"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startupValidation = void 0;
require("dotenv/config");
const http_1 = __importDefault(require("http"));
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const rateLimiter_1 = require("./middleware/rateLimiter");
const requestId_1 = require("./middleware/requestId");
const audit_1 = require("./middleware/audit");
const errorHandler_1 = require("./middleware/errorHandler");
const auth_1 = __importDefault(require("./routes/auth"));
const referral_1 = __importDefault(require("./routes/referral"));
const referralLanding_1 = __importDefault(require("./routes/referralLanding"));
const users_1 = __importDefault(require("./routes/users"));
const binance_1 = __importDefault(require("./routes/binance"));
const trading_1 = __importDefault(require("./routes/trading"));
const risk_1 = __importDefault(require("./routes/risk"));
const onboarding_1 = __importDefault(require("./routes/onboarding"));
const entitlements_1 = __importDefault(require("./routes/entitlements"));
const copierControl_1 = __importDefault(require("./routes/copierControl"));
const copierEvents_1 = __importDefault(require("./routes/copierEvents"));
const copierSource_1 = __importDefault(require("./routes/copierSource"));
const billingWebhooks_1 = __importDefault(require("./routes/billingWebhooks"));
const master_1 = __importDefault(require("./routes/master"));
const manualPayments_1 = __importDefault(require("./routes/manualPayments"));
const tradingPolicy_1 = __importDefault(require("./routes/tradingPolicy"));
const orders_1 = __importDefault(require("./routes/orders"));
const tradePlans_1 = __importStar(require("./routes/tradePlans"));
const market_1 = require("./routes/market");
const priceAlerts_1 = require("./routes/priceAlerts");
const binancePublicMarketFeed_1 = require("./services/binancePublicMarketFeed");
const priceAlertService_1 = require("./services/priceAlertService");
const tradingPolicyService_1 = require("./services/tradingPolicyService");
const decisions_1 = __importDefault(require("./routes/decisions"));
const environment_1 = __importDefault(require("./routes/environment"));
const appUpdates_1 = __importDefault(require("./routes/appUpdates"));
const public_1 = __importDefault(require("./routes/public"));
const entitlementService_1 = require("./services/entitlementService");
const metrics_1 = require("./config/metrics");
const database_1 = __importDefault(require("./config/database"));
// Initialize OpenTelemetry tracing (must be before any imports that use it)
if (process.env.ENABLE_TRACING === 'true') {
    Promise.resolve().then(() => __importStar(require('./config/tracing'))).catch((err) => {
        console.error('[TRACING] Failed to initialize:', err);
    });
}
const encryptionService_1 = require("./services/encryptionService");
// ── Validate critical env vars before starting ─────────────────────────────
const required = ['DATABASE_URL', 'JWT_SECRET', 'ENCRYPTION_KEY'];
for (const key of required) {
    if (!process.env[key])
        throw new Error(`Missing required env var: ${key}`);
}
if (!/^[0-9a-f]{64}$/i.test(process.env.ENCRYPTION_KEY)) {
    throw new Error('ENCRYPTION_KEY must be configured as exactly 32 bytes of hex.');
}
const isNeonFunctionRuntime = process.env.NEON_FUNCTION_RUNTIME === 'true';
// Fail closed immediately if KMS envelope encryption validation fails
exports.startupValidation = process.env.NODE_ENV === 'test'
    ? Promise.resolve()
    : (0, encryptionService_1.validateEncryptionConfiguration)().catch((err) => {
        const message = err instanceof Error ? err.message : 'Unknown encryption configuration error.';
        console.error('FATAL: KMS envelope encryption failed startup validation:', message);
        if (!isNeonFunctionRuntime)
            process.exit(1);
        throw err;
    });
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT ?? 3000);
const API_BIND_HOST = process.env.API_BIND_HOST?.trim() || '0.0.0.0';
// Enable trust proxy for Cloudflare Tunnel, reverse proxies, and Neon Functions.
app.set('trust proxy', 1);
// ── Security & logging ─────────────────────────────────────────────────────
app.use((0, helmet_1.default)());
const DEFAULT_CORS_ORIGINS = [
    'http://localhost:5174',
    'http://localhost:3000',
    'https://localhost',
    'capacitor://localhost',
    'http://10.0.2.2:3000',
];
function isPermittedCorsOrigin(origin) {
    if (!origin)
        return true;
    if (DEFAULT_CORS_ORIGINS.includes(origin))
        return true;
    if (process.env.CORS_ORIGIN?.split(',').includes(origin))
        return true;
    if (origin === 'null')
        return true;
    if (/^https?:\/\/([a-zA-Z0-9-]+\.)*genetrader\.site(:\d+)?$/.test(origin))
        return true;
    if (/^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?$/.test(origin))
        return true;
    if (/^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(origin))
        return true;
    if (/^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(origin))
        return true;
    if (/^https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(origin))
        return true;
    return process.env.NODE_ENV !== 'production';
}
app.use((0, cors_1.default)({
    origin(origin, callback) {
        if (isPermittedCorsOrigin(origin))
            return callback(null, true);
        callback(new Error(`Origin ${origin ?? '(none)'} not permitted by CORS policy`));
    },
    credentials: true,
}));
// Detailed request logging
app.use((req, res, next) => {
    console.log(`[REQUEST] ${req.method} ${req.url} - Origin: ${req.headers.origin} - User-Agent: ${req.headers['user-agent']}`);
    next();
});
app.use((0, morgan_1.default)(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
// Telemetry middleware (order matters: request ID first)
app.use(requestId_1.requestIdMiddleware);
app.use(audit_1.auditMiddleware);
// Preserve the exact signed bytes for provider adapters; real providers are not configured yet.
app.use('/v1/webhooks/billing', express_1.default.raw({ type: 'application/json', limit: '32kb' }), billingWebhooks_1.default);
app.use(express_1.default.json({ limit: '1mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '64kb', parameterLimit: 100 }));
app.use(rateLimiter_1.apiLimiter);
// ── Metrics endpoint ──────────────────────────────────────────────────────────
app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', metrics_1.register.contentType);
    res.end(await metrics_1.register.metrics());
});
// ── Health check ────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
});
// This is intentionally separate from /health. It confirms the process is
// serving requests *and* the configured PostgreSQL database is reachable,
// without exposing schema or account data.
app.get('/ready', async (_req, res, next) => {
    try {
        await (0, database_1.default) `SELECT 1`;
        res.json({ status: 'ready', database: 'ok' });
    }
    catch (error) {
        next(error);
    }
});
let publicMarketFeed = null;
let marketSymbolRefreshTimer = null;
const priceAlertService = new priceAlertService_1.PriceAlertService(market_1.marketDataService, (symbols) => {
    publicMarketFeed?.addSymbols(symbols);
});
// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/r', referralLanding_1.default);
// Public (unauthenticated) copier stats — must be mounted BEFORE any auth middleware.
app.use('/api/public', public_1.default);
app.use('/api/auth', auth_1.default);
app.use('/api/referral', referral_1.default);
app.use('/api/master', master_1.default);
app.use('/api/billing', manualPayments_1.default);
app.use('/api/users', users_1.default);
app.use('/api/binance', binance_1.default);
app.use('/api/trading', trading_1.default);
app.use('/api/risk', risk_1.default);
app.use('/api/onboarding', onboarding_1.default);
app.use('/api/policy', tradingPolicy_1.default);
app.use('/api/orders', orders_1.default);
app.use('/api/trade-plans', tradePlans_1.default);
app.use('/api/market', market_1.marketRouter);
app.use('/api/price-alerts', (0, priceAlerts_1.createPriceAlertsRouter)(priceAlertService));
app.use('/api/decisions', decisions_1.default);
app.use('/api/environment', environment_1.default);
app.use('/api/app-updates', appUpdates_1.default);
app.use('/v1', entitlements_1.default);
app.use('/internal/v1/copier/events', copierEvents_1.default);
app.use('/internal/v1/copier', copierControl_1.default);
app.use('/api/copier/source', copierSource_1.default);
// ── 404 + error handler ─────────────────────────────────────────────────────
app.use(errorHandler_1.notFound);
app.use(errorHandler_1.errorHandler);
const httpServer = isNeonFunctionRuntime ? null : http_1.default.createServer(app);
const marketWss = httpServer ? (0, market_1.attachMarketWss)(httpServer) : null;
if (httpServer && process.env.NODE_ENV !== 'test') {
    httpServer.listen(PORT, API_BIND_HOST, () => {
        console.log(`🚀 GeneTrader API running on http://${API_BIND_HOST}:${PORT} [${process.env.NODE_ENV}]`);
        const configuredSymbols = process.env.MARKET_FEED_SYMBOLS
            ?.split(',')
            .map((symbol) => symbol.trim())
            .filter(Boolean);
        publicMarketFeed = new binancePublicMarketFeed_1.BinancePublicMarketFeed(market_1.marketDataService, {
            symbols: configuredSymbols?.length ? configuredSymbols : undefined,
        });
        (0, market_1.setPublicMarketFeedStatusProvider)(() => publicMarketFeed.getStatus());
        publicMarketFeed.start();
        void priceAlertService.start();
        const copierTokenHash = 'e1abba3955ea9b906c0edcdcb4be2f0f6aa11e83daa568caec280ff25a85fdf8';
        void (0, database_1.default) `
      INSERT INTO copier_instances (instance_id, auth_token_sha256, enabled, next_revision)
      VALUES 
        ('genetrader-pc-01', ${copierTokenHash}, FALSE, 0),
        ('genetrader-aws-vps-01', ${copierTokenHash}, TRUE, 0)
      ON CONFLICT (instance_id) DO UPDATE
        SET auth_token_sha256 = EXCLUDED.auth_token_sha256, enabled = EXCLUDED.enabled
    `.then(() => {
            console.log('[COPIER] Auto-registered genetrader-pc-01 and genetrader-aws-vps-01 instances');
        }).catch((err) => {
            console.error('[COPIER] Failed to register copier instances:', err instanceof Error ? err.message : err);
        });
        void tradePlans_1.tradePlanService.loadPersistedPlans().then((count) => {
            if (count > 0) {
                console.log(`[TradePlanService] Rehydrated ${count} active trade plan(s) from Neon PostgreSQL`);
            }
        });
        let refreshInFlight = false;
        const refreshStrategySymbols = async () => {
            if (refreshInFlight || !publicMarketFeed)
                return;
            refreshInFlight = true;
            try {
                const symbols = await (0, tradingPolicyService_1.getEnabledStrategySymbols)();
                publicMarketFeed.addSymbols(symbols);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown strategy-symbol lookup error.';
                console.error(`[MARKET_FEED] Enabled strategy symbols could not be refreshed: ${message}`);
            }
            finally {
                refreshInFlight = false;
            }
        };
        void refreshStrategySymbols();
        marketSymbolRefreshTimer = setInterval(() => {
            void refreshStrategySymbols();
        }, 60_000);
        marketSymbolRefreshTimer.unref();
    });
}
if (httpServer) {
    httpServer.on('close', () => {
        if (marketSymbolRefreshTimer)
            clearInterval(marketSymbolRefreshTimer);
        marketSymbolRefreshTimer = null;
        publicMarketFeed?.stop();
        priceAlertService.stop();
        (0, market_1.setPublicMarketFeedStatusProvider)(null);
        marketWss?.close();
    });
}
if (process.env.NODE_ENV !== 'test' && !isNeonFunctionRuntime) {
    const entitlementSweepTimer = setInterval(() => {
        void (0, entitlementService_1.sweepExpiredEntitlements)().catch(() => console.error('[ENTITLEMENTS] Expiry sweep failed'));
    }, 60_000);
    entitlementSweepTimer.unref();
}
exports.default = app;
//# sourceMappingURL=index.js.map