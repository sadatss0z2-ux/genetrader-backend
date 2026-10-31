/**
 * Ledger and Reconciliation Models (P5-02)
 * Fill/cancel/fee ledger, balances, and user-data stream.
 */
/**
 * Fill ledger entry - record of a fill from exchange
 */
export interface FillLedgerEntry {
    id: string;
    userId: number;
    orderId: string;
    exchangeOrderId: string;
    fillId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    price: string;
    quantity: string;
    commission: string;
    commissionAsset: string;
    tradeTime: number;
    isMaker: boolean;
    createdAt: number;
}
/**
 * Cancel ledger entry - record of order cancellation
 */
export interface CancelLedgerEntry {
    id: string;
    userId: number;
    orderId: string;
    exchangeOrderId: string | null;
    symbol: string;
    reason: string;
    cancelledAt: number;
    createdAt: number;
}
/**
 * Fee ledger entry - record of trading fees
 */
export interface FeeLedgerEntry {
    id: string;
    userId: number;
    orderId: string;
    exchangeOrderId: string;
    symbol: string;
    feeAsset: string;
    feeAmount: string;
    tradeTime: number;
    createdAt: number;
}
/**
 * Balance entry - wallet balance
 */
export interface BalanceEntry {
    id: string;
    userId: number;
    asset: string;
    free: string;
    locked: string;
    total: string;
    updatedAt: number;
    createdAt: number;
}
/**
 * User data stream event - real-time update from exchange
 */
export interface UserDataStreamEvent {
    id: string;
    eventType: 'ACCOUNT_UPDATE' | 'ORDER_UPDATE' | 'ACCOUNT_POSITION_UPDATE';
    userId: number;
    symbol: string | null;
    payload: Record<string, unknown>;
    receivedAt: number;
    processed: boolean;
    processedAt: number | null;
}
/**
 * Reconciliation snapshot - snapshot of state for reconciliation
 */
export interface ReconciliationSnapshot {
    id: string;
    userId: number;
    snapshotType: 'BALANCE' | 'POSITION' | 'ORDER';
    symbol: string | null;
    source: 'REST' | 'WEBSOCKET' | 'LEDGER';
    data: Record<string, unknown>;
    capturedAt: number;
    createdAt: number;
}
/**
 * Reconciliation result - result of reconciliation check
 */
export interface ReconciliationResult {
    id: string;
    userId: number;
    snapshotId: string;
    match: boolean;
    discrepancies: string[];
    reconciledAt: number;
    createdAt: number;
}
//# sourceMappingURL=ledger.d.ts.map