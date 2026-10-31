"use strict";
/**
 * Position Service (P5-02)
 * Position lots and position summaries with FIFO accounting.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PositionService = void 0;
const events_1 = require("events");
const crypto_1 = require("crypto");
class PositionService extends events_1.EventEmitter {
    positionLots = new Map();
    positionSummaries = new Map();
    /**
     * Open a position lot on fill
     */
    openPositionLot(userId, symbol, side, entryPrice, entryQuantity, orderId) {
        const lot = {
            id: (0, crypto_1.randomUUID)(),
            userId,
            symbol,
            side: side === 'BUY' ? 'LONG' : 'SHORT',
            entryPrice,
            entryQuantity,
            entryTime: Date.now(),
            exitPrice: null,
            exitQuantity: null,
            exitTime: null,
            realizedPnL: null,
            status: 'OPEN',
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        this.positionLots.set(lot.id, lot);
        this.updatePositionSummary(userId, symbol);
        this.emit('positionLotOpened', lot);
        return lot;
    }
    /**
     * Close a position lot on fill
     */
    closePositionLot(lotId, exitPrice, exitQuantity) {
        const lot = this.positionLots.get(lotId);
        if (!lot) {
            throw new Error(`Position lot not found: ${lotId}`);
        }
        // Calculate realized PnL
        const realizedPnL = this.calculateRealizedPnL(lot, exitPrice, exitQuantity);
        const updatedLot = {
            ...lot,
            exitPrice,
            exitQuantity,
            exitTime: Date.now(),
            realizedPnL,
            status: 'CLOSED',
            updatedAt: Date.now(),
        };
        this.positionLots.set(lotId, updatedLot);
        this.updatePositionSummary(lot.userId, lot.symbol);
        this.emit('positionLotClosed', updatedLot);
        return updatedLot;
    }
    /**
     * Calculate realized PnL for a position lot
     */
    calculateRealizedPnL(lot, exitPrice, exitQuantity) {
        // Placeholder: actual calculation would use decimal.js
        // For LONG: (exitPrice - entryPrice) * exitQuantity
        // For SHORT: (entryPrice - exitPrice) * exitQuantity
        return '0'; // Placeholder
    }
    /**
     * Update position summary
     */
    updatePositionSummary(userId, symbol) {
        const lots = Array.from(this.positionLots.values()).filter((l) => l.userId === userId && l.symbol === symbol);
        const openLots = lots.filter((l) => l.status === 'OPEN');
        const closedLots = lots.filter((l) => l.status === 'CLOSED');
        const totalQuantity = openLots.reduce((sum, lot) => {
            // Placeholder: decimal addition
            return lot.entryQuantity; // Simplified
        }, '0');
        const averageEntryPrice = openLots.length > 0 ? openLots[0].entryPrice : '0';
        const realizedPnL = closedLots.reduce((sum, lot) => {
            // Placeholder: decimal addition
            return lot.realizedPnL || '0'; // Simplified
        }, '0');
        const summary = {
            userId,
            symbol,
            side: openLots.length > 0 ? openLots[0].side : 'LONG',
            totalQuantity,
            averageEntryPrice,
            unrealizedPnL: null, // Would require current market price
            realizedPnL,
            openLots: openLots.length,
            closedLots: closedLots.length,
            lastUpdate: Date.now(),
        };
        this.positionSummaries.set(`${userId}-${symbol}`, summary);
        this.emit('positionSummaryUpdated', summary);
    }
    /**
     * Get position lots by user
     */
    getPositionLotsByUser(userId) {
        return Array.from(this.positionLots.values()).filter((l) => l.userId === userId);
    }
    /**
     * Get position lots by symbol
     */
    getPositionLotsBySymbol(symbol) {
        return Array.from(this.positionLots.values()).filter((l) => l.symbol === symbol);
    }
    /**
     * Get position summary
     */
    getPositionSummary(userId, symbol) {
        return this.positionSummaries.get(`${userId}-${symbol}`) || null;
    }
    /**
     * Get all position summaries for user
     */
    getPositionSummariesByUser(userId) {
        return Array.from(this.positionSummaries.values()).filter((s) => s.userId === userId);
    }
    /**
     * Reset all in-memory state (useful for test isolation)
     */
    reset() {
        this.positionLots.clear();
        this.positionSummaries.clear();
    }
}
exports.PositionService = PositionService;
//# sourceMappingURL=positionService.js.map