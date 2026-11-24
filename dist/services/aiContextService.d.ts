export interface AiMarketQuote {
    symbol: string;
    priceUsdt: number;
    change24hPct: number;
    source: 'Binance Spot live stream' | 'Binance Spot REST fallback';
    observedAt: string;
}
export interface AiPersonalContext {
    access: 'available' | 'not_connected' | 'temporarily_unavailable';
    environment: 'testnet';
    observedAt?: string;
    totalValueUsdt?: number;
    riskSettings?: {
        riskPerTradePct: number;
        maxPositionSizeUsdt: number;
        maxOpenTrades: number;
        autoTakeProfit: boolean;
        takeProfitPct: number;
        autoStopLoss: boolean;
        stopLossPct: number;
    };
    holdings: Array<{
        asset: string;
        quantity: number;
        priceUsdt?: number;
        valueUsdt?: number;
    }>;
    recentOrders: Array<{
        symbol: string;
        side: 'BUY' | 'SELL';
        type: string;
        quantity: number;
        priceUsdt: number;
        status: string;
        placedAt: string;
    }>;
}
export interface AiContextSnapshot {
    generatedAt: string;
    appMode: 'personal' | 'demo';
    market: {
        status: 'available' | 'partially_available' | 'unavailable';
        source: string;
        observedAt: string;
        quotes: AiMarketQuote[];
    };
    personal?: AiPersonalContext;
}
export declare function buildAiContext(userId: number | undefined, question: string, appMode?: 'personal' | 'demo', preferredAssets?: string[]): Promise<AiContextSnapshot>;
//# sourceMappingURL=aiContextService.d.ts.map