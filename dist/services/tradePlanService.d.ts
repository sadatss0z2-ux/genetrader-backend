/**
 * Trade Plan Service
 *
 * Implements authoritative lifecycle and state machine for:
 * 1. Chart Trade — Visual Entry, Take Profit & Stop Loss
 * 2. Chart Trade — Trailing Stop After Entry
 *
 * Shared across manual user executions and automated GeneTrader strategies.
 * Guarantees idempotent operations, non-decreasing trailing stops, and single-exit safety (no inventory oversell).
 */
import { EventEmitter } from 'events';
import { TradePlan, TradePlanCommand, TradePlanValidationResult } from '../models/tradePlan';
import { OrderService } from './orderService';
export interface TradePlanServiceOptions {
    orderService?: OrderService;
    feeRate?: number;
}
export declare class TradePlanService extends EventEmitter {
    private plans;
    private idempotencyRecords;
    private orderService;
    private feeRate;
    constructor(options?: TradePlanServiceOptions);
    /**
     * Preview a trade plan without saving or executing
     */
    previewPlan(command: Omit<TradePlanCommand, 'idempotencyKey'> & {
        availableBalance?: number;
    }): TradePlanValidationResult;
    /**
     * Create and validate a new Trade Plan (Idempotent)
     */
    createPlan(command: TradePlanCommand): Promise<TradePlan>;
    /**
     * Execute the entry order for a validated plan
     */
    executePlan(planId: string): Promise<TradePlan>;
    /**
     * Authoritative entry fill handler
     */
    handleOrderFill(orderId: string, filledQty: number, fillPrice: number): Promise<TradePlan | null>;
    /**
     * Live Market Feed Tick Processor:
     * Inspects active plans, updates favorable trailing extremes monotonically,
     * and triggers protective exits without double-selling inventory.
     */
    updateMarketPrice(symbol: string, currentPrice: number, candleHigh?: number): Promise<TradePlan[]>;
    /**
     * Execute single coordinated exit (Prevents duplicate exits / overselling inventory)
     */
    triggerExit(plan: TradePlan, reason: 'TRAILING_STOP' | 'TAKE_PROFIT' | 'STOP_LOSS', exitPrice: number): Promise<TradePlan>;
    /**
     * Cancel an active or pending Trade Plan safely
     */
    cancelPlan(planId: string, reason?: string): Promise<TradePlan>;
    /**
     * Get plan by ID
     */
    getPlan(planId: string): TradePlan | null;
    /**
     * List plans by user ID
     */
    getPlansByUserId(userId: number, symbol?: string): TradePlan[];
    /**
     * Reconcile active plans after backend restart
     */
    reconcilePlans(openExchangeOrderIds: Set<string | number>): Promise<{
        recovered: number;
        degraded: number;
    }>;
    /**
     * Persist a plan to PostgreSQL / Neon database table
     */
    persistPlan(plan: TradePlan): Promise<void>;
    /**
     * Load active plans from Neon PostgreSQL database on startup
     */
    loadPersistedPlans(): Promise<number>;
    /**
     * Dispatch push notification on critical lifecycle state transitions
     */
    private dispatchNotification;
    /**
     * Clear all in-memory state (useful for tests)
     */
    reset(): void;
}
//# sourceMappingURL=tradePlanService.d.ts.map