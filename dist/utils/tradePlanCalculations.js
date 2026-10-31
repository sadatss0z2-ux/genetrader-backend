"use strict";
/**
 * Financial Calculation Engine for Visual Trade Planning & Trailing Stops
 *
 * Implements deterministic P&L, fee modeling, risk/reward, tick/lot precision rounding,
 * and exchange filter compliance for Binance Spot.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.roundToStep = roundToStep;
exports.roundToTick = roundToTick;
exports.calculateTradeMetrics = calculateTradeMetrics;
exports.calculateTrailingStopTrigger = calculateTrailingStopTrigger;
/**
 * Floor/round to given decimal step size without floating point drift
 */
function roundToStep(value, step) {
    if (!step || step <= 0)
        return value;
    const inv = 1.0 / step;
    return Math.floor(value * inv + 1e-10) / inv;
}
/**
 * Round price to tick size
 */
function roundToTick(price, tickSize) {
    if (!tickSize || tickSize <= 0)
        return price;
    const precision = Math.max(0, Math.ceil(-Math.log10(tickSize)));
    const rounded = Math.round(price / tickSize) * tickSize;
    return Number(rounded.toFixed(precision));
}
/**
 * Calculate complete trade metrics and validation
 */
function calculateTradeMetrics(input) {
    const { side, entryPrice, takeProfitPrice, stopLossPrice, quantity, availableBalance = 0, feeRate = 0.001, // 0.10% standard maker/taker spot fee
    minNotional = 5.0, // Binance Spot min notional
    minQty = 0.00001, } = input;
    const errors = [];
    if (entryPrice <= 0)
        errors.push('Entry price must be greater than zero.');
    if (takeProfitPrice <= 0)
        errors.push('Take profit price must be greater than zero.');
    if (stopLossPrice <= 0)
        errors.push('Stop loss price must be greater than zero.');
    if (quantity <= 0)
        errors.push('Quantity must be greater than zero.');
    // Validate price geometry based on direction
    if (side === 'BUY') {
        if (takeProfitPrice <= entryPrice) {
            errors.push('Take profit must be higher than entry price for a Buy order.');
        }
        if (stopLossPrice >= entryPrice) {
            errors.push('Stop loss must be lower than entry price for a Buy order.');
        }
    }
    else {
        // Spot Sell (exiting holding)
        if (takeProfitPrice >= entryPrice) {
            errors.push('Target exit must be lower than reference price for short/exit.');
        }
        if (stopLossPrice <= entryPrice) {
            errors.push('Protective stop must be higher than reference price for short/exit.');
        }
    }
    const orderValue = entryPrice * quantity;
    // Filter checks
    if (orderValue < minNotional) {
        errors.push(`Order value ($${orderValue.toFixed(2)}) is below minimum notional ($${minNotional.toFixed(2)}).`);
    }
    if (quantity < minQty) {
        errors.push(`Quantity (${quantity}) is below minimum quantity (${minQty}).`);
    }
    // Fees
    const estimatedEntryFee = orderValue * feeRate;
    const estimatedTakeProfitFee = (quantity * takeProfitPrice) * feeRate;
    const estimatedStopLossFee = (quantity * stopLossPrice) * feeRate;
    const totalEstimatedFees = estimatedEntryFee + Math.max(estimatedTakeProfitFee, estimatedStopLossFee);
    const requiredBalance = side === 'BUY' ? orderValue + estimatedEntryFee : quantity;
    if (availableBalance > 0 && requiredBalance > availableBalance) {
        errors.push(`Required balance (${requiredBalance.toFixed(4)}) exceeds available balance (${availableBalance.toFixed(4)}).`);
    }
    // Gross & Net P&L
    let grossProfit = 0;
    let grossLoss = 0;
    let netProfit = 0;
    let netLoss = 0;
    if (side === 'BUY') {
        grossProfit = quantity * (takeProfitPrice - entryPrice);
        grossLoss = -Math.abs(quantity * (entryPrice - stopLossPrice));
        netProfit = grossProfit - estimatedEntryFee - estimatedTakeProfitFee;
        netLoss = grossLoss - estimatedEntryFee - estimatedStopLossFee;
    }
    else {
        grossProfit = quantity * (entryPrice - takeProfitPrice);
        grossLoss = -Math.abs(quantity * (stopLossPrice - entryPrice));
        netProfit = grossProfit - estimatedEntryFee - estimatedTakeProfitFee;
        netLoss = grossLoss - estimatedEntryFee - estimatedStopLossFee;
    }
    // Risk / Reward Ratio
    const riskAmount = Math.abs(entryPrice - stopLossPrice);
    const rewardAmount = Math.abs(takeProfitPrice - entryPrice);
    const riskRewardRatio = riskAmount > 0 ? Number((rewardAmount / riskAmount).toFixed(2)) : 0;
    // Percentage distances
    const stopLossPercent = entryPrice > 0 ? Math.abs((entryPrice - stopLossPrice) / entryPrice) * 100 : 0;
    const takeProfitPercent = entryPrice > 0 ? Math.abs((takeProfitPrice - entryPrice) / entryPrice) * 100 : 0;
    const positionSizePercent = availableBalance > 0
        ? Math.min(100, Number(((orderValue / availableBalance) * 100).toFixed(1)))
        : 0;
    return {
        orderValue: Number(orderValue.toFixed(4)),
        requiredBalance: Number(requiredBalance.toFixed(4)),
        estimatedEntryFee: Number(estimatedEntryFee.toFixed(4)),
        estimatedTakeProfitFee: Number(estimatedTakeProfitFee.toFixed(4)),
        estimatedStopLossFee: Number(estimatedStopLossFee.toFixed(4)),
        totalEstimatedFees: Number(totalEstimatedFees.toFixed(4)),
        grossProfit: Number(grossProfit.toFixed(4)),
        grossLoss: Number(grossLoss.toFixed(4)),
        netProfit: Number(netProfit.toFixed(4)),
        netLoss: Number(netLoss.toFixed(4)),
        riskRewardRatio,
        stopLossPercent: Number(stopLossPercent.toFixed(2)),
        takeProfitPercent: Number(takeProfitPercent.toFixed(2)),
        positionSizePercent,
        isValid: errors.length === 0,
        validationErrors: errors,
    };
}
/**
 * Trailing Stop Trigger Calculation
 * Pure function: Given current favorable extreme, trailing percentage or distance,
 * returns the non-decreasing (monotonic) stop trigger for Long Spot.
 */
