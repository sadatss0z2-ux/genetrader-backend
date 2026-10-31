"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradePlanService = void 0;
const events_1 = require("events");
const crypto_1 = require("crypto");
const tradePlanCalculations_1 = require("../utils/tradePlanCalculations");
const orderService_1 = require("./orderService");
const database_1 = __importDefault(require("../config/database"));
const notificationService_1 = require("./notificationService");
class TradePlanService extends events_1.EventEmitter {
    plans = new Map();
    idempotencyRecords = new Map(); // idempotencyKey -> planId
    orderService;
    feeRate;
    constructor(options = {}) {
        super();
        this.orderService = options.orderService || new orderService_1.OrderService();
        this.feeRate = options.feeRate ?? 0.001; // 0.10% Binance spot fee
    }
    /**
     * Preview a trade plan without saving or executing
     */
    previewPlan(command) {
        const calculations = (0, tradePlanCalculations_1.calculateTradeMetrics)({
            side: command.side,
            entryPrice: command.entryPrice,
            takeProfitPrice: command.takeProfitPrice,
            stopLossPrice: command.stopLossPrice,
            quantity: command.quantity,
            availableBalance: command.availableBalance,
            feeRate: this.feeRate,
        });
        return {
            isValid: calculations.isValid,
            errors: calculations.validationErrors,
            metrics: {
                orderValue: calculations.orderValue,
                requiredBalance: calculations.requiredBalance,
                estimatedFees: calculations.totalEstimatedFees,
                grossProfit: calculations.grossProfit,
                grossLoss: calculations.grossLoss,
                netProfit: calculations.netProfit,
                netLoss: calculations.netLoss,
                riskRewardRatio: calculations.riskRewardRatio,
                stopLossPercent: calculations.stopLossPercent,
                takeProfitPercent: calculations.takeProfitPercent,
                positionSizePercent: calculations.positionSizePercent,
            },
        };
    }
    /**
     * Create and validate a new Trade Plan (Idempotent)
     */
    async createPlan(command) {
        // Idempotency check
        const existingPlanId = this.idempotencyRecords.get(command.idempotencyKey);
        if (existingPlanId) {
            const existing = this.plans.get(existingPlanId);
            if (existing) {
                this.emit('planDuplicate', existing);
                return existing;
            }
        }
        // Validate inputs
        const validation = this.previewPlan(command);
        if (!validation.isValid) {
            throw new Error(`Invalid trade plan: ${validation.errors.join('; ')}`);
        }
        const planId = (0, crypto_1.randomUUID)();
        const correlationId = command.correlationId || (0, crypto_1.randomUUID)();
        const entryClientOrderId = command.clientOrderId || `GT-ENT-${planId.slice(0, 8)}`;
        const plan = {
            id: planId,
            userId: command.userId,
            symbol: command.symbol.toUpperCase(),
            planType: command.planType,
            side: command.side,
            entryType: command.entryType,
            entryPrice: command.entryPrice,
            quantity: command.quantity,
            filledQuantity: 0,
            averageEntryPrice: null,
            takeProfit: {
                price: command.takeProfitPrice,
                orderId: null,
                status: 'PENDING',
            },
            stopLoss: {
                price: command.stopLossPrice,
                orderId: null,
                status: 'PENDING',
            },
            trailingStop: command.planType === 'TRAILING_STOP' ? {
                trailingPercentage: command.trailingPercentage ?? 0.015,
                trailingDistance: command.trailingDistance,
                activationPrice: command.activationPrice,
                favorableExtreme: undefined,
                currentTriggerPrice: command.stopLossPrice,
                state: 'INITIAL_STOP',
            } : undefined,
            state: 'VALIDATED',
            stateMessage: 'Trade plan validated and ready for execution',
            origin: command.origin || 'MANUAL',
            strategyId: command.strategyId || null,
            correlationId,
            idempotencyKey: command.idempotencyKey,
            entryOrderId: null,
            entryClientOrderId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        this.plans.set(plan.id, plan);
        this.idempotencyRecords.set(command.idempotencyKey, plan.id);
        await this.persistPlan(plan);
        this.emit('planCreated', plan);
        return plan;
    }
    /**
     * Execute the entry order for a validated plan
     */
    async executePlan(planId) {
        const plan = this.plans.get(planId);
        if (!plan) {
            throw new Error(`Trade plan not found: ${planId}`);
        }
        if (plan.state !== 'VALIDATED' && plan.state !== 'DRAFT') {
            throw new Error(`Trade plan cannot be executed from state: ${plan.state}`);
        }
        plan.state = 'ENTRY_PENDING';
        plan.stateMessage = `Submitting ${plan.entryType} ${plan.side} entry order...`;
        plan.updatedAt = Date.now();
        // Create and submit order via authoritative OrderService
        const orderCommand = {
            idempotencyKey: `ord-${plan.idempotencyKey}`,
            userId: plan.userId,
            symbol: plan.symbol,
            side: plan.side,
            type: plan.entryType === 'LIMIT' ? 'LIMIT' : 'MARKET',
            quantity: plan.quantity.toString(),
            price: plan.entryType === 'LIMIT' ? plan.entryPrice.toString() : null,
            stopPrice: null,
            timeInForce: 'GTC',
            clientOrderId: plan.entryClientOrderId || `GT-ENT-${plan.id.slice(0, 8)}`,
            decisionCandidateId: plan.strategyId || '',
            authorizationId: '',
            createdAt: Date.now(),
        };
        const orderRecord = await this.orderService.submitOrder(orderCommand);
        await this.orderService.submitToExchange(orderRecord.id);
        plan.entryOrderId = orderRecord.id;
        await this.persistPlan(plan);
        this.emit('planSubmitted', plan);
        // If Market order, simulate/expect immediate fill in mock/testnet scenarios
        if (plan.entryType === 'MARKET') {
            const exchangeOrderId = `EX-${orderRecord.id}`;
            await this.orderService.processAcknowledgment({
                orderId: orderRecord.id,
                exchangeOrderId,
                status: 'ACKNOWLEDGED',
                rejectionReason: null,
                acknowledgedAt: Date.now(),
            });
            await this.orderService.processFill({
                orderId: orderRecord.id,
                exchangeOrderId,
                fillId: `FILL-${(0, crypto_1.randomUUID)().slice(0, 8)}`,
                price: plan.entryPrice.toString(),
                quantity: plan.quantity.toString(),
                commission: '0.001',
                commissionAsset: 'USDT',
                tradeTime: Date.now(),
                isMaker: false,
            });
            await this.handleOrderFill(orderRecord.id, plan.quantity, plan.entryPrice);
        }
        return plan;
    }
    /**
     * Authoritative entry fill handler
     */
    async handleOrderFill(orderId, filledQty, fillPrice) {
        // Find matching plan
        let matchedPlan = null;
        for (const plan of this.plans.values()) {
            if (plan.entryOrderId === orderId) {
                matchedPlan = plan;
                break;
            }
        }
        if (!matchedPlan)
            return null;
        matchedPlan.filledQuantity = Number((matchedPlan.filledQuantity + filledQty).toFixed(8));
        matchedPlan.averageEntryPrice = fillPrice;
        matchedPlan.updatedAt = Date.now();
        const isFullyFilled = matchedPlan.filledQuantity >= matchedPlan.quantity;
        if (!isFullyFilled) {
            matchedPlan.state = 'PARTIALLY_FILLED';
            matchedPlan.stateMessage = `Partially filled: ${matchedPlan.filledQuantity}/${matchedPlan.quantity} at avg price ${fillPrice}`;
            await this.persistPlan(matchedPlan);
            this.emit('planPartiallyFilled', matchedPlan);
            return matchedPlan;
        }
        // Fully filled -> establish protection
        if (matchedPlan.planType === 'TRAILING_STOP' && matchedPlan.trailingStop) {
            matchedPlan.state = 'TRAILING_ACTIVE';
            matchedPlan.trailingStop.state = 'TRAILING_ACTIVE';
            matchedPlan.trailingStop.favorableExtreme = fillPrice;
            // Calculate initial trailing trigger
            const trigger = (0, tradePlanCalculations_1.calculateTrailingStopTrigger)(matchedPlan.side, fillPrice, matchedPlan.trailingStop.trailingPercentage, matchedPlan.trailingStop.trailingDistance, matchedPlan.stopLoss.price);
            matchedPlan.trailingStop.currentTriggerPrice = trigger;
            matchedPlan.takeProfit.status = 'PLACED';
            matchedPlan.stateMessage = `Entry filled at ${fillPrice}. Trailing stop active with trigger at ${trigger.toFixed(4)}`;
            await this.persistPlan(matchedPlan);
            await this.dispatchNotification(matchedPlan, 'TRAILING_ACTIVE');
        }
        else {
            matchedPlan.state = 'POSITION_PROTECTED';
            matchedPlan.takeProfit.status = 'PLACED';
            matchedPlan.stopLoss.status = 'PLACED';
            matchedPlan.stateMessage = `Entry filled at ${fillPrice}. Protection active (TP: ${matchedPlan.takeProfit.price}, SL: ${matchedPlan.stopLoss.price})`;
            await this.persistPlan(matchedPlan);
            await this.dispatchNotification(matchedPlan, 'POSITION_PROTECTED');
        }
        this.emit('planProtected', matchedPlan);
        return matchedPlan;
    }
    /**
     * Live Market Feed Tick Processor:
     * Inspects active plans, updates favorable trailing extremes monotonically,
     * and triggers protective exits without double-selling inventory.
     */
    async updateMarketPrice(symbol, currentPrice, candleHigh) {
        const sym = symbol.toUpperCase();
        const affectedPlans = [];
        for (const plan of this.plans.values()) {
            if (plan.symbol !== sym)
                continue;
            // Handle Trailing Stop logic
            if (plan.state === 'TRAILING_ACTIVE' && plan.trailingStop) {
                const config = plan.trailingStop;
                const favorablePrice = plan.side === 'BUY'
                    ? Math.max(currentPrice, candleHigh ?? currentPrice)
                    : currentPrice;
                // Check if price makes a new favorable extreme
                const currentExtreme = config.favorableExtreme ?? plan.entryPrice;
                if (plan.side === 'BUY' && favorablePrice > currentExtreme) {
                    config.favorableExtreme = favorablePrice;
                    const newTrigger = (0, tradePlanCalculations_1.calculateTrailingStopTrigger)(plan.side, favorablePrice, config.trailingPercentage, config.trailingDistance, config.currentTriggerPrice);
                    // Update trigger monotonically
                    config.currentTriggerPrice = newTrigger;
                    config.updatedAt = Date.now();
                    plan.updatedAt = Date.now();
                    this.emit('trailingStopUpdated', plan);
                }
                // Check for Stop Trigger condition
                const stopTrigger = config.currentTriggerPrice ?? plan.stopLoss.price;
                if (plan.side === 'BUY' && currentPrice <= stopTrigger) {
                    await this.triggerExit(plan, 'TRAILING_STOP', currentPrice);
                    affectedPlans.push(plan);
                    continue;
                }
                // Check for Take Profit condition
                if (plan.side === 'BUY' && currentPrice >= plan.takeProfit.price) {
                    await this.triggerExit(plan, 'TAKE_PROFIT', currentPrice);
                    affectedPlans.push(plan);
                    continue;
                }
            }
            // Handle standard Position Protected logic
            if (plan.state === 'POSITION_PROTECTED') {
                if (plan.side === 'BUY') {
                    if (currentPrice >= plan.takeProfit.price) {
                        await this.triggerExit(plan, 'TAKE_PROFIT', currentPrice);
                        affectedPlans.push(plan);
                    }
                    else if (currentPrice <= plan.stopLoss.price) {
                        await this.triggerExit(plan, 'STOP_LOSS', currentPrice);
                        affectedPlans.push(plan);
                    }
                }
                else {
                    // Sell direction
                    if (currentPrice <= plan.takeProfit.price) {
                        await this.triggerExit(plan, 'TAKE_PROFIT', currentPrice);
                        affectedPlans.push(plan);
                    }
                    else if (currentPrice >= plan.stopLoss.price) {
                        await this.triggerExit(plan, 'STOP_LOSS', currentPrice);
                        affectedPlans.push(plan);
                    }
                }
            }
        }
        return affectedPlans;
    }
    /**
     * Execute single coordinated exit (Prevents duplicate exits / overselling inventory)
     */
    async triggerExit(plan, reason, exitPrice) {
        if (plan.state === 'EXIT_PENDING' || plan.state === 'CLOSED') {
            return plan; // Already exiting or closed
        }
        plan.state = 'EXIT_PENDING';
        plan.stateMessage = `Triggered ${reason} at ${exitPrice}. Executing single protective exit...`;
        plan.updatedAt = Date.now();
        // Prevent duplicate orders: Cancel remaining opposite protective intent
        if (reason === 'TAKE_PROFIT') {
            plan.takeProfit.status = 'FILLED';
            plan.stopLoss.status = 'CANCELLED';
            if (plan.trailingStop)
                plan.trailingStop.state = 'CANCELLED';
        }
        else {
            plan.takeProfit.status = 'CANCELLED';
            plan.stopLoss.status = 'TRIGGERED';
            if (plan.trailingStop)
                plan.trailingStop.state = 'TRIGGERED';
        }
        // Submit authoritative exit order for filledQuantity
        const exitSide = plan.side === 'BUY' ? 'SELL' : 'BUY';
        const exitClientOrderId = `GT-EXIT-${plan.id.slice(0, 8)}`;
        plan.exitClientOrderId = exitClientOrderId;
        const exitCommand = {
            idempotencyKey: `exit-${plan.idempotencyKey}`,
            userId: plan.userId,
            symbol: plan.symbol,
            side: exitSide,
            type: 'MARKET',
            quantity: plan.filledQuantity.toString(),
            price: null,
            stopPrice: null,
            timeInForce: 'GTC',
            clientOrderId: exitClientOrderId,
            decisionCandidateId: plan.strategyId || '',
            authorizationId: '',
            createdAt: Date.now(),
        };
        const exitRecord = await this.orderService.submitOrder(exitCommand);
        await this.orderService.submitToExchange(exitRecord.id);
        plan.exitOrderId = exitRecord.id;
        // Record exchange acknowledgment and exit fill
        const exchangeOrderId = `EX-${exitRecord.id}`;
        await this.orderService.processAcknowledgment({
            orderId: exitRecord.id,
            exchangeOrderId,
            status: 'ACKNOWLEDGED',
            rejectionReason: null,
            acknowledgedAt: Date.now(),
        });
        await this.orderService.processFill({
            orderId: exitRecord.id,
            exchangeOrderId,
            fillId: `FILL-${(0, crypto_1.randomUUID)().slice(0, 8)}`,
            price: exitPrice.toString(),
            quantity: plan.filledQuantity.toString(),
            commission: '0.001',
            commissionAsset: 'USDT',
            tradeTime: Date.now(),
            isMaker: false,
        });
        const entryCost = plan.filledQuantity * (plan.averageEntryPrice ?? plan.entryPrice);
        const exitProceeds = plan.filledQuantity * exitPrice;
        const entryFee = entryCost * this.feeRate;
        const exitFee = exitProceeds * this.feeRate;
        const totalFees = entryFee + exitFee;
        const grossPnl = plan.side === 'BUY' ? exitProceeds - entryCost : entryCost - exitProceeds;
        const netPnl = grossPnl - totalFees;
        plan.realizedExitPrice = exitPrice;
        plan.realizedPnl = Number(netPnl.toFixed(4));
        plan.commissionPaid = Number(totalFees.toFixed(4));
        plan.state = 'CLOSED';
        plan.stateMessage = `Closed via ${reason} at ${exitPrice}. Net PnL: ${plan.realizedPnl} (Fees: ${plan.commissionPaid})`;
        plan.closedAt = Date.now();
        plan.updatedAt = Date.now();
        await this.persistPlan(plan);
        await this.dispatchNotification(plan, 'CLOSED', { exitPrice, pnl: plan.realizedPnl, exitReason: reason });
        this.emit('planClosed', plan);
        return plan;
    }
    /**
     * Cancel an active or pending Trade Plan safely
     */
    async cancelPlan(planId, reason = 'User requested cancellation') {
        const plan = this.plans.get(planId);
        if (!plan) {
            throw new Error(`Trade plan not found: ${planId}`);
        }
        if (plan.state === 'CLOSED' || plan.state === 'CANCELLED') {
            return plan;
        }
        // If entry order is still pending, cancel it on exchange
        if (plan.state === 'ENTRY_PENDING' && plan.entryOrderId) {
            try {
                await this.orderService.cancelOrder(plan.entryOrderId.toString());
            }
            catch (e) {
                // Log and continue
            }
        }
        // Cancel protective orders
        plan.takeProfit.status = 'CANCELLED';
        plan.stopLoss.status = 'CANCELLED';
        if (plan.trailingStop) {
            plan.trailingStop.state = 'CANCELLED';
        }
        plan.state = 'CANCELLED';
        plan.stateMessage = reason;
        plan.updatedAt = Date.now();
        plan.closedAt = Date.now();
        await this.persistPlan(plan);
        this.emit('planCancelled', plan);
        return plan;
    }
    /**
     * Get plan by ID
     */
    getPlan(planId) {
        return this.plans.get(planId) || null;
    }
    /**
     * List plans by user ID
     */
    getPlansByUserId(userId, symbol) {
        const list = [];
        for (const plan of this.plans.values()) {
            if (plan.userId === userId) {
                if (!symbol || plan.symbol === symbol.toUpperCase()) {
                    list.push(plan);
                }
            }
        }
        return list.sort((a, b) => b.createdAt - a.createdAt);
    }
    /**
     * Reconcile active plans after backend restart
     */
    async reconcilePlans(openExchangeOrderIds) {
        let recovered = 0;
        let degraded = 0;
        for (const plan of this.plans.values()) {
            if (plan.state === 'CLOSED' || plan.state === 'CANCELLED')
                continue;
            if (plan.state === 'ENTRY_PENDING') {
                if (plan.entryOrderId && openExchangeOrderIds.has(plan.entryOrderId)) {
                    recovered++;
                }
                else {
                    // Entry order no longer on exchange -> could be filled or cancelled
                    recovered++;
                }
            }
            else if (plan.state === 'POSITION_PROTECTED' || plan.state === 'TRAILING_ACTIVE') {
                // Backend managed stop loss & TP
                recovered++;
            }
        }
        return { recovered, degraded };
    }
    /**
     * Persist a plan to PostgreSQL / Neon database table
     */
    async persistPlan(plan) {
        if (!database_1.default || process.env.NODE_ENV === 'test')
            return;
        try {
            await (0, database_1.default) `
        INSERT INTO trade_plans (
          id, user_id, symbol, plan_type, side, entry_type, entry_price,
          quantity, filled_quantity, average_entry_price,
          take_profit_price, take_profit_order_id, take_profit_status,
          stop_loss_price, stop_loss_order_id, stop_loss_status,
          trailing_percentage, trailing_distance, activation_price,
          favorable_extreme, current_trailing_stop_price, trailing_stop_state,
          state, state_message, origin, strategy_id, correlation_id, idempotency_key,
          entry_order_id, entry_client_order_id, exit_order_id, exit_client_order_id,
          realized_exit_price, realized_pnl, commission_paid,
          created_at, updated_at, closed_at
        ) VALUES (
          ${plan.id}, ${plan.userId}, ${plan.symbol}, ${plan.planType}, ${plan.side}, ${plan.entryType}, ${plan.entryPrice},
          ${plan.quantity}, ${plan.filledQuantity}, ${plan.averageEntryPrice ?? null},
          ${plan.takeProfit.price}, ${plan.takeProfit.orderId ? String(plan.takeProfit.orderId) : null}, ${plan.takeProfit.status},
          ${plan.stopLoss.price}, ${plan.stopLoss.orderId ? String(plan.stopLoss.orderId) : null}, ${plan.stopLoss.status},
          ${plan.trailingStop?.trailingPercentage ?? null}, ${plan.trailingStop?.trailingDistance ?? null}, ${plan.trailingStop?.activationPrice ?? null},
          ${plan.trailingStop?.favorableExtreme ?? null}, ${plan.trailingStop?.currentTriggerPrice ?? null}, ${plan.trailingStop?.state ?? null},
          ${plan.state}, ${plan.stateMessage ?? null}, ${plan.origin}, ${plan.strategyId ?? null}, ${plan.correlationId}, ${plan.idempotencyKey},
          ${plan.entryOrderId ? String(plan.entryOrderId) : null}, ${plan.entryClientOrderId ?? null}, ${plan.exitOrderId ? String(plan.exitOrderId) : null}, ${plan.exitClientOrderId ?? null},
          ${plan.realizedExitPrice ?? null}, ${plan.realizedPnl ?? null}, ${plan.commissionPaid ?? null},
          ${plan.createdAt}, ${plan.updatedAt}, ${plan.closedAt ?? null}
        )
        ON CONFLICT (id) DO UPDATE SET
          filled_quantity = EXCLUDED.filled_quantity,
          average_entry_price = EXCLUDED.average_entry_price,
          take_profit_order_id = EXCLUDED.take_profit_order_id,
          take_profit_status = EXCLUDED.take_profit_status,
          stop_loss_order_id = EXCLUDED.stop_loss_order_id,
          stop_loss_status = EXCLUDED.stop_loss_status,
          favorable_extreme = EXCLUDED.favorable_extreme,
          current_trailing_stop_price = EXCLUDED.current_trailing_stop_price,
          trailing_stop_state = EXCLUDED.trailing_stop_state,
          state = EXCLUDED.state,
          state_message = EXCLUDED.state_message,
          entry_order_id = EXCLUDED.entry_order_id,
          exit_order_id = EXCLUDED.exit_order_id,
          exit_client_order_id = EXCLUDED.exit_client_order_id,
          realized_exit_price = EXCLUDED.realized_exit_price,
          realized_pnl = EXCLUDED.realized_pnl,
          commission_paid = EXCLUDED.commission_paid,
          updated_at = EXCLUDED.updated_at,
          closed_at = EXCLUDED.closed_at
      `;
        }
        catch (err) {
            console.error('[TradePlanService] Failed to persist plan to Neon DB:', err);
        }
    }
    /**
     * Load active plans from Neon PostgreSQL database on startup
     */
    async loadPersistedPlans() {
        if (!database_1.default || process.env.NODE_ENV === 'test')
            return 0;
        try {
            const rows = await (0, database_1.default) `
        SELECT * FROM trade_plans
        WHERE state NOT IN ('CLOSED', 'CANCELLED', 'REJECTED')
      `;
            let count = 0;
            for (const row of rows) {
                const plan = {
                    id: row.id,
                    userId: Number(row.user_id),
                    symbol: row.symbol,
                    planType: row.plan_type,
                    side: row.side,
                    entryType: row.entry_type,
                    entryPrice: Number(row.entry_price),
                    quantity: Number(row.quantity),
                    filledQuantity: Number(row.filled_quantity),
                    averageEntryPrice: row.average_entry_price ? Number(row.average_entry_price) : null,
                    takeProfit: {
                        price: Number(row.take_profit_price),
                        orderId: row.take_profit_order_id,
                        status: row.take_profit_status,
                    },
                    stopLoss: {
                        price: Number(row.stop_loss_price),
                        orderId: row.stop_loss_order_id,
                        status: row.stop_loss_status,
                    },
                    trailingStop: row.trailing_percentage ? {
                        trailingPercentage: Number(row.trailing_percentage),
                        trailingDistance: row.trailing_distance ? Number(row.trailing_distance) : undefined,
                        activationPrice: row.activation_price ? Number(row.activation_price) : undefined,
                        favorableExtreme: row.favorable_extreme ? Number(row.favorable_extreme) : undefined,
                        currentTriggerPrice: row.current_trailing_stop_price ? Number(row.current_trailing_stop_price) : undefined,
                        state: row.trailing_stop_state,
                    } : undefined,
                    state: row.state,
                    stateMessage: row.state_message,
                    origin: row.origin,
                    strategyId: row.strategy_id,
                    correlationId: row.correlation_id,
                    idempotencyKey: row.idempotency_key,
                    entryOrderId: row.entry_order_id,
                    entryClientOrderId: row.entry_client_order_id,
                    exitOrderId: row.exit_order_id,
                    exitClientOrderId: row.exit_client_order_id,
                    realizedExitPrice: row.realized_exit_price ? Number(row.realized_exit_price) : null,
                    realizedPnl: row.realized_pnl ? Number(row.realized_pnl) : null,
                    commissionPaid: row.commission_paid ? Number(row.commission_paid) : null,
                    createdAt: Number(row.created_at),
                    updatedAt: Number(row.updated_at),
                    closedAt: row.closed_at ? Number(row.closed_at) : null,
                };
                this.plans.set(plan.id, plan);
                this.idempotencyRecords.set(plan.idempotencyKey, plan.id);
                count++;
            }
            return count;
        }
        catch (err) {
            console.error('[TradePlanService] Failed to load persisted plans from Neon DB:', err);
            return 0;
        }
    }
    /**
     * Dispatch push notification on critical lifecycle state transitions
     */
    async dispatchNotification(plan, state, details) {
        if (process.env.NODE_ENV === 'test')
            return;
        try {
            await (0, notificationService_1.notifyTradePlanStatusChanged)(plan.userId, {
                planId: plan.id,
                symbol: plan.symbol,
                side: plan.side,
                state,
                orderType: plan.planType,
                entryPrice: plan.averageEntryPrice ?? plan.entryPrice,
                takeProfitPrice: plan.takeProfit.price,
                stopLossPrice: plan.stopLoss.price,
                trailingStopPrice: plan.trailingStop?.currentTriggerPrice,
                trailingPercentage: plan.trailingStop?.trailingPercentage,
                exitPrice: details?.exitPrice,
                pnl: details?.pnl,
                exitReason: details?.exitReason,
            });
        }
        catch (err) {
            console.error('[TradePlanService] Failed to dispatch trade plan notification:', err);
        }
    }
    /**
     * Clear all in-memory state (useful for tests)
     */
    reset() {
        this.plans.clear();
        this.idempotencyRecords.clear();
        this.orderService.reset();
    }
}
exports.TradePlanService = TradePlanService;
//# sourceMappingURL=tradePlanService.js.map