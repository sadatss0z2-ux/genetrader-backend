"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const auth_1 = __importDefault(require("./routes/auth"));
const users_1 = __importDefault(require("./routes/users"));
const referral_1 = __importDefault(require("./routes/referral"));
const master_1 = __importDefault(require("./routes/master"));
const manualPayments_1 = __importDefault(require("./routes/manualPayments"));
const entitlements_1 = __importDefault(require("./routes/entitlements"));
const binance_1 = __importDefault(require("./routes/binance"));
const priceAlerts_1 = require("./routes/priceAlerts");
const market_1 = require("./routes/market");
const reauth_1 = __importDefault(require("./routes/reauth"));
const binancePublicMarketFeed_1 = require("./services/binancePublicMarketFeed");
const priceAlertService_1 = require("./services/priceAlertService");
const database_1 = __importDefault(require("./config/database"));
const requestId_1 = require("./middleware/requestId");
const errorHandler_1 = require("./middleware/errorHandler");
const copierEvents_1 = __importDefault(require("./routes/copierEvents"));
const copierControl_1 = __importDefault(require("./routes/copierControl"));
const copierSource_1 = __importDefault(require("./routes/copierSource"));
const app = (0, express_1.default)();
const port = Number(process.env.LOCAL_ACCOUNT_API_PORT ?? 3100);
const priceAlertFeed = new binancePublicMarketFeed_1.BinancePublicMarketFeed(market_1.marketDataService, {
    symbols: ['BTCUSDT'],
    intervals: ['1m'],
});
const priceAlertService = new priceAlertService_1.PriceAlertService(market_1.marketDataService, (symbols) => {
    priceAlertFeed.addSymbols(symbols);
});
const allowedOrigins = new Set([
    'http://localhost',
    'https://localhost',
    'capacitor://localhost',
]);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('LOCAL_ACCOUNT_API_PORT must be a valid TCP port');
}
app.use((0, helmet_1.default)());
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.has(origin)) {
        res.status(403).json({ error: 'Origin is not allowed by the local account API' });
        return;
    }
    next();
});
app.use((0, cors_1.default)({
    origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) {
            callback(null, true);
            return;
        }
        callback(null, false);
    },
}));
app.use(express_1.default.json({ limit: '1mb' }));
app.use(requestId_1.requestIdMiddleware);
app.use((0, express_rate_limit_1.default)({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'local-account-api' });
});
app.get('/ready', async (_req, res, next) => {
    try {
        await (0, database_1.default) `SELECT 1`;
        res.json({ status: 'ready', database: 'ok' });
    }
    catch (error) {
        next(error);
    }
});
app.use('/api/auth', auth_1.default);
app.use('/api/users', users_1.default);
app.use('/api/referral', referral_1.default);
app.use('/api/billing', manualPayments_1.default);
app.use('/api/environment', reauth_1.default);
app.use('/api/binance', binance_1.default);
app.use('/api/price-alerts', (0, priceAlerts_1.createPriceAlertsRouter)(priceAlertService));
app.use('/internal/v1/copier/events', copierEvents_1.default);
app.use('/internal/v1/copier', copierControl_1.default);
app.use('/api/copier/source', copierSource_1.default);
app.use('/v1', entitlements_1.default);
app.use('/api/master/copier', (_req, res) => {
    res.status(404).json({ error: 'Route not found' });
});
app.use('/api/master', master_1.default);
app.use((req, res) => (0, errorHandler_1.notFound)(req, res));
app.use(errorHandler_1.errorHandler);
const server = app.listen(port, '127.0.0.1', () => {
    console.log(`Local account API listening on http://127.0.0.1:${port}`);
    void priceAlertService.start();
    priceAlertFeed.start();
});
function shutdown() {
    priceAlertFeed.stop();
    priceAlertService.stop();
    server.close((serverError) => {
        if (serverError) {
            console.error('Failed to close local account API server', serverError);
            process.exitCode = 1;
        }
        void database_1.default.end({ timeout: 5 }).catch((databaseError) => {
            console.error('Failed to close local account API database pool', databaseError);
            process.exitCode = 1;
        });
    });
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
//# sourceMappingURL=localAccountApi.js.map