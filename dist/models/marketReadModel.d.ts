/**
 * Market Read Models (P3-02)
 *
 * Typed query-side snapshots derived from normalized ingested market events.
 * Each model carries source time, received time, a server-computed freshness flag,
 * and latency metadata so consumers can always know the age and reliability of data.
 *
 * These models are intentionally decoupled from storage — they are pure in-memory
 * projections maintained by MarketReadModelStore, updated on every ingested event.
 */
import type { MarketChannel } from './marketEvent';
export interface LatencyStats {
    /** Samples collected in the rolling window */
    sampleCount: number;
    /** Median latency in ms (p50) */
    p50Ms: number;
    /** 95th-percentile latency in ms */
    p95Ms: number;
    /** 99th-percentile latency in ms */
    p99Ms: number;
    /** All-time minimum latency seen */
    minMs: number;
    /** All-time maximum latency seen */
    maxMs: number;
    /** Timestamp of last update */
    lastUpdatedAt: number;
}
export interface TickerReadModel {
    symbol: string;
    /** ISO-8601 UTC, derived from exchange sourceTime */
    sourceTimestamp: string;
    /** ISO-8601 UTC, wall-clock time the event arrived at the ingest boundary */
    receivedTimestamp: string;
    /** True if receivedTime - sourceTime > staleThresholdMs at ingest time */
    stale: boolean;
    /** True if now - receivedTime > staleThresholdMs (freshness check at read time) */
    fresh: boolean;
    /** Monotonic ingest sequence number for the ticker channel */
    sequence: number;
    /** Best bid price (string decimal) */
    bidPrice: string;
    /** Best ask price (string decimal) */
    askPrice: string;
    /** Last traded price (string decimal) */
    lastPrice: string;
    priceChange24h: string;
    priceChangePercent24h: string;
    high24h: string;
    low24h: string;
    volume24h: string;
    quoteVolume24h: string;
    /** Source exchange that produced this event */
    source: string;
}
export interface CandleReadModel {
    symbol: string;
    interval: string;
    /** Candle open epoch ms */
    openTime: number;
    /** Candle close epoch ms */
    closeTime: number;
    /** ISO-8601 UTC from exchange sourceTime */
    sourceTimestamp: string;
    /** ISO-8601 UTC received at ingest boundary */
    receivedTimestamp: string;
    stale: boolean;
    fresh: boolean;
    sequence: number;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
    quoteVolume: string;
    tradesCount: number;
    /** True once the candle period has closed */
    isFinal: boolean;
    source: string;
}
export interface DepthLevel {
    price: string;
    quantity: string;
}
export interface OrderBookReadModel {
    symbol: string;
    /** ISO-8601 UTC from exchange sourceTime */
    sourceTimestamp: string;
    /** ISO-8601 UTC received at ingest boundary */
    receivedTimestamp: string;
    stale: boolean;
    fresh: boolean;
    sequence: number;
    bids: DepthLevel[];
    asks: DepthLevel[];
    source: string;
}
export interface TradeReadModel {
    symbol: string;
    tradeId: string;
    /** ISO-8601 UTC from exchange sourceTime */
    sourceTimestamp: string;
    /** ISO-8601 UTC received at ingest boundary */
    receivedTimestamp: string;
    stale: boolean;
    fresh: boolean;
    sequence: number;
    price: string;
    quantity: string;
    isBuyerMaker: boolean;
    source: string;
}
export interface ChannelStatus {
    symbol: string;
    channel: MarketChannel;
    fresh: boolean;
    lastReceivedAt: string | null;
    totalEvents: number;
    duplicateCount: number;
    gapCount: number;
    latency: LatencyStats | null;
}
export interface MarketSnapshot {
    symbol: string;
    /** Wall-clock timestamp at which this snapshot was assembled */
    snapshotAt: string;
    ticker: TickerReadModel | null;
    latestCandles: Record<string, CandleReadModel>;
    candleHistory: Record<string, CandleReadModel[]>;
    recentTrades: TradeReadModel[];
    orderBook: OrderBookReadModel | null;
    channels: ChannelStatus[];
}
//# sourceMappingURL=marketReadModel.d.ts.map