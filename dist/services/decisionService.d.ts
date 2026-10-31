/**
 * Decision Service (P4-01)
 * Versioned strategy/policy inputs, decision candidates, and rule-level results.
 * Supports deterministic replay with golden dataset output.
 */
import { EventEmitter } from 'events';
import { FeatureSnapshot, RegimeResult, DecisionCandidate, DecisionRuleResult, RiskAssessment, SignalRule } from '../models/decision';
import { NormalizedMarketEvent } from '../models/marketEvent';
export interface StrategyVersion {
    version: string;
    schemaVersion: string;
    createdAt: number;
    isActive: boolean;
    description?: string;
}
export interface FeatureConfig {
    lookbackWindowMs: number;
    indicators: string[];
    schemaVersion: string;
    minLookbackEvents?: number;
}
export interface RegimeConfig {
    eligibleRegimes: string[];
    confidenceThreshold: number;
    schemaVersion: string;
    volatilityThreshold?: number;
    trendThreshold?: number;
}
export interface DecisionConfig {
    strategyVersion: string;
    featureConfig: FeatureConfig;
    regimeConfig: RegimeConfig;
    signalRules: SignalRule[];
}
export interface ReplayDataset {
    strategyVersion: string;
    featureSnapshots: FeatureSnapshot[];
    regimeResults: RegimeResult[];
    decisionCandidates: DecisionCandidate[];
    ruleResults: DecisionRuleResult[];
    riskAssessments: RiskAssessment[];
    generatedAt: number;
    datasetChecksum?: string;
}
export interface ReplayOptions {
    userId: number;
    symbol: string;
    strategyVersion: string;
    deterministicIds?: boolean;
    riskPolicy?: {
        enabledSymbols?: string[];
        isObserver?: boolean;
        globalHaltActive?: boolean;
        symbolHaltActive?: boolean;
        maxExposure?: string;
        maxPosition?: string;
        availableBalance?: string;
        dailyLoss?: string;
        dailyLossLimit?: string;
        dailyTradeCount?: number;
        dailyTradeLimit?: number;
        volatilityThreshold?: string;
        spreadThreshold?: string;
        liquidityThreshold?: string;
        minNotional?: string;
    };
}
export declare class DecisionService extends EventEmitter {
    private strategyVersions;
    private activeStrategyVersion;
    private decisionConfigs;
    private featureSnapshots;
    private regimeResults;
    private decisionCandidates;
    private decisionRuleResults;
    private riskAssessments;
    private rollingHistory;
    constructor();
    /**
     * Register a strategy version
     */
    registerStrategyVersion(version: StrategyVersion): void;
    /**
     * Get active strategy version
     */
    getActiveStrategyVersion(): string | null;
    /**
     * Get all registered strategy versions
     */
    getStrategyVersions(): StrategyVersion[];
    /**
     * Register a decision configuration for a strategy version
     */
    registerDecisionConfig(config: DecisionConfig): void;
    /**
     * Get decision configuration for a strategy version
     */
    getDecisionConfig(strategyVersion: string): DecisionConfig | undefined;
    /**
     * Compute feature snapshot from market event
     */
    computeFeatureSnapshot(userId: number, symbol: string, marketEvent: NormalizedMarketEvent, features?: Record<string, string | number | boolean>, detSuffix?: string, timestampOverride?: number): FeatureSnapshot | null;
    /**
     * Compute regime result from feature snapshot
     */
    computeRegimeResult(userId: number, symbol: string, featureSnapshot: FeatureSnapshot, detSuffix?: string, timestampOverride?: number): RegimeResult | null;
    /**
     * Create decision candidate from regime and features
     */
    createDecisionCandidate(userId: number, symbol: string, regimeResult: RegimeResult, featureSnapshot: FeatureSnapshot, action: 'BUY' | 'SELL' | 'HOLD' | 'CLOSE_ALL', quantity: string, price?: string | null, orderType?: 'MARKET' | 'LIMIT' | 'STOP_LIMIT', detSuffix?: string, timestampOverride?: number): DecisionCandidate;
    /**
     * Evaluate rule for decision candidate
     */
    evaluateRule(userId: number, decisionCandidateId: string, ruleId: string, ruleName: string, ruleVersion: string, ruleType: DecisionRuleResult['ruleType'], context: Record<string, unknown>, evaluatedBy?: string): DecisionRuleResult;
    /**
     * Create risk assessment for decision candidate
     */
    createRiskAssessment(userId: number, decisionCandidateId: string, authorized: boolean, authorizationId: string | null, vetoReason: string | null, riskMetrics: {
        maxExposure: string;
        currentExposure: string;
        availableBalance: string;
        dailyLoss: string;
        dailyLossLimit: string;
        dailyTradeCount: number;
        dailyTradeLimit: number;
    }, riskFlags: string[], ruleResultIds: string[], detSuffix?: string, timestampOverride?: number): RiskAssessment;
    /**
     * Generate replay dataset for deterministic replay
     * Exports all decision artifacts for a given strategy version sorted deterministically
     */
    generateReplayDataset(strategyVersion: string): ReplayDataset;
    /**
     * Execute deterministic replay of market events
     */
    replayMarketEvents(events: NormalizedMarketEvent[], options: ReplayOptions): ReplayDataset;
    registerFeatureSnapshot(snapshot: FeatureSnapshot): void;
    registerRegimeResult(result: RegimeResult): void;
    getFeatureSnapshot(id: string): FeatureSnapshot | undefined;
    getFeatureSnapshots(filter?: {
        userId?: number;
        symbol?: string;
        strategyVersion?: string;
    }): FeatureSnapshot[];
    getRegimeResult(id: string): RegimeResult | undefined;
    getRegimeResults(filter?: {
        userId?: number;
        symbol?: string;
        strategyVersion?: string;
    }): RegimeResult[];
    getDecisionCandidate(id: string): DecisionCandidate | undefined;
    getDecisionCandidates(filter?: {
        userId?: number;
        symbol?: string;
        strategyVersion?: string;
        status?: string;
    }): DecisionCandidate[];
    getDecisionRuleResults(candidateId: string): DecisionRuleResult[];
    getRiskAssessment(candidateId: string): RiskAssessment | undefined;
    /**
     * Extract price from market event
     */
    private extractPrice;
    /**
     * Extract quantity from market event
     */
    private extractQuantity;
    /**
     * Extract spread from event
     */
    private extractSpread;
    /**
     * Classify regime based on features
     */
    private classifyRegime;
    /**
     * Reset all in-memory state (useful for test isolation)
     */
    reset(): void;
}
export declare const decisionService: DecisionService;
//# sourceMappingURL=decisionService.d.ts.map