function calculateTrailingStopTrigger(side, favorableExtreme, trailingPercentage, // e.g. 0.015 for 1.5%
trailingDistance, previousTrigger) {
    let candidateTrigger = 0;
    if (side === 'BUY') {
        // For long Spot: as price rises, stop price rises below it
        if (trailingDistance && trailingDistance > 0) {
            candidateTrigger = favorableExtreme - trailingDistance;
        }
        else {
            candidateTrigger = favorableExtreme * (1.0 - trailingPercentage);
        }
        // Monotonicity rule: for a long position, stop price MUST NEVER fall
        if (previousTrigger !== undefined && Number.isFinite(previousTrigger)) {
            return Math.max(previousTrigger, candidateTrigger);
        }
        return candidateTrigger;
    }
    else {
        // For short / exit position: as price falls, stop price falls above it
        if (trailingDistance && trailingDistance > 0) {
            candidateTrigger = favorableExtreme + trailingDistance;
        }
        else {
            candidateTrigger = favorableExtreme * (1.0 + trailingPercentage);
        }
        // Monotonicity rule: for a short position, stop price MUST NEVER rise
        if (previousTrigger !== undefined && Number.isFinite(previousTrigger)) {
            return Math.min(previousTrigger, candidateTrigger);
        }
        return candidateTrigger;
    }
}
//# sourceMappingURL=tradePlanCalculations.js.map