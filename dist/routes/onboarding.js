"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Onboarding routes.
 *
 * Security notes:
 * - Every route requires authentication via requireAuth.
 * - getDecryptedApiKeys is intentionally NOT imported here. Decrypted credential
 *   material must never be returned to a client over the API. The function is
 *   internal to server-side service calls only.
 */
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_1 = require("../middleware/auth");
const onboardingService_1 = require("../services/onboardingService");
const router = (0, express_1.Router)();
// ── GET /api/onboarding/status ───────────────────────────────────────────────
router.get('/status', auth_1.requireAuth, async (req, res, next) => {
    try {
        const status = await (0, onboardingService_1.getOnboardingStatus)(req.user.userId);
        res.json(status);
    }
    catch (err) {
        next(err);
    }
});
// ── POST /api/onboarding/observer ────────────────────────────────────────────
router.post('/observer', auth_1.requireAuth, (0, express_validator_1.body)('accepted')
    .custom((value) => typeof value === 'boolean' && value)
    .withMessage('Observer disclosure acknowledgement is required'), (0, express_validator_1.body)('disclosureVersion').isString().trim().notEmpty()
    .withMessage('disclosureVersion is required'), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    try {
        const result = await (0, onboardingService_1.completeObserverOnboarding)(req.user.userId, req.body.disclosureVersion, req.body.accepted, req.ip, req.get('user-agent'));
        if (!result.success) {
            res.status(409).json({ message: result.message });
            return;
        }
        res.json(result);
    }
    catch (err) {
        next(err);
    }
});
// ── POST /api/onboarding/complete ────────────────────────────────────────────
router.post('/complete', auth_1.requireAuth, (0, express_validator_1.body)('accountSize').isFloat({ min: 0 }).withMessage('accountSize must be a non-negative number'), (0, express_validator_1.body)('accountSizeCurrency').isIn(['USDT', 'BTC', 'ETH']).withMessage('accountSizeCurrency must be USDT, BTC, or ETH'), (0, express_validator_1.body)('binanceApiKey').isString().trim().notEmpty().withMessage('binanceApiKey is required'), (0, express_validator_1.body)('binanceApiSecret').isString().trim().notEmpty().withMessage('binanceApiSecret is required'), (0, express_validator_1.body)('riskSettings.maxPositionSize').optional().isFloat({ min: 0 }).withMessage('maxPositionSize must be a non-negative number'), (0, express_validator_1.body)('riskSettings.maxOpenTrades').optional().isInt({ min: 1 }).withMessage('maxOpenTrades must be a positive integer'), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    try {
        const result = await (0, onboardingService_1.completeOnboarding)(req.user.userId, req.body);
        res.json(result);
    }
    catch (err) {
        next(err);
    }
});
// ── PUT /api/onboarding/observer-mode ────────────────────────────────────────
router.put('/observer-mode', auth_1.requireAuth, (0, express_validator_1.body)('observerMode')
    .custom((value) => typeof value === 'boolean')
    .withMessage('observerMode must be a boolean'), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    try {
        await (0, onboardingService_1.updateObserverMode)(req.user.userId, req.body.observerMode);
        res.json({ message: 'Observer mode updated' });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=onboarding.js.map