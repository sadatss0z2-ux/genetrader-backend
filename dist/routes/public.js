"use strict";
// ── Public (unauthenticated) copier stats & decisions endpoints ──────────────
// These routes expose anonymised aggregate data from the VPS trade copier so
// that the mobile app can display live win-rate, trade count, and recent
// trade decisions WITHOUT requiring the user to be signed in.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../config/database"));
const router = (0, express_1.Router)();
function finiteNumber(value) {
    const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
    return Number.isFinite(n) ? n : null;
}
/** Returns the latest active copier instance.
 * Checks portfolio reports first, then falls back to heartbeat so the health
 * endpoint stays LIVE even while Freqtrade is restarting.
 */
async function getLatestInstance() {
    // Primary: latest COMPLETE portfolio report
    const reportRows = await (0, database_1.default) `
    SELECT r.instance_id, r.observed_at
    FROM copier_portfolio_reports r
    JOIN copier_instances i ON i.instance_id = r.instance_id AND i.enabled = TRUE
    WHERE r.is_complete = TRUE
    ORDER BY r.observed_at DESC LIMIT 1
  `;
    if (reportRows[0]) {
        const lastSeen = new Date(reportRows[0].observed_at);
        const ageMs = Date.now() - lastSeen.getTime();
        return { instanceId: reportRows[0].instance_id, lastSeen, isFresh: ageMs <= 15 * 60 * 1000 };
    }
    // Fallback: copier heartbeat (instance alive, Freqtrade may be restarting)
    const hbRows = await (0, database_1.default) `
    SELECT instance_id, last_seen_at
    FROM copier_instances
    WHERE enabled = TRUE AND last_seen_at IS NOT NULL
    ORDER BY last_seen_at DESC LIMIT 1
  `;
    if (!hbRows[0])
        return null;
    const lastSeen = new Date(hbRows[0].last_seen_at);
    const ageMs = Date.now() - lastSeen.getTime();
    return { instanceId: hbRows[0].instance_id, lastSeen, isFresh: ageMs <= 15 * 60 * 1000 };
}
// ── GET /api/public/health ───────────────────────────────────────────────────
router.get('/health', async (_req, res, next) => {
    try {
        const latest = await getLatestInstance();
        res.json({
            status: 'ok',
            version: '1.0.0',
            copier_online: latest?.isFresh ?? false,
            instance_id: latest?.instanceId ?? null,
            last_seen: latest?.lastSeen?.toISOString() ?? null,
        });
    }
    catch (err) {
        next(err);
    }
});
// ── GET /api/public/stats ────────────────────────────────────────────────────
router.get('/stats', async (_req, res, next) => {
    try {
        const latest = await getLatestInstance();
        if (!latest) {
            res.status(503).json({ error: 'copier_unavailable', message: 'No copier report available' });
            return;
        }
        const accounts = await (0, database_1.default) `
      SELECT enabled, dry_run, balance_usdt, initial_balance_usdt, stats
      FROM copier_portfolio_accounts
      WHERE instance_id = ${latest.instanceId}
    `;
        const activeAccounts = accounts.filter((a) => a.enabled);
        const liveAccount = activeAccounts.find((a) => !a.dry_run);
        let totalTrades = 0;
        let winningTrades = 0;
        let totalProfitUsdt = 0;
        for (const account of activeAccounts) {
            const s = account.stats ?? {};
            totalTrades += finiteNumber(s.total_trades) ?? 0;
            totalTrades += finiteNumber(s.open_trades) ?? 0;
            winningTrades += finiteNumber(s.winning_trades) ?? 0;
            totalProfitUsdt += finiteNumber(s.total_profit_usdt) ?? 0;
        }
        const closedTrades = totalTrades - activeAccounts.reduce((sum, a) => sum + (finiteNumber((a.stats ?? {}).open_trades) ?? 0), 0);
        const winRate = closedTrades > 0
            ? Number(((winningTrades / closedTrades) * 100).toFixed(2))
            : 0;
        const masterBalance = liveAccount ? finiteNumber(liveAccount.balance_usdt) : null;
        res.json({
            win_rate: winRate,
            total_trades: totalTrades,
            total_profit: Number(totalProfitUsdt.toFixed(2)),
            master_balance: masterBalance,
            active_wallets: activeAccounts.length,
            instance_id: latest.instanceId,
            is_live: latest.isFresh,
            last_seen: latest.lastSeen.toISOString(),
        });
    }
    catch (err) {
        next(err);
    }
});
// ── GET /api/public/decisions?limit=8 ───────────────────────────────────────
router.get('/decisions', async (req, res, next) => {
    try {
        const rawLimit = parseInt(String(req.query.limit ?? '8'), 10);
        const limit = Math.min(Math.max(isNaN(rawLimit) ? 8 : rawLimit, 1), 50);
        const latest = await getLatestInstance();
        if (!latest) {
            res.json([]);
            return;
        }
        const rows = await (0, database_1.default) `
      SELECT record FROM copier_portfolio_trades
      WHERE instance_id = ${latest.instanceId} AND is_open = FALSE
      ORDER BY close_date::timestamptz DESC NULLS LAST, trade_id DESC
      LIMIT ${limit}
    `;
        const decisions = rows.map((row) => {
            const r = row.record ?? {};
            const tradeId = r.id ?? r.trade_id;
            const closeProfit = finiteNumber(r.close_profit);
            let decision = 'CLOSED';
            if (closeProfit !== null) {
                decision = closeProfit >= 0 ? 'PROFIT' : 'LOSS';
            }
            const confidence = closeProfit !== null
                ? Math.min(100, Math.round(50 + Math.abs(closeProfit) * 500))
                : 60;
            return {
                id: String(tradeId ?? ''),
                pair: typeof r.pair === 'string' ? r.pair : 'UNKNOWN',
                decision,
                confidence,
                time: typeof r.close_date === 'string' ? r.close_date : new Date().toISOString(),
            };
        });
        res.json(decisions);
    }
    catch (err) {
        next(err);
    }
});
// ── GET /api/public/open-trades ──────────────────────────────────────────────
router.get('/open-trades', async (req, res, next) => {
    try {
        const latest = await getLatestInstance();
        if (!latest) {
            res.json({ count: 0, source_trades: [], open_trades: [] });
            return;
        }
        const [sourceRows, portfolioRows] = await Promise.all([
            (0, database_1.default) `
              SELECT master_trade_id, pair, stake_amount, profit_ratio, observed_at
              FROM copier_source_open_trades
              WHERE instance_id = ${latest.instanceId}
            `,
            (0, database_1.default) `
              SELECT record FROM copier_portfolio_trades
              WHERE instance_id = ${latest.instanceId} AND is_open = TRUE
              ORDER BY open_date::timestamptz DESC
            `
        ]);
        const sourceTrades = sourceRows.map((r) => ({
            master_trade_id: r.master_trade_id,
            pair: r.pair,
            stake_amount: finiteNumber(r.stake_amount) ?? 0,
            profit_ratio: finiteNumber(r.profit_ratio) ?? 0,
            observed_at: r.observed_at
        }));
        const portfolioTrades = portfolioRows.map((r) => r.record);
        res.json({
            count: sourceTrades.length + portfolioTrades.length,
            source_trades: sourceTrades,
            open_trades: portfolioTrades
        });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=public.js.map