/**
 * Position Service (P5-02)
 * Position lots and position summaries with FIFO accounting.
 */
import { EventEmitter } from 'events';
import { PositionLot, PositionSummary } from '../models/position';
export declare class PositionService extends EventEmitter {
    private positionLots;
    private positionSummaries;
    /**
     * Open a position lot on fill
     */
    openPositionLot(userId: number, symbol: string, side: 'BUY' | 'SELL', entryPrice: string, entryQuantity: string, orderId: string): PositionLot;
    /**
     * Close a position lot on fill
     */
    closePositionLot(lotId: string, exitPrice: string, exitQuantity: string): PositionLot;
    /**
     * Calculate realized PnL for a position lot
     */
    private calculateRealizedPnL;
    /**
     * Update position summary
     */
    private updatePositionSummary;
    /**
     * Get position lots by user
     */
    getPositionLotsByUser(userId: number): PositionLot[];
    /**
     * Get position lots by symbol
     */
    getPositionLotsBySymbol(symbol: string): PositionLot[];
    /**
     * Get position summary
     */
    getPositionSummary(userId: number, symbol: string): PositionSummary | null;
    /**
     * Get all position summaries for user
     */
    getPositionSummariesByUser(userId: number): PositionSummary[];
    /**
     * Reset all in-memory state (useful for test isolation)
     */
    reset(): void;
}
//# sourceMappingURL=positionService.d.ts.map