"use strict";
/**
 * Trade Plans Route
 * Exposes TradePlanService via REST endpoints.
 * Handles Chart Trade and Trailing Stop After Entry for manual and automated orders.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.tradePlanService = void 0;
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_1 = require("../middleware/auth");
const rateLimiter_1 = require("../middleware/rateLimiter");
const tradePlanService_1 = require("../services/tradePlanService");
const orders_1 = require("./orders");
const crypto_1 = require("crypto");
const router = (0, express_1.Router)();
// Shared TradePlanService instance
exports.tradePlanService = new tradePlanService_1.TradePlanService({ orderService: orders_1.orderService });
function sendValidationErrors(req, res) {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return true;
    }
    return false;
}
/**
 * POST /api/trade-plans/preview
 * Compute trade plan metrics, fee estimates, R:R, and filter checks without submitting.
 */
router.post('/preview', auth_1.requireAuth, (0, express_validator_1.body)('symbol').isString().trim().isLength({ min: 1, max: 20 }), (0, express_validator_1.body)('side').isIn(['BUY', 'SELL']), (0, express_validator_1.body)('entryPrice').isFloat({ gt: 0 }), (0, express_validator_1.body)('takeProfitPrice').isFloat({ gt: 0 }), (0, express_validator_1.body)('stopLossPrice').isFloat({ gt: 0 }), (0, express_validator_1.body)('quantity').isFloat({ gt: 0 }), (0, express_validator_1.body)('availableBalance').optional().isFloat({ min: 0 }), (req, res, next) => {
    if (sendValidationErrors(req, res))
        return;
    try {
        const { symbol, side, entryPrice, takeProfitPrice, stopLossPrice, quantity, availableBalance, trailingPercentage, trailingDistance, } = req.body;
        const preview = exports.tradePlanService.previewPlan({
            userId: req.user.userId,
            symbol,
            planType: req.body.planType || 'CHART_TRADE',
            side,
            entryType: req.body.entryType || 'LIMIT',
            entryPrice: Number(entryPrice),
            takeProfitPrice: Number(takeProfitPrice),
            stopLossPrice: Number(stopLossPrice),
            quantity: Number(quantity),
            availableBalance: availableBalance ? Number(availableBalance) : undefined,
            trailingPercentage: trailingPercentage ? Number(trailingPercentage) : undefined,
            trailingDistance: trailingDistance ? Number(trailingDistance) : undefined,
        });
        res.json(preview);
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /api/trade-plans
 * Create, validate, and optionally execute a new trade plan.
 */
router.post('/', auth_1.requireAuth, rateLimiter_1.tradingLimiter, (0, express_validator_1.body)('symbol').isString().trim().isLength({ min: 1, max: 20 }), (0, express_validator_1.body)('planType').isIn(['CHART_TRADE', 'TRAILING_STOP']), (0, express_validator_1.body)('side').isIn(['BUY', 'SELL']), (0, express_validator_1.body)('entryType').isIn(['LIMIT', 'MARKET']), (0, express_validator_1.body)('entryPrice').isFloat({ gt: 0 }), (0, express_validator_1.body)('takeProfitPrice').isFloat({ gt: 0 }), (0, express_validator_1.body)('stopLossPrice').isFloat({ gt: 0 }), (0, express_validator_1.body)('quantity').isFloat({ gt: 0 }), (0, express_validator_1.body)('trailingPercentage').optional().isFloat({ gt: 0 }), (0, express_validator_1.body)('trailingDistance').optional().isFloat({ gt: 0 }), (0, express_validator_1.body)('activationPrice').optional().isFloat({ gt: 0 }), (0, express_validator_1.body)('idempotencyKey').optional().isString().isLength({ max: 128 }), (0, express_validator_1.body)('executeNow').optional().isBoolean(), async (req, res, next) => {
    if (sendValidationErrors(req, res))
        return;
    try {
        const { symbol, planType, side, entryType, entryPrice, takeProfitPrice, stopLossPrice, quantity, trailingPercentage, trailingDistance, activationPrice, idempotencyKey, origin, strategyId, executeNow = true, } = req.body;
        const command = {
            idempotencyKey: idempotencyKey || (0, crypto_1.randomUUID)(),
            userId: req.user.userId,
            symbol: symbol.toUpperCase(),
            planType,
            side,
            entryType,
            entryPrice: Number(entryPrice),
            takeProfitPrice: Number(takeProfitPrice),
            stopLossPrice: Number(stopLossPrice),
            quantity: Number(quantity),
            trailingPercentage: trailingPercentage ? Number(trailingPercentage) : undefined,
            trailingDistance: trailingDistance ? Number(trailingDistance) : undefined,
            activationPrice: activationPrice ? Number(activationPrice) : undefined,
            origin: origin || 'MANUAL',
            strategyId: strategyId || null,
            createdAt: Date.now(),
        };
        const plan = await exports.tradePlanService.createPlan(command);
        if (executeNow) {
            await exports.tradePlanService.executePlan(plan.id);
        }
        res.status(201).json(exports.tradePlanService.getPlan(plan.id));
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/trade-plans
 * List trade plans for the authenticated user.
 */
router.get('/', auth_1.requireAuth, (req, res, next) => {
    try {
        const symbol = req.query.symbol;
        const plans = exports.tradePlanService.getPlansByUserId(req.user.userId, symbol);
        res.json(plans);
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/trade-plans/:id
 * Retrieve a single trade plan.
 */
router.get('/:id', auth_1.requireAuth, (0, express_validator_1.param)('id').isUUID(), (req, res, next) => {
    if (sendValidationErrors(req, res))
        return;
    try {
        const planId = String(req.params.id);
        const plan = exports.tradePlanService.getPlan(planId);
        if (!plan || plan.userId !== req.user.userId) {
            res.status(404).json({ error: 'Trade plan not found' });
            return;
        }
        res.json(plan);
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /api/trade-plans/:id/cancel
 * Cancel an active or pending trade plan.
 */
router.post('/:id/cancel', auth_1.requireAuth, (0, express_validator_1.param)('id').isUUID(), async (req, res, next) => {
    if (sendValidationErrors(req, res))
        return;
    try {
        const planId = String(req.params.id);
        const plan = exports.tradePlanService.getPlan(planId);
        if (!plan || plan.userId !== req.user.userId) {
            res.status(404).json({ error: 'Trade plan not found' });
            return;
        }
        const cancelled = await exports.tradePlanService.cancelPlan(planId);
        res.json(cancelled);
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /api/trade-plans/market-tick
 * Feed market price update to active plans (useful for price polling / webhook / tests).
 */
router.post('/market-tick', auth_1.requireAuth, (0, express_validator_1.body)('symbol').isString().notEmpty(), (0, express_validator_1.body)('price').isFloat({ gt: 0 }), (0, express_validator_1.body)('high').optional().isFloat({ gt: 0 }), async (req, res, next) => {
    if (sendValidationErrors(req, res))
        return;
    try {
        const { symbol, price, high } = req.body;
        const affected = await exports.tradePlanService.updateMarketPrice(symbol, Number(price), high ? Number(high) : undefined);
        res.json({ processed: affected.length, affectedPlans: affected });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=tradePlans.js.map