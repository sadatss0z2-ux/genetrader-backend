"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../config/database"));
const rateLimiter_1 = require("../middleware/rateLimiter");
const copierAuth_1 = require("../middleware/copierAuth");
const copierControlService_1 = require("../services/copierControlService");
const liveCopyService_1 = require("../services/liveCopyService");
const copierReportingService_1 = require("../services/copierReportingService");
const router = (0, express_1.Router)();
const hasOnlyKeys = (value, keys) => Object.keys(value).every((key) => keys.includes(key));
const isUuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const isIsoDate = (value) => typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
const isDateString = (value) => typeof value === 'string'
    && value.length <= 64 && Number.isFinite(Date.parse(value));
const isFiniteNumber = (value) => typeof value === 'number'
    && Number.isFinite(value) && Math.abs(value) <= 1_000_000_000_000;
const isSafeName = (value) => typeof value === 'string'
    && /^[A-Za-z0-9._:-]{1,255}$/.test(value);
const portfolioStats = [
    'total_trades', 'winning_trades', 'losing_trades', 'win_rate_pct',
    'total_profit_usdt', 'avg_profit_usdt', 'avg_profit_pct', 'best_trade_usdt',
    'worst_trade_usdt', 'best_trade_pct', 'worst_trade_pct', 'open_trades',
    'open_stake_usdt',
];
const portfolioDiagnostics = ['connection_status', 'exchange_error_code', 'exchange_error_message'];
const portfolioTradeFields = [
    'id', 'account_name', 'master_trade_id', 'strategy', 'pair', 'is_open',
    'open_date', 'open_rate', 'stake_amount', 'amount', 'open_order_id', 'enter_tag',
    'nr_of_successful_buys', 'max_stake_amount', 'close_date', 'close_rate',
    'close_profit', 'close_profit_abs', 'exit_reason', 'max_rate', 'min_rate',
    'stop_loss', 'fee_open', 'fee_close', 'created_at',
];
router.get('/commands', rateLimiter_1.copierLimiter, copierAuth_1.requireCopierInstance, async (req, res, next) => {
    const instanceId = req.query.instance_id;
    if (!(0, copierAuth_1.requireMatchingCopierInstance)(req, instanceId, res))
        return;
    const after = req.query.after_revision;
    if (typeof after !== 'string' || !/^\d{1,16}$/.test(after)) {
        res.status(400).json({ error: 'Invalid after_revision' });
        return;
    }
    try {
        res.json(await (0, copierControlService_1.pollCopierCommands)(req.copierInstanceId, Number(after)));
    }
    catch (error) {
        next(error);
    }
});
router.post('/commands/:commandId/ack', rateLimiter_1.copierLimiter, copierAuth_1.requireCopierInstance, async (req, res, next) => {
    const body = req.body;
    const permitted = ['instance_id', 'revision', 'result', 'observed_state', 'observed_at', 'error_code', 'copier_account_ref'];
    if (!body || typeof body !== 'object' || !hasOnlyKeys(body, permitted)) {
        res.status(400).json({ error: 'Acknowledgement schema is invalid' });
        return;
    }
    if (!(0, copierAuth_1.requireMatchingCopierInstance)(req, body.instance_id, res))
        return;
    if (!isUuid(req.params.commandId) || !Number.isSafeInteger(body.revision) || Number(body.revision) < 1
        || !['applied', 'rejected', 'retryable_error'].includes(String(body.result))
        || typeof body.observed_state !== 'string' || !isIsoDate(body.observed_at)
        || (body.error_code !== undefined && (typeof body.error_code !== 'string' || body.error_code.length > 48))
        || (body.copier_account_ref !== undefined
            && (typeof body.copier_account_ref !== 'string' || !/^[A-Za-z0-9._:-]{1,255}$/.test(body.copier_account_ref)))) {
        res.status(400).json({ error: 'Acknowledgement schema is invalid' });
        return;
    }
    try {
        const result = await (0, copierControlService_1.acknowledgeCopierCommand)({
            instanceId: req.copierInstanceId, commandId: req.params.commandId,
            revision: Number(body.revision), result: body.result,
            observedState: body.observed_state, observedAt: new Date(body.observed_at), errorCode: body.error_code,
            copierAccountRef: body.copier_account_ref,
        });
        res.status(result.accepted ? 202 : 409).json(result);
    }
    catch (error) {
        next(error);
    }
});
router.post('/reconciliation', rateLimiter_1.copierLimiter, copierAuth_1.requireCopierInstance, async (req, res, next) => {
    const body = req.body;
    const permitted = ['instance_id', 'membership_id', 'snapshot_id', 'observed_at', 'authoritative', 'inflight_entry_commands', 'positions'];
    if (!body || typeof body !== 'object' || !hasOnlyKeys(body, permitted)) {
        res.status(400).json({ error: 'Reconciliation schema is invalid' });
        return;
    }
    if (!(0, copierAuth_1.requireMatchingCopierInstance)(req, body.instance_id, res))
        return;
    if (!isUuid(body.membership_id) || typeof body.snapshot_id !== 'string' || !/^[A-Za-z0-9._:-]{1,255}$/.test(body.snapshot_id)
        || !isIsoDate(body.observed_at) || typeof body.authoritative !== 'boolean'
        || typeof body.inflight_entry_commands !== 'boolean' || !Array.isArray(body.positions)) {
        res.status(400).json({ error: 'Reconciliation schema is invalid' });
        return;
    }
    const positions = [];
    for (const item of body.positions) {
        if (!item || typeof item !== 'object') {
            res.status(400).json({ error: 'Invalid position snapshot' });
            return;
        }
        const position = item;
        if (!hasOnlyKeys(position, ['position_ref', 'state', 'pending_executable_orders', 'inflight_entry_commands'])
            || typeof position.position_ref !== 'string' || !/^[A-Za-z0-9._:-]{1,255}$/.test(position.position_ref)
            || !['OPEN', 'FLAT', 'UNKNOWN'].includes(String(position.state))
            || typeof position.pending_executable_orders !== 'boolean' || typeof position.inflight_entry_commands !== 'boolean') {
            res.status(400).json({ error: 'Invalid position snapshot' });
            return;
        }
        positions.push({ positionRef: position.position_ref, state: position.state, pendingExecutableOrders: position.pending_executable_orders, inflightEntryCommands: position.inflight_entry_commands });
    }
    try {
        const result = await (0, copierControlService_1.acceptCopierReconciliation)({
            instanceId: req.copierInstanceId, membershipId: body.membership_id, snapshotId: body.snapshot_id,
            observedAt: new Date(body.observed_at), authoritative: body.authoritative,
            inflightEntryCommands: body.inflight_entry_commands, positions,
        });
        res.status(202).json(result);
    }
    catch (error) {
        next(error);
    }
});
// An idle copier still needs to be visible to the master account. Unlike a
// source-state snapshot, a heartbeat makes no claim about open positions and
// cannot activate memberships or change any trading state.
router.post('/heartbeat', rateLimiter_1.copierLimiter, copierAuth_1.requireCopierInstance, async (req, res, next) => {
    const body = req.body;
    const permitted = ['instance_id', 'observed_at'];
    if (!body || typeof body !== 'object' || !hasOnlyKeys(body, permitted)
        || !(0, copierAuth_1.requireMatchingCopierInstance)(req, body.instance_id, res)
        || !isIsoDate(body.observed_at)) {
        if (!res.headersSent)
            res.status(400).json({ error: 'Heartbeat schema is invalid' });
        return;
    }
    const instanceId = req.copierInstanceId;
    if (!instanceId) {
        res.status(401).json({ error: 'Machine authentication required' });
        return;
    }
    try {
        await (0, database_1.default) `UPDATE copier_instances SET last_seen_at = NOW() WHERE instance_id = ${instanceId}`;
        res.status(202).json({
            accepted: true,
            instance_id: instanceId,
            received_at: new Date().toISOString(),
        });
    }
    catch (error) {
        next(error);
    }
});
router.post('/source-state', rateLimiter_1.copierLimiter, copierAuth_1.requireCopierInstance, async (req, res, next) => {
    const body = req.body;
    const permitted = ['instance_id', 'snapshot_id', 'observed_at', 'open_trade_count', 'inflight_entry_commands'];
    if (!body || typeof body !== 'object' || !hasOnlyKeys(body, permitted)) {
        res.status(400).json({ error: 'Source-state schema is invalid' });
        return;
    }
    if (!(0, copierAuth_1.requireMatchingCopierInstance)(req, body.instance_id, res))
        return;
    if (!isUuid(body.snapshot_id) || !isIsoDate(body.observed_at)
        || !Number.isSafeInteger(body.open_trade_count) || Number(body.open_trade_count) < 0
        || typeof body.inflight_entry_commands !== 'boolean') {
        res.status(400).json({ error: 'Source-state schema is invalid' });
        return;
    }
    try {
        res.status(202).json(await (0, liveCopyService_1.recordCopierSourceState)({
            instanceId: req.copierInstanceId,
            snapshotId: body.snapshot_id,
            observedAt: new Date(body.observed_at),
            openTradeCount: Number(body.open_trade_count),
            inflightEntryCommands: body.inflight_entry_commands,
        }));
    }
    catch (error) {
        next(error);
    }
});
router.post('/reports', rateLimiter_1.copierLimiter, copierAuth_1.requireCopierInstance, async (req, res, next) => {
    const body = req.body;
    const permitted = ['instance_id', 'observed_at', 'complete', 'accounts', 'trades', 'source_open_trades'];
    if (!body || typeof body !== 'object' || !hasOnlyKeys(body, permitted)) {
        res.status(400).json({ error: 'Portfolio report schema is invalid' });
        return;
    }
    if (!(0, copierAuth_1.requireMatchingCopierInstance)(req, body.instance_id, res))
        return;
    const observedAt = typeof body.observed_at === 'string' ? new Date(body.observed_at) : null;
    if (!isIsoDate(body.observed_at) || !observedAt
        || observedAt.getTime() > Date.now() + 60_000
        || observedAt.getTime() < Date.now() - 5 * 60_000
        || typeof body.complete !== 'boolean'
        || !Array.isArray(body.accounts) || body.accounts.length < 1 || body.accounts.length > 100
        || !Array.isArray(body.trades) || body.trades.length > 250
        || !Array.isArray(body.source_open_trades) || body.source_open_trades.length > 500) {
        res.status(400).json({ error: 'Portfolio report schema is invalid' });
        return;
    }
    const accounts = [];
    for (const value of body.accounts) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            res.status(400).json({ error: 'Invalid portfolio account' });
            return;
        }
        const account = value;
        const accountStats = account.stats;
        if (!hasOnlyKeys(account, ['name', 'enabled', 'dry_run', 'balance_usdt', 'initial_balance_usdt', 'stats'])
            || !isSafeName(account.name) || typeof account.enabled !== 'boolean' || typeof account.dry_run !== 'boolean'
            || !isFiniteNumber(account.balance_usdt) || account.balance_usdt < 0
            || !isFiniteNumber(account.initial_balance_usdt) || account.initial_balance_usdt < 0
            || !account.stats || typeof account.stats !== 'object' || Array.isArray(account.stats)
            || Object.entries(accountStats ?? {}).some(([key, stat]) => {
                if (portfolioStats.includes(key))
                    return !isFiniteNumber(stat);
                if (key === 'connection_status')
                    return !['CONNECTED', 'REJECTED', 'UNAVAILABLE', 'UNKNOWN'].includes(String(stat));
                if (key === 'exchange_error_code')
                    return stat !== null && (typeof stat !== 'string' || stat.length > 32 || !/^-?[A-Za-z0-9_]+$/.test(stat));
                if (key === 'exchange_error_message')
                    return stat !== null && (typeof stat !== 'string' || stat.length > 240 || !/^[A-Za-z0-9 .,'/()-]+$/.test(stat));
                return true;
            })) {
            res.status(400).json({ error: 'Invalid portfolio account' });
            return;
        }
        accounts.push({
            name: account.name,
            enabled: account.enabled,
            dryRun: account.dry_run,
            balanceUsdt: account.balance_usdt,
            initialBalanceUsdt: account.initial_balance_usdt,
            stats: account.stats,
        });
    }
    if (new Set(accounts.map((account) => account.name)).size !== accounts.length) {
        res.status(400).json({ error: 'Duplicate portfolio account' });
        return;
    }
    const trades = [];
    for (const value of body.trades) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            res.status(400).json({ error: 'Invalid portfolio trade' });
            return;
        }
        const trade = value;
        if (!hasOnlyKeys(trade, portfolioTradeFields)
            || !Number.isSafeInteger(trade.id) || Number(trade.id) < 1
            || !isSafeName(trade.account_name) || typeof trade.is_open !== 'boolean'
            || !isDateString(trade.open_date)
            || (trade.master_trade_id !== null && trade.master_trade_id !== undefined
                && (!Number.isSafeInteger(trade.master_trade_id) || Number(trade.master_trade_id) < 1))
            || Object.entries(trade).some(([key, field]) => !portfolioTradeFields.includes(key)
                || !(field === null || typeof field === 'string' || typeof field === 'boolean'
                    || (typeof field === 'number' && isFiniteNumber(field))))) {
            res.status(400).json({ error: 'Invalid portfolio trade' });
            return;
        }
        trades.push(trade);
    }
    if (new Set(trades.map((trade) => `${trade.account_name}:${trade.id}`)).size !== trades.length) {
        res.status(400).json({ error: 'Duplicate portfolio trade' });
        return;
    }
    const sourceOpenTrades = [];
    for (const value of body.source_open_trades) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            res.status(400).json({ error: 'Invalid source open trade' });
            return;
        }
        const trade = value;
        if (!hasOnlyKeys(trade, ['master_trade_id', 'pair', 'stake_amount', 'profit_ratio'])
            || !Number.isSafeInteger(trade.master_trade_id) || Number(trade.master_trade_id) < 1
            || typeof trade.pair !== 'string' || trade.pair.length < 1 || trade.pair.length > 64
            || !isFiniteNumber(trade.stake_amount) || trade.stake_amount < 0
            || !isFiniteNumber(trade.profit_ratio)) {
            res.status(400).json({ error: 'Invalid source open trade' });
            return;
        }
        sourceOpenTrades.push({
            master_trade_id: Number(trade.master_trade_id),
            pair: trade.pair,
            stake_amount: trade.stake_amount,
            profit_ratio: trade.profit_ratio,
        });
    }
    if (new Set(sourceOpenTrades.map((trade) => trade.master_trade_id)).size !== sourceOpenTrades.length) {
        res.status(400).json({ error: 'Duplicate source open trade' });
        return;
    }
    try {
        res.status(202).json(await (0, copierReportingService_1.storeCopierPortfolioReport)({
            instanceId: req.copierInstanceId,
            observedAt: observedAt,
            complete: body.complete,
            accounts,
            trades,
            sourceOpenTrades,
        }));
    }
    catch (error) {
        next(error);
    }
});
router.get('/members/:membershipId/credentials', rateLimiter_1.copierLimiter, copierAuth_1.requireCopierInstance, async (req, res, next) => {
    const instanceId = req.query.instance_id;
    if (!(0, copierAuth_1.requireMatchingCopierInstance)(req, instanceId, res))
        return;
    if (!isUuid(req.params.membershipId)) {
        res.status(400).json({ error: 'Membership ID is invalid' });
        return;
    }
    try {
        const credentials = await (0, liveCopyService_1.getCopierMemberCredentials)(req.copierInstanceId, req.params.membershipId);
        res.setHeader('Cache-Control', 'no-store, private');
        res.setHeader('Pragma', 'no-cache');
        res.json(credentials);
    }
    catch (error) {
        next(error);
    }
});
router.get('/members', rateLimiter_1.copierLimiter, copierAuth_1.requireCopierInstance, async (req, res, next) => {
    const instanceId = req.query.instance_id;
    if (!(0, copierAuth_1.requireMatchingCopierInstance)(req, instanceId, res))
        return;
    try {
        res.setHeader('Cache-Control', 'no-store, private');
        res.setHeader('Pragma', 'no-cache');
        res.json({ members: await (0, liveCopyService_1.listCopierLiveMemberships)(req.copierInstanceId) });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=copierControl.js.map