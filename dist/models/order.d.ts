/**
 * Order Infrastructure Models (P5-01)
 * Idempotent order-command/outbox/state machine and exchange acknowledgment adapter.
 */
/**
 * Order state - state machine for order lifecycle
 */
export type OrderState = 'PENDING' | 'SUBMITTED' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'REJECTED' | 'EXPIRED';
/**
 * Order type
 */
export type OrderType = 'MARKET' | 'LIMIT' | 'STOP_LIMIT' | 'OCO';
/**
 * Order side
 */
export type OrderSide = 'BUY' | 'SELL';
/**
 * Time in force
 */
export type TimeInForce = 'GTC' | 'IOC' | 'FOK';
/**
 * Order command - request to create an order
 */
export interface OrderCommand {
    idempotencyKey: string;
    userId: number;
    symbol: string;
    side: OrderSide;
    type: OrderType;
    quantity: string;
    price: string | null;
    stopPrice: string | null;
    timeInForce: TimeInForce;
    clientOrderId: string;
    decisionCandidateId: string;
    authorizationId: string;
    createdAt: number;
}
/**
 * Order record - persisted order with state
 */
export interface OrderRecord {
    id: string;
    idempotencyKey: string;
    userId: number;
    symbol: string;
    side: OrderSide;
    type: OrderType;
    quantity: string;
    price: string | null;
    stopPrice: string | null;
    timeInForce: TimeInForce;
    clientOrderId: string;
    decisionCandidateId: string;
    authorizationId: string;
    state: OrderState;
    exchangeOrderId: string | null;
    filledQuantity: string;
    averagePrice: string | null;
    commission: string | null;
    statusMessage: string | null;
    submittedAt: number | null;
    updatedAt: number;
    createdAt: number;
}
/**
 * Outbox event - event to be published reliably
 */
export interface OutboxEvent {
    id: string;
    eventType: 'ORDER_SUBMITTED' | 'ORDER_FILLED' | 'ORDER_CANCELLED' | 'ORDER_REJECTED' | 'ORDER_EXPIRED';
    aggregateId: string;
    aggregateType: 'ORDER' | 'USER' | 'ACCOUNT';
    payload: Record<string, unknown>;
    published: boolean;
    publishedAt: number | null;
    createdAt: number;
}
/**
 * Exchange acknowledgment - acknowledgment from exchange
 */
export interface ExchangeAcknowledgment {
    orderId: string;
    exchangeOrderId: string | null;
    status: 'ACKNOWLEDGED' | 'REJECTED' | 'ERROR';
    rejectionReason: string | null;
    acknowledgedAt: number;
}
/**
 * Exchange order status - status from exchange
 */
export interface ExchangeOrderStatus {
    exchangeOrderId: string;
    symbol: string;
    side: OrderSide;
    type: OrderType;
    quantity: string;
    price: string | null;
    stopPrice: string | null;
    status: 'NEW' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELED' | 'REJECTED' | 'EXPIRED';
    filledQuantity: string;
    remainingQuantity: string;
    averagePrice: string | null;
    commission: string | null;
    updateTime: number;
}
/**
 * Order fill - fill event from exchange
 */
export interface OrderFill {
    orderId: string;
    exchangeOrderId: string;
    fillId: string;
    price: string;
    quantity: string;
    commission: string;
    commissionAsset: string;
    tradeTime: number;
    isMaker: boolean;
}
//# sourceMappingURL=order.d.ts.map