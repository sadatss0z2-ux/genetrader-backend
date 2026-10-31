/**
 * Position Models (P5-02)
 * Position lots and position summaries.
 */
/**
 * Position lot - FIFO position lot
 */
export interface PositionLot {
    id: string;
    userId: number;
    symbol: string;
    side: 'LONG' | 'SHORT';
    entryPrice: string;
    entryQuantity: string;
    entryTime: number;
    exitPrice: string | null;
    exitQuantity: string | null;
    exitTime: number | null;
    realizedPnL: string | null;
    status: 'OPEN' | 'CLOSED';
    createdAt: number;
    updatedAt: number;
}
/**
 * Position summary - aggregated position per symbol
 */
export interface PositionSummary {
    userId: number;
    symbol: string;
    side: 'LONG' | 'SHORT';
    totalQuantity: string;
    averageEntryPrice: string;
    unrealizedPnL: string | null;
    realizedPnL: string;
    openLots: number;
    closedLots: number;
    lastUpdate: number;
}
//# sourceMappingURL=position.d.ts.map