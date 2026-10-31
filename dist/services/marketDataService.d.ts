import { EventEmitter } from 'events';
import { MarketChannel, NormalizedMarketEvent, NormalizedTradeEvent, NormalizedCandleEvent, NormalizedTickerEvent, MarketGapEvent, MarketCursor } from '../models/marketEvent';
export interface RawTradeInput {
    symbol: string;
    tradeId: string | number;
    price: string | number;
    quantity: string | number;
    sourceTime: number;
    isBuyerMaker?: boolean;
    exchangeSequence?: number;
}
export interface RawCandleInput {
    symbol: string;
    interval: string;
    openTime: number;
    closeTime: number;
    open: string | number;
    high: string | number;
    low: string | number;
    close: string | number;
    volume: string | number;
    quoteVolume?: string | number;
    tradesCount?: number;
    isFinal?: boolean;
    sourceTime?: number;
    exchangeSequence?: number;
}
export interface RawTickerInput {
    symbol: string;
    bidPrice: string | number;
    askPrice: string | number;
    lastPrice: string | number;
    priceChange24h?: string | number;
    priceChangePercent24h?: string | number;
    high24h?: string | number;
    low24h?: string | number;
    volume24h?: string | number;
    quoteVolume24h?: string | number;
    sourceTime?: number;
}
export interface IngestResult<T extends NormalizedMarketEvent> {
    event: T;
    isDuplicate: boolean;
    gapDetected?: MarketGapEvent;
}
export interface BackfillAdapter {
    fetchMissingTrades?(symbol: string, fromSeq: number, toSeq: number): Promise<RawTradeInput[]>;
    fetchMissingCandles?(symbol: string, interval: string, startTime: number, endTime: number): Promise<RawCandleInput[]>;
}
export interface MarketDataServiceOptions {
    staleThresholdMs?: number;
    maxBufferPerChannel?: number;
    backfillAdapter?: BackfillAdapter;
}
export interface ReplayReport {
    totalProcessed: number;
    acceptedCount: number;
    duplicateCount: number;
    gapsDetectedCount: number;
    gapsResolvedCount: number;
    startTime: number;
    endTime: number;
}
export declare class MarketDataService extends EventEmitter {
    private staleThresholdMs;
    private maxBufferPerChannel;
    private backfillAdapter?;
    private cursors;
    private buffers;
    private processedIds;
    private gapEvents;
    private channelSequences;
    constructor(options?: MarketDataServiceOptions);
    private getChannelKey;
    private getOrCreateCursor;
    private getBuffer;
    private getProcessedSet;
    private appendToBuffer;
    /**
     * Ingest a public trade event
     */
    ingestTrade(raw: RawTradeInput, receivedTime?: number): IngestResult<NormalizedTradeEvent>;
    /**
     * Ingest a public candlestick/kline event
     */
    ingestCandle(raw: RawCandleInput, receivedTime?: number): IngestResult<NormalizedCandleEvent>;
    /**
     * Ingest a public 24hr ticker event
     */
    ingestTicker(raw: RawTickerInput, receivedTime?: number): IngestResult<NormalizedTickerEvent>;
    /**
     * Check if a specific symbol channel is fresh
     */
    isChannelFresh(symbol: string, channel: MarketChannel, now?: number): boolean;
    /**
     * Get cursor status for a symbol & channel
     */
    getCursor(symbol: string, channel: MarketChannel): MarketCursor | undefined;
    /**
     * Get all registered cursors
     */
    getAllCursors(): MarketCursor[];
    /**
     * Get recorded gap events
     */
    getGapEvents(symbol?: string): MarketGapEvent[];
    /**
     * Get latest event from ring buffer
     */
    getLatestEvent(symbol: string, channel: MarketChannel): NormalizedMarketEvent | undefined;
    /**
     * Get recent events from ring buffer up to limit
     */
    getRecentEvents(symbol: string, channel: MarketChannel, limit?: number): NormalizedMarketEvent[];
    /**
     * Resolve a gap via the backfill adapter
     */
    resolveGap(gapId: string): Promise<boolean>;
    /**
     * Replay a recorded sequence of events and output a summary report
     */
    replayTrades(trades: RawTradeInput[], options?: {
        autoResolveGaps?: boolean;
    }): Promise<ReplayReport>;
    /**
     * Reset all in-memory buffers and state (useful for test isolation)
     */
    reset(): void;
}
//# sourceMappingURL=marketDataService.d.ts.map