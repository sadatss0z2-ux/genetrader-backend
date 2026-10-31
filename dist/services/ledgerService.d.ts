/**
 * Ledger Service (P5-02)
 * Fill/cancel/fee ledger for trading records.
 */
import { EventEmitter } from 'events';
import { FillLedgerEntry, CancelLedgerEntry, FeeLedgerEntry } from '../models/ledger';
import { OrderFill } from '../models/order';
export declare class LedgerService extends EventEmitter {
    private fillLedger;
    private cancelLedger;
    private feeLedger;
    /**
     * Record a fill from exchange
     */
    recordFill(fill: OrderFill, userId: number, orderId: string): FillLedgerEntry;
    /**
     * Record a cancellation
     */
    recordCancellation(userId: number, orderId: string, exchangeOrderId: string | null, symbol: string, reason: string): CancelLedgerEntry;
    /**
     * Record a fee
     */
    recordFee(userId: number, orderId: string, exchangeOrderId: string, symbol: string, feeAsset: string, feeAmount: string, tradeTime: number): FeeLedgerEntry;
    /**
     * Get fills by user
     */
    getFillsByUser(userId: number): FillLedgerEntry[];
    /**
     * Get fills by order
     */
    getFillsByOrder(orderId: string): FillLedgerEntry[];
    /**
     * Get cancellations by user
     */
    getCancellationsByUser(userId: number): CancelLedgerEntry[];
    /**
     * Get fees by user
     */
    getFeesByUser(userId: number): FeeLedgerEntry[];
    /**
     * Reset all in-memory state (useful for test isolation)
     */
    reset(): void;
}
//# sourceMappingURL=ledgerService.d.ts.map