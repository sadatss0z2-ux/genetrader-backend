/**
 * Environment Configuration & Live/Testnet Separation (P6-01)
 *
 * Establishes strict separation between Binance Testnet and Binance Live environments.
 * Live execution is fail-closed by default and strictly prohibited unless all canary
 * and operator release approvals are satisfied.
 */
export type ExecutionEnvironment = 'testnet' | 'live';
export interface EnvironmentConfig {
    environment: ExecutionEnvironment;
    isTestnet: boolean;
    isLive: boolean;
    binanceTestnet: boolean;
    binanceBaseUrl: string;
    binanceWsBaseUrl: string;
    liveTradingAcknowledged: boolean;
    canaryCohortEnabled: boolean;
    maxCanaryOrderNotionalUsd: number;
    maxCanaryAccountBalanceUsd: number;
    reauthTtlSeconds: number;
    isLiveApproved: boolean;
}
export declare const BINANCE_TESTNET_HTTP_URL = "https://testnet.binance.vision";
export declare const BINANCE_TESTNET_WS_URL = "wss://testnet.binance.vision/ws-api/v3";
export declare const BINANCE_LIVE_HTTP_URL = "https://api.binance.com";
export declare const BINANCE_LIVE_WS_URL = "wss://stream.binance.com:9443/ws";
export declare const DEFAULT_CANARY_MAX_NOTIONAL_USD = 50;
export declare const DEFAULT_CANARY_MAX_BALANCE_USD = 500;
export declare const DEFAULT_REAUTH_TTL_SECONDS = 300;
/**
 * Reads and validates current environment configuration from environment variables.
 */
export declare function getEnvironmentConfig(): EnvironmentConfig;
/**
 * Asserts that live execution is permitted. Throws fail-closed error if not permitted.
 */
export declare function assertLiveExecutionAllowed(params?: {
    userId?: number;
    notionalUsd?: number;
    isCanaryMember?: boolean;
}): void;
//# sourceMappingURL=environment.d.ts.map