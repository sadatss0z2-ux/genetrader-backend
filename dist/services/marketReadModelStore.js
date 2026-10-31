"use strict";
/**
 * MarketReadModelStore (P3-02)
 *
 * Maintains in-memory, query-ready read models derived from the MarketDataService
 * event stream. Every normalized event is projected into a typed snapshot that
 * carries source time, received time, freshness state, and rolling latency stats.
 *
 * Design principles:
 *  - Pure projection: no business logic, no side-effects beyond in-memory state.
 *  - Freshness is computed at read time (not just at write time) so callers always
 *    see an up-to-date stale/fresh flag.
 *  - Latency samples use a bounded sliding window (default 1 000) to bound memory.
 *  - Order-book depth is updated via snapshot and partial update (incremental diff)
 *    with price-level merging.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketReadModelStore = void 0;
const events_1 = require("events");
const decimal_1 = require("../lib/decimal");
// ─────────────────────────────────────────────────────────────
// Internal latency accumulator
// ─────────────────────────────────────────────────────────────
class LatencyAccumulator {
    samples = [];
    maxSamples;
    minSeen = Infinity;
    maxSeen = -Infinity;
    lastUpdatedAt = 0;
    constructor(maxSamples) {
        this.maxSamples = maxSamples;
    }
    record(latencyMs, now) {
        this.samples.push(latencyMs);
        if (this.samples.length > this.maxSamples) {
            this.samples.shift();
        }
        if (latencyMs < this.minSeen)
            this.minSeen = latencyMs;
        if (latencyMs > this.maxSeen)
            this.maxSeen = latencyMs;
        this.lastUpdatedAt = now;
    }
    getStats() {
        if (this.samples.length === 0)
            return null;
        const sorted = [...this.samples].sort((a, b) => a - b);
        const n = sorted.length;
        const p = (pct) => {
            const idx = Math.min(Math.floor((pct / 100) * n), n - 1);
            return sorted[idx];
        };
        return {
            sampleCount: n,
            p50Ms: p(50),
            p95Ms: p(95),
            p99Ms: p(99),
            minMs: this.minSeen,
            maxMs: this.maxSeen,
            lastUpdatedAt: this.lastUpdatedAt,
        };
    }
    get count() {
        return this.samples.length;
    }
}
// ─────────────────────────────────────────────────────────────
// MarketReadModelStore
// ─────────────────────────────────────────────────────────────
class MarketReadModelStore extends events_1.EventEmitter {
    marketDataService;
    staleThresholdMs;
    maxTradesPerSymbol;
    maxLatencySamples;
    source;
    // Projections
    tickers = new Map();
    candles = new Map(); // symbol → interval → model
    candleHistory = new Map();
    trades = new Map(); // symbol → ring list
    orderBooks = new Map();
    // Latency accumulators keyed by `symbol:channel`
    latency = new Map();
    // Sequence counters (per-channel, used only for depth which has no MarketDataService sequence)
    depthSequences = new Map();
    constructor(marketDataService, options = {}) {
        super();
        this.marketDataService = marketDataService;
        this.staleThresholdMs = options.staleThresholdMs ?? 5000;
        this.maxTradesPerSymbol = options.maxTradesPerSymbol ?? 100;
        this.maxLatencySamples = options.maxLatencySamples ?? 1000;
        this.source = options.source ?? 'binance';
        this.subscribeToMarketDataService();
    }
    // ─── Subscription ───────────────────────────────────────────
    subscribeToMarketDataService() {
        this.marketDataService.on('trade', (event) => {
            this.projectTrade(event);
        });
        this.marketDataService.on('candle', (event) => {
            this.projectCandle(event);
        });
        this.marketDataService.on('ticker', (event) => {
            this.projectTicker(event);
        });
    }
    // ─── Projection helpers ──────────────────────────────────────
    recordLatency(symbol, channel, sourceTime, receivedTime) {
        const latencyMs = receivedTime - sourceTime;
        const key = `${symbol}:${channel}`;
        let acc = this.latency.get(key);
        if (!acc) {
            acc = new LatencyAccumulator(this.maxLatencySamples);
            this.latency.set(key, acc);
        }
        acc.record(latencyMs, receivedTime);
    }
    isFreshNow(receivedTimeMs, now = Date.now()) {
        return now - receivedTimeMs <= this.staleThresholdMs;
    }
    toISO(epochMs) {
        return new Date(epochMs).toISOString();
    }
    // ─── Trade projection ─────────────────────────────────────────
    projectTrade(event) {
        const symbol = event.symbol;
        const now = Date.now();
        this.recordLatency(symbol, 'trades', event.sourceTime, event.receivedTime);
        const model = {
            symbol,
            tradeId: event.tradeId,
            sourceTimestamp: this.toISO(event.sourceTime),
            receivedTimestamp: this.toISO(event.receivedTime),
            stale: event.stale,
            fresh: this.isFreshNow(event.receivedTime, now),
            sequence: event.sequence,
            price: event.price,
            quantity: event.quantity,
            isBuyerMaker: event.isBuyerMaker,
            source: this.source,
        };
        let list = this.trades.get(symbol);
        if (!list) {
            list = [];
            this.trades.set(symbol, list);
        }
        list.push(model);
        if (list.length > this.maxTradesPerSymbol) {
            list.shift();
        }
        this.emit('trade:projected', model);
    }
    // ─── Candle projection ────────────────────────────────────────
    projectCandle(event) {
        const symbol = event.symbol;
        const now = Date.now();
        this.recordLatency(symbol, 'candles', event.sourceTime, event.receivedTime);
        const model = {
            symbol,
            interval: event.interval,
            openTime: event.openTime,
            closeTime: event.closeTime,
            sourceTimestamp: this.toISO(event.sourceTime),
            receivedTimestamp: this.toISO(event.receivedTime),
            stale: event.stale,
            fresh: this.isFreshNow(event.receivedTime, now),
            sequence: event.sequence,
            open: event.open,
            high: event.high,
            low: event.low,
            close: event.close,
            volume: event.volume,
            quoteVolume: event.quoteVolume,
            tradesCount: event.tradesCount,
            isFinal: event.isFinal,
            source: this.source,
        };
        let intervalMap = this.candles.get(symbol);
        if (!intervalMap) {
            intervalMap = new Map();
            this.candles.set(symbol, intervalMap);
        }
        intervalMap.set(event.interval, model);
        let symbolHistory = this.candleHistory.get(symbol);
        if (!symbolHistory) {
            symbolHistory = new Map();
            this.candleHistory.set(symbol, symbolHistory);
        }
        const history = symbolHistory.get(event.interval) ?? [];
        const existingIndex = history.findIndex((candle) => candle.openTime === model.openTime);
        if (existingIndex >= 0) {
            history[existingIndex] = model;
        }
        else {
            history.push(model);
            history.sort((left, right) => left.openTime - right.openTime);
            if (history.length > 300)
                history.splice(0, history.length - 300);
        }
        symbolHistory.set(event.interval, history);
        this.emit('candle:projected', model);
    }
    // ─── Ticker projection ────────────────────────────────────────
    projectTicker(event) {
        const symbol = event.symbol;
        const now = Date.now();
        this.recordLatency(symbol, 'ticker', event.sourceTime, event.receivedTime);
        const model = {
            symbol,
            sourceTimestamp: this.toISO(event.sourceTime),
            receivedTimestamp: this.toISO(event.receivedTime),
            stale: event.stale,
            fresh: this.isFreshNow(event.receivedTime, now),
            sequence: event.sequence,
            bidPrice: event.bidPrice,
            askPrice: event.askPrice,
            lastPrice: event.lastPrice,
            priceChange24h: event.priceChange24h,
            priceChangePercent24h: event.priceChangePercent24h,
            high24h: event.high24h,
            low24h: event.low24h,
            volume24h: event.volume24h,
            quoteVolume24h: event.quoteVolume24h,
            source: this.source,
        };
        this.tickers.set(symbol, model);
        this.emit('ticker:projected', model);
    }
    // ─── Depth update ─────────────────────────────────────────────
    /**
     * Project an order-book depth update (snapshot or incremental diff).
     *
     * For incremental updates: price levels with qty='0' are deletions.
     * Bids are kept in descending price order; asks in ascending price order.
     */
    ingestDepth(raw, receivedTime = Date.now()) {
        const symbol = raw.symbol.toUpperCase();
        const sourceTime = raw.sourceTime ?? receivedTime;
        const now = Date.now();
        const seqKey = `${symbol}:depth`;
        const seq = (this.depthSequences.get(seqKey) ?? 0) + 1;
        this.depthSequences.set(seqKey, seq);
        this.recordLatency(symbol, 'depth', sourceTime, receivedTime);
        let existing = this.orderBooks.get(symbol);
        let bids;
        let asks;
        if (raw.isSnapshot || !existing) {
            bids = new Map();
            asks = new Map();
        }
        else {
            // Rebuild mutable maps from existing model
            bids = new Map(existing.bids.map((l) => [l.price, l.quantity]));
            asks = new Map(existing.asks.map((l) => [l.price, l.quantity]));
        }
        // Apply updates — zero-quantity entries are deletions
        for (const [price, qty] of raw.bids) {
            const priceDec = (0, decimal_1.financial)(price).toString();
            if ((0, decimal_1.financial)(qty).isZero()) {
                bids.delete(priceDec);
            }
            else {
                bids.set(priceDec, (0, decimal_1.financial)(qty).toString());
            }
        }
        for (const [price, qty] of raw.asks) {
            const priceDec = (0, decimal_1.financial)(price).toString();
            if ((0, decimal_1.financial)(qty).isZero()) {
                asks.delete(priceDec);
            }
            else {
                asks.set(priceDec, (0, decimal_1.financial)(qty).toString());
            }
        }
        // Sort: bids descending, asks ascending
        const sortedBids = [...bids.entries()]
            .sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]))
            .map(([price, quantity]) => ({ price, quantity }));
        const sortedAsks = [...asks.entries()]
            .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
            .map(([price, quantity]) => ({ price, quantity }));
        const model = {
            symbol,
            sourceTimestamp: this.toISO(sourceTime),
            receivedTimestamp: this.toISO(receivedTime),
            stale: receivedTime - sourceTime > this.staleThresholdMs,
            fresh: this.isFreshNow(receivedTime, now),
            sequence: seq,
            bids: sortedBids,
            asks: sortedAsks,
            source: this.source,
        };
        this.orderBooks.set(symbol, model);
        this.emit('depth:projected', model);
    }
    // ─── Query API ────────────────────────────────────────────────
    /** Get the latest ticker snapshot for a symbol */
    getTicker(symbol, now = Date.now()) {
        const m = this.tickers.get(symbol.toUpperCase());
        if (!m)
            return null;
        // Recompute fresh flag at read time
        return { ...m, fresh: this.isFreshNow(new Date(m.receivedTimestamp).getTime(), now) };
    }
    /** Get the latest finalized candle for a symbol and interval */
    getCandle(symbol, interval, now = Date.now()) {
        const intervalMap = this.candles.get(symbol.toUpperCase());
        if (!intervalMap)
            return null;
        const m = intervalMap.get(interval);
        if (!m)
            return null;
        return { ...m, fresh: this.isFreshNow(new Date(m.receivedTimestamp).getTime(), now) };
    }
    /** Get all candle intervals for a symbol */
    getAllCandles(symbol, now = Date.now()) {
        const intervalMap = this.candles.get(symbol.toUpperCase());
        if (!intervalMap)
            return {};
        const result = {};
        for (const [interval, m] of intervalMap) {
            result[interval] = { ...m, fresh: this.isFreshNow(new Date(m.receivedTimestamp).getTime(), now) };
        }
        return result;
    }
    /** Get bounded candle history for charting, oldest first. */
    getCandleHistory(symbol, now = Date.now()) {
        const intervalMap = this.candleHistory.get(symbol.toUpperCase());
        if (!intervalMap)
            return {};
        const result = {};
        for (const [interval, history] of intervalMap) {
            result[interval] = history.map((model) => ({
                ...model,
                fresh: this.isFreshNow(new Date(model.receivedTimestamp).getTime(), now),
            }));
        }
        return result;
    }
    /** Get recent trades for a symbol, newest last */
    getRecentTrades(symbol, limit = 50, now = Date.now()) {
        const list = this.trades.get(symbol.toUpperCase()) ?? [];
        return list.slice(-limit).map((m) => ({
            ...m,
            fresh: this.isFreshNow(new Date(m.receivedTimestamp).getTime(), now),
        }));
    }
    /** Get order book for a symbol */
    getOrderBook(symbol, now = Date.now()) {
        const m = this.orderBooks.get(symbol.toUpperCase());
        if (!m)
            return null;
        return { ...m, fresh: this.isFreshNow(new Date(m.receivedTimestamp).getTime(), now) };
    }
    /** Get latency stats for a channel */
    getLatencyStats(symbol, channel) {
        const key = `${symbol.toUpperCase()}:${channel}`;
        return this.latency.get(key)?.getStats() ?? null;
    }
    /** Get channel status summary */
    getChannelStatus(symbol, channel, now = Date.now()) {
        const cursor = this.marketDataService.getCursor(symbol, channel);
        const latency = this.getLatencyStats(symbol, channel);
        const lastReceivedMs = cursor?.lastReceivedTime ?? 0;
        return {
            symbol: symbol.toUpperCase(),
            channel,
            fresh: lastReceivedMs > 0 && now - lastReceivedMs <= this.staleThresholdMs,
            lastReceivedAt: lastReceivedMs > 0 ? new Date(lastReceivedMs).toISOString() : null,
            totalEvents: cursor?.totalEvents ?? 0,
            duplicateCount: cursor?.duplicateCount ?? 0,
            gapCount: cursor?.gapCount ?? 0,
            latency,
        };
    }
    /** Assemble a full market snapshot for a symbol */
    getMarketSnapshot(symbol, recentTradeLimit = 20, now = Date.now()) {
        const sym = symbol.toUpperCase();
        const channels = ['trades', 'candles', 'ticker', 'depth'].map((ch) => this.getChannelStatus(sym, ch, now));
        return {
            symbol: sym,
            snapshotAt: new Date(now).toISOString(),
            ticker: this.getTicker(sym, now),
            latestCandles: this.getAllCandles(sym, now),
            candleHistory: this.getCandleHistory(sym, now),
            recentTrades: this.getRecentTrades(sym, recentTradeLimit, now),
            orderBook: this.getOrderBook(sym, now),
            channels,
        };
    }
    /** Reset all projections (for test isolation) */
    reset() {
        this.tickers.clear();
        this.candles.clear();
        this.candleHistory.clear();
        this.trades.clear();
        this.orderBooks.clear();
        this.latency.clear();
        this.depthSequences.clear();
    }
}
exports.MarketReadModelStore = MarketReadModelStore;
//# sourceMappingURL=marketReadModelStore.js.map