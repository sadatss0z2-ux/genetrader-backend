import Decimal from 'decimal.js';
/**
 * Domain decimal wrapper for financial precision arithmetic.
 * Avoids floating-point errors in monetary calculations.
 */
export declare class FinancialDecimal {
    private value;
    constructor(value: number | string | Decimal);
    static fromString(value: string): FinancialDecimal;
    static fromNumber(value: number): FinancialDecimal;
    static fromDecimal(value: Decimal): FinancialDecimal;
    static zero(): FinancialDecimal;
    add(other: FinancialDecimal | number | string): FinancialDecimal;
    subtract(other: FinancialDecimal | number | string): FinancialDecimal;
    multiply(other: FinancialDecimal | number | string): FinancialDecimal;
    divide(other: FinancialDecimal | number | string): FinancialDecimal;
    round(places?: number): FinancialDecimal;
    toNumber(): number;
    toString(): string;
    toFixed(places?: number): string;
    equals(other: FinancialDecimal | number | string): boolean;
    greaterThan(other: FinancialDecimal | number | string): boolean;
    greaterThanOrEqual(other: FinancialDecimal | number | string): boolean;
    lessThan(other: FinancialDecimal | number | string): boolean;
    lessThanOrEqual(other: FinancialDecimal | number | string): boolean;
    isZero(): boolean;
    isNegative(): boolean;
    isPositive(): boolean;
    abs(): FinancialDecimal;
    neg(): FinancialDecimal;
    /**
     * Calculate percentage (value * percentage / 100)
     */
    percentage(percentage: FinancialDecimal | number | string): FinancialDecimal;
    /**
     * Calculate price * quantity for trade calculations
     */
    times(quantity: FinancialDecimal | number | string): FinancialDecimal;
    /**
     * Calculate value / quantity for average price calculations
     */
    dividedBy(quantity: FinancialDecimal | number | string): FinancialDecimal;
    /**
     * Format as currency string (e.g., "$1,234.56")
     */
    toCurrency(symbol?: string, decimals?: number): string;
    /**
     * Get raw Decimal instance for advanced operations
     */
    getRaw(): Decimal;
}
/**
 * Convenience function to create a FinancialDecimal from a string
 */
export declare function financial(value: string | number): FinancialDecimal;
/**
 * Calculate percentage return ((current - previous) / previous * 100)
 */
export declare function calculatePercentageReturn(current: FinancialDecimal | number | string, previous: FinancialDecimal | number | string): FinancialDecimal;
/**
 * Calculate profit/loss (exitPrice - entryPrice) * quantity
 */
export declare function calculateProfitLoss(entryPrice: FinancialDecimal | number | string, exitPrice: FinancialDecimal | number | string, quantity: FinancialDecimal | number | string): FinancialDecimal;
//# sourceMappingURL=decimal.d.ts.map