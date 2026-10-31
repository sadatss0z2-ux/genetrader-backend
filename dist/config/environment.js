"use strict";
/**
 * Environment Configuration & Live/Testnet Separation (P6-01)
 *
 * Establishes strict separation between Binance Testnet and Binance Live environments.
 * Live execution is fail-closed by default and strictly prohibited unless all canary
 * and operator release approvals are satisfied.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_REAUTH_TTL_SECONDS = exports.DEFAULT_CANARY_MAX_BALANCE_USD = exports.DEFAULT_CANARY_MAX_NOTIONAL_USD = exports.BINANCE_LIVE_WS_URL = exports.BINANCE_LIVE_HTTP_URL = exports.BINANCE_TESTNET_WS_URL = exports.BINANCE_TESTNET_HTTP_URL = void 0;
exports.getEnvironmentConfig = getEnvironmentConfig;
exports.assertLiveExecutionAllowed = assertLiveExecutionAllowed;
exports.BINANCE_TESTNET_HTTP_URL = 'https://testnet.binance.vision';
exports.BINANCE_TESTNET_WS_URL = 'wss://testnet.binance.vision/ws-api/v3';
exports.BINANCE_LIVE_HTTP_URL = 'https://api.binance.com';
exports.BINANCE_LIVE_WS_URL = 'wss://stream.binance.com:9443/ws';
exports.DEFAULT_CANARY_MAX_NOTIONAL_USD = 50.0;
exports.DEFAULT_CANARY_MAX_BALANCE_USD = 500.0;
exports.DEFAULT_REAUTH_TTL_SECONDS = 300; // 5 minutes
/**
 * Reads and validates current environment configuration from environment variables.
 */
function getEnvironmentConfig() {
    const executionMode = (process.env.EXCHANGE_EXECUTION_MODE || 'testnet').toLowerCase();
    const binanceTestnetEnv = process.env.BINANCE_TESTNET !== 'false'; // defaults true for safety
    const liveTradingAck = process.env.LIVE_TRADING_ACKNOWLEDGED === 'true';
    const operatorCanaryApproval = process.env.OPERATOR_CANARY_APPROVAL === 'true';
    const canaryEnabled = process.env.CANARY_COHORT_ENABLED !== 'false';
    // Live execution mode requires:
    // 1. Explicit EXCHANGE_EXECUTION_MODE === 'live'
    // 2. BINANCE_TESTNET explicitly set to 'false'
    // 3. Explicit operator canary approval
    // 4. Explicit user/operator live trading acknowledgement
    const isLiveConfigured = executionMode === 'live' && !binanceTestnetEnv;
    const isLiveApproved = isLiveConfigured && liveTradingAck && operatorCanaryApproval;
    const environment = isLiveApproved ? 'live' : 'testnet';
    const isTestnet = environment === 'testnet';
    const isLive = environment === 'live';
    const binanceBaseUrl = isLive ? exports.BINANCE_LIVE_HTTP_URL : exports.BINANCE_TESTNET_HTTP_URL;
    const binanceWsBaseUrl = isLive ? exports.BINANCE_LIVE_WS_URL : exports.BINANCE_TESTNET_WS_URL;
    const maxCanaryOrderNotionalUsd = parseFloat(process.env.CANARY_MAX_NOTIONAL_USD || String(exports.DEFAULT_CANARY_MAX_NOTIONAL_USD));
    const maxCanaryAccountBalanceUsd = parseFloat(process.env.CANARY_MAX_BALANCE_USD || String(exports.DEFAULT_CANARY_MAX_BALANCE_USD));
    const reauthTtlSeconds = parseInt(process.env.REAUTH_TTL_SECONDS || String(exports.DEFAULT_REAUTH_TTL_SECONDS), 10);
    return {
        environment,
        isTestnet,
        isLive,
        binanceTestnet: isTestnet,
        binanceBaseUrl,
        binanceWsBaseUrl,
        liveTradingAcknowledged: liveTradingAck,
        canaryCohortEnabled: canaryEnabled,
        maxCanaryOrderNotionalUsd: isNaN(maxCanaryOrderNotionalUsd) ? exports.DEFAULT_CANARY_MAX_NOTIONAL_USD : maxCanaryOrderNotionalUsd,
        maxCanaryAccountBalanceUsd: isNaN(maxCanaryAccountBalanceUsd) ? exports.DEFAULT_CANARY_MAX_BALANCE_USD : maxCanaryAccountBalanceUsd,
        reauthTtlSeconds: isNaN(reauthTtlSeconds) ? exports.DEFAULT_REAUTH_TTL_SECONDS : reauthTtlSeconds,
        isLiveApproved,
    };
}
/**
 * Asserts that live execution is permitted. Throws fail-closed error if not permitted.
 */
function assertLiveExecutionAllowed(params) {
    const config = getEnvironmentConfig();
    if (!config.isLive) {
        throw new Error(`Live execution rejected: system is running in ${config.environment.toUpperCase()} mode. Real money operations are strictly blocked.`);
    }
    if (!config.isLiveApproved) {
        throw new Error('Live execution rejected: operator canary approval or live trading acknowledgement is missing. System fails closed.');
    }
    if (config.canaryCohortEnabled && params) {
        if (params.isCanaryMember === false) {
            throw new Error('Live execution rejected: user is not an approved member of the live canary cohort.');
        }
        if (params.notionalUsd !== undefined && params.notionalUsd > config.maxCanaryOrderNotionalUsd) {
            throw new Error(`Live execution rejected: order notional $${params.notionalUsd.toFixed(2)} exceeds canary maximum of $${config.maxCanaryOrderNotionalUsd.toFixed(2)}.`);
        }
    }
}
//# sourceMappingURL=environment.js.map