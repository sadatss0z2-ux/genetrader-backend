import { MarketDataService } from './marketDataService';
export type PriceAlertDirection = 'ABOVE' | 'BELOW';
export type PriceAlertFrequency = 'ONCE' | 'RECURRING';
export type PriceAlertStatus = 'ACTIVE' | 'TRIGGERED' | 'CANCELLED';
export interface PriceAlert {
    id: string;
    userId: number;
    symbol: string;
    direction: PriceAlertDirection;
    targetPrice: string;
    frequency: PriceAlertFrequency;
    note: string | null;
    status: PriceAlertStatus;
    triggerCount: number;
    lastTriggeredAt: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface PriceAlertEvent {
    id: string;
    alertId: string;
    symbol: string;
    direction: PriceAlertDirection;
    targetPrice: string;
    triggerPrice: string;
    note: string | null;
    triggeredAt: string;
    notificationStatus: 'PENDING' | 'SENT' | 'SKIPPED' | 'FAILED';
}
export interface CreatePriceAlertInput {
    symbol: string;
    direction: PriceAlertDirection;
    targetPrice: string;
    frequency: PriceAlertFrequency;
    note?: string | null;
}
export interface UpdatePriceAlertInput {
    direction: PriceAlertDirection;
    targetPrice: string;
    frequency: PriceAlertFrequency;
    note?: string | null;
}
type SymbolSubscriber = (symbols: string[]) => void;
/**
 * Keeps the alert decision point on the server-side public market feed. This means
 * alerts remain active when a device is backgrounded or the app is not running.
 */
export declare class PriceAlertService {
    private readonly marketData;
    private readonly subscribeSymbols?;
    private readonly activeBySymbol;
    private readonly lastPriceBySymbol;
    private readonly tickerQueues;
    private started;
    constructor(marketData: MarketDataService, subscribeSymbols?: SymbolSubscriber | undefined);
    start(): Promise<void>;
    stop(): void;
    listForUser(userId: number, symbol?: string): Promise<PriceAlert[]>;
    create(userId: number, input: CreatePriceAlertInput): Promise<PriceAlert>;
    update(userId: number, id: string, input: UpdatePriceAlertInput): Promise<PriceAlert | null>;
    cancel(userId: number, id: string): Promise<PriceAlert | null>;
    listEventsForUser(userId: number, alertId: string): Promise<PriceAlertEvent[]>;
    private readonly onTicker;
    private evaluateTicker;
    private trigger;
    private cacheAlert;
    private removeCachedAlert;
    private requestSymbols;
}
export {};
//# sourceMappingURL=priceAlertService.d.ts.map