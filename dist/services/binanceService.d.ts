import Binance from 'node-binance-api';
import WebSocket from 'ws';
export type ExchangeEnvironment = 'testnet' | 'live';
export type ObserverExecutionMode = 'virtual' | 'testnet';
export declare function parseExchangeEnvironment(value: unknown, fallback?: ExchangeEnvironment): ExchangeEnvironment;
export declare class ExchangeConnectionUnavailableError extends Error {
    readonly statusCode = 503;
    constructor(message: string);
}
/**
 * User credentials are deliberately fail-closed. This adapter must never fall
 * back to a shared environment key, because that could expose another account.
 * A user may retain one Testnet and one Live profile; callers must always name
 * the environment they intend to use.
 */
export declare function getUserBinanceCredentials(userId: number, environment?: ExchangeEnvironment): Promise<{
    apiKey: string;
    apiSecret: string;
}>;
export interface ExchangeKeyPermissions {
    canTrade: boolean;
    canWithdraw: boolean;
    canDeposit: boolean;
    accountType?: string;
}
export interface ExchangeKeyValidationResult {
    valid: boolean;
    error?: string;
    permissions?: ExchangeKeyPermissions;
}
export interface ExchangeConnectionStatus {
    connected: boolean;
    testnet: boolean;
    permissions: string[];
    keyAddedAt: Date | null;
    lastUsedAt: Date | null;
    executionEnvironment: 'testnet';
    observerExecutionMode: ObserverExecutionMode;
    profiles: Array<{
        environment: ExchangeEnvironment;
        connected: boolean;
        permissions: string[];
        keyAddedAt: Date | null;
        lastUsedAt: Date | null;
    }>;
}
/**
 * Inspects Binance API key permissions against the configured Spot API.
 * The non-custodial withdrawal rule is enforced for Live credentials; Spot
 * Testnet withdrawal flags do not represent movement of real funds.
 */
export declare function inspectExchangeKeyPermissions(apiKey: string, apiSecret: string, environment?: ExchangeEnvironment): Promise<ExchangeKeyValidationResult>;
export declare function validateTestnetSpotCredentials(apiKey: string, apiSecret: string): Promise<boolean>;
export declare function getExchangeConnectionStatus(userId: number): Promise<ExchangeConnectionStatus>;
export declare function rotateExchangeCredentials(userId: number, apiKey: string, apiSecret: string, environment?: ExchangeEnvironment): Promise<{
    success: boolean;
    permissions: string[];
    environment: ExchangeEnvironment;
}>;
export declare function revokeExchangeCredentials(userId: number, environment?: ExchangeEnvironment): Promise<void>;
export declare function setObserverExecutionMode(userId: number, observerExecutionMode: ObserverExecutionMode): Promise<{
    observerExecutionMode: ObserverExecutionMode;
}>;
declare const publicClient: Binance;
export interface Ticker {
    symbol: string;
    price: number;
    priceChange: number;
    priceChangePercent: number;
    volume: number;
    quoteVolume: number;
}
export interface BinanceTicker24h {
    symbol: string;
    lastPrice: string;
    priceChange: string;
    priceChangePercent: string;
    highPrice: string;
    lowPrice: string;
    volume: string;
    quoteVolume: string;
}
export interface BinanceExchangeInfo {
    symbol: string;
    baseAsset: string;
    quoteAsset: string;
    status: string;
}
export interface Kline {
    openTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    closeTime: number;
    quoteVolume: number;
}
export interface AccountInfo {
    balances: Record<string, {
        free: string;
        locked: string;
    }>;
    updateTime: number;
    managedAccount?: ManagedLiveAccountOverview;
}
export interface ManagedLiveAccountOverview {
    managed: boolean;
    online?: boolean;
    accountName?: string;
    accountKind?: string;
    balanceUsdt?: number;
    portfolioValueUsdt?: number;
    initialBalanceUsdt?: number | null;
    realizedProfitUsdt?: number | null;
    totalTrades?: number | null;
    openTrades?: number | null;
    connectionStatus?: string | null;
    observedAt?: string;
}
export interface Order {
    symbol: string;
    orderId: number;
    clientOrderId: string;
    transactTime: number;
    price: number;
    origQty: string;
    executedQty: string;
    status: string;
    side: 'BUY' | 'SELL';
    type: string;
}
export declare function assertUserCanSubmitExchangeOrder(userId: number): Promise<void>;
export declare function getTicker(symbol: string): Promise<Ticker>;
export declare function get24hTicker(symbol: string): Promise<Ticker>;
export declare function get24hTickers(): Promise<BinanceTicker24h[]>;
export declare function getAllSpotPairs(): Promise<BinanceExchangeInfo[]>;
export declare function getKlines(symbol: string, interval?: string, limit?: number): Promise<Kline[]>;
export declare function getManagedLiveAccountOverview(userId: number): Promise<ManagedLiveAccountOverview>;
export declare function getAccountInfo(userId: number, environment?: ExchangeEnvironment): Promise<AccountInfo>;
export declare function syncUserTradesFromBinance(userId: number, symbol?: string): Promise<void>;
export declare function placeMarketOrder(symbol: string, side: 'BUY' | 'SELL', quantity: number, userId: number): Promise<Order>;
export declare function placeLimitOrder(symbol: string, side: 'BUY' | 'SELL', quantity: number, price: number, userId: number): Promise<Order>;
export declare function placeStopLimitOrder(symbol: string, side: 'BUY' | 'SELL', quantity: number, price: number, stopPrice: number, userId: number): Promise<Order>;
export declare function cancelOrder(symbol: string, orderId: number, userId: number): Promise<void>;
export declare function getOpenOrders(userId: number, symbol?: string): Promise<Order[]>;
export declare function getOrderStatus(symbol: string, orderId: number, userId: number): Promise<Order>;
export declare function createTickerWebSocket(symbol: string, callback: (ticker: Ticker) => void): WebSocket;
export default publicClient;
//# sourceMappingURL=binanceService.d.ts.map
