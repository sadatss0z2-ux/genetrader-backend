"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriceAlertService = void 0;
const node_crypto_1 = require("node:crypto");
const decimal_js_1 = __importDefault(require("decimal.js"));
const database_1 = __importDefault(require("../config/database"));
const notificationService_1 = require("./notificationService");
function toIso(value) {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
function toAlert(row) {
    return {
        id: row.id,
        userId: row.user_id,
        symbol: row.symbol,
        direction: row.direction,
        targetPrice: String(row.target_price),
        frequency: row.frequency,
        note: row.note,
        status: row.status,
        triggerCount: Number(row.trigger_count),
        lastTriggeredAt: row.last_triggered_at ? toIso(row.last_triggered_at) : null,
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
    };
}
function toEvent(row) {
    return {
        id: row.id,
        alertId: row.alert_id,
        symbol: row.symbol,
        direction: row.direction,
        targetPrice: String(row.target_price),
        triggerPrice: String(row.trigger_price),
        note: row.note,
        triggeredAt: toIso(row.triggered_at),
        notificationStatus: row.notification_status,
    };
}
function isCrossed(direction, previous, current, target) {
    return direction === 'ABOVE'
        ? previous.lessThan(target) && current.greaterThanOrEqualTo(target)
        : previous.greaterThan(target) && current.lessThanOrEqualTo(target);
}
/**
 * Keeps the alert decision point on the server-side public market feed. This means
 * alerts remain active when a device is backgrounded or the app is not running.
 */
class PriceAlertService {
    marketData;
    subscribeSymbols;
    activeBySymbol = new Map();
    lastPriceBySymbol = new Map();
    tickerQueues = new Map();
    started = false;
    constructor(marketData, subscribeSymbols) {
        this.marketData = marketData;
        this.subscribeSymbols = subscribeSymbols;
    }
    async start() {
        if (this.started)
            return;
        this.started = true;
        this.marketData.on('ticker', this.onTicker);
        try {
            const rows = await (0, database_1.default) `
        SELECT * FROM price_alerts WHERE status = 'ACTIVE'
      `;
            for (const row of rows)
                this.cacheAlert(toAlert(row));
            this.requestSymbols([...this.activeBySymbol.keys()]);
        }
        catch (error) {
            // Leave the listener attached: a later alert creation can still recover the service.
            console.error('[PriceAlerts] Active alerts could not be loaded', error instanceof Error ? error.name : 'Unknown error');
        }
    }
    stop() {
        if (!this.started)
            return;
        this.marketData.off('ticker', this.onTicker);
        this.started = false;
        this.tickerQueues.clear();
    }
    async listForUser(userId, symbol) {
        const rows = symbol
            ? await (0, database_1.default) `
        SELECT * FROM price_alerts
        WHERE user_id = ${userId} AND symbol = ${symbol}
        ORDER BY CASE status WHEN 'ACTIVE' THEN 0 WHEN 'TRIGGERED' THEN 1 ELSE 2 END, created_at DESC
      `
            : await (0, database_1.default) `
        SELECT * FROM price_alerts
        WHERE user_id = ${userId}
        ORDER BY CASE status WHEN 'ACTIVE' THEN 0 WHEN 'TRIGGERED' THEN 1 ELSE 2 END, created_at DESC
      `;
        return rows.map(toAlert);
    }
    async create(userId, input) {
        const id = (0, node_crypto_1.randomUUID)();
        const rows = await (0, database_1.default) `
      INSERT INTO price_alerts (
        id, user_id, symbol, direction, target_price, frequency, note
      ) VALUES (
        ${id}, ${userId}, ${input.symbol}, ${input.direction}, ${input.targetPrice}, ${input.frequency}, ${input.note ?? null}
      )
      RETURNING *
    `;
        const alert = toAlert(rows[0]);
        this.cacheAlert(alert);
        this.requestSymbols([alert.symbol]);
        return alert;
    }
    async update(userId, id, input) {
        const rows = await (0, database_1.default) `
      UPDATE price_alerts
      SET direction = ${input.direction},
          target_price = ${input.targetPrice},
          frequency = ${input.frequency},
          note = ${input.note ?? null},
          updated_at = NOW()
      WHERE id = ${id} AND user_id = ${userId} AND status = 'ACTIVE'
      RETURNING *
    `;
        if (!rows[0])
            return null;
        const alert = toAlert(rows[0]);
        this.cacheAlert(alert);
        return alert;
    }
    async cancel(userId, id) {
        const rows = await (0, database_1.default) `
      UPDATE price_alerts
      SET status = 'CANCELLED', updated_at = NOW()
      WHERE id = ${id} AND user_id = ${userId} AND status = 'ACTIVE'
      RETURNING *
    `;
        if (!rows[0])
            return null;
        const alert = toAlert(rows[0]);
        this.removeCachedAlert(alert);
        return alert;
    }
    async listEventsForUser(userId, alertId) {
        const rows = await (0, database_1.default) `
      SELECT event.*
      FROM price_alert_events event
      JOIN price_alerts alert ON alert.id = event.alert_id
      WHERE event.alert_id = ${alertId} AND alert.user_id = ${userId}
      ORDER BY event.triggered_at DESC
      LIMIT 100
    `;
        return rows.map(toEvent);
    }
    onTicker = (ticker) => {
        const symbol = ticker.symbol.toUpperCase();
        if (!this.activeBySymbol.has(symbol))
            return;
        const previousTask = this.tickerQueues.get(symbol) ?? Promise.resolve();
        const task = previousTask
            .then(() => this.evaluateTicker(ticker))
            .catch((error) => {
            console.error('[PriceAlerts] Ticker evaluation failed', error instanceof Error ? error.name : 'Unknown error');
        });
        this.tickerQueues.set(symbol, task);
        void task.finally(() => {
            if (this.tickerQueues.get(symbol) === task)
                this.tickerQueues.delete(symbol);
        });
    };
    async evaluateTicker(ticker) {
        const symbol = ticker.symbol.toUpperCase();
        let current;
        try {
            current = new decimal_js_1.default(ticker.lastPrice);
        }
        catch {
            return;
        }
        if (!current.isFinite() || current.lessThanOrEqualTo(0))
            return;
        const previous = this.lastPriceBySymbol.get(symbol);
        this.lastPriceBySymbol.set(symbol, current);
        if (!previous)
            return;
        const alerts = [...(this.activeBySymbol.get(symbol)?.values() ?? [])];
        for (const alert of alerts) {
            const target = new decimal_js_1.default(alert.targetPrice);
            if (isCrossed(alert.direction, previous, current, target)) {
                await this.trigger(alert, current.toString());
            }
        }
    }
    async trigger(alert, triggerPrice) {
        const eventId = (0, node_crypto_1.randomUUID)();
        const rows = await database_1.default.begin(async (tx) => {
            const changed = await tx `
        UPDATE price_alerts
        SET status = ${alert.frequency === 'ONCE' ? 'TRIGGERED' : 'ACTIVE'},
            trigger_count = trigger_count + 1,
            last_triggered_at = NOW(),
            updated_at = NOW()
        WHERE id = ${alert.id} AND status = 'ACTIVE'
        RETURNING *
      `;
            if (!changed[0])
                return [];
            await tx `
        INSERT INTO price_alert_events (
          id, alert_id, user_id, symbol, direction, target_price, trigger_price, note
        ) VALUES (
          ${eventId}, ${alert.id}, ${alert.userId}, ${alert.symbol}, ${alert.direction}, ${alert.targetPrice}, ${triggerPrice}, ${alert.note}
        )
      `;
            return changed;
        });
        if (!rows[0])
            return;
        const triggeredAlert = toAlert(rows[0]);
        if (triggeredAlert.frequency === 'ONCE')
            this.removeCachedAlert(triggeredAlert);
        else
            this.cacheAlert(triggeredAlert);
        const delivery = await (0, notificationService_1.notifyPriceAlertTriggered)(triggeredAlert.userId, {
            alertId: triggeredAlert.id,
            symbol: triggeredAlert.symbol,
            direction: triggeredAlert.direction,
            targetPrice: triggeredAlert.targetPrice,
            triggerPrice,
            note: triggeredAlert.note,
        });
        await (0, database_1.default) `
      UPDATE price_alert_events
      SET notification_status = ${delivery},
          notification_sent_at = ${delivery === 'SENT' ? new Date() : null}
      WHERE id = ${eventId}
    `;
    }
    cacheAlert(alert) {
        if (alert.status !== 'ACTIVE') {
            this.removeCachedAlert(alert);
            return;
        }
        const byId = this.activeBySymbol.get(alert.symbol) ?? new Map();
        byId.set(alert.id, alert);
        this.activeBySymbol.set(alert.symbol, byId);
    }
    removeCachedAlert(alert) {
        const byId = this.activeBySymbol.get(alert.symbol);
        if (!byId)
            return;
        byId.delete(alert.id);
        if (byId.size === 0)
            this.activeBySymbol.delete(alert.symbol);
    }
    requestSymbols(symbols) {
        const unique = [...new Set(symbols.filter((symbol) => /^[A-Z0-9]{5,20}$/.test(symbol)))];
        if (!unique.length)
            return;
        try {
            this.subscribeSymbols?.(unique);
        }
        catch (error) {
            console.error('[PriceAlerts] Required market symbols could not be subscribed', error instanceof Error ? error.name : 'Unknown error');
        }
    }
}
exports.PriceAlertService = PriceAlertService;
//# sourceMappingURL=priceAlertService.js.map