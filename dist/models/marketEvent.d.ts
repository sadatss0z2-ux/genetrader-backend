/**
 * Normalized Market Event Schema (P3-01)
 * Standardized data models for public market ingest, sequencing, cursors, and gap events.
 */
export type MarketChannel = 'trades' | 'candles' | 'ticker' | 'depth';
export interface NormalizedMarketEventBase {
    id: string;
    symbol: string;
    channel: MarketChannel;
    sourceTime: number;
    receivedTime: number;
    sequence: number;
    stale: boolean;
}
export interface NormalizedTradeEvent extends NormalizedMarketEventBase {
    channel: 'trades';
    tradeId: string;
    price: string;
    quantity: string;
    isBuyerMaker: boolean;
}
export interface NormalizedCandleEvent extends NormalizedMarketEventBase {
    channel: 'candles';
    interval: string;
    openTime: number;
    closeTime: number;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
    quoteVolume: string;
    tradesCount: number;
    isFinal: boolean;
}
export interface NormalizedTickerEvent extends NormalizedMarketEventBase {
    channel: 'ticker';
    bidPrice: string;
    askPrice: string;
    lastPrice: string;
    priceChange24h: string;
    priceChangePercent24h: string;
    high24h: string;
    low24h: string;
    volume24h: string;
    quoteVolume24h: string;
}
export type NormalizedMarketEvent = NormalizedTradeEvent | NormalizedCandleEvent | NormalizedTickerEvent;
export interface MarketGapEvent {
    id: string;
    symbol: string;
    channel: MarketChannel;
    expectedSequence: number;
    receivedSequence: number;
    gapSize: number;
    detectedAt: number;
    backfillStatus: 'pending' | 'in_progress' | 'resolved' | 'failed';
    resolvedAt?: number;
    error?: string;
}
export interface MarketCursor {
    symbol: string;
    channel: MarketChannel;
    lastSequence: number;
    lastExchangeSequence?: number;
    lastSourceTime: number;
    lastReceivedTime: number;
    totalEvents: number;
    duplicateCount: number;
    gapCount: number;
}
//# sourceMappingURL=marketEvent.d.ts.map