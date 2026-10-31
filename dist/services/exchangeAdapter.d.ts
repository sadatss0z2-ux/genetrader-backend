/**
 * Exchange Acknowledgment Adapter (P5-01)
 * Adapter for submitting orders to exchange and receiving acknowledgments.
 * Placeholder implementation for Binance integration.
 */
import { EventEmitter } from 'events';
import { OrderRecord, ExchangeAcknowledgment, ExchangeOrderStatus, OrderFill } from '../models/order';
export interface ExchangeAdapterOptions {
    apiKey?: string;
    apiSecret?: string;
    testnet?: boolean;
}
export declare class ExchangeAdapter extends EventEmitter {
    private apiKey?;
    private apiSecret?;
    private testnet;
    constructor(options?: ExchangeAdapterOptions);
    /**
     * Submit order to exchange
     * Placeholder: simulates exchange submission
     */
    submitOrder(order: OrderRecord): Promise<ExchangeAcknowledgment>;
    /**
     * Cancel order on exchange
     * Placeholder: simulates exchange cancellation
     */
    cancelOrder(order: OrderRecord): Promise<ExchangeAcknowledgment>;
    /**
     * Query order status from exchange
     * Placeholder: simulates order status query
     */
    queryOrderStatus(exchangeOrderId: string): Promise<ExchangeOrderStatus>;
    /**
     * Fetch recent fills for order
     * Placeholder: simulates fill fetch
     */
    fetchFills(exchangeOrderId: string): Promise<OrderFill[]>;
    /**
     * Validate order against exchange filters
     * Placeholder: simulates filter validation
     */
    validateOrder(order: OrderRecord): Promise<{
        valid: boolean;
        reason?: string;
    }>;
}
//# sourceMappingURL=exchangeAdapter.d.ts.map