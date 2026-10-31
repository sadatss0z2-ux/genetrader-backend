"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_1 = require("../middleware/auth");
const tradingPolicyService_1 = require("../services/tradingPolicyService");
const router = (0, express_1.Router)();
// ── AUDIT LOGS ──────────────────────────────────────────────────────────────
// GET /api/policy/audit
router.get('/audit', auth_1.requireAuth, (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    try {
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
        const logs = await (0, tradingPolicyService_1.getPolicyAuditLogs)(req.user.userId, limit);
        res.json(logs);
    }
    catch (err) {
        next(err);
    }
});
// ── GLOBAL HALT ─────────────────────────────────────────────────────────────
// GET /api/policy/halt
router.get('/halt', auth_1.requireAuth, async (req, res, next) => {
    try {
        const status = await (0, tradingPolicyService_1.getGlobalHaltStatus)(req.user.userId);
        res.json(status);
    }
    catch (err) {
        next(err);
    }
});
// PUT /api/policy/halt
router.put('/halt', auth_1.requireAuth, (0, express_validator_1.body)('halted')
    .custom((val) => typeof val === 'boolean')
    .withMessage('halted must be a boolean'), (0, express_validator_1.body)('reason').optional().isString().trim(), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    try {
        const updated = await (0, tradingPolicyService_1.setGlobalHalt)(req.user.userId, req.body.halted, req.body.reason, 'USER', req.ip, req.get('user-agent'));
        res.json(updated);
    }
    catch (err) {
        next(err);
    }
});
// ── SYMBOL / PAIR CONFIGURATIONS ────────────────────────────────────────────
// GET /api/policy/pairs
router.get('/pairs', auth_1.requireAuth, async (req, res, next) => {
    try {
        const configs = await (0, tradingPolicyService_1.getSymbolConfigs)(req.user.userId);
        res.json(configs);
    }
    catch (err) {
        next(err);
    }
});
// GET /api/policy/pairs/:symbol
router.get('/pairs/:symbol', auth_1.requireAuth, (0, express_validator_1.param)('symbol').isString().trim().isLength({ min: 1, max: 20 }), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    try {
        const symbol = req.params.symbol;
        const config = await (0, tradingPolicyService_1.getSymbolConfig)(req.user.userId, symbol);
        if (!config) {
            res.status(404).json({ error: `No configuration found for symbol ${symbol}` });
            return;
        }
        res.json(config);
    }
    catch (err) {
        next(err);
    }
});
// POST /api/policy/pairs/:symbol/enable
// Requires password reauthentication + explicit consentVersion
router.post('/pairs/:symbol/enable', auth_1.requireAuth, (0, express_validator_1.param)('symbol').isString().trim().isLength({ min: 1, max: 20 }), (0, express_validator_1.body)('password').isString().notEmpty().withMessage('password is required for reauthentication'), (0, express_validator_1.body)('consentVersion').isString().trim().notEmpty().withMessage('consentVersion is required'), (0, express_validator_1.body)('maxPositionSize').optional().isFloat({ min: 0 }).withMessage('maxPositionSize must be a non-negative number'), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    try {
        const symbol = req.params.symbol;
        const { password, consentVersion, maxPositionSize } = req.body;
        const updated = await (0, tradingPolicyService_1.enableSymbolWithReauth)({
            userId: req.user.userId,
            symbol,
            password,
            consentVersion,
            maxPositionSize: maxPositionSize !== undefined ? parseFloat(maxPositionSize) : undefined,
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });
        res.json(updated);
    }
    catch (err) {
        next(err);
    }
});
// POST /api/policy/pairs/:symbol/disable
router.post('/pairs/:symbol/disable', auth_1.requireAuth, (0, express_validator_1.param)('symbol').isString().trim().isLength({ min: 1, max: 20 }), (0, express_validator_1.body)('reason').optional().isString().trim(), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    try {
        const symbol = req.params.symbol;
        const { reason } = req.body;
        const updated = await (0, tradingPolicyService_1.disableSymbol)({
            userId: req.user.userId,
            symbol,
            reason,
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });
        res.json(updated);
    }
    catch (err) {
        next(err);
    }
});
// PUT /api/policy/pairs/:symbol/halt
router.put('/pairs/:symbol/halt', auth_1.requireAuth, (0, express_validator_1.param)('symbol').isString().trim().isLength({ min: 1, max: 20 }), (0, express_validator_1.body)('halted').custom((val) => typeof val === 'boolean').withMessage('halted must be a boolean'), (0, express_validator_1.body)('reason').optional().isString().trim(), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    try {
        const symbol = req.params.symbol;
        const { halted, reason } = req.body;
        const updated = await (0, tradingPolicyService_1.setSymbolHalt)({
            userId: req.user.userId,
            symbol,
            halted,
            reason,
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });
        res.json(updated);
    }
    catch (err) {
        next(err);
    }
});
// PUT /api/policy/pairs/:symbol
router.put('/pairs/:symbol', auth_1.requireAuth, (0, express_validator_1.param)('symbol').isString().trim().isLength({ min: 1, max: 20 }), (0, express_validator_1.body)('enabled').optional().custom((val) => typeof val === 'boolean').withMessage('enabled must be a boolean'), (0, express_validator_1.body)('halted').optional().custom((val) => typeof val === 'boolean').withMessage('halted must be a boolean'), (0, express_validator_1.body)('maxPositionSize').optional().isFloat({ min: 0 }).withMessage('maxPositionSize must be a non-negative number'), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    try {
        const symbol = req.params.symbol;
        const { enabled, halted, maxPositionSize } = req.body;
        const updated = await (0, tradingPolicyService_1.upsertSymbolConfig)(req.user.userId, symbol, {
            enabled,
            halted,
            maxPositionSize: maxPositionSize !== undefined ? parseFloat(maxPositionSize) : undefined,
        });
        res.json(updated);
    }
    catch (err) {
        next(err);
    }
});
// ── RISK DRAFTS ─────────────────────────────────────────────────────────────
// GET /api/policy/draft
router.get('/draft', auth_1.requireAuth, async (req, res, next) => {
    try {
        const draft = await (0, tradingPolicyService_1.getRiskDraft)(req.user.userId);
        if (!draft) {
            res.json({ status: 'NONE', draftData: null });
            return;
        }
        res.json(draft);
    }
    catch (err) {
        next(err);
    }
});
// PUT /api/policy/draft
router.put('/draft', auth_1.requireAuth, (0, express_validator_1.body)('draftData').isObject().withMessage('draftData must be an object'), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    try {
        const saved = await (0, tradingPolicyService_1.saveRiskDraft)(req.user.userId, req.body.draftData);
        res.json(saved);
    }
    catch (err) {
        next(err);
    }
});
// POST /api/policy/draft/commit
router.post('/draft/commit', auth_1.requireAuth, async (req, res, next) => {
    try {
        const result = await (0, tradingPolicyService_1.commitRiskDraft)(req.user.userId);
        res.json(result);
    }
    catch (err) {
        next(err);
    }
});
// POST /api/policy/draft/discard
router.post('/draft/discard', auth_1.requireAuth, async (req, res, next) => {
    try {
        await (0, tradingPolicyService_1.discardRiskDraft)(req.user.userId);
        res.json({ message: 'Risk draft discarded' });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=tradingPolicy.js.map