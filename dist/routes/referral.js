"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_1 = require("../middleware/auth");
const rateLimiter_1 = require("../middleware/rateLimiter");
const referralService_1 = require("../services/referralService");
const deviceFingerprint_1 = require("../utils/deviceFingerprint");
const database_1 = __importDefault(require("../config/database"));
const router = (0, express_1.Router)();
router.post('/redeem-monthly', auth_1.requireAuth, rateLimiter_1.authLimiter, async (req, res, next) => {
    if (Object.keys(req.body ?? {}).length > 0) {
        res.status(400).json({ error: 'This request does not accept input fields.' });
        return;
    }
    try {
        res.status(201).json(await (0, referralService_1.redeemMonthlySubscriptionWithPoints)(req.user.userId));
    }
    catch (err) {
        next(err);
    }
});
// ── GET /api/referral/my-code ────────────────────────────────────────────────
router.get('/my-code', auth_1.requireAuth, async (req, res, next) => {
    try {
        const rows = await (0, database_1.default) `
        SELECT referral_code FROM users WHERE id = ${req.user.userId} LIMIT 1
      `;
        if (!rows.length) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json({ referralCode: rows[0].referral_code });
    }
    catch (err) {
        next(err);
    }
});
// ── POST /api/referral/validate ──────────────────────────────────────────────
router.post('/validate', (0, express_validator_1.body)('code').isString().notEmpty().trim().toUpperCase(), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    try {
        const result = await (0, referralService_1.validateReferralCode)(req.body.code, req.user?.userId);
        res.json(result);
    }
    catch (err) {
        next(err);
    }
});
// ── POST /api/referral/click ─────────────────────────────────────────────────
router.post('/click', rateLimiter_1.clickLimiter, (0, express_validator_1.body)('code').isString().notEmpty().trim(), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    try {
        await (0, referralService_1.trackClick)({
            code: req.body.code,
            ip: (0, deviceFingerprint_1.getRealIp)(req),
            deviceId: (0, deviceFingerprint_1.getDeviceId)(req),
            userAgent: req.headers['user-agent'] ?? '',
        });
        res.json({ tracked: true });
    }
    catch (err) {
        next(err);
    }
});
// ── GET /api/referral/my-stats ───────────────────────────────────────────────
router.get('/my-stats', auth_1.requireAuth, async (req, res, next) => {
    try {
        const stats = await (0, referralService_1.getReferralStats)(req.user.userId);
        res.json(stats);
    }
    catch (err) {
        next(err);
    }
});
// ── GET /api/referral/my-friends ─────────────────────────────────────────────
router.get('/my-friends', auth_1.requireAuth, async (req, res, next) => {
    try {
        const friends = await (0, referralService_1.getReferralFriends)(req.user.userId);
        res.json({ friends });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=referral.js.map