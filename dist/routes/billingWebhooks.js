"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const billingService_1 = require("../services/billingService");
const paymentProvider_1 = require("../services/paymentProvider");
const rateLimiter_1 = require("../middleware/rateLimiter");
const router = (0, express_1.Router)();
const testProvider = new paymentProvider_1.TestOnlyPaymentProvider();
router.post('/:provider', rateLimiter_1.authLimiter, async (req, res, next) => {
    if (!Buffer.isBuffer(req.body)) {
        res.status(415).json({ error: 'Expected application/json webhook body' });
        return;
    }
    const providerName = req.params.provider;
    // Real adapters remain deliberately unconfigured until DEC-03 and provider verification are approved.
    if (providerName !== 'test-fixture') {
        res.status(404).json({ error: 'Provider not configured' });
        return;
    }
    try {
        const event = testProvider.verifyAndNormalize(req.body, req.header('x-provider-signature'));
        const result = await (0, billingService_1.applyProviderEvent)(event);
        res.status(202).json(result);
    }
    catch (error) {
        if (error instanceof Error && error.message === 'SIGNATURE_INVALID') {
            res.status(401).json({ error: 'Invalid webhook signature' });
            return;
        }
        if (error instanceof Error && error.message === 'EVENT_INVALID') {
            res.status(400).json({ error: 'Invalid provider event' });
            return;
        }
        if (error instanceof Error && error.message === 'PROVIDER_DISABLED') {
            res.status(404).json({ error: 'Provider not configured' });
            return;
        }
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=billingWebhooks.js.map