import WebSocket from 'ws';
import type { EventEmitter } from 'events';
import { MarketDataService } from './marketDataService';
export declare const BINANCE_KLINE_INTERVALS: readonly ["1m", "5m", "15m", "1h", "4h", "1d"];
type MarketSocket = WebSocket & EventEmitter;
type SocketFactory = (url: string) => MarketSocket;
type KlineHistoryLoader = (symbol: string, interval: string, limit: number) => Promise<BinanceKlineRestRow[]>;
export interface BinancePublicFeedStatus {
    enabled: boolean;
    state: 'stopped' | 'connecting' | 'connected' | 'reconnecting' | 'error';
    source: 'binance_spot_public';
    symbols: string[];
    interval: string;
    intervals: string[];
    connectedAt: string | null;
    lastMessageAt: string | null;
    lastSourceTime: string | null;
    lastError: string | null;
    reconnectCount: number;
}
export interface BinancePublicMarketFeedOptions {
    symbols?: readonly string[];
    intervals?: readonly string[];
    wsUrl?: string;
    staleThresholdMs?: number;
    historyLimit?: number;
    socketFactory?: SocketFactory;
    historyLoader?: KlineHistoryLoader;
}
interface BinanceKlineRestRow {
    0: number;
    1: string;
    2: string;
    3: string;
    4: string;
    5: string;
    6: number;
    7: string;
    8: number;
    9: string;
    10: string;
    11: string;
}
export declare function buildBinanceCombinedStreamUrl(symbols?: readonly string[], interval?: string | readonly string[]): string;
/** Normalize public Binance combined-stream frames into the shared read model. */
export declare function ingestBinancePublicFrame(rawMessage: string | Buffer, marketDataService: MarketDataService, receivedTime?: number): boolean;
export declare class BinancePublicMarketFeed {
    private readonly marketDataService;
    private readonly symbols;
    private readonly initialSymbols;
    private readonly intervals;
    private readonly wsUrl;
    private readonly staleThresholdMs;
    private readonly historyLimit;
    private readonly socketFactory;
    private readonly historyLoader;
    private socket;
    private reconnectTimer;
    private reconnectCount;
    private manuallyStopped;
    private connectedAt;
    private lastMessageAt;
    private lastSourceTime;
    private lastError;
    private state;
    constructor(marketDataService: MarketDataService, options?: BinancePublicMarketFeedOptions);
    start(): void;
    stop(): void;
    getStatus(): BinancePublicFeedStatus;
    addSymbols(symbols: readonly string[]): string[];
    private hydrateCandleHistory;
    private connect;
    private scheduleReconnect;
    private subscribeDynamicSymbols;
}
export {};
//# sourceMappingURL=binancePublicMarketFeed.d.ts.map