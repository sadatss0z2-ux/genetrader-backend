"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storeCopierPortfolioReport = storeCopierPortfolioReport;
exports.simulateObserverPortfolio = simulateObserverPortfolio;
exports.getObserverPortfolio = getObserverPortfolio;
exports.getMasterCopierPortfolio = getMasterCopierPortfolio;
exports.getMasterCopierTrades = getMasterCopierTrades;
exports.getMasterCopierStats = getMasterCopierStats;
exports.getMasterCopierOrders = getMasterCopierOrders;
const database_1 = __importDefault(require("../config/database"));
const errorHandler_1 = require("../middleware/errorHandler");
const notificationService_1 = require("./notificationService");
const TRADE_FIELDS = [
    'id', 'account_name', 'master_trade_id', 'strategy', 'pair', 'is_open',
    'open_date', 'open_rate', 'stake_amount', 'amount', 'open_order_id', 'enter_tag',
    'nr_of_successful_buys', 'max_stake_amount', 'close_date', 'close_rate',
    'close_profit', 'close_profit_abs', 'exit_reason', 'max_rate', 'min_rate',
    'stop_loss', 'fee_open', 'fee_close', 'created_at',
];
const STAT_FIELDS = [
    'total_trades', 'winning_trades', 'losing_trades', 'win_rate_pct',
    'total_profit_usdt', 'avg_profit_usdt', 'avg_profit_pct', 'best_trade_usdt',
    'worst_trade_usdt', 'best_trade_pct', 'worst_trade_pct', 'open_trades',
    'open_stake_usdt',
];
const CONNECTION_DIAGNOSTIC_FIELDS = [
    'connection_status', 'exchange_error_code', 'exchange_error_message',
];
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function copierApiUrl(path) {
    const base = process.env.COPIER_ADMIN_API_URL?.trim();
    const token = process.env.COPIER_ADMIN_TOKEN?.trim();
    if (!base || !token) {
        throw (0, errorHandler_1.createError)('Authenticated copier reporting is not configured', 503);
    }
    let baseUrl;
    try {
        baseUrl = new URL(base);
    }
    catch {
        throw (0, errorHandler_1.createError)('Authenticated copier reporting URL is invalid', 503);
    }
    if (!['http:', 'https:'].includes(baseUrl.protocol)
        || baseUrl.username
        || baseUrl.password
        || baseUrl.search
        || baseUrl.hash
        || (process.env.NODE_ENV === 'production' && baseUrl.protocol !== 'https:')) {
        throw (0, errorHandler_1.createError)('Authenticated copier reporting URL is invalid', 503);
    }
    return new URL(path.replace(/^\/+/, ''), `${baseUrl.toString().replace(/\/+$/, '')}/`);
}
async function requestCopier(path) {
    const url = copierApiUrl(path);
    const token = process.env.COPIER_ADMIN_TOKEN.trim();
    let response;
    try {
        response = await fetch(url, {
            headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(10_000),
            redirect: 'error',
        });
    }
    catch {
        throw (0, errorHandler_1.createError)('Copier reporting service is unavailable', 503);
    }
    if (!response.ok)
        throw (0, errorHandler_1.createError)('Copier reporting service rejected the request', 503);
    try {
        return await response.json();
    }
    catch {
        throw (0, errorHandler_1.createError)('Copier reporting service returned invalid JSON', 502);
    }
}
function pickFields(value, fields) {
    return Object.fromEntries(fields.filter((field) => field in value).map((field) => [field, value[field]]));
}
async function storeCopierPortfolioReport(input) {
    await database_1.default.begin(async (tx) => {
        const reportRows = await tx `
      INSERT INTO copier_portfolio_reports (instance_id, observed_at, is_complete, received_at)
      VALUES (${input.instanceId}, ${input.observedAt}, ${input.complete}, NOW())
      ON CONFLICT (instance_id) DO UPDATE
        SET observed_at = EXCLUDED.observed_at,
          is_complete = CASE
            WHEN copier_portfolio_reports.observed_at = EXCLUDED.observed_at
              THEN copier_portfolio_reports.is_complete OR EXCLUDED.is_complete
            ELSE EXCLUDED.is_complete
          END,
          received_at = NOW()
        WHERE copier_portfolio_reports.observed_at <= EXCLUDED.observed_at
      RETURNING instance_id
    `;
        if (reportRows.length === 0) {
            throw (0, errorHandler_1.createError)('Copier portfolio report is older than the latest accepted report', 409);
        }
        for (const account of input.accounts) {
            await tx `
        INSERT INTO copier_portfolio_accounts
          (instance_id, account_name, enabled, dry_run, balance_usdt, initial_balance_usdt, stats, observed_at)
        VALUES (
          ${input.instanceId}, ${account.name}, ${account.enabled}, ${account.dryRun},
          ${account.balanceUsdt}, ${account.initialBalanceUsdt}, ${database_1.default.json(account.stats)}::jsonb, ${input.observedAt}
        )
        ON CONFLICT (instance_id, account_name) DO UPDATE SET
          enabled = EXCLUDED.enabled, dry_run = EXCLUDED.dry_run, balance_usdt = EXCLUDED.balance_usdt,
          initial_balance_usdt = EXCLUDED.initial_balance_usdt, stats = EXCLUDED.stats, observed_at = EXCLUDED.observed_at
      `;
        }
        await tx `
      DELETE FROM copier_portfolio_accounts
      WHERE instance_id = ${input.instanceId} AND observed_at < ${input.observedAt}
    `;
        if (input.trades.length > 0) {
            await tx `
        INSERT INTO copier_portfolio_trades
          (instance_id, account_name, trade_id, master_trade_id, is_open, open_date, close_date, record, observed_at)
        SELECT ${input.instanceId}, item.record->>'account_name', (item.record->>'id')::bigint,
          NULLIF(item.record->>'master_trade_id', '')::bigint, (item.record->>'is_open')::boolean,
          item.record->>'open_date', item.record->>'close_date', item.record, ${input.observedAt}
        FROM jsonb_array_elements(${database_1.default.json(input.trades)}::jsonb) AS item(record)
        ON CONFLICT (instance_id, account_name, trade_id) DO UPDATE SET
          master_trade_id = EXCLUDED.master_trade_id, is_open = EXCLUDED.is_open,
          open_date = EXCLUDED.open_date, close_date = EXCLUDED.close_date,
          record = EXCLUDED.record, observed_at = EXCLUDED.observed_at
        WHERE copier_portfolio_trades.observed_at <= EXCLUDED.observed_at
      `;
        }
        await tx `DELETE FROM copier_source_open_trades WHERE instance_id = ${input.instanceId}`;
        for (const trade of input.sourceOpenTrades) {
            await tx `
        INSERT INTO copier_source_open_trades
          (instance_id, master_trade_id, pair, stake_amount, profit_ratio, observed_at)
        VALUES (
          ${input.instanceId}, ${trade.master_trade_id}, ${trade.pair},
          ${trade.stake_amount}, ${trade.profit_ratio}, ${input.observedAt}
        )
      `;
        }
    });
    for (const account of input.accounts) {
        const stats = account.stats;
        const status = typeof stats?.connection_status === 'string' ? stats.connection_status : null;
        const errorCode = typeof stats?.exchange_error_code === 'string' ? stats.exchange_error_code : null;
        const errorMessage = typeof stats?.exchange_error_message === 'string' ? stats.exchange_error_message : null;
        if (status === 'REJECTED' || status === 'UNAVAILABLE') {
            void (0, notificationService_1.notifyCopierAccountFailure)(account.name, {
                status,
                errorCode,
                errorMessage,
            });
        }
        else if (status === 'CONNECTED') {
            (0, notificationService_1.resetCopierAccountFailureCooldown)(account.name);
        }
    }
    return { accepted: true };
}
async function getMembershipByAccount() {
    const rows = await (0, database_1.default) `
    SELECT m.copier_account_ref, u.id AS user_id, u.email, u.display_name,
      m.desired_state, m.observed_state, subscription.paid_through_at, subscription.plan
    FROM copier_memberships m
    JOIN copier_instances instance ON instance.instance_id = m.instance_id AND instance.enabled = TRUE
    JOIN users u ON u.id = m.user_id
    LEFT JOIN LATERAL (
      SELECT paid_through_at, plan FROM subscriptions
      WHERE user_id = u.id ORDER BY updated_at DESC LIMIT 1
    ) subscription ON TRUE
    WHERE m.copier_account_ref IS NOT NULL
  `;
    return new Map(rows.map((row) => [row.copier_account_ref, row]));
}
function finiteNumber(value) {
    const result = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
    return Number.isFinite(result) ? result : null;
}
function dateValue(value) {
    if (typeof value !== 'string' && !(value instanceof Date))
        return null;
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
}
function simulateObserverPortfolio(input) {
    if (!Number.isFinite(input.sourceCapital) || input.sourceCapital <= 0) {
        throw (0, errorHandler_1.createError)('Observer simulation source capital is unavailable', 503);
    }
    const initialBalance = 500;
    const start = input.startsAt.getTime();
    const openById = new Map();
    for (const trade of input.openSourceTrades) {
        const id = finiteNumber(trade.master_trade_id);
        if (id !== null)
            openById.set(id, trade);
    }
    const eligible = input.trades.filter((trade) => {
        if (trade.account_name !== input.sourceAccount)
            return false;
        const openedAt = dateValue(trade.open_date);
        return openedAt !== null && openedAt >= start;
    });
    eligible.sort((a, b) => (dateValue(a.close_date) ?? dateValue(a.open_date) ?? 0)
        - (dateValue(b.close_date) ?? dateValue(b.open_date) ?? 0));
    let equity = initialBalance;
    let realizedPnl = 0;
    let winningTrades = 0;
    let losingTrades = 0;
    let openTrades = 0;
    const simulatedTrades = [];
    for (const trade of eligible) {
        const stake = finiteNumber(trade.stake_amount);
        if (stake === null || stake <= 0)
            continue;
        const allocation = Math.min(stake / input.sourceCapital, 1);
        if (trade.is_open === true) {
            openTrades++;
            simulatedTrades.push({
                trade_id: String(trade.master_trade_id ?? trade.id ?? ''),
                pair: typeof trade.pair === 'string' ? trade.pair : 'Unknown pair',
                opened_at: String(trade.open_date),
                closed_at: null,
                is_open: true,
                profit_pct: null,
                simulated_pnl_usdt: null,
            });
            continue;
        }
        const absoluteProfit = finiteNumber(trade.close_profit_abs);
        const closeRatio = finiteNumber(trade.close_profit)
            ?? (absoluteProfit === null ? null : absoluteProfit / stake);
        if (closeRatio === null)
            continue;
        const pnl = equity * allocation * closeRatio;
        equity += pnl;
        realizedPnl += pnl;
        if (pnl > 0)
            winningTrades++;
        else
            losingTrades++;
        simulatedTrades.push({
            trade_id: String(trade.master_trade_id ?? trade.id ?? ''),
            pair: typeof trade.pair === 'string' ? trade.pair : 'Unknown pair',
            opened_at: String(trade.open_date),
            closed_at: typeof trade.close_date === 'string' ? trade.close_date : null,
            is_open: false,
            profit_pct: Number((closeRatio * 100).toFixed(4)),
            simulated_pnl_usdt: Number(pnl.toFixed(2)),
        });
    }
    let unrealizedPnl = 0;
    for (const trade of eligible) {
        if (trade.is_open !== true)
            continue;
        const masterTradeId = finiteNumber(trade.master_trade_id);
        const current = masterTradeId === null ? undefined : openById.get(masterTradeId);
        const stake = finiteNumber(trade.stake_amount);
        const ratio = current ? finiteNumber(current.profit_ratio) : null;
        if (stake === null || stake <= 0 || ratio === null)
            continue;
        const pnl = equity * Math.min(stake / input.sourceCapital, 1) * ratio;
        unrealizedPnl += pnl;
        const simulatedTrade = simulatedTrades.find((item) => item.is_open && item.trade_id === String(masterTradeId));
        if (simulatedTrade) {
            simulatedTrade.profit_pct = Number((ratio * 100).toFixed(4));
            simulatedTrade.simulated_pnl_usdt = Number(pnl.toFixed(2));
        }
    }
    const totalTrades = winningTrades + losingTrades + openTrades;
    return {
        membership_id: '',
        display_name: '',
        starts_at: input.startsAt.toISOString(),
        expires_at: input.expiresAt.toISOString(),
        initial_balance_usdt: initialBalance,
        equity_usdt: Number((equity + unrealizedPnl).toFixed(2)),
        realized_pnl_usdt: Number(realizedPnl.toFixed(2)),
        unrealized_pnl_usdt: Number(unrealizedPnl.toFixed(2)),
        total_trades: totalTrades,
        winning_trades: winningTrades,
        losing_trades: losingTrades,
        open_trades: openTrades,
        win_rate_pct: totalTrades ? Number((winningTrades / (winningTrades + losingTrades || 1) * 100).toFixed(2)) : 0,
        source_account: input.sourceAccount,
        recent_trades: simulatedTrades
            .sort((a, b) => (dateValue(b.opened_at) ?? 0) - (dateValue(a.opened_at) ?? 0))
            .slice(0, 20),
    };
}
async function getFreshPortfolioInstance() {
    const rows = await (0, database_1.default) `
    SELECT r.instance_id FROM copier_portfolio_reports r
    JOIN copier_instances i ON i.instance_id = r.instance_id AND i.enabled = TRUE
    WHERE r.is_complete = TRUE
    ORDER BY r.observed_at DESC LIMIT 1
  `;
    if (!rows[0])
        throw (0, errorHandler_1.createError)('Copier portfolio report is unavailable', 503);
    return rows[0].instance_id;
}
async function fetchActiveObservers(userId) {
    return (0, database_1.default) `
    SELECT m.membership_id, u.id AS user_id, u.display_name,
      o.starts_at, o.expires_at
    FROM observer_access_requests o
    JOIN users u ON u.id = o.user_id AND u.is_active = TRUE
    JOIN copier_memberships m ON m.user_id = o.user_id
      AND m.desired_state = 'OBSERVER' AND m.observed_state = 'OBSERVER'
    JOIN copier_instances i ON i.instance_id = m.instance_id AND i.enabled = TRUE
    WHERE o.status = 'ACTIVE' AND o.starts_at <= NOW() AND o.expires_at > NOW()
      AND o.starts_at IS NOT NULL AND o.expires_at IS NOT NULL
      ${userId === undefined ? (0, database_1.default) `` : (0, database_1.default) `AND u.id = ${userId}`}
    ORDER BY o.starts_at, u.id
  `;
}
async function calculateObserverPortfolios(observers) {
    if (observers.length === 0)
        return [];
    const instanceId = await getFreshPortfolioInstance();
    const accounts = await (0, database_1.default) `
    SELECT account_name, enabled, dry_run, initial_balance_usdt
    FROM copier_portfolio_accounts
    WHERE instance_id = ${instanceId}
  `;
    const source = accounts.find((account) => account.enabled && !account.dry_run);
    if (!source) {
        throw (0, errorHandler_1.createError)('No active live source account is available for observer simulation', 503);
    }
    const sourceCapital = finiteNumber(source.initial_balance_usdt);
    if (sourceCapital === null || sourceCapital <= 0) {
        throw (0, errorHandler_1.createError)('Observer simulation source capital is unavailable', 503);
    }
    const earliestStart = observers.reduce((earliest, observer) => observer.starts_at < earliest ? observer.starts_at : earliest, observers[0].starts_at);
    const [tradeRows, openTrades] = await Promise.all([
        (0, database_1.default) `
      SELECT record FROM copier_portfolio_trades
      WHERE instance_id = ${instanceId} AND account_name = ${source.account_name}
        AND open_date::timestamptz >= ${earliestStart}
      ORDER BY open_date::timestamptz
    `,
        (0, database_1.default) `
      SELECT master_trade_id, pair, stake_amount, profit_ratio
      FROM copier_source_open_trades
      WHERE instance_id = ${instanceId}
    `,
    ]);
    const trades = tradeRows.map((row) => row.record);
    return observers.map((observer) => ({
        ...simulateObserverPortfolio({
            startsAt: observer.starts_at,
            expiresAt: observer.expires_at,
            sourceAccount: source.account_name,
            sourceCapital,
            trades,
            openSourceTrades: openTrades,
        }),
        membership_id: observer.membership_id,
        display_name: observer.display_name ?? `Observer ${observer.user_id}`,
    }));
}
async function getObserverPortfolio(userId) {
    const observers = await fetchActiveObservers(userId);
    if (observers.length === 0) {
        throw (0, errorHandler_1.createError)('Active observer access is required to view this portfolio', 403);
    }
    return (await calculateObserverPortfolios(observers))[0];
}
async function getMasterCopierPortfolio() {
    const [instanceId, observers, members] = await Promise.all([
        getFreshPortfolioInstance(),
        fetchActiveObservers(),
        getMembershipByAccount(),
    ]);
    const [accountRows, operatorOwners] = await Promise.all([
        (0, database_1.default) `
    SELECT account_name, enabled, dry_run, balance_usdt, initial_balance_usdt, stats
    FROM copier_portfolio_accounts
    WHERE instance_id = ${instanceId}
    ORDER BY account_name
    `,
        (0, database_1.default) `
      SELECT managed.account_ref, users.email
      FROM operator_managed_live_accounts managed
      JOIN users ON users.id = managed.user_id
      WHERE managed.instance_id = ${instanceId} AND managed.active = TRUE
    `,
    ]);
    const operatorOwnerByAccount = new Map(operatorOwners.map((owner) => [owner.account_ref, owner.email]));
    const accounts = accountRows.map((account) => {
        const stat = pickFields(account.stats, [...STAT_FIELDS, ...CONNECTION_DIAGNOSTIC_FIELDS]);
        const balance = finiteNumber(account.balance_usdt);
        const openStake = finiteNumber(stat.open_stake_usdt) ?? 0;
        return {
            ...stat,
            account_name: account.account_name,
            owner_email: operatorOwnerByAccount.get(account.account_name) ?? null,
            member: members.get(account.account_name) ?? null,
            enabled: account.enabled,
            dry_run: account.dry_run,
            balance_usdt: account.enabled ? balance : null,
            initial_balance_usdt: account.enabled ? finiteNumber(account.initial_balance_usdt) : null,
            portfolio_value_usdt: !account.enabled || balance === null ? null : Number((balance + openStake).toFixed(2)),
        };
    });
    const activeAccounts = accounts.filter((account) => account.enabled === true);
    const liveAccounts = activeAccounts.filter((account) => account.dry_run === false);
    let observerPortfolios = [];
    let observerError = null;
    try {
        observerPortfolios = await calculateObserverPortfolios(observers);
    }
    catch {
        observerError = 'Observer simulations are unavailable because their live source portfolio could not be loaded.';
    }
    const accountRealizedProfit = activeAccounts.reduce((sum, account) => sum + (finiteNumber(account.total_profit_usdt) ?? 0), 0);
    const observerRealizedProfit = observerPortfolios.reduce((sum, observer) => sum + observer.realized_pnl_usdt, 0);
    const totals = {
        active_account_count: activeAccounts.length,
        active_live_account_count: liveAccounts.length,
        live_portfolio_value_usdt: Number(liveAccounts.reduce((sum, account) => sum + (finiteNumber(account.portfolio_value_usdt) ?? 0), 0).toFixed(2)),
        observer_count: observerPortfolios.length,
        observer_portfolio_value_usdt: Number(observerPortfolios.reduce((sum, observer) => sum + observer.equity_usdt, 0).toFixed(2)),
        total_trades: activeAccounts.reduce((sum, account) => sum + (finiteNumber(account.total_trades) ?? 0) + (finiteNumber(account.open_trades) ?? 0), 0),
        realized_profit_usdt: Number(accountRealizedProfit.toFixed(2)),
        observer_realized_profit_usdt: Number(observerRealizedProfit.toFixed(2)),
        combined_realized_profit_usdt: Number((accountRealizedProfit + observerRealizedProfit).toFixed(2)),
        open_trades: activeAccounts.reduce((sum, account) => sum + (finiteNumber(account.open_trades) ?? 0), 0),
    };
    return {
        accounts,
        observers: observerPortfolios,
        observer_error: observerError,
        totals,
    };
}
async function getMasterCopierTrades(input) {
    const [instanceId, members] = await Promise.all([getFreshPortfolioInstance(), getMembershipByAccount()]);
    const [countRows, rows] = await Promise.all([
        (0, database_1.default) `
      SELECT COUNT(*)::int AS count FROM copier_portfolio_trades
      WHERE instance_id = ${instanceId}
        ${input.account ? (0, database_1.default) `AND account_name = ${input.account}` : (0, database_1.default) ``}
        ${input.openOnly ? (0, database_1.default) `AND is_open = TRUE` : (0, database_1.default) ``}
    `,
        (0, database_1.default) `
      SELECT record FROM copier_portfolio_trades
      WHERE instance_id = ${instanceId}
        ${input.account ? (0, database_1.default) `AND account_name = ${input.account}` : (0, database_1.default) ``}
        ${input.openOnly ? (0, database_1.default) `AND is_open = TRUE` : (0, database_1.default) ``}
      ORDER BY open_date::timestamptz DESC, trade_id DESC LIMIT ${input.limit} OFFSET ${input.offset}
    `,
    ]);
    const trades = rows.map(({ record }) => {
        const selected = pickFields(record, TRADE_FIELDS);
        const accountName = typeof record.account_name === 'string' ? record.account_name : '';
        return { ...selected, member: members.get(accountName) ?? null };
    });
    const totalCount = Number(countRows[0]?.count ?? 0);
    return { count: trades.length, total_count: totalCount, limit: input.limit, offset: input.offset, trades };
}
async function getMasterCopierStats() {
    const portfolio = await getMasterCopierPortfolio();
    return portfolio.accounts;
}
async function getMasterCopierOrders(tradeId) {
    const response = await requestCopier(`/api/orders/${tradeId}`);
    if (!isRecord(response) || !Array.isArray(response.orders)) {
        throw (0, errorHandler_1.createError)('Copier reporting service returned an invalid orders response', 502);
    }
    return response.orders.filter(isRecord).map((order) => pickFields(order, [
        'id', 'trade_id', 'account_name', 'master_trade_id', 'pair', 'order_id',
        'order_type', 'order_date', 'order_filled_date', 'status', 'price',
        'amount', 'cost', 'filled', 'fee',
    ]));
}
//# sourceMappingURL=copierReportingService.js.map