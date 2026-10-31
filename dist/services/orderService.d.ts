/**
 * Order Service (P5-01)
 * Idempotent order-command/outbox/state machine for order lifecycle management.
 */
import { EventEmitter } from 'events';
import { OrderCommand, OrderRecord, OutboxEvent, ExchangeAcknowledgment, ExchangeOrderStatus, OrderFill } from '../models/order';
export interface IdempotencyRecord {
    id: string;
    type: string;
    createdAt: number;
}
export interface OrderServiceOptions {
}
export declare class OrderService extends EventEmitter {
    private orders;
    private outboxEvents;
    private exchangeAcknowledgments;
    private idempotencyRecords;
    constructor(options?: OrderServiceOptions);
    /**
     * Check idempotency key
     */
    private checkIdempotency;
    /**
     * Record idempotency key
     */
    private recordIdempotency;
    /**
     * Submit an order command with idempotency
     */
    submitOrder(command: OrderCommand): Promise<OrderRecord>;
    /**
     * Submit order to exchange (transition to SUBMITTED)
     */
    submitToExchange(orderId: string): Promise<OrderRecord>;
    /**
     * Process exchange acknowledgment
     */
    processAcknowledgment(ack: ExchangeAcknowledgment): Promise<OrderRecord>;
    /**
     * Process order status update from exchange
     */
    processOrderStatus(status: ExchangeOrderStatus): Promise<OrderRecord>;
    /**
     * Process order fill
     */
    processFill(fill: OrderFill): Promise<OrderRecord>;
    /**
     * Cancel order
     */
    cancelOrder(orderId: string): Promise<OrderRecord>;
    /**
     * Get order by ID
     */
    getOrder(orderId: string): OrderRecord | null;
    /**
     * Get orders by user ID
     */
    getOrdersByUser(userId: number): OrderRecord[];
    /**
     * Get orders by symbol
     */
    getOrdersBySymbol(symbol: string): OrderRecord[];
    /**
     * Get order by idempotency key
     */
    getOrderByIdempotencyKey(idempotencyKey: string): OrderRecord | null;
    /**
     * Create outbox event
     */
    private createOutboxEvent;
    /**
     * Get outbox events for order
     */
    getOutboxEvents(orderId: string): OutboxEvent[];
    /**
     * Mark outbox event as published
     */
    markOutboxEventPublished(eventId: string): OutboxEvent;
    /**
     * Get unpublished outbox events
     */
    getUnpublishedOutboxEvents(): OutboxEvent[];
    /**
     * Reset all in-memory state (useful for test isolation)
     */
    reset(): void;
}
//# sourceMappingURL=orderService.d.ts.map