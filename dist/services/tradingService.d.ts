export interface Trade {
    id: number;
    userId: number;
    symbol: string;
    side: 'BUY' | 'SELL';
    type: 'MARKET' | 'LIMIT' | 'STOP_LIMIT';
    quantity: number;
    price: number;
    status: string;
    binanceOrderId: number | null;
    timestamp: Date;
}
export interface PortfolioPosition {
    id: number;
    symbol: string;
    quantity: number;
    averageBuyPrice: number;
    currentPrice: number;
    unrealizedPnl: number;
    realizedPnl: number;
}
export declare function executeTrade(userId: number, symbol: string, side: 'BUY' | 'SELL', type: 'MARKET' | 'LIMIT' | 'STOP_LIMIT', quantity: number, price?: number, stopPrice?: number): Promise<Trade>;
export declare function getUserPortfolio(userId: number): Promise<PortfolioPosition[]>;
export declare function getUserTrades(userId: number, limit?: number, offset?: number): Promise<Trade[]>;
export declare function syncBalances(userId: number): Promise<void>;
export declare function cancelOrder(userId: number, tradeId: number): Promise<Trade>;
export declare function closePosition(userId: number, symbol: string): Promise<Trade>;
export declare function setStopTakeProfit(userId: number, symbol: string, stopLossPrice?: number, takeProfitPrice?: number): Promise<void>;
export declare function flattenAllPositions(userId: number): Promise<Trade[]>;
declare const _default: {
    executeTrade: typeof executeTrade;
    getUserPortfolio: typeof getUserPortfolio;
    getUserTrades: typeof getUserTrades;
    syncBalances: typeof syncBalances;
    cancelOrder: typeof cancelOrder;
    closePosition: typeof closePosition;
    setStopTakeProfit: typeof setStopTakeProfit;
    flattenAllPositions: typeof flattenAllPositions;
};
export default _default;
//# sourceMappingURL=tradingService.d.ts.map