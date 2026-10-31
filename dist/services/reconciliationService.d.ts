/**
 * Reconciliation Service (P5-02)
 * REST reconciliation for balances, positions, and orders.
 */
import { EventEmitter } from 'events';
import { BalanceEntry, UserDataStreamEvent, ReconciliationSnapshot, ReconciliationResult } from '../models/ledger';
export interface ReconciliationServiceOptions {
    apiKey?: string;
    apiSecret?: string;
    testnet?: boolean;
}
export declare class ReconciliationService extends EventEmitter {
    private balances;
    private userDataStreamEvents;
    private reconciliationSnapshots;
    private reconciliationResults;
    constructor(options?: ReconciliationServiceOptions);
    /**
     * Update balance from user data stream
     */
    updateBalance(userId: number, asset: string, free: string, locked: string): BalanceEntry;
    /**
     * Get balance
     */
    getBalance(userId: number, asset: string): BalanceEntry | null;
    /**
     * Get all balances for user
     */
    getBalancesByUser(userId: number): BalanceEntry[];
    /**
     * Process user data stream event
     */
    processUserDataStreamEvent(event: UserDataStreamEvent): UserDataStreamEvent;
    /**
     * Create reconciliation snapshot
     */
    createReconciliationSnapshot(userId: number, snapshotType: ReconciliationSnapshot['snapshotType'], symbol: string | null, source: ReconciliationSnapshot['source'], data: Record<string, unknown>): ReconciliationSnapshot;
    /**
     * Reconcile against REST API
     * Placeholder: simulates REST reconciliation
     */
    reconcileWithRest(userId: number, snapshotType: ReconciliationSnapshot['snapshotType']): Promise<ReconciliationResult>;
    /**
     * Add decimals (placeholder for decimal.js)
     */
    private addDecimals;
    /**
     * Reset all in-memory state (useful for test isolation)
     */
    reset(): void;
}
//# sourceMappingURL=reconciliationService.d.ts.map