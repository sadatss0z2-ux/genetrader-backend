/**
 * Generated TypeScript client from OpenAPI 3.1 spec (P1-01)
 * Strongly-typed client for the GeneTrader API
 */
export interface UserProfile {
    id: number;
    email: string;
    displayName: string | null;
    photoUrl: string | null;
    referralCode: string;
    plan: 'observer' | 'annual' | 'monthly' | 'master';
    createdAt: string;
    lastLoginAt: string | null;
    isActive: boolean;
}
export interface UserSettings {
    id: number;
    userId: number;
    notificationsEnabled: boolean;
    biometricEnabled: boolean;
    theme: string;
    createdAt: string;
    updatedAt: string;
}
export interface UpdateProfileRequest {
    displayName?: string;
    photoUrl?: string;
}
export interface UpdateSettingsRequest {
    notificationsEnabled?: boolean;
    biometricEnabled?: boolean;
    theme?: string;
}
export interface ExchangePermissions {
    enableSpotAndMarginTrading: boolean;
    enableWithdrawals: boolean;
    enableInternalTransfer: boolean;
    permitsTrading: boolean;
    isNonCustodialSafe: boolean;
}
export interface ExchangeConnectionStatus {
    connected: boolean;
    environment: 'testnet' | 'live' | 'none';
    keyStatus: 'active' | 'revoked' | 'expired' | 'unconfigured';
    permissions?: ExchangePermissions;
}
export interface GlobalHalt {
    userId: number;
    isHalted: boolean;
    reason: string | null;
    updatedAt: string;
}
export interface EntitlementsResponse {
    schemaVersion: string;
    serverTime: string;
    role: 'none' | 'observer' | 'subscriber' | 'closeout_only' | 'revoked';
    observer: {
        active: boolean;
        startsAt: string | null;
        expiresAt: string | null;
    };
    subscription: {
        active: boolean;
        paidThroughAt: string | null;
    };
}
export interface ErrorResponse {
    error: string;
    code?: string;
    status: number;
    request_id: string;
    timestamp: string;
    details?: unknown;
    path?: string;
    method?: string;
    stack?: string;
}
export interface ApiClientConfig {
    baseUrl: string;
    apiKey?: string;
    timeout?: number;
}
export declare class GeneTraderApiClient {
    private config;
    constructor(config: ApiClientConfig);
    private request;
    /**
     * GET /api/users/profile
     */
    getUserProfile(): Promise<{
        profile: UserProfile;
    }>;
    /**
     * PUT /api/users/profile
     */
    updateUserProfile(data: UpdateProfileRequest): Promise<{
        profile: UserProfile;
    }>;
    /**
     * GET /api/users/settings
     */
    getUserSettings(): Promise<{
        settings: UserSettings;
    }>;
    /**
     * PUT /api/users/settings
     */
    updateUserSettings(data: UpdateSettingsRequest): Promise<{
        settings: UserSettings;
    }>;
    /**
     * GET /api/binance/connection-status
     */
    getExchangeConnectionStatus(): Promise<ExchangeConnectionStatus>;
    /**
     * POST /api/binance/validate-keys
     */
    validateExchangeKeys(keys: {
        apiKey: string;
        apiSecret: string;
    }): Promise<{
        valid: boolean;
        permissions: ExchangePermissions;
    }>;
    /**
     * GET /api/policy/halt
     */
    getGlobalHalt(): Promise<GlobalHalt>;
    /**
     * POST /api/policy/halt
     */
    setGlobalHalt(data: {
        isHalted: boolean;
        reason?: string;
    }): Promise<GlobalHalt>;
    /**
     * GET /v1/me/entitlements
     */
    getEntitlements(): Promise<EntitlementsResponse>;
    /**
     * POST /v1/observer-access-requests
     */
    requestObserverAccess(data: {
        consentVersion: string;
        idempotencyKey: string;
    }): Promise<{
        status: string;
    }>;
}
//# sourceMappingURL=index.d.ts.map