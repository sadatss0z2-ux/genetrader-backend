"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExchangeConnectionUnavailableError = void 0;
exports.parseExchangeEnvironment = parseExchangeEnvironment;
exports.getUserBinanceCredentials = getUserBinanceCredentials;
exports.inspectExchangeKeyPermissions = inspectExchangeKeyPermissions;
exports.validateTestnetSpotCredentials = validateTestnetSpotCredentials;
exports.getExchangeConnectionStatus = getExchangeConnectionStatus;
exports.rotateExchangeCredentials = rotateExchangeCredentials;
exports.revokeExchangeCredentials = revokeExchangeCredentials;
exports.setObserverExecutionMode = setObserverExecutionMode;
exports.assertUserCanSubmitExchangeOrder = assertUserCanSubmitExchangeOrder;
exports.getTicker = getTicker;
exports.get24hTicker = get24hTicker;
exports.get24hTickers = get24hTickers;
exports.getAllSpotPairs = getAllSpotPairs;
exports.getKlines = getKlines;
exports.getManagedLiveAccountOverview = getManagedLiveAccountOverview;
exports.getAccountInfo = getAccountInfo;
exports.syncUserTradesFromBinance = syncUserTradesFromBinance;
exports.placeMarketOrder = placeMarketOrder;
exports.placeLimitOrder = placeLimitOrder;
exports.placeStopLimitOrder = placeStopLimitOrder;
exports.cancelOrder = cancelOrder;
exports.getOpenOrders = getOpenOrders;
exports.getOrderStatus = getOrderStatus;
exports.createTickerWebSocket = createTickerWebSocket;
const node_binance_api_1 = __importDefault(require("node-binance-api"));
const ws_1 = __importDefault(require("ws"));
const database_1 = __importDefault(require("../config/database"));
const encryptionService_1 = require("./encryptionService");
const errorHandler_1 = require("../middleware/errorHandler");
const environment_1 = require("../config/environment");
const notificationService_1 = require("./notificationService");
const EXECUTION_MODE = process.env.EXCHANGE_EXECUTION_MODE;
// The local live bots use api1 because the default Binance REST host rejects
// signed requests from this network. Keep credential validation and user live
// clients on the same host as the running execution services.
const LIVE_SPOT_URLS = {
    base: 'https://api1.binance.com/api/',
    sapi: 'https://api1.binance.com/sapi/',
};
const SPOT_INTERVALS = [
    '1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M',
];
function isExchangeEnvironment(value) {
    return value === 'testnet' || value === 'live';
}
function parseExchangeEnvironment(value, fallback = 'testnet') {
    if (value === undefined || value === null || value === '')
        return fallback;
    if (isExchangeEnvironment(value))
        return value;
    throw (0, errorHandler_1.createError)('Exchange environment must be either testnet or live.', 400);
}
class ExchangeConnectionUnavailableError extends Error {
    statusCode = 503;
    constructor(message) {
        super(message);
        this.name = 'ExchangeConnectionUnavailableError';
    }
}
exports.ExchangeConnectionUnavailableError = ExchangeConnectionUnavailableError;
function normaliseSpotSymbol(value) {
    const symbol = value.trim().toUpperCase();
    if (!/^[A-Z0-9]{5,20}$/.test(symbol)) {
        throw new Error('A valid Binance Spot symbol is required.');
    }
    return symbol;
}
function numberFrom(value, field) {
    const result = Number(value);
    if (!Number.isFinite(result)) {
        throw new Error(`Binance returned an invalid ${field}.`);
    }
    return result;
}
/**
 * User credentials are deliberately fail-closed. This adapter must never fall
 * back to a shared environment key, because that could expose another account.
 * A user may retain one Testnet and one Live profile; callers must always name
 * the environment they intend to use.
 */
