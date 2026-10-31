"use strict";
/**
 * Order Service (P5-01)
 * Idempotent order-command/outbox/state machine for order lifecycle management.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderService = void 0;
const events_1 = require("events");
const crypto_1 = require("crypto");
class OrderService extends events_1.EventEmitter {
    orders = new Map();
    outboxEvents = new Map();
    exchangeAcknowledgments = new Map();
    idempotencyRecords = new Map();
    constructor(options = {}) {
        super();
    }
    /**
     * Check idempotency key
     */
    checkIdempotency(idempotencyKey) {
        return this.idempotencyRecords.get(idempotencyKey) || null;
    }
    /**
     * Record idempotency key
     */
    recordIdempotency(idempotencyKey, record) {
        this.idempotencyRecords.set(idempotencyKey, record);
    }
    /**
     * Submit an order command with idempotency
     */
    async submitOrder(command) {
        // Check idempotency
        const existing = this.checkIdempotency(command.idempotencyKey);
        if (existing) {
            const existingOrder = this.orders.get(existing.id);
            if (existingOrder) {
                this.emit('orderDuplicate', existingOrder);
                return existingOrder;
            }
        }
        // Create new order record
        const order = {
            id: (0, crypto_1.randomUUID)(),
            idempotencyKey: command.idempotencyKey,
            userId: command.userId,
            symbol: command.symbol,
            side: command.side,
            type: command.type,
            quantity: command.quantity,
            price: command.price,
            stopPrice: command.stopPrice,
            timeInForce: command.timeInForce,
            clientOrderId: command.clientOrderId,
            decisionCandidateId: command.decisionCandidateId,
            authorizationId: command.authorizationId,
            state: 'PENDING',
            exchangeOrderId: null,
            filledQuantity: '0',
            averagePrice: null,
            commission: null,
            statusMessage: null,
            submittedAt: null,
            updatedAt: Date.now(),
            createdAt: Date.now(),
        };
        // Store order
        this.orders.set(order.id, order);
        // Record idempotency
        this.recordIdempotency(command.idempotencyKey, {
            id: order.id,
            type: 'ORDER',
            createdAt: order.createdAt,
        });
        // Create outbox event for order submitted
        this.createOutboxEvent('ORDER_SUBMITTED', order.id, order);
        this.emit('orderCreated', order);
        return order;
    }
    /**
     * Submit order to exchange (transition to SUBMITTED)
     */
    async submitToExchange(orderId) {
        const order = this.orders.get(orderId);
        if (!order) {
            throw new Error(`Order not found: ${orderId}`);
        }
        if (order.state !== 'PENDING') {
            throw new Error(`Order is not in PENDING state: ${order.state}`);
        }
        const updatedOrder = {
            ...order,
            state: 'SUBMITTED',
            submittedAt: Date.now(),
            updatedAt: Date.now(),
        };
        this.orders.set(orderId, updatedOrder);
        this.emit('orderSubmitted', updatedOrder);
        return updatedOrder;
    }
    /**
     * Process exchange acknowledgment
     */
    async processAcknowledgment(ack) {
        const order = this.orders.get(ack.orderId);
        if (!order) {
            throw new Error(`Order not found: ${ack.orderId}`);
        }
        this.exchangeAcknowledgments.set(ack.orderId, ack);
        let newState = order.state;
        let statusMessage = null;
        if (ack.status === 'ACKNOWLEDGED') {
            newState = 'SUBMITTED';
            // Exchange order ID is set
        }
        else if (ack.status === 'REJECTED') {
            newState = 'REJECTED';
            statusMessage = ack.rejectionReason;
        }
        else if (ack.status === 'ERROR') {
            newState = 'REJECTED';
            statusMessage = ack.rejectionReason || 'Exchange error';
        }
        const updatedOrder = {
            ...order,
            state: newState,
            exchangeOrderId: ack.exchangeOrderId,
            statusMessage,
            updatedAt: Date.now(),
        };
        this.orders.set(ack.orderId, updatedOrder);
        // Create outbox event for order rejected
        if (newState === 'REJECTED') {
            this.createOutboxEvent('ORDER_REJECTED', order.id, updatedOrder);
        }
        this.emit('orderAcknowledged', updatedOrder, ack);
        return updatedOrder;
    }
    /**
     * Process order status update from exchange
     */
    async processOrderStatus(status) {
        // Find order by exchange order ID
        let order;
        for (const o of this.orders.values()) {
            if (o.exchangeOrderId === status.exchangeOrderId) {
                order = o;
                break;
            }
        }
        if (!order) {
            throw new Error(`Order not found for exchange order ID: ${status.exchangeOrderId}`);
        }
        let newState = order.state;
        // Map exchange status to order state
        switch (status.status) {
            case 'NEW':
                newState = 'SUBMITTED';
                break;
            case 'PARTIALLY_FILLED':
                newState = 'PARTIALLY_FILLED';
                break;
            case 'FILLED':
                newState = 'FILLED';
                break;
            case 'CANCELED':
                newState = 'CANCELLED';
                break;
            case 'REJECTED':
                newState = 'REJECTED';
                break;
            case 'EXPIRED':
                newState = 'EXPIRED';
                break;
        }
        const updatedOrder = {
            ...order,
            state: newState,
            filledQuantity: status.filledQuantity,
            averagePrice: status.averagePrice,
            commission: status.commission,
            updatedAt: Date.now(),
        };
        this.orders.set(order.id, updatedOrder);
        // Create outbox event for state transitions
        if (newState === 'FILLED') {
            this.createOutboxEvent('ORDER_FILLED', order.id, updatedOrder);
        }
        else if (newState === 'CANCELLED') {
            this.createOutboxEvent('ORDER_CANCELLED', order.id, updatedOrder);
        }
        else if (newState === 'EXPIRED') {
            this.createOutboxEvent('ORDER_EXPIRED', order.id, updatedOrder);
        }
        this.emit('orderStatusUpdated', updatedOrder, status);
        return updatedOrder;
    }
    /**
     * Process order fill
     */
    async processFill(fill) {
        // Find order by exchange order ID
        let order;
        for (const o of this.orders.values()) {
            if (o.exchangeOrderId === fill.exchangeOrderId) {
                order = o;
                break;
            }
        }
        if (!order) {
            throw new Error(`Order not found for exchange order ID: ${fill.exchangeOrderId}`);
        }
        const updatedOrder = {
            ...order,
            filledQuantity: fill.quantity,
            averagePrice: fill.price,
            commission: fill.commission,
            state: 'FILLED',
            updatedAt: Date.now(),
        };
        this.orders.set(order.id, updatedOrder);
        this.createOutboxEvent('ORDER_FILLED', order.id, updatedOrder);
        this.emit('orderFilled', updatedOrder, fill);
        return updatedOrder;
    }
    /**
     * Cancel order
     */
    async cancelOrder(orderId) {
        const order = this.orders.get(orderId);
        if (!order) {
            throw new Error(`Order not found: ${orderId}`);
        }
        if (order.state === 'FILLED' || order.state === 'CANCELLED' || order.state === 'REJECTED' || order.state === 'EXPIRED') {
            throw new Error(`Order cannot be cancelled in state: ${order.state}`);
        }
        const updatedOrder = {
            ...order,
            state: 'CANCELLED',
            updatedAt: Date.now(),
        };
        this.orders.set(orderId, updatedOrder);
        this.createOutboxEvent('ORDER_CANCELLED', order.id, updatedOrder);
        this.emit('orderCancelled', updatedOrder);
        return updatedOrder;
    }
    /**
     * Get order by ID
     */
    getOrder(orderId) {
        return this.orders.get(orderId) || null;
    }
    /**
     * Get orders by user ID
     */
    getOrdersByUser(userId) {
        return Array.from(this.orders.values()).filter((o) => o.userId === userId);
    }
    /**
     * Get orders by symbol
     */
    getOrdersBySymbol(symbol) {
        return Array.from(this.orders.values()).filter((o) => o.symbol === symbol);
    }
    /**
     * Get order by idempotency key
     */
    getOrderByIdempotencyKey(idempotencyKey) {
        for (const order of this.orders.values()) {
            if (order.idempotencyKey === idempotencyKey) {
                return order;
            }
        }
        return null;
    }
    /**
     * Create outbox event
     */
    createOutboxEvent(eventType, aggregateId, payload) {
        const event = {
            id: (0, crypto_1.randomUUID)(),
            eventType,
            aggregateId,
            aggregateType: 'ORDER',
            payload,
            published: false,
            publishedAt: null,
            createdAt: Date.now(),
        };
        this.outboxEvents.set(event.id, event);
        this.emit('outboxEventCreated', event);
        return event;
    }
    /**
     * Get outbox events for order
     */
    getOutboxEvents(orderId) {
        return Array.from(this.outboxEvents.values()).filter((e) => e.aggregateId === orderId);
    }
    /**
     * Mark outbox event as published
     */
    markOutboxEventPublished(eventId) {
        const event = this.outboxEvents.get(eventId);
        if (!event) {
            throw new Error(`Outbox event not found: ${eventId}`);
        }
        const updatedEvent = {
            ...event,
            published: true,
            publishedAt: Date.now(),
        };
        this.outboxEvents.set(eventId, updatedEvent);
        this.emit('outboxEventPublished', updatedEvent);
        return updatedEvent;
    }
    /**
     * Get unpublished outbox events
     */
    getUnpublishedOutboxEvents() {
        return Array.from(this.outboxEvents.values()).filter((e) => !e.published);
    }
    /**
     * Reset all in-memory state (useful for test isolation)
     */
    reset() {
        this.orders.clear();
        this.outboxEvents.clear();
        this.exchangeAcknowledgments.clear();
    }
}
exports.OrderService = OrderService;
//# sourceMappingURL=orderService.js.map