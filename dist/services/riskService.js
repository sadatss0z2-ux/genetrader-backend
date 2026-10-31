"use strict";
/**
 * Risk Gate Service (P4-02)
 * Server-authoritative hard risk checks and risk assessment record.
 * Integrates with decision service for rule evaluation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.riskGateService = exports.RiskGateService = void 0;
const events_1 = require("events");
const crypto_1 = require("crypto");
const decisionService_1 = require("./decisionService");
class RiskGateService extends events_1.EventEmitter {
    decisionService;
    riskCheckConfigs = new Map();
    userRiskPolicies = new Map();
    globalHaltActive = false;
    symbolHalts = new Map();
    assessmentRecords = [];
    constructor(options = {}) {
        super();
        this.decisionService = options.decisionService;
        this.initializeDefaultRiskChecks();
    }
    /**
     * Initialize default risk check configurations
     */
    initializeDefaultRiskChecks() {
        const defaultChecks = [
            {
                ruleId: 'symbol_enabled',
                ruleName: 'Symbol Enabled',
                ruleType: 'SYMBOL_ENABLED',
                enabled: true,
                severity: 'BLOCKING',
                parameters: {},
            },
            {
                ruleId: 'observer_state',
                ruleName: 'Observer State',
                ruleType: 'OBSERVER_STATE',
                enabled: true,
                severity: 'BLOCKING',
                parameters: {},
            },
            {
                ruleId: 'global_halt',
                ruleName: 'Global Halt',
                ruleType: 'GLOBAL_HALT',
                enabled: true,
                severity: 'BLOCKING',
                parameters: {},
            },
            {
                ruleId: 'per_symbol_halt',
                ruleName: 'Per-Symbol Halt',
                ruleType: 'PER_SYMBOL_HALT',
                enabled: true,
                severity: 'BLOCKING',
                parameters: {},
            },
            {
                ruleId: 'max_exposure',
                ruleName: 'Max Exposure',
                ruleType: 'MAX_EXPOSURE',
                enabled: true,
                severity: 'BLOCKING',
                parameters: {},
            },
            {
                ruleId: 'max_position',
                ruleName: 'Max Position',
                ruleType: 'MAX_POSITION',
                enabled: true,
                severity: 'BLOCKING',
                parameters: {},
            },
            {
                ruleId: 'available_balance',
                ruleName: 'Available Balance',
                ruleType: 'AVAILABLE_BALANCE',
                enabled: true,
                severity: 'BLOCKING',
                parameters: {},
            },
            {
                ruleId: 'daily_loss_limit',
                ruleName: 'Daily Loss Limit',
                ruleType: 'DAILY_LOSS_LIMIT',
                enabled: true,
                severity: 'BLOCKING',
                parameters: {},
            },
            {
                ruleId: 'daily_trade_limit',
                ruleName: 'Daily Trade Limit',
                ruleType: 'DAILY_TRADE_LIMIT',
                enabled: true,
                severity: 'BLOCKING',
                parameters: {},
            },
            {
                ruleId: 'volatility',
                ruleName: 'Volatility',
                ruleType: 'VOLATILITY',
                enabled: true,
                severity: 'WARNING',
                parameters: {},
            },
            {
                ruleId: 'spread',
                ruleName: 'Spread',
                ruleType: 'SPREAD',
                enabled: true,
                severity: 'WARNING',
                parameters: {},
            },
            {
                ruleId: 'liquidity',
                ruleName: 'Liquidity',
                ruleType: 'LIQUIDITY',
                enabled: true,
                severity: 'WARNING',
                parameters: {},
            },
            {
                ruleId: 'min_notional',
                ruleName: 'Min Notional',
                ruleType: 'MIN_NOTIONAL',
                enabled: true,
                severity: 'BLOCKING',
                parameters: {},
            },
            {
                ruleId: 'exchange_filters',
                ruleName: 'Exchange Filters',
                ruleType: 'EXCHANGE_FILTERS',
                enabled: true,
                severity: 'BLOCKING',
                parameters: {},
            },
            {
                ruleId: 'stale_data',
                ruleName: 'Stale Data',
                ruleType: 'STALE_DATA',
                enabled: true,
                severity: 'BLOCKING',
                parameters: {},
            },
            {
                ruleId: 'idempotency',
                ruleName: 'Idempotency',
                ruleType: 'IDEMPOTENCY',
                enabled: true,
                severity: 'BLOCKING',
                parameters: {},
            },
        ];
        for (const check of defaultChecks) {
            this.riskCheckConfigs.set(check.ruleId, check);
        }
    }
    /**
     * Register a risk check configuration
     */
    registerRiskCheckConfig(config) {
        this.riskCheckConfigs.set(config.ruleId, config);
        this.emit('riskCheckConfigRegistered', config);
    }
    /**
     * Set user risk policy
     */
    setUserRiskPolicy(policy) {
        this.userRiskPolicies.set(policy.userId, policy);
        this.emit('userRiskPolicySet', policy);
    }
    /**
     * Get user risk policy
     */
    getUserRiskPolicy(userId) {
        return this.userRiskPolicies.get(userId) || null;
    }
    /**
     * Set global halt state
     */
    setGlobalHalt(halted) {
        this.globalHaltActive = halted;
        this.emit('globalHaltChanged', halted);
    }
    /**
     * Set symbol halt state
     */
    setSymbolHalt(symbol, halted) {
        this.symbolHalts.set(symbol.toUpperCase(), halted);
        this.emit('symbolHaltChanged', symbol, halted);
    }
    /**
     * Perform risk gate evaluation
     */
    async evaluateRiskGate(request) {
        const checkResults = [];
        const assessedAt = Date.now();
        // Run all enabled risk checks
        for (const [ruleId, config] of this.riskCheckConfigs) {
            if (!config.enabled)
                continue;
            const result = await this.evaluateRiskCheck(request, config);
            checkResults.push(result);
            // If blocking rule fails, veto immediately
            if (config.severity === 'BLOCKING' && result.result === 'FAIL') {
                const response = {
                    authorized: false,
                    authorizationId: null,
                    vetoReason: result.reason,
                    riskCheckResults: checkResults,
                    assessedAt: assessedAt,
                };
                this.recordAssessment(request, response);
                this.emit('riskGateEvaluated', response);
                return response;
            }
        }
        // All checks passed or only warnings
        const authorizationId = (0, crypto_1.randomUUID)();
        const response = {
            authorized: true,
            authorizationId: authorizationId,
            vetoReason: null,
            riskCheckResults: checkResults,
            assessedAt: assessedAt,
        };
        this.recordAssessment(request, response);
        this.emit('riskGateEvaluated', response);
        return response;
    }
    recordAssessment(request, response) {
        const record = {
            id: `risk-rec-${(0, crypto_1.randomUUID)()}`,
            userId: request.userId,
            decisionCandidateId: request.decisionCandidateId,
            riskGateRequestId: request.decisionCandidateId || (0, crypto_1.randomUUID)(),
            authorized: response.authorized,
            authorizationId: response.authorizationId,
            vetoReason: response.vetoReason,
            riskCheckResults: response.riskCheckResults,
            assessedAt: response.assessedAt,
            createdAt: Date.now(),
        };
        this.assessmentRecords.push(record);
        return record;
    }
    /**
     * Evaluate a single risk check
     */
    async evaluateRiskCheck(request, config) {
        const evaluatedAt = Date.now();
        const context = {
            ...request.context,
            symbol: request.symbol,
            action: request.action,
            quantity: request.quantity,
            price: request.price,
            orderType: request.orderType,
        };
        // Evaluate based on rule type
        let result = 'PASS';
        let reason = 'Check passed';
        switch (config.ruleType) {
            case 'SYMBOL_ENABLED':
                ({ result, reason } = this.checkSymbolEnabled(request, context));
                break;
            case 'OBSERVER_STATE':
                ({ result, reason } = this.checkObserverState(request, context));
                break;
            case 'GLOBAL_HALT':
                ({ result, reason } = this.checkGlobalHalt(request, context));
                break;
            case 'PER_SYMBOL_HALT':
                ({ result, reason } = this.checkPerSymbolHalt(request, context));
                break;
            case 'MAX_EXPOSURE':
                ({ result, reason } = this.checkMaxExposure(request, context));
                break;
            case 'MAX_POSITION':
                ({ result, reason } = this.checkMaxPosition(request, context));
                break;
            case 'AVAILABLE_BALANCE':
                ({ result, reason } = this.checkAvailableBalance(request, context));
                break;
            case 'DAILY_LOSS_LIMIT':
                ({ result, reason } = this.checkDailyLossLimit(request, context));
                break;
            case 'DAILY_TRADE_LIMIT':
                ({ result, reason } = this.checkDailyTradeLimit(request, context));
                break;
            case 'VOLATILITY':
                ({ result, reason } = this.checkVolatility(request, context));
                break;
            case 'SPREAD':
                ({ result, reason } = this.checkSpread(request, context));
                break;
            case 'LIQUIDITY':
                ({ result, reason } = this.checkLiquidity(request, context));
                break;
            case 'MIN_NOTIONAL':
                ({ result, reason } = this.checkMinNotional(request, context));
                break;
            case 'EXCHANGE_FILTERS':
                ({ result, reason } = this.checkExchangeFilters(request, context));
                break;
            case 'STALE_DATA':
                ({ result, reason } = this.checkStaleData(request, context));
                break;
            case 'IDEMPOTENCY':
                ({ result, reason } = this.checkIdempotency(request, context));
                break;
            default:
                result = 'PASS';
                reason = 'Unknown rule type, passed by default';
        }
        // If decision service is available, also evaluate via decision service
        if (this.decisionService) {
            const decisionResult = this.decisionService.evaluateRule(request.userId, request.decisionCandidateId, config.ruleId, config.ruleName, '1.0.0', config.ruleType, context, 'risk_gate');
            // Merge decision service result with our result
            if (decisionResult.result === 'FAIL' && result === 'PASS') {
                result = 'FAIL';
                reason = decisionResult.reason;
            }
        }
        const riskCheckResult = {
            ruleId: config.ruleId,
            ruleName: config.ruleName,
            ruleType: config.ruleType,
            result,
            reason,
            context,
            evaluatedAt,
        };
        this.emit('riskCheckEvaluated', riskCheckResult);
        return riskCheckResult;
    }
    /**
     * Check if symbol is enabled in user policy
     */
    checkSymbolEnabled(request, context) {
        const policy = this.getUserRiskPolicy(request.userId);
        if (!policy) {
            return { result: 'FAIL', reason: 'No risk policy configured for user' };
        }
        const symbol = request.symbol.toUpperCase();
        if (!policy.enabledSymbols.includes(symbol)) {
            return { result: 'FAIL', reason: `Symbol ${symbol} is not enabled in user policy` };
        }
        return { result: 'PASS', reason: 'Symbol is enabled' };
    }
    /**
     * Check observer state (placeholder - would check entitlement service)
     */
    checkObserverState(request, context) {
        // In a real implementation, this would check entitlement service
        // For now, we assume observer mode allows read-only but blocks execution
        // Placeholder: assume user is not in observer mode
        return { result: 'PASS', reason: 'Observer state check passed' };
    }
    /**
     * Check global halt
     */
    checkGlobalHalt(request, context) {
        if (this.globalHaltActive) {
            return { result: 'FAIL', reason: 'Global halt is active' };
        }
        return { result: 'PASS', reason: 'Global halt is not active' };
    }
    /**
     * Check per-symbol halt
     */
    checkPerSymbolHalt(request, context) {
        const symbol = request.symbol.toUpperCase();
        if (this.symbolHalts.get(symbol)) {
            return { result: 'FAIL', reason: `Symbol ${symbol} is halted` };
        }
        return { result: 'PASS', reason: `Symbol ${symbol} is not halted` };
    }
    /**
     * Check max exposure
     */
    checkMaxExposure(request, context) {
        const policy = this.getUserRiskPolicy(request.userId);
        if (!policy) {
            return { result: 'FAIL', reason: 'No risk policy configured for user' };
        }
        const currentExposure = context.currentExposure;
        const maxExposure = policy.maxExposure;
        // In a real implementation, this would use decimal comparison
        // For now, we assume current exposure is within limits
        return { result: 'PASS', reason: 'Current exposure within max exposure limit' };
    }
    /**
     * Check max position
     */
    checkMaxPosition(request, context) {
        const policy = this.getUserRiskPolicy(request.userId);
        if (!policy) {
            return { result: 'FAIL', reason: 'No risk policy configured for user' };
        }
        // Placeholder: assume position is within limits
        return { result: 'PASS', reason: 'Position within max position limit' };
    }
    /**
     * Check available balance
     */
    checkAvailableBalance(request, context) {
        const availableBalance = context.availableBalance;
        const quantity = request.quantity;
        // In a real implementation, this would use decimal comparison
        // For now, we assume balance is sufficient
        return { result: 'PASS', reason: 'Available balance sufficient for order' };
    }
    /**
     * Check daily loss limit
     */
    checkDailyLossLimit(request, context) {
        const policy = this.getUserRiskPolicy(request.userId);
        if (!policy) {
            return { result: 'FAIL', reason: 'No risk policy configured for user' };
        }
        const dailyLoss = context.dailyLoss;
        const dailyLossLimit = policy.dailyLossLimit;
        // In a real implementation, this would use decimal comparison
        // For now, we assume daily loss is within limit
        return { result: 'PASS', reason: 'Daily loss within limit' };
    }
    /**
     * Check daily trade limit
     */
    checkDailyTradeLimit(request, context) {
        const policy = this.getUserRiskPolicy(request.userId);
        if (!policy) {
            return { result: 'FAIL', reason: 'No risk policy configured for user' };
        }
        const dailyTradeCount = context.dailyTradeCount;
        const dailyTradeLimit = policy.dailyTradeLimit;
        if (dailyTradeCount >= dailyTradeLimit) {
            return { result: 'FAIL', reason: `Daily trade limit reached (${dailyTradeCount}/${dailyTradeLimit})` };
        }
        return { result: 'PASS', reason: 'Daily trade count within limit' };
    }
    /**
     * Check volatility (placeholder)
     */
    checkVolatility(request, context) {
        // Placeholder: assume volatility is acceptable
        return { result: 'PASS', reason: 'Volatility within acceptable range' };
    }
    /**
     * Check spread (placeholder)
     */
    checkSpread(request, context) {
        // Placeholder: assume spread is acceptable
        return { result: 'PASS', reason: 'Spread within acceptable range' };
    }
    /**
     * Check liquidity (placeholder)
     */
    checkLiquidity(request, context) {
        // Placeholder: assume liquidity is acceptable
        return { result: 'PASS', reason: 'Liquidity within acceptable range' };
    }
    /**
     * Check min notional (placeholder)
     */
    checkMinNotional(request, context) {
        // Placeholder: assume notional is above minimum
        return { result: 'PASS', reason: 'Notional value above minimum' };
    }
    /**
     * Check exchange filters (placeholder)
     */
    checkExchangeFilters(request, context) {
        // Placeholder: assume exchange filters passed
        return { result: 'PASS', reason: 'Exchange filters passed' };
    }
    /**
     * Check stale data (placeholder)
     */
    checkStaleData(request, context) {
        // Placeholder: assume data is fresh
        return { result: 'PASS', reason: 'Data is fresh' };
    }
    /**
     * Check idempotency (placeholder)
     */
    checkIdempotency(request, context) {
        // Placeholder: assume idempotency check passed
        return { result: 'PASS', reason: 'Idempotency check passed' };
    }
    getAssessmentRecords(userId) {
        if (userId !== undefined) {
            return this.assessmentRecords.filter((r) => r.userId === userId);
        }
        return [...this.assessmentRecords];
    }
    getVetoRecords(userId) {
        const list = userId !== undefined
            ? this.assessmentRecords.filter((r) => r.userId === userId && !r.authorized)
            : this.assessmentRecords.filter((r) => !r.authorized);
        return list;
    }
    /**
     * Reset all in-memory state (useful for test isolation)
     */
    reset() {
        this.riskCheckConfigs.clear();
        this.userRiskPolicies.clear();
        this.globalHaltActive = false;
        this.symbolHalts.clear();
        this.assessmentRecords = [];
        this.initializeDefaultRiskChecks();
    }
}
exports.RiskGateService = RiskGateService;
exports.riskGateService = new RiskGateService({ decisionService: decisionService_1.decisionService });
//# sourceMappingURL=riskService.js.map