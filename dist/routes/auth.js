"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const rateLimiter_1 = require("../middleware/rateLimiter");
const auth_1 = require("../middleware/auth");
const authService_1 = require("../services/authService");
const database_1 = __importDefault(require("../config/database"));
const deviceFingerprint_1 = require("../utils/deviceFingerprint");
const router = (0, express_1.Router)();
// ── POST /api/auth/register (Phase 1 email/password) ────────────────────────
router.post('/register', rateLimiter_1.authLimiter, (0, express_validator_1.body)('email').isEmail().normalizeEmail(), (0, express_validator_1.body)('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'), (0, express_validator_1.body)('displayName').optional().isString().trim().isLength({ max: 100 }), (0, express_validator_1.body)('referralCode').optional().isString().trim().toUpperCase().isLength({ max: 10 }), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    try {
        const { email, password, displayName = '', referralCode } = req.body;
        const verification = await (0, authService_1.emailRegister)(email, password, displayName, referralCode);
        res.status(202).json(verification);
    }
    catch (err) {
        next(err);
    }
});
// ── POST /api/auth/login (Phase 1 email/password) ────────────────────────────
router.post('/login', rateLimiter_1.authLimiter, (0, express_validator_1.body)('email').isEmail().normalizeEmail(), (0, express_validator_1.body)('password').notEmpty(), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    try {
        const { email, password } = req.body;
        const result = await (0, authService_1.emailLogin)(email, password);
        if ('verificationRequired' in result) {
            res.status(202).json(result);
            return;
        }
        res.json({ user: sanitizeUser(result.user), ...result.tokens });
    }
    catch (err) {
        next(err);
    }
});
router.post('/password-reset/request', rateLimiter_1.passwordResetLimiter, (0, express_validator_1.body)('email').isEmail().normalizeEmail(), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    try {
        const challenge = await (0, authService_1.requestPasswordReset)(req.body.email);
        res.status(202).json({
            ...challenge,
            message: 'If an email/password account exists for that address, a password reset code has been sent.',
        });
    }
    catch (err) {
        next(err);
    }
});
router.post('/password-reset/complete', rateLimiter_1.passwordResetLimiter, (0, express_validator_1.body)('challengeId').isUUID().withMessage('A password reset request is required.'), (0, express_validator_1.body)('code').isString().isLength({ min: 6, max: 6 }).isNumeric().withMessage('Enter the six-digit password reset code.'), (0, express_validator_1.body)('newPassword').isString().isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    try {
        const { challengeId, code, newPassword } = req.body;
        await (0, authService_1.completePasswordReset)(challengeId, code, newPassword);
        res.json({ message: 'Password reset successfully. Sign in with your new password.' });
    }
    catch (err) {
        next(err);
    }
});
// ── POST /api/auth/google ─────────────────────────────────────────────────────
router.post('/google', rateLimiter_1.authLimiter, (0, express_validator_1.body)('idToken').isString().notEmpty().withMessage('idToken is required'), (0, express_validator_1.body)('referralCode').optional().isString().trim().isLength({ max: 10 }), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    try {
        const { idToken, referralCode } = req.body;
        const result = await (0, authService_1.googleSignIn)(idToken, referralCode);
        if ('verificationRequired' in result) {
            res.status(202).json(result);
            return;
        }
        res.status(200).json({ user: sanitizeUser(result.user), ...result.tokens });
    }
    catch (err) {
        next(err);
    }
});
// ── POST /api/auth/verify-email ───────────────────────────────────────────────
router.post('/verify-email', rateLimiter_1.authLimiter, (0, express_validator_1.body)('challengeId').isUUID().withMessage('A verification request is required.'), (0, express_validator_1.body)('code').isString().isLength({ min: 6, max: 6 }).isNumeric().withMessage('Enter the six-digit email code.'), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    try {
        const { challengeId, code } = req.body;
        const { user, tokens } = await (0, authService_1.completeEmailVerification)(challengeId, code, {
            ip: (0, deviceFingerprint_1.getRealIp)(req),
            deviceId: (0, deviceFingerprint_1.getDeviceId)(req),
        });
        res.json({ user: sanitizeUser(user), ...tokens });
    }
    catch (err) {
        next(err);
    }
});
// ── POST /api/auth/verification/resend ────────────────────────────────────────
router.post('/verification/resend', rateLimiter_1.authLimiter, (0, express_validator_1.body)('challengeId').isUUID().withMessage('A verification request is required.'), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    try {
        const { challengeId } = req.body;
        res.json(await (0, authService_1.resendEmailVerification)(challengeId));
    }
    catch (err) {
        next(err);
    }
});
// ── POST /api/auth/refresh ───────────────────────────────────────────────────
router.post('/refresh', (0, express_validator_1.body)('refreshToken').isString().notEmpty(), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    try {
        const tokens = await (0, authService_1.refreshTokens)(req.body.refreshToken);
        res.json(tokens);
    }
    catch (err) {
        next(err);
    }
});
// ── POST /api/auth/logout ────────────────────────────────────────────────────
router.post('/logout', auth_1.requireAuth, async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        if (refreshToken) {
            await (0, authService_1.revokeRefreshToken)(refreshToken);
        }
        else {
            // Revoke ALL sessions for this user
            await (0, authService_1.revokeAllTokensForUser)(req.user.userId);
        }
        res.json({ message: 'Logged out successfully' });
    }
    catch (err) {
        next(err);
    }
});
// ── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get('/me', auth_1.requireAuth, async (req, res, next) => {
    try {
        const rows = await (0, database_1.default) `
        SELECT * FROM users WHERE id = ${req.user.userId} AND is_active = true LIMIT 1
      `;
        if (!rows.length) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json({ user: sanitizeUser(rows[0]) });
    }
    catch (err) {
        next(err);
    }
});
// ── Helpers ──────────────────────────────────────────────────────────────────
function sanitizeUser(user) {
    return {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        photoUrl: user.photo_url?.startsWith('object://') ? null : user.photo_url,
        referralCode: user.referral_code,
        plan: user.plan,
        createdAt: user.created_at,
        lastLoginAt: user.last_login_at,
    };
}
exports.default = router;
//# sourceMappingURL=auth.js.map