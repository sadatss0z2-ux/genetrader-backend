"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_1 = require("../middleware/auth");
const requireReauth_1 = require("../middleware/requireReauth");
const rateLimiter_1 = require("../middleware/rateLimiter");
const authService_1 = require("../services/authService");
const router = (0, express_1.Router)();
router.post('/reauth', rateLimiter_1.authLimiter, auth_1.requireAuth, (0, express_validator_1.body)('password').isString().isLength({ min: 1, max: 1024 }), (0, express_validator_1.body)('action').optional().isIn([
    'sensitive_operation',
    'rotate_exchange_credentials',
    'revoke_exchange_credentials',
    'enable_live_trading',
    'canary_enrollment',
    'live_copy_consent',
]), async (req, res) => {
    const userId = req.user.userId;
    if (req.body?.password === undefined || req.body.password === null || req.body.password === '') {
        res.status(400).json({
            error: 'Password is required for reauthentication.',
            code: 'MISSING_PASSWORD',
        });
        return;
    }
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({
            error: 'A valid password and supported reauthentication action are required.',
            code: 'INVALID_REAUTH_REQUEST',
        });
        return;
    }
    if (Object.keys(req.body ?? {}).some((key) => !['password', 'action'].includes(key))) {
        res.status(400).json({ error: 'Unexpected request field.', code: 'INVALID_REAUTH_REQUEST' });
        return;
    }
    const { password, action = 'sensitive_operation' } = req.body || {};
    const isValid = await (0, authService_1.verifyPassword)(userId, password);
    if (!isValid) {
        res.status(401).json({
            error: 'Invalid password. Reauthentication failed.',
            code: 'INVALID_REAUTH_PASSWORD',
        });
        return;
    }
    const { token, expiresIn, expiresAt } = (0, requireReauth_1.issueReauthToken)(userId, action);
    res.json({
        success: true,
        reauthToken: token,
        expiresIn,
        expiresAt,
        action,
        userId,
    });
});
exports.default = router;
//# sourceMappingURL=reauth.js.map