"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAiContext = buildAiContext;
const database_1 = __importDefault(require("../config/database"));
const binanceService_1 = require("./binanceService");
const CORE_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
const STABLE_ASSETS = new Set(['USDT', 'USDC', 'FDUSD', 'BUSD', 'TUSD', 'USDP', 'DAI']);
const NON_TICKER_WORDS = new Set(['AI', 'API', 'BUY', 'SELL', 'HOLD', 'HOW', 'WHAT', 'WHEN', 'WHERE', 'WHY', 'WHO', 'MY', 'ME', 'THE', 'AND', 'FOR', 'WITH', 'FROM', 'PRICE', 'MARKET', 'NEWS', 'TODAY', 'LATEST', 'CURRENT', 'USDT', 'USDC', 'USD', 'PNL', 'ROI']);
const ASSET_ALIASES = [
    [['bitcoin', 'btc'], 'BTCUSDT'],
    [['ethereum', 'ether', 'eth'], 'ETHUSDT'],
    [['solana', 'sol'], 'SOLUSDT'],
    [['bnb', 'binance coin'], 'BNBUSDT'],
    [['xrp', 'ripple'], 'XRPUSDT'],
    [['cardano', 'ada'], 'ADAUSDT'],
    [['dogecoin', 'doge'], 'DOGEUSDT'],
    [['avalanche', 'avax'], 'AVAXUSDT'],
    [['chainlink', 'link'], 'LINKUSDT'],
    [['polkadot', 'dot'], 'DOTUSDT'],
    [['litecoin', 'ltc'], 'LTCUSDT'],
    [['tron', 'trx'], 'TRXUSDT'],
    [['shiba inu', 'shib'], 'SHIBUSDT'],
    [['toncoin', 'ton'], 'TONUSDT'],
    [['sui'], 'SUIUSDT'],
];
function requestedSymbols(question) {
    const lower = question.toLowerCase();
    const symbols = new Set(CORE_SYMBOLS);
    for (const [aliases, pair] of ASSET_ALIASES) {
        if (aliases.some((alias) => {
            const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
            return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i').test(lower);
        })) {
            symbols.add(pair);
        }
    }
    for (const match of question.matchAll(/\b([A-Z0-9]{2,12})(?:USDT|USDC|USD)?\b/g)) {
        const asset = match[1]?.toUpperCase().replace(/(?:USDT|USDC|USD)$/, '');
        if (asset && !/^\d+$/.test(asset) && !NON_TICKER_WORDS.has(asset) && !STABLE_ASSETS.has(asset)) {
            symbols.add(`${asset}USDT`);
        }
    }
    return [...symbols].slice(0, 12);
}
function safeNumber(value) {
    if (value === null || value === undefined || value === '')
        return undefined;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}
