/**
 * Risk Gate Models (P4-02)
 * Server-authoritative hard risk checks and risk assessment records.
 */
/**
 * Risk check result - result of a single risk check
 */
export interface RiskCheckResult {
    ruleId: string;
    ruleName: string;
    ruleType: 'SYMBOL_ENABLED' | 'OBSERVER_STATE' | 'GLOBAL_HALT' | 'PER_SYMBOL_HALT' | 'MAX_EXPOSURE' | 'MAX_POSITION' | 'AVAILABLE_BALANCE' | 'DAILY_LOSS_LIMIT' | 'DAILY_TRADE_LIMIT' | 'VOLATILITY' | 'SPREAD' | 'LIQUIDITY' | 'MIN_NOTIONAL' | 'EXCHANGE_FILTERS' | 'STALE_DATA' | 'IDEMPOTENCY';
    result: 'PASS' | 'FAIL' | 'WARN';
    reason: string;
    context: Record<string, unknown>;
    evaluatedAt: number;
}
/**
 * Risk gate request - request to risk gate for authorization
 */
export interface RiskGateRequest {
    userId: number;
    symbol: string;
    action: 'BUY' | 'SELL' | 'CLOSE_ALL';
    quantity: string;
    price: string | null;
    orderType: 'MARKET' | 'LIMIT' | 'STOP_LIMIT';
    decisionCandidateId: string;
    context: {
        currentExposure: string;
        availableBalance: string;
        dailyLoss: string;
        dailyTradeCount: number;
        marketEventId?: string;
    };
}
/**
 * Risk gate response - response from risk gate
 */
export interface RiskGateResponse {
    authorized: boolean;
    authorizationId: string | null;
    vetoReason: string | null;
    riskCheckResults: RiskCheckResult[];
    assessedAt: number;
}
/**
 * Risk check configuration - configuration for a risk check rule
 */
export interface RiskCheckConfig {
    ruleId: string;
    ruleName: string;
    ruleType: RiskCheckResult['ruleType'];
    enabled: boolean;
    severity: 'BLOCKING' | 'WARNING' | 'INFO';
    parameters: Record<string, unknown>;
}
/**
 * Risk assessment record - persisted risk assessment
 */
export interface RiskAssessmentRecord {
    id: string;
    userId: number;
    decisionCandidateId: string;
    riskGateRequestId: string;
    authorized: boolean;
    authorizationId: string | null;
    vetoReason: string | null;
    riskCheckResults: RiskCheckResult[];
    assessedAt: number;
    createdAt: number;
}
/**
 * Authorization record - server-generated authorization ID tracking
 */
export interface AuthorizationRecord {
    id: string;
    authorizationId: string;
    userId: number;
    decisionCandidateId: string;
    grantedAt: number;
    expiresAt: number | null;
    used: boolean;
    usedAt: number | null;
    createdAt: number;
}
/**
 * Risk policy configuration - user-specific risk policy
 */
export interface RiskPolicyConfig {
    userId: number;
    maxExposure: string;
    maxPosition: string;
    dailyLossLimit: string;
    dailyTradeLimit: number;
    volatilityThreshold: string;
    spreadThreshold: string;
    liquidityThreshold: string;
    minNotional: string;
    enabledSymbols: string[];
    globalHaltActive: boolean;
    symbolHalts: Record<string, boolean>;
    createdAt: number;
    updatedAt: number;
}
//# sourceMappingURL=risk.d.ts.map