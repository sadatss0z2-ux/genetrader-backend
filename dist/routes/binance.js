"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const requireReauth_1 = require("../middleware/requireReauth");
const rateLimiter_1 = require("../middleware/rateLimiter");
const express_validator_1 = require("express-validator");
const binanceService_1 = require("../services/binanceService");
const liveCopyService_1 = require("../services/liveCopyService");
const router = (0, express_1.Router)();
function requiredPathParam(value, name) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`${name} is required.`);
    }
    return value;
}
function positiveInteger(value, name) {
    const parsed = Number(requiredPathParam(value, name));
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new Error(`${name} must be a positive integer.`);
    }
    return parsed;
}
function queryString(value, fallback) {
    return typeof value === 'string' && value.length > 0 ? value : fallback;
}
function queryInteger(value, fallback) {
    if (typeof value !== 'string')
        return fallback;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : fallback;
}
function requestEnvironment(value) {
    if (value === undefined || value === null || value === '')
        return 'testnet';
    if (value === 'testnet' || value === 'live')
        return value;
    throw new Error('environment must be testnet or live.');
}
// Public Spot market data has no user or exchange-account information.
router.get('/ticker/:symbol', async (req, res, next) => {
    try {
        res.json(await (0, binanceService_1.getTicker)(requiredPathParam(req.params.symbol, 'symbol')));
    }
    catch (err) {
        next(err);
    }
});
router.get('/ticker/:symbol/24h', async (req, res, next) => {
    try {
        res.json(await (0, binanceService_1.get24hTicker)(requiredPathParam(req.params.symbol, 'symbol')));
    }
    catch (err) {
        next(err);
    }
});
// GET /api/binance/tickers/all - Get all 24h tickers for all spot pairs
router.get('/tickers/all', async (req, res, next) => {
    try {
        res.json(await (0, binanceService_1.get24hTickers)());
    }
    catch (err) {
        next(err);
    }
});
// GET /api/binance/pairs/all - Get all available spot trading pairs
router.get('/pairs/all', async (req, res, next) => {
    try {
        res.json(await (0, binanceService_1.getAllSpotPairs)());
    }
    catch (err) {
        next(err);
    }
});
router.get('/klines/:symbol', async (req, res, next) => {
    try {
        const symbol = requiredPathParam(req.params.symbol, 'symbol');
        const interval = queryString(req.query.interval, '1h');
        const limit = queryInteger(req.query.limit, 100);
        res.json(await (0, binanceService_1.getKlines)(symbol, interval, limit));
    }
    catch (err) {
        next(err);
    }
});
router.get('/account', auth_1.requireAuth, async (req, res, next) => {
    try {
        const requestedEnvironment = req.query.environment;
        const account = requestedEnvironment === undefined
            ? await (0, binanceService_1.getAccountInfo)(req.user.userId)
            : await (0, binanceService_1.getAccountInfo)(req.user.userId, requestEnvironment(requestedEnvironment));
        res.json(account);
    }
    catch (err) {
        next(err);
    }
});
// Operator-managed accounts do not expose or depend on a personal exchange
// credential. Their read-only portfolio is supplied by the remote copier.
router.get('/managed-account', auth_1.requireAuth, async (req, res, next) => {
    try {
        res.json(await (0, binanceService_1.getManagedLiveAccountOverview)(req.user.userId));
    }
    catch (err) {
        next(err);
    }
});
router.post('/order/market', auth_1.requireAuth, async (req, res, next) => {
    try {
        const { symbol, side, quantity } = req.body;
        if (side !== 'BUY' && side !== 'SELL')
            throw new Error('Order side must be BUY or SELL.');
        res.json(await (0, binanceService_1.placeMarketOrder)(String(symbol), side, Number(quantity), req.user.userId));
    }
    catch (err) {
        next(err);
    }
});
router.post('/order/limit', auth_1.requireAuth, async (req, res, next) => {
    try {
        const { symbol, side, quantity, price } = req.body;
        if (side !== 'BUY' && side !== 'SELL')
            throw new Error('Order side must be BUY or SELL.');
        res.json(await (0, binanceService_1.placeLimitOrder)(String(symbol), side, Number(quantity), Number(price), req.user.userId));
    }
    catch (err) {
        next(err);
    }
});
router.post('/order/stop-limit', auth_1.requireAuth, (0, express_validator_1.body)('symbol').isString().trim().isLength({ min: 1, max: 20 }), (0, express_validator_1.body)('side').isIn(['BUY', 'SELL']), (0, express_validator_1.body)('quantity').isFloat({ min: 0.00000001 }), (0, express_validator_1.body)('price').isFloat({ min: 0.00000001 }), (0, express_validator_1.body)('stopPrice').isFloat({ min: 0.00000001 }), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    try {
        const { symbol, side, quantity, price, stopPrice } = req.body;
        res.json(await (0, binanceService_1.placeStopLimitOrder)(String(symbol), side, Number(quantity), Number(price), Number(stopPrice), req.user.userId));
    }
    catch (err) {
        next(err);
    }
});
router.delete('/order/:symbol/:orderId', auth_1.requireAuth, async (req, res, next) => {
    try {
        await (0, binanceService_1.cancelOrder)(requiredPathParam(req.params.symbol, 'symbol'), positiveInteger(req.params.orderId, 'orderId'), req.user.userId);
        res.status(204).send();
    }
    catch (err) {
        next(err);
    }
});
router.get('/orders/open', auth_1.requireAuth, async (req, res, next) => {
    try {
        const symbol = typeof req.query.symbol === 'string' ? req.query.symbol : undefined;
        res.json(await (0, binanceService_1.getOpenOrders)(req.user.userId, symbol));
    }
    catch (err) {
        next(err);
    }
});
router.get('/order/:symbol/:orderId', auth_1.requireAuth, async (req, res, next) => {
    try {
        res.json(await (0, binanceService_1.getOrderStatus)(requiredPathParam(req.params.symbol, 'symbol'), positiveInteger(req.params.orderId, 'orderId'), req.user.userId));
    }
    catch (err) {
        next(err);
    }
});
// ── EXCHANGE CONNECTION MANAGEMENT ──────────────────────────────────────────
// POST /api/binance/validate-keys
router.post('/validate-keys', rateLimiter_1.authLimiter, auth_1.requireAuth, (0, express_validator_1.body)('binanceApiKey').isString().trim().isLength({ min: 1, max: 256 }), (0, express_validator_1.body)('binanceApiSecret').isString().trim().isLength({ min: 1, max: 256 }), async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            res.status(400).json({ valid: false, error: 'Both Binance API key and API secret are required.' });
            return;
        }
        if (Object.keys(req.body ?? {}).some((key) => !['binanceApiKey', 'binanceApiSecret', 'environment'].includes(key))) {
            res.status(400).json({ valid: false, error: 'Unexpected request field.' });
            return;
        }
        const { binanceApiKey, binanceApiSecret } = req.body;
        const environment = requestEnvironment(req.body.environment);
        const result = Object.prototype.hasOwnProperty.call(req.body, 'environment')
            ? await (0, binanceService_1.inspectExchangeKeyPermissions)(binanceApiKey, binanceApiSecret, environment)
            : await (0, binanceService_1.inspectExchangeKeyPermissions)(binanceApiKey, binanceApiSecret);
        if (!result.valid) {
            res.status(400).json(result);
            return;
        }
        res.json(result);
    }
    catch (err) {
        next(err);
    }
});
// GET /api/binance/connection-status
router.get('/connection-status', auth_1.requireAuth, async (req, res, next) => {
    try {
        const status = await (0, binanceService_1.getExchangeConnectionStatus)(req.user.userId);
        res.json(status);
    }
    catch (err) {
        next(err);
    }
});
// PUT /api/binance/connection
router.put('/connection', rateLimiter_1.authLimiter, auth_1.requireAuth, (0, requireReauth_1.requireReauth)('rotate_exchange_credentials'), (0, express_validator_1.body)('binanceApiKey').isString().trim().isLength({ min: 1, max: 256 }), (0, express_validator_1.body)('binanceApiSecret').isString().trim().isLength({ min: 1, max: 256 }), async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            res.status(400).json({ error: 'Both Binance API key and API secret are required.' });
            return;
        }
        if (Object.keys(req.body ?? {}).some((key) => !['binanceApiKey', 'binanceApiSecret', 'environment'].includes(key))) {
            res.status(400).json({ error: 'Unexpected request field.' });
            return;
        }
        const { binanceApiKey, binanceApiSecret } = req.body;
        const environment = requestEnvironment(req.body.environment);
        const result = Object.prototype.hasOwnProperty.call(req.body, 'environment')
            ? await (0, binanceService_1.rotateExchangeCredentials)(req.user.userId, binanceApiKey, binanceApiSecret, environment)
            : await (0, binanceService_1.rotateExchangeCredentials)(req.user.userId, binanceApiKey, binanceApiSecret);
        res.json({
            message: `Exchange credentials updated successfully for ${environment === 'testnet' ? 'Testnet' : 'Live'}`,
            permissions: result.permissions,
            environment: result.environment,
        });
    }
    catch (err) {
        next(err);
    }
});
// DELETE /api/binance/connection
router.delete('/connection', rateLimiter_1.authLimiter, auth_1.requireAuth, (0, requireReauth_1.requireReauth)('revoke_exchange_credentials'), async (req, res, next) => {
    try {
        const environment = requestEnvironment(req.query.environment);
        if (req.query.environment === undefined) {
            await (0, binanceService_1.revokeExchangeCredentials)(req.user.userId);
        }
        else {
            await (0, binanceService_1.revokeExchangeCredentials)(req.user.userId, environment);
        }
        res.status(204).send();
    }
    catch (err) {
        next(err);
    }
});
// Observer accounts always start in virtual mode. Selecting Testnet permits
// Testnet-only orders with that user's own Testnet connection; it never enables
// a stored Live profile or any real-money route.
router.put('/observer-execution-mode', rateLimiter_1.authLimiter, auth_1.requireAuth, (0, express_validator_1.body)('mode').isIn(['virtual', 'testnet']), async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty() || Object.keys(req.body ?? {}).some((key) => key !== 'mode')) {
            res.status(400).json({ error: 'Observer execution mode must be virtual or testnet.' });
            return;
        }
        res.json(await (0, binanceService_1.setObserverExecutionMode)(req.user.userId, req.body.mode));
    }
    catch (err) {
        next(err);
    }
});
router.put('/live-copy-consent', rateLimiter_1.authLimiter, auth_1.requireAuth, (0, requireReauth_1.requireReauth)('live_copy_consent'), async (req, res, next) => {
    try {
        const body = req.body;
        if (!body || typeof body !== 'object'
            || Object.keys(body).some((key) => !['enabled', 'consentVersion'].includes(key))
            || typeof body.enabled !== 'boolean'
            || typeof body.consentVersion !== 'string') {
            res.status(400).json({ error: 'Live-copy consent schema is invalid.' });
            return;
        }
        const currentVersion = process.env.LIVE_COPY_CONSENT_VERSION;
        if (!currentVersion) {
            res.status(503).json({ error: 'Live-copy consent is not configured.' });
            return;
        }
        if (body.consentVersion !== currentVersion) {
            res.status(409).json({ error: 'Live-copy consent has changed. Refresh and review the current terms.' });
            return;
        }
        res.json(await (0, liveCopyService_1.setLiveCopyOptIn)(req.user.userId, body.enabled, body.consentVersion));
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=binance.js.map
