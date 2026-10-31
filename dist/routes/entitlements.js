"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_1 = require("../middleware/auth");
const rateLimiter_1 = require("../middleware/rateLimiter");
const idempotencyService_1 = require("../services/idempotencyService");
const entitlementService_1 = require("../services/entitlementService");
const copierReportingService_1 = require("../services/copierReportingService");
const router = (0, express_1.Router)();
function readIdempotencyKey(req) {
    const raw = req.header('Idempotency-Key') ?? req.header('idempotency-key');
    return (0, idempotencyService_1.assertValidIdempotencyKey)(raw);
}
function rejectUnexpectedBodyFields(req, allowed, res) {
    if (Object.keys(req.body ?? {}).some((key) => !allowed.includes(key))) {
        res.status(400).json({ error: 'Unexpected request field' });
        return true;
    }
    return false;
}
router.get('/me/entitlements', auth_1.requireAuth, async (req, res, next) => {
    try {
        const entitlements = await (0, entitlementService_1.getEntitlements)(req.user.userId);
        const observer = entitlements.observer;
        const liveCopy = entitlements.live_copy;
        res.json({
            ...entitlements,
            observer: {
                ...(typeof observer === 'object' && observer !== null ? observer : {}),
                consent_version: process.env.OBSERVER_CONSENT_VERSION ?? null,
            },
            live_copy: {
                ...(typeof liveCopy === 'object' && liveCopy !== null ? liveCopy : {}),
                current_consent_version: process.env.LIVE_COPY_CONSENT_VERSION ?? null,
            },
        });
    }
    catch (error) {
        next(error);
    }
});
router.get('/me/observer-portfolio', auth_1.requireAuth, async (req, res, next) => {
    try {
        res.json(await (0, copierReportingService_1.getObserverPortfolio)(req.user.userId));
    }
    catch (error) {
        next(error);
    }
});
router.post('/observer-access-requests', rateLimiter_1.authLimiter, auth_1.requireAuth, auth_1.requireVerifiedIdentity, (0, express_validator_1.body)('consent_accepted').isBoolean().custom((value) => value === true), (0, express_validator_1.body)('consent_version').isString().trim().matches(/^[A-Za-z0-9._-]{1,64}$/), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ error: 'Invalid observer access request' });
        return;
    }
    if (rejectUnexpectedBodyFields(req, ['consent_accepted', 'consent_version'], res))
        return;
    if (!process.env.OBSERVER_CONSENT_VERSION) {
        res.status(503).json({ error: 'Observer consent is not configured' });
        return;
    }
    if (req.body.consent_version !== process.env.OBSERVER_CONSENT_VERSION) {
        res.status(409).json({ error: 'Consent version is no longer current' });
        return;
    }
    try {
        const idempotencyKey = readIdempotencyKey(req);
        const result = await (0, entitlementService_1.requestObserverAccess)(req.user.userId, req.body.consent_version, idempotencyKey);
        res.status(result.httpStatus).json({ request_id: result.requestId, status: result.status });
    }
    catch (error) {
        if (error.statusCode === 400) {
            res.status(400).json({ error: error.message });
            return;
        }
        next(error);
    }
});
router.post('/access-requests', rateLimiter_1.authLimiter, (0, express_validator_1.body)('email').isEmail().normalizeEmail().isLength({ max: 320 }), (0, express_validator_1.body)('consent_accepted').isBoolean().custom((value) => value === true), (0, express_validator_1.body)('consent_version').isString().trim().matches(/^[A-Za-z0-9._-]{1,64}$/), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ error: 'Invalid access request' });
        return;
    }
    if (rejectUnexpectedBodyFields(req, ['email', 'consent_accepted', 'consent_version'], res))
        return;
    if (!process.env.ACCESS_REQUEST_CONSENT_VERSION) {
        res.status(503).json({ error: 'Access request consent is not configured' });
        return;
    }
    if (req.body.consent_version !== process.env.ACCESS_REQUEST_CONSENT_VERSION) {
        res.status(409).json({ error: 'Consent version is no longer current' });
        return;
    }
    try {
        const idempotencyKey = readIdempotencyKey(req);
        const result = await (0, entitlementService_1.createPublicAccessRequest)(req.body.email, req.body.consent_version, idempotencyKey);
        res.status(result.httpStatus).json({ request_id: result.requestId, status: 'pending' });
    }
    catch (error) {
        if (error.statusCode === 400) {
            res.status(400).json({ error: error.message });
            return;
        }
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=entitlements.js.map