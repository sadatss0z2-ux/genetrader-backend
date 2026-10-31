/**
 * Trade Plan Infrastructure Models
 * Explicit state machine and lifecycle for Chart Trade and Trailing Stop After Entry.
 * Supports both manual user execution and automated strategy execution.
 */
export type TradePlanType = 'CHART_TRADE' | 'TRAILING_STOP';
export type TradePlanSide = 'BUY' | 'SELL';
export type TradePlanEntryType = 'LIMIT' | 'MARKET';
export type TradePlanState = 'DRAFT' | 'VALIDATED' | 'ENTRY_PENDING' | 'PARTIALLY_FILLED' | 'POSITION_PROTECTED' | 'TRAILING_ACTIVE' | 'EXIT_PENDING' | 'CLOSED' | 'CANCELLED' | 'REJECTED' | 'DEGRADED_PROTECTION';
export type ProtectiveStopState = 'INACTIVE' | 'INITIAL_STOP' | 'TRAILING_ACTIVE' | 'TRIGGERED' | 'CANCELLED';
export interface TrailingStopConfig {
    trailingPercentage: number;
    trailingDistance?: number;
    activationPrice?: number;
    favorableExtreme?: number;
    currentTriggerPrice?: number;
    state: ProtectiveStopState;
    updatedAt?: number;
}
export interface TakeProfitConfig {
    price: number;
    orderId?: string | number | null;
    status: 'PENDING' | 'PLACED' | 'FILLED' | 'CANCELLED';
}
export interface StopLossConfig {
    price: number;
    orderId?: string | number | null;
    status: 'PENDING' | 'PLACED' | 'TRIGGERED' | 'CANCELLED';
}
export interface TradePlanCommand {
    idempotencyKey: string;
    userId: number;
    symbol: string;
    planType: TradePlanType;
    side: TradePlanSide;
    entryType: TradePlanEntryType;
    entryPrice: number;
    quantity: number;
    takeProfitPrice: number;
    stopLossPrice: number;
    trailingPercentage?: number;
    trailingDistance?: number;
    activationPrice?: number;
    origin?: 'MANUAL' | 'STRATEGY';
    strategyId?: string | null;
    correlationId?: string;
    clientOrderId?: string;
    createdAt?: number;
}
export interface TradePlan {
    id: string;
    userId: number;
    symbol: string;
    planType: TradePlanType;
    side: TradePlanSide;
    entryType: TradePlanEntryType;
    entryPrice: number;
    quantity: number;
    filledQuantity: number;
    averageEntryPrice: number | null;
    takeProfit: TakeProfitConfig;
    stopLoss: StopLossConfig;
    trailingStop?: TrailingStopConfig;
    state: TradePlanState;
    stateMessage?: string | null;
    origin: 'MANUAL' | 'STRATEGY';
    strategyId?: string | null;
    correlationId: string;
    idempotencyKey: string;
    entryOrderId?: string | number | null;
    entryClientOrderId?: string;
    exitOrderId?: string | number | null;
    exitClientOrderId?: string;
    realizedExitPrice?: number | null;
    realizedPnl?: number | null;
    commissionPaid?: number | null;
    createdAt: number;
    updatedAt: number;
    closedAt?: number | null;
}
export interface TradePlanValidationResult {
    isValid: boolean;
    errors: string[];
    metrics?: {
        orderValue: number;
        requiredBalance: number;
        estimatedFees: number;
        grossProfit: number;
        grossLoss: number;
        netProfit: number;
        netLoss: number;
        riskRewardRatio: number;
        stopLossPercent: number;
        takeProfitPercent: number;
        positionSizePercent: number;
    };
}
//# sourceMappingURL=tradePlan.d.ts.map