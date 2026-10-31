"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_1 = require("../middleware/auth");
const rateLimiter_1 = require("../middleware/rateLimiter");
const masterOperationsService_1 = require("../services/masterOperationsService");
const paymentPlans_1 = require("../config/paymentPlans");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth, auth_1.requireVerifiedIdentity);
router.get('/plans', (_req, res) => {
    res.json({
        plans: paymentPlans_1.PAYMENT_PLANS.map(({ key, label, price, currency, duration, paymentUrl }) => ({
            key, label, price, currency, duration, payment_url: paymentUrl,
        })),
    });
});
router.get('/manual-proofs', async (req, res, next) => {
    try {
        res.json({ payments: await (0, masterOperationsService_1.listManualPaymentProofs)(req.user.userId) });
    }
    catch (error) {
        next(error);
    }
});
router.post('/manual-proofs', rateLimiter_1.authLimiter, (0, express_validator_1.body)('plan_key').isIn(paymentPlans_1.PAYMENT_PLANS.map((plan) => plan.key)), (0, express_validator_1.body)('transaction_ref').isString().trim().isLength({ min: 3, max: 255 }), (0, express_validator_1.body)('amount').isFloat({ min: 0.00000001, max: 100000000000 }), (0, express_validator_1.body)('currency').isString().trim().matches(/^[A-Za-z0-9]{3,12}$/), (0, express_validator_1.body)('payment_details').optional().isString().trim().isLength({ max: 2000 }), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ error: 'Invalid manual payment proof' });
        return;
    }
    if (Object.keys(req.body ?? {}).some((key) => !['plan_key', 'transaction_ref', 'amount', 'currency', 'payment_details'].includes(key))) {
        res.status(400).json({ error: 'Unexpected request field' });
        return;
    }
    try {
        const plan = (0, paymentPlans_1.getPaymentPlan)(req.body.plan_key);
        if (!plan) {
            res.status(400).json({ error: 'Invalid payment plan' });
            return;
        }
        if (Number(req.body.amount) !== plan.price || String(req.body.currency).trim().toUpperCase() !== plan.currency) {
            res.status(400).json({ error: 'Payment amount and currency do not match the selected plan' });
            return;
        }
        const result = await (0, masterOperationsService_1.submitManualPaymentProof)(req.user.userId, {
            planKey: plan.key,
            transactionRef: req.body.transaction_ref,
            amount: Number(req.body.amount),
            currency: req.body.currency.trim(),
            paymentDetails: req.body.payment_details ?? '',
        });
        res.status(201).json(result);
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=manualPayments.js.map