"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.marketRouter = exports.marketReadModelStore = exports.marketDataService = void 0;
exports.setPublicMarketFeedStatusProvider = setPublicMarketFeedStatusProvider;
exports.attachMarketWss = attachMarketWss;
const express_1 = require("express");
const ws_1 = require("ws");
const url_1 = require("url");
const marketDataService_1 = require("../services/marketDataService");
const marketReadModelStore_1 = require("../services/marketReadModelStore");
// ─────────────────────────────────────────────────────────────
// Singleton service instances (shared with the rest of the app)
// ─────────────────────────────────────────────────────────────
// Services are created once per process and exported so that any
// module can ingest events (e.g., a Binance WS adapter).
exports.marketDataService = new marketDataService_1.MarketDataService({
    staleThresholdMs: Number(process.env.MARKET_STALE_THRESHOLD_MS ?? 5000),
    maxBufferPerChannel: 1000,
});
exports.marketReadModelStore = new marketReadModelStore_1.MarketReadModelStore(exports.marketDataService, {
    staleThresholdMs: Number(process.env.MARKET_STALE_THRESHOLD_MS ?? 5000),
    maxTradesPerSymbol: 200,
    maxLatencySamples: 1000,
    source: 'binance',
});
// ─────────────────────────────────────────────────────────────
// REST router
// ─────────────────────────────────────────────────────────────
exports.marketRouter = (0, express_1.Router)();
let publicMarketFeedStatus = null;
function setPublicMarketFeedStatusProvider(provider) {
    publicMarketFeedStatus = provider;
}
/**
 * GET /api/market/snapshot/:symbol
 * Returns a full MarketSnapshot — used by clients on initial load or reconnect.
 */
exports.marketRouter.get('/snapshot/:symbol', (req, res) => {
    const symbol = (String(req.params.symbol ?? '')).toUpperCase();
    if (!symbol || !/^[A-Z0-9]{2,20}$/.test(symbol)) {
        res.status(400).json({ error: 'invalid_symbol', message: 'Symbol must be 2–20 uppercase alphanumeric characters' });
        return;
    }
    const snap = exports.marketReadModelStore.getMarketSnapshot(symbol);
    res.json({ symbol, snapshot: snap, serverTime: new Date().toISOString() });
});
/**
 * GET /api/market/channels/:symbol
 * Returns per-channel status and latency stats for a symbol.
 */
exports.marketRouter.get('/channels/:symbol', (req, res) => {
    const symbol = (String(req.params.symbol ?? '')).toUpperCase();
    if (!symbol || !/^[A-Z0-9]{2,20}$/.test(symbol)) {
        res.status(400).json({ error: 'invalid_symbol' });
        return;
    }
    const channels = ['trades', 'candles', 'ticker', 'depth'].map((ch) => exports.marketReadModelStore.getChannelStatus(symbol, ch));
    res.json({ symbol, channels, serverTime: new Date().toISOString() });
});
/**
 * GET /api/market/status
 * Returns all active cursors across all symbols/channels.
 */
exports.marketRouter.get('/status', (_req, res) => {
    const cursors = exports.marketDataService.getAllCursors();
    res.json({
        cursors,
        feed: publicMarketFeedStatus?.() ?? null,
        serverTime: new Date().toISOString(),
    });
});
// ─────────────────────────────────────────────────────────────
// WebSocket server attachment
// ─────────────────────────────────────────────────────────────
const WS_PATH = '/api/market/stream';
const VALID_CHANNELS = new Set(['trades', 'candles', 'ticker', 'depth']);
const HEARTBEAT_INTERVAL_MS = 20_000;
function send(ws, frame) {
    if (ws.readyState === ws_1.WebSocket.OPEN) {
        ws.send(JSON.stringify(frame));
    }
}
/**
 * Attach the market-data WebSocket server to an existing HTTP server.
 * Call this once after `app.listen()` or `createServer(app)`.
 *
 * Returns the WSS instance so the caller can close it gracefully.
 */
function attachMarketWss(httpServer) {
    const wss = new ws_1.WebSocketServer({ server: httpServer, path: WS_PATH });
    wss.on('connection', (ws, req) => {
        // ── Parse query params ───────────────────────────────────
        const rawUrl = req.url ?? '';
        let symbol = '';
        let requestedChannels = new Set(['trades', 'candles', 'ticker', 'depth']);
        try {
            const url = new url_1.URL(rawUrl, 'ws://localhost');
            symbol = (url.searchParams.get('symbol') ?? '').toUpperCase();
            const chParam = url.searchParams.get('channels');
            if (chParam) {
                const parsed = chParam.split(',').map((s) => s.trim().toLowerCase()).filter((s) => VALID_CHANNELS.has(s));
                if (parsed.length > 0)
                    requestedChannels = new Set(parsed);
            }
        }
        catch {
            send(ws, { type: 'error', code: 'bad_request', message: 'Invalid WS URL' });
            ws.close(1008, 'bad_request');
            return;
        }
        if (!symbol || !/^[A-Z0-9]{2,20}$/.test(symbol)) {
            send(ws, { type: 'error', code: 'invalid_symbol', message: 'symbol query param required (2–20 alphanumeric)' });
            ws.close(1008, 'invalid_symbol');
            return;
        }
        // ── Send initial snapshot ────────────────────────────────
        const snapshot = exports.marketReadModelStore.getMarketSnapshot(symbol);
        send(ws, { type: 'snapshot', payload: snapshot });
        // ── Subscribe to market events ───────────────────────────
        const tradeHandler = (event) => {
            if (event.symbol === symbol && requestedChannels.has('trades')) {
                const model = exports.marketReadModelStore.getRecentTrades(symbol, 1)[0];
                if (model)
                    send(ws, { type: 'trade', payload: model });
            }
        };
        const candleHandler = (event) => {
            if (event.symbol === symbol && requestedChannels.has('candles')) {
                const model = exports.marketReadModelStore.getCandle(symbol, event.interval);
                if (model)
                    send(ws, { type: 'candle', payload: model });
            }
        };
        const tickerHandler = (event) => {
            if (event.symbol === symbol && requestedChannels.has('ticker')) {
                const model = exports.marketReadModelStore.getTicker(symbol);
                if (model)
                    send(ws, { type: 'ticker', payload: model });
            }
        };
        exports.marketDataService.on('trade', tradeHandler);
        exports.marketDataService.on('candle', candleHandler);
        exports.marketDataService.on('ticker', tickerHandler);
        // ── Heartbeat to detect stale connections ────────────────
        let alive = true;
        ws.on('pong', () => { alive = true; });
        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.type === 'ping')
                    send(ws, { type: 'pong' });
            }
            catch { /* ignore malformed frames */ }
        });
        const heartbeatTimer = setInterval(() => {
            if (!alive) {
                ws.terminate();
                return;
            }
            alive = false;
            ws.ping();
        }, HEARTBEAT_INTERVAL_MS);
        if (typeof heartbeatTimer.unref === 'function') {
            heartbeatTimer.unref();
        }
        // ── Cleanup on close ─────────────────────────────────────
        ws.on('close', () => {
            clearInterval(heartbeatTimer);
            exports.marketDataService.off('trade', tradeHandler);
            exports.marketDataService.off('candle', candleHandler);
            exports.marketDataService.off('ticker', tickerHandler);
        });
        ws.on('error', (err) => {
            console.error('[MarketWS] socket error:', err.message);
        });
    });
    wss.on('error', (err) => {
        console.error('[MarketWS] server error:', err.message);
    });
    return wss;
}
//# sourceMappingURL=market.js.map