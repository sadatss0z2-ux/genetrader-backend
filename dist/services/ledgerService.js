"use strict";
/**
 * Ledger Service (P5-02)
 * Fill/cancel/fee ledger for trading records.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LedgerService = void 0;
const events_1 = require("events");
const crypto_1 = require("crypto");
class LedgerService extends events_1.EventEmitter {
    fillLedger = new Map();
    cancelLedger = new Map();
    feeLedger = new Map();
    /**
     * Record a fill from exchange
     */
    recordFill(fill, userId, orderId) {
        const entry = {
            id: (0, crypto_1.randomUUID)(),
            userId,
            orderId,
            exchangeOrderId: fill.exchangeOrderId,
            fillId: fill.fillId,
            symbol: 'BTCUSDT', // Would be from order
            side: 'BUY', // Would be from order
            price: fill.price,
            quantity: fill.quantity,
            commission: fill.commission,
            commissionAsset: fill.commissionAsset,
            tradeTime: fill.tradeTime,
            isMaker: fill.isMaker,
            createdAt: Date.now(),
        };
        this.fillLedger.set(entry.id, entry);
        this.emit('fillRecorded', entry);
        return entry;
    }
    /**
     * Record a cancellation
     */
    recordCancellation(userId, orderId, exchangeOrderId, symbol, reason) {
        const entry = {
            id: (0, crypto_1.randomUUID)(),
            userId,
            orderId,
            exchangeOrderId,
            symbol,
            reason,
            cancelledAt: Date.now(),
            createdAt: Date.now(),
        };
        this.cancelLedger.set(entry.id, entry);
        this.emit('cancellationRecorded', entry);
        return entry;
    }
    /**
     * Record a fee
     */
    recordFee(userId, orderId, exchangeOrderId, symbol, feeAsset, feeAmount, tradeTime) {
        const entry = {
            id: (0, crypto_1.randomUUID)(),
            userId,
            orderId,
            exchangeOrderId,
            symbol,
            feeAsset,
            feeAmount,
            tradeTime,
            createdAt: Date.now(),
        };
        this.feeLedger.set(entry.id, entry);
        this.emit('feeRecorded', entry);
        return entry;
    }
    /**
     * Get fills by user
     */
    getFillsByUser(userId) {
        return Array.from(this.fillLedger.values()).filter((f) => f.userId === userId);
    }
    /**
     * Get fills by order
     */
    getFillsByOrder(orderId) {
        return Array.from(this.fillLedger.values()).filter((f) => f.orderId === orderId);
    }
    /**
     * Get cancellations by user
     */
    getCancellationsByUser(userId) {
        return Array.from(this.cancelLedger.values()).filter((c) => c.userId === userId);
    }
    /**
     * Get fees by user
     */
    getFeesByUser(userId) {
        return Array.from(this.feeLedger.values()).filter((f) => f.userId === userId);
    }
    /**
     * Reset all in-memory state (useful for test isolation)
     */
    reset() {
        this.fillLedger.clear();
        this.cancelLedger.clear();
        this.feeLedger.clear();
    }
}
exports.LedgerService = LedgerService;
//# sourceMappingURL=ledgerService.js.map