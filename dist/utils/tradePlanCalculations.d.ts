/**
 * Financial Calculation Engine for Visual Trade Planning & Trailing Stops
 *
 * Implements deterministic P&L, fee modeling, risk/reward, tick/lot precision rounding,
 * and exchange filter compliance for Binance Spot.
 */
export interface CalculationInput {
    side: 'BUY' | 'SELL';
    entryPrice: number;
    takeProfitPrice: number;
    stopLossPrice: number;
    quantity: number;
    availableBalance?: number;
    feeRate?: number;
    tickSize?: number;
    stepSize?: number;
    minNotional?: number;
    minQty?: number;
}
export interface TradeCalculations {
    orderValue: number;
    requiredBalance: number;
    estimatedEntryFee: number;
    estimatedTakeProfitFee: number;
    estimatedStopLossFee: number;
    totalEstimatedFees: number;
    grossProfit: number;
    grossLoss: number;
    netProfit: number;
    netLoss: number;
    riskRewardRatio: number;
    stopLossPercent: number;
    takeProfitPercent: number;
    positionSizePercent: number;
    isValid: boolean;
    validationErrors: string[];
}
/**
 * Floor/round to given decimal step size without floating point drift
 */
export declare function roundToStep(value: number, step: number): number;
/**
 * Round price to tick size
 */
export declare function roundToTick(price: number, tickSize: number): number;
/**
 * Calculate complete trade metrics and validation
 */
export declare function calculateTradeMetrics(input: CalculationInput): TradeCalculations;
/**
 * Trailing Stop Trigger Calculation
 * Pure function: Given current favorable extreme, trailing percentage or distance,
 * returns the non-decreasing (monotonic) stop trigger for Long Spot.
 */
export declare function calculateTrailingStopTrigger(side: 'BUY' | 'SELL', favorableExtreme: number, trailingPercentage: number, // e.g. 0.015 for 1.5%
trailingDistance?: number, previousTrigger?: number): number;
//# sourceMappingURL=tradePlanCalculations.d.ts.map