async function getRecentOrders(userId) {
    const rows = await (0, database_1.default) `
    SELECT symbol, side, type, quantity::text, price::text, status, timestamp
    FROM trades
    WHERE user_id = ${userId}
    ORDER BY timestamp DESC NULLS LAST, id DESC
    LIMIT 5
  `;
    return rows.flatMap((row) => {
        const quantity = safeNumber(row.quantity);
        const priceUsdt = safeNumber(row.price);
        const placedMs = new Date(row.timestamp).getTime();
        if (!quantity || !priceUsdt || !Number.isFinite(placedMs))
            return [];
        return [{
                symbol: row.symbol,
                side: row.side,
                type: row.type,
                quantity,
                priceUsdt,
                status: row.status,
                placedAt: new Date(placedMs).toISOString(),
            }];
    });
}
async function getConfiguredRiskSettings(userId) {
    const rows = await (0, database_1.default) `
    SELECT risk_per_trade, max_position_size, max_open_trades, auto_take_profit,
      take_profit_percent, auto_stop_loss, stop_loss_percent
    FROM trading_settings
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC NULLS LAST, id DESC
    LIMIT 1
  `;
    const row = rows[0];
    if (!row)
        return undefined;
    return {
        riskPerTradePct: safeNumber(row.risk_per_trade) ?? 1,
        maxPositionSizeUsdt: safeNumber(row.max_position_size) ?? 1_000,
        maxOpenTrades: safeNumber(row.max_open_trades) ?? 5,
        autoTakeProfit: row.auto_take_profit ?? false,
        takeProfitPct: safeNumber(row.take_profit_percent) ?? 5,
        autoStopLoss: row.auto_stop_loss ?? false,
        stopLossPct: safeNumber(row.stop_loss_percent) ?? 3,
    };
}
function toQuoteMap(symbols, results) {
    const quoteBySymbol = new Map();
    results.forEach((result, index) => {
        if (result.status !== 'fulfilled')
            return;
        const price = safeNumber(result.value.price);
        const change = safeNumber(result.value.priceChangePercent);
        if (price !== undefined && price > 0 && change !== undefined) {
            quoteBySymbol.set(symbols[index], { price, change });
        }
    });
    return quoteBySymbol;
}
async function getPublicSpotTicker(symbol) {
    const response = await fetch(`https://data-api.binance.vision/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(3_500) });
    if (!response.ok)
        throw new Error(`Binance public ticker HTTP ${response.status}`);
    const data = await response.json();
    const price = safeNumber(data.lastPrice);
    const priceChangePercent = safeNumber(data.priceChangePercent);
    if (price === undefined || price <= 0 || priceChangePercent === undefined) {
        throw new Error('Binance returned an invalid public ticker quote.');
    }
    return { price, priceChangePercent };
}
async function fetchQuoteResults(symbols) {
    return Promise.allSettled(symbols.map((symbol) => getPublicSpotTicker(symbol)));
}
async function getPersonalContext(userId, baseSymbols, baseQuoteResults) {
    const [connectionResult, accountResult, ordersResult, riskSettingsResult] = await Promise.allSettled([
        (0, binanceService_1.getExchangeConnectionStatus)(userId),
        (0, binanceService_1.getAccountInfo)(userId, 'testnet'),
        getRecentOrders(userId),
        getConfiguredRiskSettings(userId),
    ]);
    const riskSettings = riskSettingsResult.status === 'fulfilled' ? riskSettingsResult.value : undefined;
    const testnetConnected = connectionResult.status === 'fulfilled'
        && connectionResult.value.profiles.some((profile) => profile.environment === 'testnet' && profile.connected);
    if (accountResult.status !== 'fulfilled') {
        return {
            access: connectionResult.status === 'rejected' || testnetConnected ? 'temporarily_unavailable' : 'not_connected',
            environment: 'testnet',
            holdings: [],
            recentOrders: ordersResult.status === 'fulfilled' ? ordersResult.value : [],
            ...(riskSettings ? { riskSettings } : {}),
        };
    }
    const balances = Object.entries(accountResult.value.balances)
        .flatMap(([asset, balance]) => {
        const free = safeNumber(balance.free) ?? 0;
        const locked = safeNumber(balance.locked) ?? 0;
        const quantity = free + locked;
        return /^[A-Z0-9]{2,16}$/.test(asset) && quantity > 0
            ? [{ asset, quantity }]
            : [];
    });
    const accountSymbols = balances
        .filter(({ asset }) => asset !== 'USDT')
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 6)
        .map(({ asset }) => `${asset}USDT`);
    const baseResults = await baseQuoteResults;
    const observedAt = new Date().toISOString();
    const quoteBySymbol = toQuoteMap(baseSymbols, baseResults);
    const additionalSymbols = accountSymbols.filter((symbol) => !quoteBySymbol.has(symbol));
    const additionalResults = await fetchQuoteResults(additionalSymbols);
    const additionalQuotes = toQuoteMap(additionalSymbols, additionalResults);
    for (const [symbol, quote] of additionalQuotes)
        quoteBySymbol.set(symbol, quote);
    const holdings = balances
        .map(({ asset, quantity }) => {
        if (asset === 'USDT')
            return { asset, quantity, priceUsdt: 1, valueUsdt: quantity };
        const priceUsdt = quoteBySymbol.get(`${asset}USDT`)?.price;
        return {
            asset,
            quantity,
            ...(priceUsdt === undefined ? {} : { priceUsdt, valueUsdt: quantity * priceUsdt }),
        };
    })
        .sort((a, b) => (b.valueUsdt ?? b.quantity) - (a.valueUsdt ?? a.quantity))
        .slice(0, 10);
    const valuedAllBalances = balances.every(({ asset }) => asset === 'USDT' || quoteBySymbol.has(`${asset}USDT`));
    const totalValueUsdt = valuedAllBalances && balances.length <= 10
        ? holdings.reduce((total, holding) => total + (holding.valueUsdt ?? 0), 0)
        : undefined;
    return {
        access: 'available',
        environment: 'testnet',
        observedAt: new Date(accountResult.value.updateTime).toISOString(),
        ...(totalValueUsdt === undefined ? {} : { totalValueUsdt }),
        ...(riskSettings ? { riskSettings } : {}),
        holdings,
        recentOrders: ordersResult.status === 'fulfilled' ? ordersResult.value : [],
    };
}
async function buildAiContext(userId, question, appMode = 'personal') {
    const generatedAt = new Date().toISOString();
    const symbols = requestedSymbols(question);
    const quoteResultsPromise = fetchQuoteResults(symbols);
    const personalPromise = userId
        ? getPersonalContext(userId, symbols, quoteResultsPromise)
        : Promise.resolve(undefined);
    const [marketResults, personal] = await Promise.all([quoteResultsPromise, personalPromise]);
    const marketObservedAt = new Date().toISOString();
    const quoteBySymbol = toQuoteMap(symbols, marketResults);
    const quotes = symbols.flatMap((symbol) => {
        const quote = quoteBySymbol.get(symbol);
        if (!quote)
            return [];
        return [{ symbol, priceUsdt: quote.price, change24hPct: quote.change, source: 'Binance Spot', observedAt: marketObservedAt }];
    });
    return {
        generatedAt,
        appMode,
        market: {
            status: quotes.length === 0 ? 'unavailable' : quotes.length < symbols.length ? 'partially_available' : 'available',
            source: 'Binance Spot',
            observedAt: marketObservedAt,
            quotes,
        },
        ...(personal ? { personal } : {}),
    };
}
//# sourceMappingURL=aiContextService.js.map