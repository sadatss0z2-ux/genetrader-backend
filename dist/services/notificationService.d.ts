type PriceAlertNotification = {
    alertId: string;
    symbol: string;
    direction: 'ABOVE' | 'BELOW';
    targetPrice: string;
    triggerPrice: string;
    note: string | null;
};
type AlertDeliveryStatus = 'SENT' | 'SKIPPED' | 'FAILED';
export declare function sendAdminNotification(userId: number, message: string): Promise<void>;
export declare function notifyTradeExecuted(userId: number, trade: {
    id: number;
    symbol: string;
    side: 'BUY' | 'SELL';
    price: number;
}): Promise<void>;
export declare function notifyPriceAlertTriggered(userId: number, alert: PriceAlertNotification): Promise<AlertDeliveryStatus>;
export declare function notifyCopierEvent(event: {
    eventId: string;
    message: string;
}): Promise<void>;
export declare function notifyOnboardingCompleted(userId: number, accountSize: number): Promise<void>;
export declare function notifyObserverOnboardingCompleted(): Promise<void>;
export declare function notifyObserverModeChange(userId: number, observerMode: boolean): Promise<void>;
export interface TradePlanNotificationPayload {
    planId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    state: 'POSITION_PROTECTED' | 'TRAILING_ACTIVE' | 'CLOSED';
    orderType: string;
    entryPrice?: number;
    takeProfitPrice?: number;
    stopLossPrice?: number;
    trailingStopPrice?: number;
    trailingPercentage?: number;
    exitPrice?: number;
    pnl?: number;
    exitReason?: string;
}
export declare function notifyTradePlanStatusChanged(userId: number, plan: TradePlanNotificationPayload): Promise<'SENT' | 'SKIPPED' | 'FAILED'>;
export interface CopierAccountFailureDetails {
    status: string;
    errorCode?: string | null;
    errorMessage?: string | null;
}
export declare function resetCopierAccountFailureCooldown(accountRef: string): void;
export declare function resetAllCopierAccountFailureCooldownsForTesting(): void;
export declare function notifyCopierAccountFailure(accountRef: string, details: CopierAccountFailureDetails): Promise<{
    sent: boolean;
    reason?: string;
}>;
export {};
//# sourceMappingURL=notificationService.d.ts.map