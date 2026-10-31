"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinancePublicMarketFeed = exports.BINANCE_KLINE_INTERVALS = void 0;
exports.buildBinanceCombinedStreamUrl = buildBinanceCombinedStreamUrl;
exports.ingestBinancePublicFrame = ingestBinancePublicFrame;
const ws_1 = __importDefault(require("ws"));
const DEFAULT_SYMBOLS = [
    'BTCUSDT',
    'ETHUSDT',
    'SOLUSDT',
    'BNBUSDT',
    'XRPUSDT',
    'ADAUSDT',
    'DOGEUSDT',
    'AVAXUSDT',
];
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const KLINE_INTERVAL = '1m';
exports.BINANCE_KLINE_INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'];
const HISTORY_LIMIT = 120;
function validNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}
function validDecimal(value) {
    return typeof value === 'string' && value.length > 0 && Number.isFinite(Number(value));
}
function buildBinanceCombinedStreamUrl(symbols = DEFAULT_SYMBOLS, interval = KLINE_INTERVAL) {
    const intervals = typeof interval === 'string' ? [interval] : interval;
    const streams = symbols.flatMap((symbol) => {
        const normalized = symbol.toLowerCase();
        return [`${normalized}@ticker`, `${normalized}@trade`, ...intervals.map((value) => `${normalized}@kline_${value}`)];
    });
    const base = process.env.BINANCE_PUBLIC_WS_URL || 'wss://stream.binance.com:9443/stream';
    return `${base}?streams=${streams.join('/')}`;
}
/** Normalize public Binance combined-stream frames into the shared read model. */
function ingestBinancePublicFrame(rawMessage, marketDataService, receivedTime = Date.now()) {
    let frame;
    try {
        frame = JSON.parse(rawMessage.toString());
    }
    catch {
        return false;
    }
    const data = frame.data;
    if (!data || typeof data !== 'object')
        return false;
    if (data.e === '24hrTicker') {
        const event = data;
        if (typeof event.s !== 'string' ||
            !validNumber(event.E) ||
            !validDecimal(event.b) ||
            !validDecimal(event.a) ||
            !validDecimal(event.c)) {
            return false;
        }
        const ticker = {
            symbol: event.s,
            bidPrice: event.b,
            askPrice: event.a,
            lastPrice: event.c,
            priceChange24h: event.p,
            priceChangePercent24h: event.P,
            high24h: event.h,
            low24h: event.l,
            volume24h: event.v,
            quoteVolume24h: event.q,
            sourceTime: event.E,
        };
        marketDataService.ingestTicker(ticker, receivedTime);
        return true;
    }
    if (data.e === 'trade') {
        const event = data;
        if (typeof event.s !== 'string' ||
            !validNumber(event.t) ||
            !validNumber(event.T) ||
            !validDecimal(event.p) ||
            !validDecimal(event.q) ||
            typeof event.m !== 'boolean') {
            return false;
        }
        const trade = {
            symbol: event.s,
            tradeId: event.t,
            price: event.p,
            quantity: event.q,
            sourceTime: event.T,
            isBuyerMaker: event.m,
        };
        marketDataService.ingestTrade(trade, receivedTime);
        return true;
    }
    if (data.e === 'kline') {
        const event = data;
        const candle = event.k;
        if (typeof event.s !== 'string' ||
            !validNumber(event.E) ||
            !candle ||
            !validNumber(candle.t) ||
            !validNumber(candle.T) ||
            typeof candle.i !== 'string' ||
            !validDecimal(candle.o) ||
            !validDecimal(candle.h) ||
            !validDecimal(candle.l) ||
            !validDecimal(candle.c) ||
            !validDecimal(candle.v) ||
            typeof candle.x !== 'boolean') {
            return false;
        }
        const rawCandle = {
            symbol: event.s,
            interval: candle.i,
            openTime: candle.t,
            closeTime: candle.T,
            open: candle.o,
            high: candle.h,
            low: candle.l,
            close: candle.c,
            volume: candle.v,
            quoteVolume: validDecimal(candle.q) ? candle.q : undefined,
            tradesCount: validNumber(candle.n) ? candle.n : 0,
            isFinal: candle.x,
            sourceTime: event.E,
        };
        marketDataService.ingestCandle(rawCandle, receivedTime);
        return true;
    }
    return false;
}
async function fetchKlineHistory(symbol, interval, limit) {
    const endpoint = new URL('https://api.binance.com/api/v3/klines');
    endpoint.searchParams.set('symbol', symbol);
    endpoint.searchParams.set('interval', interval);
    endpoint.searchParams.set('limit', String(limit));
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
        throw new Error(`Binance kline history request failed with HTTP ${response.status}.`);
    }
    return await response.json();
}
class BinancePublicMarketFeed {
    marketDataService;
    symbols;
    initialSymbols;
    intervals;
    wsUrl;
    staleThresholdMs;
    historyLimit;
    socketFactory;
    historyLoader;
    socket = null;
    reconnectTimer = null;
    reconnectCount = 0;
    manuallyStopped = false;
    connectedAt = null;
    lastMessageAt = null;
    lastSourceTime = null;
    lastError = null;
    state = 'stopped';
    constructor(marketDataService, options = {}) {
        this.marketDataService = marketDataService;
        this.symbols = new Set((options.symbols ?? DEFAULT_SYMBOLS).map((symbol) => symbol.toUpperCase()));
        this.initialSymbols = new Set(this.symbols);
        this.intervals = [...new Set(options.intervals ?? exports.BINANCE_KLINE_INTERVALS)];
        this.wsUrl = options.wsUrl ?? buildBinanceCombinedStreamUrl([...this.symbols], this.intervals);
        this.staleThresholdMs = options.staleThresholdMs ?? 5_000;
        this.historyLimit = options.historyLimit ?? HISTORY_LIMIT;
        this.socketFactory = options.socketFactory ?? ((url) => new ws_1.default(url));
        this.historyLoader = options.historyLoader ?? fetchKlineHistory;
        if (this.symbols.size === 0 || [...this.symbols].some((symbol) => !/^[A-Z0-9]{5,20}$/.test(symbol))) {
            throw new Error('Binance public feed requires one or more valid Spot symbols.');
        }
        if (this.intervals.length === 0 || this.intervals.some((interval) => !/^(1m|3m|5m|15m|30m|1h|2h|4h|6h|8h|12h|1d|3d|1w|1M)$/.test(interval))) {
            throw new Error('Binance public feed requires valid Spot kline intervals.');
        }
        if (!Number.isInteger(this.historyLimit) || this.historyLimit < 1 || this.historyLimit > 1_000) {
            throw new Error('Binance public feed history limit must be between 1 and 1000.');
        }
    }
    start() {
        if (this.state !== 'stopped')
            return;
        this.manuallyStopped = false;
        void this.hydrateCandleHistory();
        this.connect();
    }
    stop() {
        this.manuallyStopped = true;
        this.state = 'stopped';
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.socket) {
            const socket = this.socket;
            this.socket = null;
            socket.removeAllListeners();
            socket.close(1000, 'server_shutdown');
        }
    }
    getStatus() {
        return {
            enabled: true,
            state: this.state,
            source: 'binance_spot_public',
            symbols: [...this.symbols].sort(),
            interval: KLINE_INTERVAL,
            intervals: [...this.intervals],
            connectedAt: this.connectedAt,
            lastMessageAt: this.lastMessageAt,
            lastSourceTime: this.lastSourceTime,
            lastError: this.lastError,
            reconnectCount: this.reconnectCount,
        };
    }
    addSymbols(symbols) {
        const added = [];
        for (const value of symbols) {
            const symbol = value.trim().toUpperCase();
            if (!/^[A-Z0-9]{5,20}$/.test(symbol)) {
                throw new Error(`Invalid Binance Spot symbol in strategy configuration: ${value}`);
            }
            if (!this.symbols.has(symbol)) {
                this.symbols.add(symbol);
                added.push(symbol);
            }
        }
        if (added.length === 0)
            return added;
        const socket = this.socket;
        if (socket && socket.readyState === ws_1.default.OPEN) {
            const params = added.flatMap((symbol) => {
                const normalized = symbol.toLowerCase();
                return [
                    `${normalized}@ticker`,
                    `${normalized}@trade`,
                    ...this.intervals.map((interval) => `${normalized}@kline_${interval}`),
                ];
            });
            socket.send(JSON.stringify({ method: 'SUBSCRIBE', params, id: Date.now() }));
        }
        void this.hydrateCandleHistory(added);
        return added;
    }
    async hydrateCandleHistory(symbols = [...this.symbols]) {
        const tasks = symbols.flatMap((symbol) => this.intervals.map((interval) => ({ symbol, interval })));
        let nextTask = 0;
        const worker = async () => {
            while (nextTask < tasks.length) {
                const task = tasks[nextTask++];
                if (!task)
                    return;
                try {
                    const history = await this.historyLoader(task.symbol, task.interval, this.historyLimit);
                    const receivedTime = Date.now();
                    for (const row of history) {
                        this.marketDataService.ingestCandle({
                            symbol: task.symbol,
                            interval: task.interval,
                            openTime: row[0],
                            open: row[1],
                            high: row[2],
                            low: row[3],
                            close: row[4],
                            volume: row[5],
                            closeTime: row[6],
                            quoteVolume: row[7],
                            tradesCount: row[8],
                            isFinal: row[6] < receivedTime,
                            sourceTime: Math.min(row[6], receivedTime),
                        }, receivedTime);
                    }
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown history request failure.';
                    console.error(`[BinancePublicMarketFeed] ${task.symbol} ${task.interval} candle history unavailable: ${message}`);
                }
            }
        };
        await Promise.all(Array.from({ length: Math.min(4, tasks.length) }, worker));
    }
    connect() {
        if (this.manuallyStopped)
            return;
        this.state = this.reconnectCount === 0 ? 'connecting' : 'reconnecting';
        let socket;
        try {
            socket = this.socketFactory(this.wsUrl);
        }
        catch (error) {
            this.scheduleReconnect(error);
            return;
        }
        this.socket = socket;
        let heartbeatTimer = null;
        let lastActivityAt = 0;
        socket.on('open', () => {
            if (this.socket !== socket)
                return;
            this.state = 'connected';
            this.connectedAt = new Date().toISOString();
            lastActivityAt = Date.now();
            this.lastError = null;
            this.reconnectCount = 0;
            this.subscribeDynamicSymbols(socket);
            heartbeatTimer = setInterval(() => {
                if (Date.now() - lastActivityAt > 45_000) {
                    socket.terminate();
                    return;
                }
                if (socket.readyState === ws_1.default.OPEN)
                    socket.ping();
            }, 15_000);
            heartbeatTimer.unref();
        });
        socket.on('message', (message) => {
            if (this.socket !== socket)
                return;
            const receivedTime = Date.now();
            if (ingestBinancePublicFrame(message, this.marketDataService, receivedTime)) {
                lastActivityAt = receivedTime;
                this.lastMessageAt = new Date(receivedTime).toISOString();
                try {
                    const frame = JSON.parse(message.toString());
                    const event = frame.data;
                    const sourceTime = event?.E ?? event?.T;
                    if (validNumber(sourceTime))
                        this.lastSourceTime = new Date(sourceTime).toISOString();
                }
                catch {
                    this.lastError = 'Received malformed public market frame.';
                }
            }
        });
        socket.on('error', (error) => {
            this.lastError = error.message;
            socket.terminate();
        });
        socket.on('close', () => {
            if (heartbeatTimer)
                clearInterval(heartbeatTimer);
            if (this.socket !== socket)
                return;
            this.socket = null;
            if (!this.manuallyStopped) {
                this.scheduleReconnect(new Error(this.lastError ?? 'Public market stream closed.'));
            }
        });
    }
    scheduleReconnect(error) {
        if (this.manuallyStopped)
            return;
        this.lastError = error instanceof Error ? error.message : 'Public market stream failed.';
        this.state = 'reconnecting';
        this.reconnectCount += 1;
        const delay = Math.min(RECONNECT_BASE_MS * 2 ** (this.reconnectCount - 1), RECONNECT_MAX_MS);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
        this.reconnectTimer.unref();
    }
    subscribeDynamicSymbols(socket) {
        const symbols = [...this.symbols].filter((symbol) => !this.initialSymbols.has(symbol));
        if (symbols.length === 0)
            return;
        const params = symbols.flatMap((symbol) => {
            const normalized = symbol.toLowerCase();
            return [
                `${normalized}@ticker`,
                `${normalized}@trade`,
                ...this.intervals.map((interval) => `${normalized}@kline_${interval}`),
            ];
        });
        socket.send(JSON.stringify({ method: 'SUBSCRIBE', params, id: Date.now() }));
    }
}
exports.BinancePublicMarketFeed = BinancePublicMarketFeed;
//# sourceMappingURL=binancePublicMarketFeed.js.map