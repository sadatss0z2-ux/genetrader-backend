/**
 * Decision and Risk Infrastructure Models (P4-01)
 * Versioned strategy/policy inputs, decision candidates, and rule-level results.
 */
/**
 * Feature snapshot - computed from market events
 * Versioned by strategy version for deterministic replay
 */
export interface FeatureSnapshot {
    id: string;
    userId: number;
    symbol: string;
    strategyVersion: string;
    computedAt: number;
    marketEventId: string;
    price: string;
    volume24h: string;
    volatility: string;
    spread: string;
    liquidity: string;
    lookbackComplete: boolean;
    lookbackWindowMs: number;
    schemaVersion: string;
    features: Record<string, string | number | boolean>;
}
/**
 * Regime result - classification of market state
 * Computed from feature snapshot and strategy version
 */
export interface RegimeResult {
    id: string;
    userId: number;
    symbol: string;
    strategyVersion: string;
    featureSnapshotId: string;
    computedAt: number;
    regime: string;
    confidence: number;
    eligible: boolean;
    regimeFlags: string[];
    lookbackStart: number;
    lookbackEnd: number;
}
/**
 * Decision candidate - proposed action from strategy
 * Independent signal rules captured individually
 */
export interface DecisionCandidate {
    id: string;
    userId: number;
    symbol: string;
    strategyVersion: string;
    regimeResultId: string;
    featureSnapshotId: string;
    proposedAt: number;
    action: 'BUY' | 'SELL' | 'HOLD' | 'CLOSE_ALL';
    quantity: string;
    price: string | null;
    orderType: 'MARKET' | 'LIMIT' | 'STOP_LIMIT';
    signalRules: SignalRule[];
    reproducibleFrom: {
        marketEventId: string;
        strategyVersion: string;
    };
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
    approvedAt: number | null;
    rejectedAt: number | null;
    rejectionReason: string | null;
}
/**
 * Signal rule - individual rule contribution to decision
 */
export interface SignalRule {
    ruleId: string;
    ruleName: string;
    ruleVersion: string;
    result: boolean;
    weight: number;
    metadata: Record<string, unknown>;
}
/**
 * Decision rule result - rule-level evaluation for risk gate
 * Immutable append-only records
 */
export interface DecisionRuleResult {
    id: string;
    userId: number;
    decisionCandidateId: string;
    ruleId: string;
    ruleName: string;
    ruleVersion: string;
    evaluatedAt: number;
    result: 'PASS' | 'FAIL' | 'WARN';
    reason: string;
    ruleType: 'SYMBOL_ENABLED' | 'OBSERVER_STATE' | 'GLOBAL_HALT' | 'PER_SYMBOL_HALT' | 'MAX_EXPOSURE' | 'MAX_POSITION' | 'AVAILABLE_BALANCE' | 'DAILY_LOSS_LIMIT' | 'DAILY_TRADE_LIMIT' | 'VOLATILITY' | 'SPREAD' | 'LIQUIDITY' | 'MIN_NOTIONAL' | 'EXCHANGE_FILTERS' | 'STALE_DATA' | 'IDEMPOTENCY';
    context: Record<string, unknown>;
    evaluatedBy: string;
}
/**
 * Risk assessment - comprehensive risk evaluation
 * Linked to decision candidate and rule results
 */
export interface RiskAssessment {
    id: string;
    userId: number;
    decisionCandidateId: string;
    assessedAt: number;
    authorized: boolean;
    authorizationId: string | null;
    vetoReason: string | null;
    maxExposure: string;
    currentExposure: string;
    availableBalance: string;
    dailyLoss: string;
    dailyLossLimit: string;
    dailyTradeCount: number;
    dailyTradeLimit: number;
    riskFlags: string[];
    ruleResultIds: string[];
}
//# sourceMappingURL=decision.d.ts.map