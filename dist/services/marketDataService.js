"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketDataService = void 0;
const events_1 = require("events");
const decimal_1 = require("../lib/decimal");
class MarketDataService extends events_1.EventEmitter {
    staleThresholdMs;
    maxBufferPerChannel;
    backfillAdapter;
    // State
    cursors = new Map();
    buffers = new Map();
    processedIds = new Map();
    gapEvents = new Map();
    channelSequences = new Map();
    constructor(options = {}) {
        super();
        this.staleThresholdMs = options.staleThresholdMs ?? 5000;
        this.maxBufferPerChannel = options.maxBufferPerChannel ?? 1000;
        this.backfillAdapter = options.backfillAdapter;
    }
    getChannelKey(symbol, channel) {
        return `${symbol.toUpperCase()}:${channel}`;
    }
    getOrCreateCursor(symbol, channel) {
        const key = this.getChannelKey(symbol, channel);
        let cursor = this.cursors.get(key);
        if (!cursor) {
            cursor = {
                symbol: symbol.toUpperCase(),
                channel,
                lastSequence: 0,
                lastSourceTime: 0,
                lastReceivedTime: 0,
                totalEvents: 0,
                duplicateCount: 0,
                gapCount: 0,
            };
            this.cursors.set(key, cursor);
        }
        return cursor;
    }
    getBuffer(key) {
        let buf = this.buffers.get(key);
        if (!buf) {
            buf = [];
            this.buffers.set(key, buf);
        }
        return buf;
    }
    getProcessedSet(key) {
        let s = this.processedIds.get(key);
        if (!s) {
            s = new Set();
            this.processedIds.set(key, s);
        }
        return s;
    }
    appendToBuffer(key, event) {
        const buf = this.getBuffer(key);
        buf.push(event);
        if (buf.length > this.maxBufferPerChannel) {
            buf.shift();
        }
    }
    /**
     * Ingest a public trade event
     */
    ingestTrade(raw, receivedTime = Date.now()) {
        const symbol = raw.symbol.toUpperCase();
        const channelKey = this.getChannelKey(symbol, 'trades');
        const cursor = this.getOrCreateCursor(symbol, 'trades');
        const processedSet = this.getProcessedSet(channelKey);
        const tradeIdStr = raw.tradeId.toString();
        const isDuplicate = processedSet.has(tradeIdStr);
        const priceDec = (0, decimal_1.financial)(raw.price);
        const qtyDec = (0, decimal_1.financial)(raw.quantity);
        if (priceDec.isNegative() || priceDec.isZero()) {
            throw new Error(`Invalid trade price: ${raw.price}`);
        }
        if (qtyDec.isNegative() || qtyDec.isZero()) {
            throw new Error(`Invalid trade quantity: ${raw.quantity}`);
        }
        const currentSeq = (this.channelSequences.get(channelKey) ?? 0) + 1;
        this.channelSequences.set(channelKey, currentSeq);
        const stale = receivedTime - raw.sourceTime > this.staleThresholdMs;
        const event = {
            id: `${symbol}-trade-${tradeIdStr}`,
            symbol,
            channel: 'trades',
            tradeId: tradeIdStr,
            price: priceDec.toString(),
            quantity: qtyDec.toString(),
            isBuyerMaker: Boolean(raw.isBuyerMaker),
            sourceTime: raw.sourceTime,
            receivedTime,
            sequence: currentSeq,
            stale,
        };
        if (isDuplicate) {
            cursor.duplicateCount++;
            return { event, isDuplicate: true };
        }
        processedSet.add(tradeIdStr);
        cursor.totalEvents++;
        cursor.lastSequence = currentSeq;
        cursor.lastSourceTime = Math.max(cursor.lastSourceTime, raw.sourceTime);
        cursor.lastReceivedTime = receivedTime;
        let gapDetected;
        if (raw.exchangeSequence !== undefined) {
            if (cursor.lastExchangeSequence !== undefined &&
                raw.exchangeSequence > cursor.lastExchangeSequence + 1) {
                cursor.gapCount++;
                gapDetected = {
                    id: `gap-${symbol}-trades-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                    symbol,
                    channel: 'trades',
                    expectedSequence: cursor.lastExchangeSequence,
                    receivedSequence: raw.exchangeSequence,
                    gapSize: raw.exchangeSequence - cursor.lastExchangeSequence,
                    detectedAt: receivedTime,
                    backfillStatus: 'pending',
                };
                this.gapEvents.set(gapDetected.id, gapDetected);
                this.emit('gap', gapDetected);
            }
            cursor.lastExchangeSequence = raw.exchangeSequence;
        }
        this.appendToBuffer(channelKey, event);
        this.emit('trade', event);
        this.emit('event', event);
        return { event, isDuplicate: false, gapDetected };
    }
    /**
     * Ingest a public candlestick/kline event
     */
    ingestCandle(raw, receivedTime = Date.now()) {
        const symbol = raw.symbol.toUpperCase();
        const channelKey = this.getChannelKey(symbol, 'candles');
        const cursor = this.getOrCreateCursor(symbol, 'candles');
        const processedSet = this.getProcessedSet(channelKey);
        const candleId = `${raw.interval}-${raw.openTime}`;
        // A candle is a final duplicate if it was already ingested as final
        const isDuplicate = processedSet.has(candleId) && Boolean(raw.isFinal);
        const openDec = (0, decimal_1.financial)(raw.open);
        const highDec = (0, decimal_1.financial)(raw.high);
        const lowDec = (0, decimal_1.financial)(raw.low);
        const closeDec = (0, decimal_1.financial)(raw.close);
        const volDec = (0, decimal_1.financial)(raw.volume);
        const quoteVolDec = raw.quoteVolume !== undefined ? (0, decimal_1.financial)(raw.quoteVolume) : volDec.multiply(closeDec);
        const sourceTime = raw.sourceTime ?? raw.closeTime;
        const stale = receivedTime - sourceTime > this.staleThresholdMs;
        const currentSeq = (this.channelSequences.get(channelKey) ?? 0) + 1;
        this.channelSequences.set(channelKey, currentSeq);
        const event = {
            id: `${symbol}-candle-${candleId}`,
            symbol,
            channel: 'candles',
            interval: raw.interval,
            openTime: raw.openTime,
            closeTime: raw.closeTime,
            open: openDec.toString(),
            high: highDec.toString(),
            low: lowDec.toString(),
            close: closeDec.toString(),
            volume: volDec.toString(),
            quoteVolume: quoteVolDec.toString(),
            tradesCount: raw.tradesCount ?? 0,
            isFinal: Boolean(raw.isFinal),
            sourceTime,
            receivedTime,
            sequence: currentSeq,
            stale,
        };
        if (isDuplicate) {
            cursor.duplicateCount++;
            return { event, isDuplicate: true };
        }
        if (raw.isFinal) {
            processedSet.add(candleId);
        }
        cursor.totalEvents++;
        cursor.lastSequence = currentSeq;
        cursor.lastSourceTime = Math.max(cursor.lastSourceTime, sourceTime);
        cursor.lastReceivedTime = receivedTime;
        this.appendToBuffer(channelKey, event);
        this.emit('candle', event);
        this.emit('event', event);
        return { event, isDuplicate: false };
    }
    /**
     * Ingest a public 24hr ticker event
     */
    ingestTicker(raw, receivedTime = Date.now()) {
        const symbol = raw.symbol.toUpperCase();
        const channelKey = this.getChannelKey(symbol, 'ticker');
        const cursor = this.getOrCreateCursor(symbol, 'ticker');
        const bidDec = (0, decimal_1.financial)(raw.bidPrice);
        const askDec = (0, decimal_1.financial)(raw.askPrice);
        const lastDec = (0, decimal_1.financial)(raw.lastPrice);
        const sourceTime = raw.sourceTime ?? receivedTime;
        const stale = receivedTime - sourceTime > this.staleThresholdMs;
        const currentSeq = (this.channelSequences.get(channelKey) ?? 0) + 1;
        this.channelSequences.set(channelKey, currentSeq);
        const event = {
            id: `${symbol}-ticker-${currentSeq}`,
            symbol,
            channel: 'ticker',
            bidPrice: bidDec.toString(),
            askPrice: askDec.toString(),
            lastPrice: lastDec.toString(),
            priceChange24h: raw.priceChange24h !== undefined ? (0, decimal_1.financial)(raw.priceChange24h).toString() : '0',
            priceChangePercent24h: raw.priceChangePercent24h !== undefined ? (0, decimal_1.financial)(raw.priceChangePercent24h).toString() : '0',
            high24h: raw.high24h !== undefined ? (0, decimal_1.financial)(raw.high24h).toString() : lastDec.toString(),
            low24h: raw.low24h !== undefined ? (0, decimal_1.financial)(raw.low24h).toString() : lastDec.toString(),
            volume24h: raw.volume24h !== undefined ? (0, decimal_1.financial)(raw.volume24h).toString() : '0',
            quoteVolume24h: raw.quoteVolume24h !== undefined ? (0, decimal_1.financial)(raw.quoteVolume24h).toString() : '0',
            sourceTime,
            receivedTime,
            sequence: currentSeq,
            stale,
        };
        cursor.totalEvents++;
        cursor.lastSequence = currentSeq;
        cursor.lastSourceTime = Math.max(cursor.lastSourceTime, sourceTime);
        cursor.lastReceivedTime = receivedTime;
        this.appendToBuffer(channelKey, event);
        this.emit('ticker', event);
        this.emit('event', event);
        return { event, isDuplicate: false };
    }
    /**
     * Check if a specific symbol channel is fresh
     */
    isChannelFresh(symbol, channel, now = Date.now()) {
        const cursor = this.cursors.get(this.getChannelKey(symbol, channel));
        if (!cursor || cursor.lastReceivedTime === 0) {
            return false;
        }
        return now - cursor.lastReceivedTime <= this.staleThresholdMs;
    }
    /**
     * Get cursor status for a symbol & channel
     */
    getCursor(symbol, channel) {
        return this.cursors.get(this.getChannelKey(symbol, channel));
    }
    /**
     * Get all registered cursors
     */
    getAllCursors() {
        return Array.from(this.cursors.values());
    }
    /**
     * Get recorded gap events
     */
    getGapEvents(symbol) {
        const all = Array.from(this.gapEvents.values());
        if (!symbol)
            return all;
        return all.filter((g) => g.symbol === symbol.toUpperCase());
    }
    /**
     * Get latest event from ring buffer
     */
    getLatestEvent(symbol, channel) {
        const buf = this.buffers.get(this.getChannelKey(symbol, channel));
        if (!buf || buf.length === 0)
            return undefined;
        return buf[buf.length - 1];
    }
    /**
     * Get recent events from ring buffer up to limit
     */
    getRecentEvents(symbol, channel, limit = 50) {
        const buf = this.buffers.get(this.getChannelKey(symbol, channel));
        if (!buf)
            return [];
        return buf.slice(-limit);
    }
    /**
     * Resolve a gap via the backfill adapter
     */
    async resolveGap(gapId) {
        const gap = this.gapEvents.get(gapId);
        if (!gap)
            return false;
        if (!this.backfillAdapter) {
            gap.backfillStatus = 'failed';
            gap.error = 'No backfill adapter configured';
            return false;
        }
        gap.backfillStatus = 'in_progress';
        try {
            if (gap.channel === 'trades' && this.backfillAdapter.fetchMissingTrades) {
                const missingTrades = await this.backfillAdapter.fetchMissingTrades(gap.symbol, gap.expectedSequence, gap.receivedSequence);
                for (const rawTrade of missingTrades) {
                    this.ingestTrade(rawTrade);
                }
                gap.backfillStatus = 'resolved';
                gap.resolvedAt = Date.now();
                this.emit('gapResolved', gap);
                return true;
            }
            gap.backfillStatus = 'failed';
            gap.error = `Unsupported backfill channel: ${gap.channel}`;
            return false;
        }
        catch (err) {
            gap.backfillStatus = 'failed';
            gap.error = err.message || 'Backfill exception';
            return false;
        }
    }
    /**
     * Replay a recorded sequence of events and output a summary report
     */
    async replayTrades(trades, options = {}) {
        const startTime = Date.now();
        let accepted = 0;
        let duplicates = 0;
        let gapsDetected = 0;
        let gapsResolved = 0;
        for (const trade of trades) {
            const res = this.ingestTrade(trade);
            if (res.isDuplicate) {
                duplicates++;
            }
            else {
                accepted++;
            }
            if (res.gapDetected) {
                gapsDetected++;
                if (options.autoResolveGaps) {
                    const ok = await this.resolveGap(res.gapDetected.id);
                    if (ok)
                        gapsResolved++;
                }
            }
        }
        return {
            totalProcessed: trades.length,
            acceptedCount: accepted,
            duplicateCount: duplicates,
            gapsDetectedCount: gapsDetected,
            gapsResolvedCount: gapsResolved,
            startTime,
            endTime: Date.now(),
        };
    }
    /**
     * Reset all in-memory buffers and state (useful for test isolation)
     */
    reset() {
        this.cursors.clear();
        this.buffers.clear();
        this.processedIds.clear();
        this.gapEvents.clear();
        this.channelSequences.clear();
    }
}
exports.MarketDataService = MarketDataService;
//# sourceMappingURL=marketDataService.js.map