async function getUserBinanceCredentials(userId, environment = 'testnet') {
    const rows = await (0, database_1.default) `
    SELECT
      public_key_encrypted,
      secret_key_encrypted
    FROM api_keys
    WHERE user_id = ${userId}
      AND exchange = 'binance'
      AND environment = ${environment}
      AND active = TRUE
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `;
    const row = rows[0];
    if (!row?.public_key_encrypted || !row?.secret_key_encrypted) {
        throw new ExchangeConnectionUnavailableError(`No ${environment === 'testnet' ? 'Binance Testnet' : 'Binance Live'} connection is configured for this account.`);
    }
    const apiKey = (0, encryptionService_1.decrypt)(row.public_key_encrypted, '', '', {
        userId,
        secretType: 'binance_api_key',
        service: 'binanceService',
    });
    const apiSecret = (0, encryptionService_1.decrypt)(row.secret_key_encrypted, '', '', {
        userId,
        secretType: 'binance_api_secret',
        service: 'binanceService',
    });
    return { apiKey, apiSecret };
}
/**
 * Inspects Binance API key permissions against the configured Spot API.
 * The non-custodial withdrawal rule is enforced for Live credentials; Spot
 * Testnet withdrawal flags do not represent movement of real funds.
 */
async function inspectExchangeKeyPermissions(apiKey, apiSecret, environment = 'testnet') {
    const trimmedKey = apiKey.trim();
    const trimmedSecret = apiSecret.trim();
    if (!trimmedKey || !trimmedSecret) {
        return {
            valid: false,
            error: 'Both Binance API key and API secret are required.',
        };
    }
    try {
        const client = new node_binance_api_1.default({
            APIKEY: trimmedKey,
            APISECRET: trimmedSecret,
            test: environment === 'testnet',
            useServerTime: true,
            recvWindow: 60_000,
            ...(environment === 'live' ? { urls: LIVE_SPOT_URLS } : {}),
        });
        const account = await client.account();
        const exchangeReportsWithdrawals = account.canWithdraw === true;
        const permissions = {
            canTrade: account.canTrade === true,
            // Spot Testnet is a simulated environment. Binance can report the
            // account capability flag as enabled there even though it cannot move
            // real funds. Keep the public permission contract truthful for the
            // environment being connected and enforce the non-custodial rule on
            // Live credentials.
            canWithdraw: environment === 'live' && exchangeReportsWithdrawals,
            canDeposit: account.canDeposit === true,
            accountType: account.accountType || 'SPOT',
        };
        if (environment === 'live' && exchangeReportsWithdrawals) {
            return {
                valid: false,
                error: 'Withdrawal permission is enabled. GeneTrader is strictly non-custodial and rejects withdrawal-enabled API keys for user safety.',
                permissions,
            };
        }
        return {
            valid: true,
            permissions,
        };
    }
    catch (err) {
        return {
            valid: false,
            error: 'Binance could not verify these credentials in the configured exchange environment. Check the key, secret, and API IP restrictions.',
        };
    }
}
async function validateTestnetSpotCredentials(apiKey, apiSecret) {
    const result = await inspectExchangeKeyPermissions(apiKey, apiSecret, 'testnet');
    return result.valid;
}
async function getExchangeConnectionStatus(userId) {
    const [profiles, preferences] = await Promise.all([
        (0, database_1.default) `
    SELECT
      environment, permissions, created_at, last_used_at
    FROM api_keys
    WHERE user_id = ${userId} AND exchange = 'binance' AND active = TRUE
    ORDER BY created_at DESC, id DESC
  `,
        (0, database_1.default) `
      SELECT observer_execution_mode
      FROM exchange_execution_preferences
      WHERE user_id = ${userId}
      LIMIT 1
    `,
    ]);
    const activeByEnvironment = new Map();
    for (const profile of profiles) {
        if (isExchangeEnvironment(profile.environment) && !activeByEnvironment.has(profile.environment)) {
            activeByEnvironment.set(profile.environment, profile);
        }
    }
    const toProfile = (environment) => {
        const profile = activeByEnvironment.get(environment);
        const permissions = Array.isArray(profile?.permissions)
            ? profile.permissions.filter((permission) => typeof permission === 'string')
            : [];
        return {
            environment,
            connected: Boolean(profile),
            permissions,
            keyAddedAt: profile?.created_at ?? null,
            lastUsedAt: profile?.last_used_at ?? null,
        };
    };
    const testnetProfile = toProfile('testnet');
    return {
        connected: testnetProfile.connected,
        testnet: true,
        permissions: testnetProfile.permissions,
        keyAddedAt: testnetProfile.keyAddedAt,
        lastUsedAt: testnetProfile.lastUsedAt,
        executionEnvironment: 'testnet',
        observerExecutionMode: preferences[0]?.observer_execution_mode === 'testnet' ? 'testnet' : 'virtual',
        profiles: [testnetProfile, toProfile('live')],
    };
}
async function rotateExchangeCredentials(userId, apiKey, apiSecret, environment = 'testnet') {
    const inspection = await inspectExchangeKeyPermissions(apiKey, apiSecret, environment);
    if (!inspection.valid) {
        throw (0, errorHandler_1.createError)(inspection.error || 'Invalid exchange credentials', 400);
    }
    const encKey = (0, encryptionService_1.encrypt)(apiKey.trim(), {
        userId,
        secretType: 'binance_api_key',
        service: 'binanceService',
    });
    const encSecret = (0, encryptionService_1.encrypt)(apiSecret.trim(), {
        userId,
        secretType: 'binance_api_secret',
        service: 'binanceService',
    });
    const permissions = inspection.permissions?.canTrade ? ['spot', 'trade'] : ['spot', 'read'];
    await database_1.default.begin(async (tx) => {
        if (environment === 'live') {
            const liveMemberships = await tx `
        SELECT membership_id FROM copier_memberships
        WHERE user_id = ${userId} AND desired_state IN ('PAID_ACTIVE','CLOSEOUT_ONLY')
        LIMIT 1 FOR UPDATE
      `;
            if (liveMemberships.length) {
                throw (0, errorHandler_1.createError)('Live exchange credentials cannot be changed while paid copier access is active or closing out.', 409);
            }
        }
        await tx `
      UPDATE api_keys
      SET active = false
      WHERE user_id = ${userId} AND exchange = 'binance'
        AND environment = ${environment} AND active = true
    `;
        if (environment === 'testnet') {
            await tx `
        UPDATE users
        SET
          binance_api_key_encrypted = ${encKey.encrypted},
          binance_api_secret_encrypted = ${encSecret.encrypted},
          api_key_added_at = NOW(),
          updated_at = NOW()
        WHERE id = ${userId}
      `;
        }
        await tx `
      INSERT INTO api_keys (user_id, key_name, exchange, public_key_encrypted, secret_key_encrypted, permissions, testnet, environment, active, last_used_at)
      VALUES (${userId}, ${environment === 'testnet' ? 'Testnet' : 'Live'}, 'binance',
        ${encKey.encrypted}, ${encSecret.encrypted}, ${JSON.stringify(permissions)}::json,
        ${environment === 'testnet'}, ${environment}, true, NULL)
      ON CONFLICT (user_id, public_key_encrypted) DO UPDATE SET
        secret_key_encrypted = EXCLUDED.secret_key_encrypted,
        permissions = EXCLUDED.permissions,
        testnet = EXCLUDED.testnet,
        environment = EXCLUDED.environment,
        active = true,
        last_used_at = NULL
    `;
    });
    return { success: true, permissions, environment };
}
async function revokeExchangeCredentials(userId, environment = 'testnet') {
    await database_1.default.begin(async (tx) => {
        if (environment === 'live') {
            const liveMemberships = await tx `
        SELECT membership_id FROM copier_memberships
        WHERE user_id = ${userId} AND desired_state IN ('PAID_ACTIVE','CLOSEOUT_ONLY')
        LIMIT 1 FOR UPDATE
      `;
            if (liveMemberships.length) {
                throw (0, errorHandler_1.createError)('Live exchange credentials cannot be revoked while paid copier access is active or closing out.', 409);
            }
        }
        await tx `
      UPDATE api_keys
      SET active = false
      WHERE user_id = ${userId}
        AND exchange = 'binance'
        AND environment = ${environment}
    `;
        if (environment === 'testnet') {
            await tx `
        UPDATE users
        SET
          binance_api_key_encrypted = NULL,
          binance_api_secret_encrypted = NULL,
          updated_at = NOW()
        WHERE id = ${userId}
      `;
        }
        await tx `
      INSERT INTO global_halts (user_id, halted, reason, halted_by, halted_at)
      VALUES (${userId}, true, 'Exchange credentials revoked', 'SYSTEM', NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        halted = true,
        reason = 'Exchange credentials revoked',
        halted_by = 'SYSTEM',
        halted_at = NOW(),
        updated_at = NOW()
    `;
    });
}
async function setObserverExecutionMode(userId, observerExecutionMode) {
    if (observerExecutionMode !== 'virtual' && observerExecutionMode !== 'testnet') {
        throw (0, errorHandler_1.createError)('Observer execution mode must be virtual or testnet.', 400);
    }
    const rows = await (0, database_1.default) `
    INSERT INTO exchange_execution_preferences (user_id, observer_execution_mode, updated_at)
    VALUES (${userId}, ${observerExecutionMode}, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      observer_execution_mode = EXCLUDED.observer_execution_mode,
      updated_at = NOW()
    RETURNING observer_execution_mode
  `;
    return { observerExecutionMode: rows[0]?.observer_execution_mode ?? observerExecutionMode };
}
async function createUserClient(userId, environment = 'testnet') {
    const { apiKey, apiSecret } = await getUserBinanceCredentials(userId, environment);
    return new node_binance_api_1.default({
        APIKEY: apiKey,
        APISECRET: apiSecret,
        test: environment === 'testnet',
        useServerTime: true,
        recvWindow: 60_000,
        ...(environment === 'live' ? { urls: LIVE_SPOT_URLS } : {}),
    });
}
const publicClient = new node_binance_api_1.default();
function mapTicker(stats) {
    return {
        symbol: stats.symbol,
        price: numberFrom(stats.lastPrice, 'last price'),
        priceChange: numberFrom(stats.priceChange, 'price change'),
        priceChangePercent: numberFrom(stats.priceChangePercent, 'price change percentage'),
        volume: numberFrom(stats.volume, 'volume'),
        quoteVolume: numberFrom(stats.quoteVolume, 'quote volume'),
    };
}
async function getSingleDailyStats(symbol) {
    const stats = await publicClient.dailyStats(normaliseSpotSymbol(symbol));
    if (Array.isArray(stats)) {
        throw new Error('Binance returned an unexpected multi-symbol ticker response.');
    }
    return stats;
}
function mapOrder(order) {
    return {
        symbol: order.symbol,
        orderId: order.orderId,
        clientOrderId: order.clientOrderId,
        transactTime: 'transactTime' in order && order.transactTime ? order.transactTime : order.updateTime ?? order.time,
        price: order.price !== undefined ? numberFrom(order.price, 'order price') : 0,
        origQty: order.origQty ?? '0',
        executedQty: order.executedQty ?? '0',
        status: order.status ?? 'NEW',
        side: order.side ?? '',
        type: order.type ?? '',
    };
}
function requireTestnetExecution() {
    if (!(0, environment_1.getEnvironmentConfig)().binanceTestnet || EXECUTION_MODE !== 'testnet') {
        throw new ExchangeConnectionUnavailableError('Order execution is disabled unless the server is explicitly configured for Binance Testnet.');
    }
}
async function assertUserCanSubmitExchangeOrder(userId) {
    const users = await (0, database_1.default) `
    SELECT
      u.is_active,
      EXISTS (
        SELECT 1
        FROM observer_access_requests o
        WHERE o.user_id = u.id
          AND o.status IN ('ACTIVE', 'PROVISIONING')
          AND (o.expires_at IS NULL OR o.expires_at > NOW())
      ) AS observer_access,
      (SELECT observer_execution_mode
        FROM exchange_execution_preferences
        WHERE user_id = u.id) AS observer_execution_mode
    FROM users u
    WHERE u.id = ${userId}
    LIMIT 1
  `;
    if (!users[0]?.is_active) {
        throw (0, errorHandler_1.createError)('An active account is required to place testnet orders.', 403);
    }
    if (users[0].observer_access && users[0].observer_execution_mode !== 'testnet') {
        throw (0, errorHandler_1.createError)('This observer account is set to virtual observation. Switch it to Testnet before placing Testnet orders.', 403);
    }
}
async function getTicker(symbol) {
    return mapTicker(await getSingleDailyStats(symbol));
}
async function get24hTicker(symbol) {
    return mapTicker(await getSingleDailyStats(symbol));
}
async function get24hTickers() {
    const stats = await publicClient.dailyStats();
    if (!Array.isArray(stats)) {
        throw new Error('Binance returned an unexpected single-symbol ticker response.');
    }
    return stats.map((stat) => ({
        symbol: stat.symbol,
        lastPrice: stat.lastPrice,
        priceChange: stat.priceChange,
        priceChangePercent: stat.priceChangePercent,
        highPrice: stat.highPrice,
        lowPrice: stat.lowPrice,
        volume: stat.volume,
        quoteVolume: stat.quoteVolume,
    }));
}
async function getAllSpotPairs() {
    const exchangeInfo = await publicClient.exchangeInfo();
    if (!exchangeInfo || !exchangeInfo.symbols) {
        throw new Error('Binance exchange info unavailable.');
    }
    return exchangeInfo.symbols
        .filter((s) => s.status === 'TRADING' && s.quoteAsset === 'USDT' && !s.symbol.includes('UP') && !s.symbol.includes('DOWN') && !s.symbol.includes('BULL') && !s.symbol.includes('BEAR'))
        .map((s) => ({
        symbol: s.symbol,
        baseAsset: s.baseAsset,
        quoteAsset: s.quoteAsset,
        status: s.status,
    }));
}
async function getKlines(symbol, interval = '1h', limit = 100) {
    if (!SPOT_INTERVALS.includes(interval)) {
        throw new Error('A supported Spot kline interval is required.');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) {
        throw new Error('Kline limit must be an integer between 1 and 1000.');
    }
    const candles = await publicClient.candlesticks(normaliseSpotSymbol(symbol), interval, { limit });
    return candles.map((candle) => ({
        openTime: candle.openTime,
        open: numberFrom(candle.open, 'kline open'),
        high: numberFrom(candle.high, 'kline high'),
        low: numberFrom(candle.low, 'kline low'),
        close: numberFrom(candle.close, 'kline close'),
        volume: numberFrom(candle.volume, 'kline volume'),
        closeTime: candle.closeTime,
        quoteVolume: numberFrom(candle.quoteVolume ?? candle.quoteAssetVolume, 'kline quote volume'),
    }));
}
async function getManagedLiveAccountOverview(userId) {
    const rows = await (0, database_1.default) `
    SELECT
      managed.account_ref,
      managed.account_kind,
      portfolio.balance_usdt,
      portfolio.initial_balance_usdt,
      portfolio.stats,
      portfolio.observed_at
    FROM operator_managed_live_accounts managed
    JOIN copier_portfolio_accounts portfolio
      ON portfolio.instance_id = managed.instance_id
      AND portfolio.account_name = managed.account_ref
    WHERE managed.user_id = ${userId}
      AND managed.active = TRUE
      AND managed.requested_live = TRUE
      AND portfolio.enabled = TRUE
      AND portfolio.dry_run = FALSE
    ORDER BY portfolio.observed_at DESC
    LIMIT 1
  `;
    const row = rows[0];
    if (!row) {
        return { managed: false };
    }
    const free = Number(row.balance_usdt);
    const locked = Number(row.stats?.open_stake_usdt ?? 0);
    const initialBalance = Number(row.initial_balance_usdt);
    const totalProfit = Number(row.stats?.total_profit_usdt ?? 0);
    const totalTrades = Number(row.stats?.total_trades ?? 0);
    const openTrades = Number(row.stats?.open_trades ?? 0);
    const observedAt = new Date(row.observed_at);
    const validSnapshot = Number.isFinite(free) && free >= 0
        && Number.isFinite(locked) && locked >= 0
        && !Number.isNaN(observedAt.getTime());
    if (!validSnapshot) {
        return { managed: true, online: false, accountName: row.account_ref };
    }
    return {
        managed: true,
        // The copier reports a fresh snapshot at least once per minute. A
        // bounded five-minute window tolerates a short network retry without
        // presenting an old balance as live.
        online: Date.now() - observedAt.getTime() <= 5 * 60 * 1000,
        accountName: row.account_ref,
        accountKind: row.account_kind,
        balanceUsdt: free,
        portfolioValueUsdt: Number((free + locked).toFixed(8)),
        initialBalanceUsdt: Number.isFinite(initialBalance) ? initialBalance : null,
        realizedProfitUsdt: Number.isFinite(totalProfit) ? totalProfit : null,
        totalTrades: Number.isFinite(totalTrades) ? totalTrades : null,
        openTrades: Number.isFinite(openTrades) ? openTrades : null,
        connectionStatus: typeof row.stats?.connection_status === 'string' ? row.stats.connection_status : null,
        observedAt: observedAt.toISOString(),
    };
}
async function getManagedLiveAccountInfo(userId) {
    const managed = await getManagedLiveAccountOverview(userId);
    if (!managed.managed || !managed.online
        || typeof managed.balanceUsdt !== 'number'
        || typeof managed.portfolioValueUsdt !== 'number'
        || typeof managed.observedAt !== 'string') {
        return null;
    }
    return {
        balances: {
            USDT: {
                free: managed.balanceUsdt.toFixed(8),
                locked: (managed.portfolioValueUsdt - managed.balanceUsdt).toFixed(8),
            },
        },
        updateTime: new Date(managed.observedAt).getTime(),
        managedAccount: managed,
    };
}
async function getAccountInfo(userId, environment = 'testnet') {
    try {
        const account = await (await createUserClient(userId, environment)).account();
        return {
            balances: Object.fromEntries(account.balances.map((balance) => [
                balance.asset,
                { free: balance.free, locked: balance.locked },
            ])),
            updateTime: account.updateTime,
        };
    }
    catch (error) {
        if (error instanceof ExchangeConnectionUnavailableError) {
            const managed = await getManagedLiveAccountInfo(userId);
            if (managed)
                return managed;
        }
        throw error;
    }
}
async function recordExecutedTrade(userId, symbol, side, type, order, requestedQty, requestedPrice) {
    try {
        const rawOrder = order;
        let fillPrice = Number(rawOrder.price);
        if (!Number.isFinite(fillPrice) || fillPrice <= 0) {
            const executedQty = Number(rawOrder.executedQty);
            const cumQuote = Number(rawOrder.cummulativeQuoteQty);
            if (executedQty > 0 && cumQuote > 0) {
                fillPrice = cumQuote / executedQty;
            }
            else if (Array.isArray(rawOrder.fills) && rawOrder.fills.length > 0) {
                const totalCost = rawOrder.fills.reduce((sum, f) => sum + (Number(f.price) * Number(f.qty)), 0);
                const totalQty = rawOrder.fills.reduce((sum, f) => sum + Number(f.qty), 0);
                fillPrice = totalQty > 0 ? totalCost / totalQty : Number(rawOrder.fills[0].price);
            }
            else if (requestedPrice && requestedPrice > 0) {
                fillPrice = requestedPrice;
            }
            else {
                try {
                    const tick = await getSingleDailyStats(symbol);
                    fillPrice = Number(tick.lastPrice) || 0;
                }
                catch {
                    fillPrice = 0;
                }
            }
        }
        const qty = Number(rawOrder.executedQty) > 0 ? Number(rawOrder.executedQty) : requestedQty;
        const cleanSym = symbol.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        const orderId = rawOrder.orderId ? Number(rawOrder.orderId) : null;
        const clientOrderId = rawOrder.clientOrderId || null;
        const status = rawOrder.status || 'FILLED';
        const inserted = await (0, database_1.default) `
      INSERT INTO trades (
        user_id, symbol, side, type, quantity, price, status,
        binance_order_id, binance_client_order_id, timestamp
      ) VALUES (
        ${userId}, ${cleanSym}, ${side}, ${type}, ${qty}, ${fillPrice}, ${status},
        ${orderId}, ${clientOrderId}, NOW()
      )
      RETURNING id, symbol, side, price
    `;
        if (inserted && inserted[0]) {
            void (0, notificationService_1.notifyTradeExecuted)(userId, inserted[0]);
        }
        if (status === 'FILLED' && fillPrice > 0) {
            if (side === 'BUY') {
                await (0, database_1.default) `
          INSERT INTO portfolio (user_id, symbol, quantity, average_buy_price, current_price, last_updated)
          VALUES (${userId}, ${cleanSym}, ${qty}, ${fillPrice}, ${fillPrice}, NOW())
          ON CONFLICT (user_id, symbol) DO UPDATE SET
            average_buy_price = CASE
              WHEN (portfolio.quantity + EXCLUDED.quantity) > 0 THEN
                ((portfolio.average_buy_price * portfolio.quantity) + (EXCLUDED.average_buy_price * EXCLUDED.quantity)) / (portfolio.quantity + EXCLUDED.quantity)
              ELSE EXCLUDED.average_buy_price
            END,
            quantity = portfolio.quantity + EXCLUDED.quantity,
            current_price = EXCLUDED.current_price,
            last_updated = NOW()
        `;
            }
            else if (side === 'SELL') {
                await (0, database_1.default) `
          UPDATE portfolio
          SET quantity = GREATEST(0, quantity - ${qty}),
              current_price = ${fillPrice},
              last_updated = NOW()
          WHERE user_id = ${userId} AND symbol = ${cleanSym}
        `;
            }
        }
    }
    catch (err) {
        console.error('[binanceService] Failed to record executed trade to DB:', err);
    }
}
async function syncUserTradesFromBinance(userId, symbol = 'BTCUSDT') {
    try {
        const activeKey = await (0, database_1.default) `
      SELECT environment FROM api_keys
      WHERE user_id = ${userId} AND exchange = 'binance' AND active = TRUE
      ORDER BY CASE WHEN environment = 'live' THEN 1 ELSE 2 END ASC
      LIMIT 1
    `;
        const targetEnv = activeKey[0]?.environment || 'testnet';
        const client = await createUserClient(userId, targetEnv);
        const normalSym = normaliseSpotSymbol(symbol);
        const orders = await client.allOrders(normalSym, { limit: 30 });
        if (Array.isArray(orders)) {
            for (const ord of orders) {
                if (ord.status === 'FILLED') {
                    const executedQty = Number(ord.executedQty);
                    const cumQuote = Number(ord.cummulativeQuoteQty);
                    const price = Number(ord.price) > 0 ? Number(ord.price) : (executedQty > 0 ? cumQuote / executedQty : 0);
                    const side = ord.side === 'BUY' ? 'BUY' : 'SELL';
                    const type = ord.type || 'MARKET';
                    const ts = ord.time ? new Date(ord.time) : new Date();
                    const ordId = Number(ord.orderId);
                    const existing = await (0, database_1.default) `
            SELECT id FROM trades WHERE user_id = ${userId} AND binance_order_id = ${ordId} LIMIT 1
          `;
                    if (existing.length === 0) {
                        await (0, database_1.default) `
              INSERT INTO trades (
                user_id, symbol, side, type, quantity, price, status,
                binance_order_id, binance_client_order_id, timestamp
              ) VALUES (
                ${userId}, ${normalSym}, ${side}, ${type}, ${executedQty}, ${price}, 'FILLED',
                ${ordId}, ${ord.clientOrderId || null}, ${ts}
              )
            `;
                    }
                }
            }
        }
    }
    catch (err) {
        console.warn('[binanceService] Could not sync historical orders from Binance:', err);
    }
}
async function placeMarketOrder(symbol, side, quantity, userId) {
    await assertUserCanSubmitExchangeOrder(userId);
    requireTestnetExecution();
    if (!Number.isFinite(quantity) || quantity <= 0)
        throw new Error('Order quantity must be greater than zero.');
    const order = await (await createUserClient(userId, 'testnet')).order('MARKET', side, normaliseSpotSymbol(symbol), quantity);
    void recordExecutedTrade(userId, symbol, side, 'MARKET', order, quantity);
    return mapOrder(order);
}
async function placeLimitOrder(symbol, side, quantity, price, userId) {
    await assertUserCanSubmitExchangeOrder(userId);
    requireTestnetExecution();
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price <= 0) {
        throw new Error('Limit order quantity and price must be greater than zero.');
    }
    const order = await (await createUserClient(userId, 'testnet')).order('LIMIT', side, normaliseSpotSymbol(symbol), quantity, price, { timeInForce: 'GTC' });
    void recordExecutedTrade(userId, symbol, side, 'LIMIT', order, quantity, price);
    return mapOrder(order);
}
async function placeStopLimitOrder(symbol, side, quantity, price, stopPrice, userId) {
    await assertUserCanSubmitExchangeOrder(userId);
    requireTestnetExecution();
    if (!Number.isFinite(quantity) || quantity <= 0
        || !Number.isFinite(price) || price <= 0
        || !Number.isFinite(stopPrice) || stopPrice <= 0) {
        throw new Error('Stop-limit quantity, limit price, and stop price must be greater than zero.');
    }
    if ((side === 'BUY' && price < stopPrice) || (side === 'SELL' && price > stopPrice)) {
        throw new Error('Stop-limit price must be above the stop price for BUY orders and below it for SELL orders.');
    }
    const client = await createUserClient(userId, 'testnet');
    // The installed SDK supports STOP_LOSS_LIMIT at runtime but omits it from OrderType.
    const order = await client.order('STOP_LOSS_LIMIT', side, normaliseSpotSymbol(symbol), quantity, price, { stopPrice, timeInForce: 'GTC', newOrderRespType: 'RESULT' });
    return mapOrder(order);
}
async function cancelOrder(symbol, orderId, userId) {
    await assertUserCanSubmitExchangeOrder(userId);
    if (!Number.isSafeInteger(orderId) || orderId <= 0)
        throw new Error('A valid exchange order ID is required.');
    requireTestnetExecution();
    await (await createUserClient(userId, 'testnet')).cancel(normaliseSpotSymbol(symbol), orderId);
}
async function getOpenOrders(userId, symbol) {
    const orders = await (await createUserClient(userId, 'testnet')).openOrders(symbol ? normaliseSpotSymbol(symbol) : undefined);
    return orders.map(mapOrder);
}
async function getOrderStatus(symbol, orderId, userId) {
    if (!Number.isSafeInteger(orderId) || orderId <= 0)
        throw new Error('A valid exchange order ID is required.');
    const order = await (await createUserClient(userId, 'testnet')).orderStatus(normaliseSpotSymbol(symbol), orderId);
    return mapOrder(order);
}
function createTickerWebSocket(symbol, callback) {
    const ws = new ws_1.default(`wss://stream.binance.com:9443/ws/${normaliseSpotSymbol(symbol).toLowerCase()}@ticker`);
    ws.on('message', (data) => {
        const event = JSON.parse(data.toString());
        if (event.s && event.c && event.p && event.P && event.v && event.q) {
            callback({
                symbol: event.s,
                price: numberFrom(event.c, 'ticker price'),
                priceChange: numberFrom(event.p, 'ticker price change'),
                priceChangePercent: numberFrom(event.P, 'ticker percentage change'),
                volume: numberFrom(event.v, 'ticker volume'),
                quoteVolume: numberFrom(event.q, 'ticker quote volume'),
            });
        }
    });
    return ws;
}
exports.default = publicClient;
//# sourceMappingURL=binanceService.js.map
