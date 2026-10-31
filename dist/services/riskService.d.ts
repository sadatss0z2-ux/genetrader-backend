/**
 * Risk Gate Service (P4-02)
 * Server-authoritative hard risk checks and risk assessment record.
 * Integrates with decision service for rule evaluation.
 */
import { EventEmitter } from 'events';
import { RiskGateRequest, RiskGateResponse, RiskCheckConfig, RiskAssessmentRecord, RiskPolicyConfig } from '../models/risk';
import { DecisionService } from './decisionService';
export interface RiskGateOptions {
    decisionService?: DecisionService;
}
export declare class RiskGateService extends EventEmitter {
    private decisionService?;
    private riskCheckConfigs;
    private userRiskPolicies;
    private globalHaltActive;
    private symbolHalts;
    private assessmentRecords;
    constructor(options?: RiskGateOptions);
    /**
     * Initialize default risk check configurations
     */
    private initializeDefaultRiskChecks;
    /**
     * Register a risk check configuration
     */
    registerRiskCheckConfig(config: RiskCheckConfig): void;
    /**
     * Set user risk policy
     */
    setUserRiskPolicy(policy: RiskPolicyConfig): void;
    /**
     * Get user risk policy
     */
    getUserRiskPolicy(userId: number): RiskPolicyConfig | null;
    /**
     * Set global halt state
     */
    setGlobalHalt(halted: boolean): void;
    /**
     * Set symbol halt state
     */
    setSymbolHalt(symbol: string, halted: boolean): void;
    /**
     * Perform risk gate evaluation
     */
    evaluateRiskGate(request: RiskGateRequest): Promise<RiskGateResponse>;
    private recordAssessment;
    /**
     * Evaluate a single risk check
     */
    private evaluateRiskCheck;
    /**
     * Check if symbol is enabled in user policy
     */
    private checkSymbolEnabled;
    /**
     * Check observer state (placeholder - would check entitlement service)
     */
    private checkObserverState;
    /**
     * Check global halt
     */
    private checkGlobalHalt;
    /**
     * Check per-symbol halt
     */
    private checkPerSymbolHalt;
    /**
     * Check max exposure
     */
    private checkMaxExposure;
    /**
     * Check max position
     */
    private checkMaxPosition;
    /**
     * Check available balance
     */
    private checkAvailableBalance;
    /**
     * Check daily loss limit
     */
    private checkDailyLossLimit;
    /**
     * Check daily trade limit
     */
    private checkDailyTradeLimit;
    /**
     * Check volatility (placeholder)
     */
    private checkVolatility;
    /**
     * Check spread (placeholder)
     */
    private checkSpread;
    /**
     * Check liquidity (placeholder)
     */
    private checkLiquidity;
    /**
     * Check min notional (placeholder)
     */
    private checkMinNotional;
    /**
     * Check exchange filters (placeholder)
     */
    private checkExchangeFilters;
    /**
     * Check stale data (placeholder)
     */
    private checkStaleData;
    /**
     * Check idempotency (placeholder)
     */
    private checkIdempotency;
    getAssessmentRecords(userId?: number): RiskAssessmentRecord[];
    getVetoRecords(userId?: number): RiskAssessmentRecord[];
    /**
     * Reset all in-memory state (useful for test isolation)
     */
    reset(): void;
}
export declare const riskGateService: RiskGateService;
//# sourceMappingURL=riskService.d.ts.map