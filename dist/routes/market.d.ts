/**
 * Market Data REST + WebSocket Transport (P3-03)
 *
 * Exposes two interfaces over the MarketDataService / MarketReadModelStore:
 *
 *  REST
 *  ────
 *  GET /api/market/snapshot/:symbol   — full per-symbol snapshot (for reconnect hydration)
 *  GET /api/market/channels/:symbol   — channel status + latency per channel
 *  GET /api/market/status             — overall ingest health (all cursors)
 *
 *  WebSocket
 *  ─────────
 *  ws://host/api/market/stream?symbol=BTCUSDT[&channels=trades,ticker,candles,depth]
 *
 *  On connect:
 *    1. Sends { type: 'snapshot', payload: MarketSnapshot } immediately.
 *    2. Streams { type: 'trade'|'candle'|'ticker'|'depth', payload: ReadModel } for subscribed channels.
 *    3. Accepts ping frames and sends pong; closes with code 1000 on graceful shutdown.
 *
 *  Frame format (all frames are JSON strings):
 *    { type: 'snapshot'|'trade'|'candle'|'ticker'|'depth'|'error'|'pong', payload: any }
 *
 * This module exports:
 *   - marketRouter        — Express router for REST endpoints
 *   - attachMarketWss     — call once after httpServer is created to bind the WS server
 */
import { WebSocketServer } from 'ws';
import type { Server } from 'http';
import { MarketDataService } from '../services/marketDataService';
import { MarketReadModelStore } from '../services/marketReadModelStore';
import type { BinancePublicMarketFeed } from '../services/binancePublicMarketFeed';
export declare const marketDataService: MarketDataService;
export declare const marketReadModelStore: MarketReadModelStore;
export declare const marketRouter: import("express-serve-static-core").Router;
export declare function setPublicMarketFeedStatusProvider(provider: (() => ReturnType<BinancePublicMarketFeed['getStatus']>) | null): void;
export type MarketWsFrame = {
    type: 'snapshot';
    payload: unknown;
} | {
    type: 'trade';
    payload: unknown;
} | {
    type: 'candle';
    payload: unknown;
} | {
    type: 'ticker';
    payload: unknown;
} | {
    type: 'depth';
    payload: unknown;
} | {
    type: 'pong';
} | {
    type: 'error';
    code: string;
    message: string;
};
/**
 * Attach the market-data WebSocket server to an existing HTTP server.
 * Call this once after `app.listen()` or `createServer(app)`.
 *
 * Returns the WSS instance so the caller can close it gracefully.
 */
export declare function attachMarketWss(httpServer: Server): WebSocketServer;
//# sourceMappingURL=market.d.ts.map