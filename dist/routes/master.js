"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_1 = require("../middleware/auth");
const masterOperationsService_1 = require("../services/masterOperationsService");
const environment_1 = require("../config/environment");
const copierReportingService_1 = require("../services/copierReportingService");
const copierNotificationService_1 = require("../services/copierNotificationService");
const database_1 = __importDefault(require("../config/database"));
const egressIpService_1 = require("../services/egressIpService");
const binanceSetupGuideEmailService_1 = require("../services/binanceSetupGuideEmailService");
const router = (0, express_1.Router)();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function pageValue(value, fallback, maximum) {
    if (value === undefined)
        return fallback;
    if (typeof value !== 'string' || !/^\d{1,8}$/.test(value))
        return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
}
function rejectUnexpectedBodyFields(req, allowed, res) {
    if (Object.keys(req.body ?? {}).some((key) => !allowed.includes(key))) {
        res.status(400).json({ error: 'Unexpected request field' });
        return true;
    }
    return false;
}
function hasValidBody(req, res) {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ error: 'Invalid master operation' });
        return false;
    }
    return true;
}
router.get('/status', auth_1.requireAuth, async (req, res, next) => {
    try {
        res.json({ isMaster: await (0, auth_1.isMasterAccount)(req.user.userId) });
    }
    catch (error) {
        next(error);
    }
});
router.use(auth_1.requireAuth, auth_1.requireMasterAccount);
router.get('/system-status', async (_req, res, next) => {
    try {
        const [status, environment] = await Promise.all([
            (0, masterOperationsService_1.getMasterSystemStatus)(),
            Promise.resolve((0, environment_1.getEnvironmentConfig)()),
        ]);
        const isFunctionRuntime = process.env.NEON_FUNCTION_RUNTIME === 'true';
        res.json({
            ...status,
            bot: {
                ...status.bot,
                runtime: isFunctionRuntime ? 'FUNCTION_ON_DEMAND' : 'PROCESS_WORKER',
                market_feed: isFunctionRuntime ? 'NOT_HOSTED' : 'PROCESS_LOCAL',
            },
            runtime: {
                deployment: isFunctionRuntime ? 'NEON_FUNCTION' : 'NODE_RUNTIME',
                node_environment: process.env.NODE_ENV ?? 'unknown',
                master_account_configured: Boolean(process.env.MASTER_ACCOUNT_EMAIL?.trim()),
                copier_event_ingest_configured: Boolean(process.env.COPIER_EVENT_INGEST_TOKEN?.trim()),
            },
            trading: {
                environment: environment.environment,
                is_live: environment.isLive,
                is_live_approved: environment.isLiveApproved,
                binance_testnet: environment.binanceTestnet,
                canary_cohort_enabled: environment.canaryCohortEnabled,
            },
        });
    }
    catch (error) {
        next(error);
    }
});
router.get('/overview', async (_req, res, next) => {
    try {
        res.json(await (0, masterOperationsService_1.getMasterOverview)());
    }
    catch (error) {
        next(error);
    }
});
router.get('/users', async (req, res, next) => {
    const limit = pageValue(req.query.limit, 50, 100);
    const offset = pageValue(req.query.offset, 0, 10_000_000);
    if (limit === null || limit < 1 || offset === null) {
        res.status(400).json({ error: 'Invalid pagination parameters' });
        return;
    }
    try {
        res.json({ users: await (0, masterOperationsService_1.listMasterUsers)(limit, offset), limit, offset });
    }
    catch (error) {
        next(error);
    }
});
router.get('/requests', async (_req, res, next) => {
    try {
        res.json(await (0, masterOperationsService_1.listMasterRequests)());
    }
    catch (error) {
        next(error);
    }
});
router.get('/payments', async (req, res, next) => {
    const limit = pageValue(req.query.limit, 50, 100);
    const offset = pageValue(req.query.offset, 0, 10_000_000);
    if (limit === null || limit < 1 || offset === null) {
        res.status(400).json({ error: 'Invalid pagination parameters' });
        return;
    }
    try {
        res.json({ payments: await (0, masterOperationsService_1.listManualPaymentProofs)(undefined, limit, offset), limit, offset });
    }
    catch (error) {
        next(error);
    }
});
router.get('/audit', async (req, res, next) => {
    const limit = pageValue(req.query.limit, 50, 100);
    const offset = pageValue(req.query.offset, 0, 10_000_000);
    if (limit === null || limit < 1 || offset === null) {
        res.status(400).json({ error: 'Invalid pagination parameters' });
        return;
    }
    try {
        res.json({ events: await (0, masterOperationsService_1.listMasterAuditEvents)(limit, offset), limit, offset });
    }
    catch (error) {
        next(error);
    }
});
router.get('/copier/stats', async (_req, res, next) => {
    try {
        res.json(await (0, copierReportingService_1.getMasterCopierPortfolio)());
    }
    catch (error) {
        next(error);
    }
});
router.get('/copier/notifications', async (req, res, next) => {
    const limit = pageValue(req.query.limit, 50, 100);
    const offset = pageValue(req.query.offset, 0, 10_000_000);
    if (limit === null || limit < 1 || offset === null) {
        res.status(400).json({ error: 'Invalid pagination parameters' });
        return;
    }
    try {
        res.json({
            events: await (0, copierNotificationService_1.listCopierNotificationEvents)(limit, offset),
            limit,
            offset,
        });
    }
    catch (error) {
        next(error);
    }
});
router.get('/copier/trades', async (req, res, next) => {
    const limit = pageValue(req.query.limit, 50, 100);
    const offset = pageValue(req.query.offset, 0, 10_000_000);
    const account = req.query.account;
    const openOnly = req.query.open_only;
    if (limit === null || limit < 1 || offset === null
        || (account !== undefined && (typeof account !== 'string' || !/^[A-Za-z0-9._:-]{1,255}$/.test(account)))
        || (openOnly !== undefined && openOnly !== 'true' && openOnly !== 'false')) {
        res.status(400).json({ error: 'Invalid copier trade query' });
        return;
    }
    try {
        res.json(await (0, copierReportingService_1.getMasterCopierTrades)({
            limit, offset, ...(typeof account === 'string' ? { account } : {}),
            ...(openOnly === 'true' ? { openOnly: true } : {}),
        }));
    }
    catch (error) {
        next(error);
    }
});
router.get('/copier/trades/:tradeId/orders', async (req, res, next) => {
    if (!/^\d{1,12}$/.test(req.params.tradeId) || Number(req.params.tradeId) < 1) {
        res.status(400).json({ error: 'Invalid copier trade ID' });
        return;
    }
    try {
        res.json({ orders: await (0, copierReportingService_1.getMasterCopierOrders)(Number(req.params.tradeId)) });
    }
    catch (error) {
        next(error);
    }
});
router.get('/copier/accounts/:accountRef/binance-ip-guide-preview', async (req, res, next) => {
    const accountRef = req.params.accountRef;
    if (typeof accountRef !== 'string' || !/^[A-Za-z0-9._:-]{1,255}$/.test(accountRef)) {
        res.status(400).json({ error: 'Invalid account reference' });
        return;
    }
    try {
        const rows = await (0, database_1.default) `
      SELECT m.account_ref, m.account_kind, m.user_id, u.email, u.display_name
      FROM operator_managed_live_accounts m
      JOIN users u ON u.id = m.user_id
      WHERE m.account_ref = ${accountRef} AND m.active = TRUE
      LIMIT 1
    `;
        if (!rows.length) {
            res.status(404).json({ error: `Operator-managed live account '${accountRef}' was not found.` });
            return;
        }
        const accountStatsRows = await (0, database_1.default) `
      SELECT stats FROM copier_portfolio_accounts
      WHERE account_name = ${accountRef}
      ORDER BY observed_at DESC LIMIT 1
    `;
        const stats = accountStatsRows[0]?.stats ?? {};
        const currentErrorCode = typeof stats.exchange_error_code === 'string' ? stats.exchange_error_code : null;
        const currentErrorMessage = typeof stats.exchange_error_message === 'string' ? stats.exchange_error_message : null;
        const egress = await (0, egressIpService_1.getVerifiedEgressIp)();
        let preview = null;
        if (egress.ip && egress.checkedAt) {
            preview = (0, binanceSetupGuideEmailService_1.binanceIpGuideEmailTemplate)({
                accountRef,
                recipientEmail: rows[0].email,
                displayName: rows[0].display_name,
                egressIp: egress.ip,
                ipCheckedAt: egress.checkedAt,
                currentErrorCode,
                currentErrorMessage,
            });
        }
        res.json({
            account_ref: accountRef,
            account_kind: rows[0].account_kind,
            recipient_email: rows[0].email,
            recipient_name: rows[0].display_name,
            egress_ip: egress.ip,
            ip_checked_at: egress.checkedAt ? egress.checkedAt.toISOString() : null,
            ip_status: egress.status,
            stale: egress.stale,
            age_seconds: egress.ageSeconds,
            error: egress.error ?? null,
            current_error_code: currentErrorCode,
            current_error_message: currentErrorMessage,
            preview,
        });
    }
    catch (error) {
        next(error);
    }
});
router.post('/copier/accounts/:accountRef/send-binance-ip-guide', async (req, res, next) => {
    const accountRef = req.params.accountRef;
    if (typeof accountRef !== 'string' || !/^[A-Za-z0-9._:-]{1,255}$/.test(accountRef)) {
        res.status(400).json({ error: 'Invalid account reference' });
        return;
    }
    try {
        const egress = await (0, egressIpService_1.getVerifiedEgressIp)();
        if (egress.status !== 'VERIFIED' || !egress.ip || egress.stale || !egress.checkedAt) {
            res.status(503).json({
                error: 'Cannot send setup guide: Bot host PC public egress IP cannot be verified or is stale.',
                details: egress.error ?? 'Unverified egress IP',
            });
            return;
        }
        const result = await (0, binanceSetupGuideEmailService_1.sendBinanceIpGuideEmail)({
            masterUserId: req.user.userId,
            accountRef,
            egressIp: egress.ip,
            ipCheckedAt: egress.checkedAt,
        });
        res.json(result);
    }
    catch (error) {
        next(error);
    }
});
router.post('/requests/observer/:requestId', (0, express_validator_1.body)('decision').isIn(['approve', 'reject']), (0, express_validator_1.body)('note').optional().isString().trim().isLength({ max: 1000 }), async (req, res, next) => {
    if (!hasValidBody(req, res) || rejectUnexpectedBodyFields(req, ['decision', 'note'], res))
        return;
    const requestId = req.params.requestId;
    if (typeof requestId !== 'string' || !UUID_PATTERN.test(requestId)) {
        res.status(400).json({ error: 'Invalid observer request ID' });
        return;
    }
    try {
        res.json(await (0, masterOperationsService_1.decideObserverRequest)(requestId, req.user.userId, req.body.decision, req.body.note ?? ''));
    }
    catch (error) {
        next(error);
    }
});
router.post('/requests/waitlist/:requestId', (0, express_validator_1.body)('decision').isIn(['approve', 'reject']), (0, express_validator_1.body)('note').optional().isString().trim().isLength({ max: 1000 }), async (req, res, next) => {
    if (!hasValidBody(req, res) || rejectUnexpectedBodyFields(req, ['decision', 'note'], res))
        return;
    const requestId = req.params.requestId;
    if (typeof requestId !== 'string' || !UUID_PATTERN.test(requestId)) {
        res.status(400).json({ error: 'Invalid waitlist request ID' });
        return;
    }
    try {
        res.json(await (0, masterOperationsService_1.decideWaitlistRequest)(requestId, req.user.userId, req.body.decision, req.body.note ?? ''));
    }
    catch (error) {
        next(error);
    }
});
router.post('/payments/:proofId/decision', (0, express_validator_1.body)('decision').isIn(['approve', 'reject']), (0, express_validator_1.body)('plan').optional().isString().trim().matches(/^[A-Za-z0-9._-]{1,64}$/), (0, express_validator_1.body)('paid_through_at').optional().isISO8601({ strict: true, strictSeparator: true }), (0, express_validator_1.body)('note').optional().isString().trim().isLength({ max: 1000 }), async (req, res, next) => {
    if (!hasValidBody(req, res)
        || rejectUnexpectedBodyFields(req, ['decision', 'plan', 'paid_through_at', 'note'], res))
        return;
    const proofId = req.params.proofId;
    if (typeof proofId !== 'string' || !UUID_PATTERN.test(proofId)) {
        res.status(400).json({ error: 'Invalid payment proof ID' });
        return;
    }
    if (req.body.decision === 'approve' && !req.body.plan) {
        res.status(400).json({ error: 'Plan is required for approval' });
        return;
    }
    const paidThroughAt = req.body.paid_through_at
        ? new Date(req.body.paid_through_at)
        : undefined;
    if (paidThroughAt && (!Number.isFinite(paidThroughAt.getTime()) || paidThroughAt.getTime() <= Date.now())) {
        res.status(400).json({ error: 'paid_through_at must be a future date' });
        return;
    }
    try {
        res.json(await (0, masterOperationsService_1.decideManualPaymentProof)(proofId, req.user.userId, req.body.decision, {
            plan: req.body.plan,
            paidThroughAt,
            note: req.body.note ?? '',
        }));
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=master.js.map