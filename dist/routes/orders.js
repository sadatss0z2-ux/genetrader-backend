"use strict";
/**
 * Orders Route (P5-03)
 * Exposes P5-01 OrderService and P5-02 PositionService via REST endpoints.
 * Covers: order submission, cancel, list, position list, close-position, flatten.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.positionService = exports.orderService = void 0;
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_1 = require("../middleware/auth");
const rateLimiter_1 = require("../middleware/rateLimiter");
const crypto_1 = require("crypto");
const orderService_1 = require("../services/orderService");
const positionService_1 = require("../services/positionService");
const router = (0, express_1.Router)();
// Shared in-memory service instances for this process.
// In production these would be singletons injected via DI; here we export
// them so tests can access / reset state.
exports.orderService = new orderService_1.OrderService();
exports.positionService = new positionService_1.PositionService();
// ─── helpers ─────────────────────────────────────────────────────────────────
function sendValidationErrors(req, res) {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return true;
    }
    return false;
}
// ─── Submit order ─────────────────────────────────────────────────────────────
/**
 * POST /api/orders
 * Submit a new idempotent order command.
 *
 * Body: { symbol, side, type, quantity, price?, stopPrice?, timeInForce?,
 *         idempotencyKey?, clientOrderId? }
 * Returns: OrderRecord
 */
router.post('/', auth_1.requireAuth, rateLimiter_1.tradingLimiter, (0, express_validator_1.body)('symbol').isString().trim().isLength({ min: 1, max: 20 }), (0, express_validator_1.body)('side').isIn(['BUY', 'SELL']), (0, express_validator_1.body)('type').isIn(['MARKET', 'LIMIT', 'STOP_LIMIT', 'OCO']), (0, express_validator_1.body)('quantity').isString().notEmpty(), (0, express_validator_1.body)('price').optional({ nullable: true }).isString(), (0, express_validator_1.body)('stopPrice').optional({ nullable: true }).isString(), (0, express_validator_1.body)('timeInForce').optional().isIn(['GTC', 'IOC', 'FOK']), (0, express_validator_1.body)('idempotencyKey').optional().isString().isLength({ max: 128 }), (0, express_validator_1.body)('clientOrderId').optional().isString().isLength({ max: 64 }), async (req, res, next) => {
    if (sendValidationErrors(req, res))
        return;
    try {
        const { symbol, side, type, quantity, price = null, stopPrice = null, timeInForce = 'GTC', idempotencyKey, clientOrderId, } = req.body;
        const command = {
            idempotencyKey: idempotencyKey ?? (0, crypto_1.randomUUID)(),
            userId: req.user.userId,
            symbol: symbol.toUpperCase(),
            side,
            type,
            quantity,
            price: price ?? null,
            stopPrice: stopPrice ?? null,
            timeInForce,
            clientOrderId: clientOrderId ?? (0, crypto_1.randomUUID)(),
            // These fields are placeholders; in the live path P4-01/P4-02 would supply them.
            decisionCandidateId: '',
            authorizationId: '',
            createdAt: Date.now(),
        };
        const order = await exports.orderService.submitOrder(command);
        res.status(201).json(order);
    }
    catch (err) {
        next(err);
    }
});
// ─── List orders ──────────────────────────────────────────────────────────────
/**
 * GET /api/orders
 * List all orders for the authenticated user.
 * Query params: symbol (optional filter)
 *
 * Returns: OrderRecord[]
 */
router.get('/', auth_1.requireAuth, (req, res, next) => {
    try {
        const userId = req.user.userId;
        const { symbol } = req.query;
        let orders = exports.orderService.getOrdersByUser(userId);
        if (symbol) {
            const sym = symbol.toUpperCase();
            orders = orders.filter((o) => o.symbol === sym);
        }
        // Most-recent first
        orders.sort((a, b) => b.createdAt - a.createdAt);
        res.json(orders);
    }
    catch (err) {
        next(err);
    }
});
// ─── Positions ────────────────────────────────────────────────────────────────
/**
 * GET /api/orders/positions
 * List aggregated position summaries for the authenticated user.
 * Query params: symbol (optional filter)
 *
 * Returns: PositionSummary[]
 */
