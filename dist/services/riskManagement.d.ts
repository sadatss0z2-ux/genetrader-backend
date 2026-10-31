export interface RiskSettings {
    riskPerTrade: number;
    maxPositionSize: number;
    autoTakeProfit: boolean;
    takeProfitPercent: number;
    autoStopLoss: boolean;
    stopLossPercent: number;
    maxOpenTrades: number;
}
export declare function getRiskSettings(userId: number): Promise<RiskSettings>;
export declare function updateRiskSettings(userId: number, settings: Partial<RiskSettings>): Promise<void>;
export declare function validateTrade(userId: number, symbol: string, quantity: number, price: number): Promise<{
    valid: boolean;
    reason?: string;
}>;
//# sourceMappingURL=riskManagement.d.ts.map