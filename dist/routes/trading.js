"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_1 = require("../middleware/auth");
const rateLimiter_1 = require("../middleware/rateLimiter");
const database_1 = __importDefault(require("../config/database"));
const notificationService_1 = require("../services/notificationService");
const tradingService_1 = require("../services/tradingService");
const router = (0, express_1.Router)();
const DEFAULT_TRADE_PAGE_SIZE = 50;
const MAX_TRADE_PAGE_SIZE = 500;
function parsePaginationValue(value, fallback, minimum, maximum) {
    if (value === undefined)
        return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value))
        return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}
// Execute trade
router.post('/trade', auth_1.requireAuth, rateLimiter_1.tradingLimiter, (0, express_validator_1.body)('symbol').isString().trim().isLength({ min: 1, max: 20 }), (0, express_validator_1.body)('side').isIn(['BUY', 'SELL']), (0, express_validator_1.body)('type').isIn(['MARKET', 'LIMIT', 'STOP_LIMIT']), (0, express_validator_1.body)('quantity').isFloat({ min: 0.00000001 }), (0, express_validator_1.body)('price').optional().isFloat({ min: 0 }), (0, express_validator_1.body)('stopPrice').optional().isFloat({ min: 0 }), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    try {
        const { symbol, side, type, quantity, price, stopPrice } = req.body;
        const parsedPrice = price === undefined ? undefined : Number(price);
        const parsedStopPrice = stopPrice === undefined ? undefined : Number(stopPrice);
        if ((type === 'LIMIT' || type === 'STOP_LIMIT')
            && (parsedPrice === undefined || !Number.isFinite(parsedPrice) || parsedPrice <= 0)) {
            res.status(400).json({ error: 'A positive limit price is required for this order type.' });
            return;
        }
        if (type === 'STOP_LIMIT'
            && (parsedStopPrice === undefined || !Number.isFinite(parsedStopPrice) || parsedStopPrice <= 0)) {
            res.status(400).json({ error: 'A positive stop price is required for STOP_LIMIT orders.' });
            return;
        }
        if (type !== 'STOP_LIMIT' && stopPrice !== undefined) {
            res.status(400).json({ error: 'stopPrice is only valid for STOP_LIMIT orders.' });
            return;
        }
        const trade = type === 'STOP_LIMIT'
            ? await (0, tradingService_1.executeTrade)(req.user.userId, symbol.toUpperCase(), side, type, parseFloat(quantity), parsedPrice, parsedStopPrice)
            : await (0, tradingService_1.executeTrade)(req.user.userId, symbol.toUpperCase(), side, type, parseFloat(quantity), parsedPrice);
        res.json(trade);
    }
    catch (err) {
        next(err);
    }
});
// Get portfolio
router.get('/portfolio', auth_1.requireAuth, async (req, res, next) => {
    try {
        const portfolio = await (0, tradingService_1.getUserPortfolio)(req.user.userId);
        res.json(portfolio);
    }
    catch (err) {
        next(err);
    }
});
// Get trades
router.get('/trades', auth_1.requireAuth, async (req, res, next) => {
    const limit = parsePaginationValue(req.query.limit, DEFAULT_TRADE_PAGE_SIZE, 1, MAX_TRADE_PAGE_SIZE);
    const offset = parsePaginationValue(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    if (limit === null || offset === null) {
        res.status(400).json({
            error: `Trade pagination must use an integer limit from 1 to ${MAX_TRADE_PAGE_SIZE} and a non-negative integer offset.`,
        });
        return;
    }
    try {
        const trades = await (0, tradingService_1.getUserTrades)(req.user.userId, limit, offset);
        res.json(trades);
    }
    catch (err) {
        next(err);
    }
});
// Record a trade into Postgres trades and emit notification
router.post('/record', auth_1.requireAuth, async (req, res, next) => {
    try {
        const { symbol, side, type = 'MARKET', quantity, price } = req.body;
        if (!symbol || !side || !quantity || !price) {
            res.status(400).json({ error: 'Missing required trade fields (symbol, side, quantity, price).' });
            return;
        }
        const cleanSym = String(symbol).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        const tradeSide = side === 'BUY' || side === 'LONG' ? 'BUY' : 'SELL';
        const tradeType = type === 'LIMIT' ? 'LIMIT' : 'MARKET';
        const qty = Number(quantity);
        const fillPrice = Number(price);
        const result = await (0, database_1.default) `
      INSERT INTO trades (
        user_id, symbol, side, type, quantity, price, status, timestamp
      ) VALUES (
        ${req.user.userId}, ${cleanSym}, ${tradeSide}, ${tradeType}, ${qty}, ${fillPrice}, 'FILLED', NOW()
      )
      RETURNING *
    `;
        if (result[0]) {
            void (0, notificationService_1.notifyTradeExecuted)(req.user.userId, result[0]);
        }
        res.json(result[0]);
    }
    catch (err) {
        next(err);
    }
});
// Sync balances from Binance
router.post('/sync-balances', auth_1.requireAuth, async (req, res, next) => {
    try {
        await (0, tradingService_1.syncBalances)(req.user.userId);
        res.json({ message: 'Balances synced' });
    }
    catch (err) {
        next(err);
    }
});
// Cancel order
router.post('/cancel/:tradeId', auth_1.requireAuth, async (req, res, next) => {
    try {
        const tradeId = req.params.tradeId;
        const trade = await (0, tradingService_1.cancelOrder)(req.user.userId, parseInt(tradeId, 10));
        res.json(trade);
    }
    catch (err) {
        next(err);
    }
});
// Close position
router.post('/close/:symbol', auth_1.requireAuth, async (req, res, next) => {
    try {
        const symbol = req.params.symbol;
        const trade = await (0, tradingService_1.closePosition)(req.user.userId, symbol.toUpperCase());
        res.json(trade);
    }
    catch (err) {
        next(err);
    }
});
// Set stop-loss and take-profit
router.post('/stop-tp/:symbol', auth_1.requireAuth, async (req, res, next) => {
    try {
        const symbol = req.params.symbol;
        const { stopLossPrice, takeProfitPrice } = req.body;
        await (0, tradingService_1.setStopTakeProfit)(req.user.userId, symbol.toUpperCase(), stopLossPrice ? parseFloat(stopLossPrice) : undefined, takeProfitPrice ? parseFloat(takeProfitPrice) : undefined);
        res.json({ message: 'Stop-loss and take-profit set' });
    }
    catch (err) {
        next(err);
    }
});
// Flatten all positions
router.post('/flatten', auth_1.requireAuth, async (req, res, next) => {
    try {
        const trades = await (0, tradingService_1.flattenAllPositions)(req.user.userId);
        res.json({ trades, count: trades.length });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=trading.js.map