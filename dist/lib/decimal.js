"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinancialDecimal = void 0;
exports.financial = financial;
exports.calculatePercentageReturn = calculatePercentageReturn;
exports.calculateProfitLoss = calculateProfitLoss;
const decimal_js_1 = __importDefault(require("decimal.js"));
// Configure Decimal for financial precision
decimal_js_1.default.set({
    precision: 28, // 28 significant digits (sufficient for financial calculations)
    rounding: decimal_js_1.default.ROUND_HALF_EVEN, // Banker's rounding (round to nearest even)
    toExpNeg: -28, // Exponential notation below 1e-28
    toExpPos: 28, // Exponential notation above 1e28
    maxE: 9e15, // Maximum exponent
    minE: -9e15, // Minimum exponent
    modulo: 1, // Use Euclidean division
});
/**
 * Domain decimal wrapper for financial precision arithmetic.
 * Avoids floating-point errors in monetary calculations.
 */
class FinancialDecimal {
    value;
    constructor(value) {
        this.value = new decimal_js_1.default(value);
    }
    static fromString(value) {
        return new FinancialDecimal(value);
    }
    static fromNumber(value) {
        return new FinancialDecimal(value);
    }
    static fromDecimal(value) {
        return new FinancialDecimal(value);
    }
    static zero() {
        return new FinancialDecimal(0);
    }
    add(other) {
        const otherValue = other instanceof FinancialDecimal ? other.value : new decimal_js_1.default(other);
        return new FinancialDecimal(this.value.add(otherValue));
    }
    subtract(other) {
        const otherValue = other instanceof FinancialDecimal ? other.value : new decimal_js_1.default(other);
        return new FinancialDecimal(this.value.sub(otherValue));
    }
    multiply(other) {
        const otherValue = other instanceof FinancialDecimal ? other.value : new decimal_js_1.default(other);
        return new FinancialDecimal(this.value.mul(otherValue));
    }
    divide(other) {
        const otherValue = other instanceof FinancialDecimal ? other.value : new decimal_js_1.default(other);
        if (otherValue.isZero()) {
            throw new Error('Division by zero in FinancialDecimal');
        }
        return new FinancialDecimal(this.value.div(otherValue));
    }
    round(places = 2) {
        return new FinancialDecimal(this.value.toDecimalPlaces(places, decimal_js_1.default.ROUND_HALF_EVEN));
    }
    toNumber() {
        return this.value.toNumber();
    }
    toString() {
        return this.value.toString();
    }
    toFixed(places = 2) {
        return this.value.toFixed(places);
    }
    equals(other) {
        const otherValue = other instanceof FinancialDecimal ? other.value : new decimal_js_1.default(other);
        return this.value.equals(otherValue);
    }
    greaterThan(other) {
        const otherValue = other instanceof FinancialDecimal ? other.value : new decimal_js_1.default(other);
        return this.value.greaterThan(otherValue);
    }
    greaterThanOrEqual(other) {
        const otherValue = other instanceof FinancialDecimal ? other.value : new decimal_js_1.default(other);
        return this.value.greaterThanOrEqualTo(otherValue);
    }
    lessThan(other) {
        const otherValue = other instanceof FinancialDecimal ? other.value : new decimal_js_1.default(other);
        return this.value.lessThan(otherValue);
    }
    lessThanOrEqual(other) {
        const otherValue = other instanceof FinancialDecimal ? other.value : new decimal_js_1.default(other);
        return this.value.lessThanOrEqualTo(otherValue);
    }
    isZero() {
        return this.value.isZero();
    }
    isNegative() {
        return this.value.lessThan(0);
    }
    isPositive() {
        return this.value.greaterThan(0);
    }
    abs() {
        return new FinancialDecimal(this.value.abs());
    }
    neg() {
        return new FinancialDecimal(this.value.neg());
    }
    /**
     * Calculate percentage (value * percentage / 100)
     */
    percentage(percentage) {
        const percentageValue = percentage instanceof FinancialDecimal ? percentage.value : new decimal_js_1.default(percentage);
        return new FinancialDecimal(this.value.mul(percentageValue).div(100));
    }
    /**
     * Calculate price * quantity for trade calculations
     */
    times(quantity) {
        return this.multiply(quantity);
    }
    /**
     * Calculate value / quantity for average price calculations
     */
    dividedBy(quantity) {
        return this.divide(quantity);
    }
    /**
     * Format as currency string (e.g., "$1,234.56")
     */
    toCurrency(symbol = '$', decimals = 2) {
        const formatted = this.value.toFixed(decimals);
        return `${symbol}${formatted}`;
    }
    /**
     * Get raw Decimal instance for advanced operations
     */
    getRaw() {
        return this.value;
    }
}
exports.FinancialDecimal = FinancialDecimal;
/**
 * Convenience function to create a FinancialDecimal from a string
 */
function financial(value) {
    return FinancialDecimal.fromString(value.toString());
}
/**
 * Calculate percentage return ((current - previous) / previous * 100)
 */
function calculatePercentageReturn(current, previous) {
    const currentValue = current instanceof FinancialDecimal ? current : financial(current);
    const previousValue = previous instanceof FinancialDecimal ? previous : financial(previous);
    if (previousValue.isZero()) {
        return FinancialDecimal.zero();
    }
    return currentValue
        .subtract(previousValue)
        .divide(previousValue)
        .multiply(100);
}
/**
 * Calculate profit/loss (exitPrice - entryPrice) * quantity
 */
function calculateProfitLoss(entryPrice, exitPrice, quantity) {
    const entry = entryPrice instanceof FinancialDecimal ? entryPrice : financial(entryPrice);
    const exit = exitPrice instanceof FinancialDecimal ? exitPrice : financial(exitPrice);
    const qty = quantity instanceof FinancialDecimal ? quantity : financial(quantity);
    return exit.subtract(entry).multiply(qty);
}
//# sourceMappingURL=decimal.js.map