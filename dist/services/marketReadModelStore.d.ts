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
import { EventEmitter } from 'events';
import { MarketDataService } from './marketDataService';
import type { MarketChannel } from '../models/marketEvent';
import type { TickerReadModel, CandleReadModel, TradeReadModel, OrderBookReadModel, ChannelStatus, MarketSnapshot, LatencyStats } from '../models/marketReadModel';
export interface RawDepthInput {
    symbol: string;
    bids: [string, string][];
    asks: [string, string][];
    sourceTime?: number;
    isSnapshot?: boolean;
}
export interface MarketReadModelStoreOptions {
    staleThresholdMs?: number;
    maxTradesPerSymbol?: number;
    maxLatencySamples?: number;
    source?: string;
}
export declare class MarketReadModelStore extends EventEmitter {
    private readonly marketDataService;
    private staleThresholdMs;
    private maxTradesPerSymbol;
    private maxLatencySamples;
    private source;
    private tickers;
    private candles;
    private candleHistory;
    private trades;
    private orderBooks;
    private latency;
    private depthSequences;
    constructor(marketDataService: MarketDataService, options?: MarketReadModelStoreOptions);
    private subscribeToMarketDataService;
    private recordLatency;
    private isFreshNow;
    private toISO;
    private projectTrade;
    private projectCandle;
    private projectTicker;
    /**
     * Project an order-book depth update (snapshot or incremental diff).
     *
     * For incremental updates: price levels with qty='0' are deletions.
     * Bids are kept in descending price order; asks in ascending price order.
     */
    ingestDepth(raw: RawDepthInput, receivedTime?: number): void;
    /** Get the latest ticker snapshot for a symbol */
    getTicker(symbol: string, now?: number): TickerReadModel | null;
    /** Get the latest finalized candle for a symbol and interval */
    getCandle(symbol: string, interval: string, now?: number): CandleReadModel | null;
    /** Get all candle intervals for a symbol */
    getAllCandles(symbol: string, now?: number): Record<string, CandleReadModel>;
    /** Get bounded candle history for charting, oldest first. */
    getCandleHistory(symbol: string, now?: number): Record<string, CandleReadModel[]>;
    /** Get recent trades for a symbol, newest last */
    getRecentTrades(symbol: string, limit?: number, now?: number): TradeReadModel[];
    /** Get order book for a symbol */
    getOrderBook(symbol: string, now?: number): OrderBookReadModel | null;
    /** Get latency stats for a channel */
    getLatencyStats(symbol: string, channel: MarketChannel): LatencyStats | null;
    /** Get channel status summary */
    getChannelStatus(symbol: string, channel: MarketChannel, now?: number): ChannelStatus;
    /** Assemble a full market snapshot for a symbol */
    getMarketSnapshot(symbol: string, recentTradeLimit?: number, now?: number): MarketSnapshot;
    /** Reset all projections (for test isolation) */
    reset(): void;
}
//# sourceMappingURL=marketReadModelStore.d.ts.map