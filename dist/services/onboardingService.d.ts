export declare const OBSERVER_DISCLOSURE_VERSION = "observer-v1";
export interface OnboardingData {
    accountSize: number;
    accountSizeCurrency: string;
    binanceApiKey: string;
    binanceApiSecret: string;
    riskSettings?: {
        maxPositionSize: number;
        maxOpenTrades: number;
    };
}
export declare function completeObserverOnboarding(userId: number, disclosureVersion: string, accepted: boolean, ipAddress?: string, userAgent?: string): Promise<{
    success: boolean;
    message: string;
}>;
export declare function completeOnboarding(userId: number, data: OnboardingData): Promise<{
    success: boolean;
    message: string;
}>;
export declare function getOnboardingStatus(userId: number): Promise<{
    completed: boolean;
    observerMode: boolean;
    accountSize?: number;
    exchangeConnected: boolean;
}>;
/**
 * @internal
 * Decrypts and returns user's Binance API keys.
 * WARNING: This function is for server-side service calls only.
 * It must NEVER be exposed via an HTTP route or returned to a client.
 * Use only in trusted server-side contexts (e.g., exchange adapter initialization).
 */
export declare function getDecryptedApiKeys(userId: number): Promise<{
    apiKey: string;
    apiSecret: string;
}>;
export declare function updateObserverMode(userId: number, observerMode: boolean): Promise<void>;
//# sourceMappingURL=onboardingService.d.ts.map