router.get('/positions', auth_1.requireAuth, (req, res, next) => {
    try {
        const userId = req.user.userId;
        const { symbol } = req.query;
        let summaries = exports.positionService.getPositionSummariesByUser(userId);
        if (symbol) {
            const sym = symbol.toUpperCase();
            summaries = summaries.filter((s) => s.symbol === sym);
        }
        res.json(summaries);
    }
    catch (err) {
        next(err);
    }
});
// ─── Close position (place closing SELL order) ────────────────────────────────
/**
 * POST /api/orders/positions/close
 * Close a position for the given symbol by placing a market SELL order for
 * the full open quantity reported by the PositionService.
 *
 * Body: { symbol }
 * Returns: OrderRecord
 */
router.post('/positions/close', auth_1.requireAuth, rateLimiter_1.tradingLimiter, (0, express_validator_1.body)('symbol').isString().trim().isLength({ min: 1, max: 20 }), async (req, res, next) => {
    if (sendValidationErrors(req, res))
        return;
    try {
        const userId = req.user.userId;
        const symbol = req.body.symbol.toUpperCase();
        const summary = exports.positionService.getPositionSummary(userId, symbol);
        if (!summary || parseFloat(summary.totalQuantity) <= 0) {
            res.status(404).json({ error: `No open position for ${symbol}` });
            return;
        }
        const command = {
            idempotencyKey: (0, crypto_1.randomUUID)(),
            userId,
            symbol,
            side: 'SELL',
            type: 'MARKET',
            quantity: summary.totalQuantity,
            price: null,
            stopPrice: null,
            timeInForce: 'GTC',
            clientOrderId: (0, crypto_1.randomUUID)(),
            decisionCandidateId: '',
            authorizationId: '',
            createdAt: Date.now(),
        };
        const order = await exports.orderService.submitOrder(command);
        res.status(201).json(order);
    }
    catch (err) {
        next(err);
    }
});
// ─── Flatten (close ALL positions) ───────────────────────────────────────────
/**
 * POST /api/orders/positions/flatten
 * Close every open position for the authenticated user by placing a market
 * SELL order for each open position lot's full quantity.
 *
 * Returns: { orders: OrderRecord[], closedCount: number }
 */
router.post('/positions/flatten', auth_1.requireAuth, rateLimiter_1.tradingLimiter, async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const summaries = exports.positionService
            .getPositionSummariesByUser(userId)
            .filter((s) => parseFloat(s.totalQuantity) > 0);
        const orders = await Promise.all(summaries.map(async (s) => {
            const command = {
                idempotencyKey: (0, crypto_1.randomUUID)(),
                userId,
                symbol: s.symbol,
                side: 'SELL',
                type: 'MARKET',
                quantity: s.totalQuantity,
                price: null,
                stopPrice: null,
                timeInForce: 'GTC',
                clientOrderId: (0, crypto_1.randomUUID)(),
                decisionCandidateId: '',
                authorizationId: '',
                createdAt: Date.now(),
            };
            return exports.orderService.submitOrder(command);
        }));
        res.status(201).json({ orders, closedCount: orders.length });
    }
    catch (err) {
        next(err);
    }
});
// ─── Get single order ─────────────────────────────────────────────────────────
/**
 * GET /api/orders/:id
 * Get a single order by its UUID.
 *
 * Returns: OrderRecord
 */
router.get('/:id', auth_1.requireAuth, (0, express_validator_1.param)('id').isUUID(), (req, res, next) => {
    if (sendValidationErrors(req, res))
        return;
    try {
        const order = exports.orderService.getOrder(req.params.id);
        if (!order || order.userId !== req.user.userId) {
            res.status(404).json({ error: 'Order not found' });
            return;
        }
        res.json(order);
    }
    catch (err) {
        next(err);
    }
});
// ─── Cancel order ─────────────────────────────────────────────────────────────
/**
 * DELETE /api/orders/:id
 * Cancel a PENDING or SUBMITTED order.
 *
 * Returns: OrderRecord (with state CANCELLED)
 */
router.delete('/:id', auth_1.requireAuth, rateLimiter_1.tradingLimiter, (0, express_validator_1.param)('id').isUUID(), async (req, res, next) => {
    if (sendValidationErrors(req, res))
        return;
    try {
        const existing = exports.orderService.getOrder(req.params.id);
        if (!existing || existing.userId !== req.user.userId) {
            res.status(404).json({ error: 'Order not found' });
            return;
        }
        const cancelled = await exports.orderService.cancelOrder(req.params.id);
        res.json(cancelled);
    }
    catch (err) {
        // Re-throw state-machine violations as 422
        if (err instanceof Error && err.message.includes('cannot be cancelled')) {
            res.status(422).json({ error: err.message });
            return;
        }
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=orders.js.map