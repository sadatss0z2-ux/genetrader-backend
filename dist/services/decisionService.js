"use strict";
/**
 * Decision Service (P4-01)
 * Versioned strategy/policy inputs, decision candidates, and rule-level results.
 * Supports deterministic replay with golden dataset output.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.decisionService = exports.DecisionService = void 0;
const events_1 = require("events");
const crypto_1 = require("crypto");
const decimal_1 = require("../lib/decimal");
class DecisionService extends events_1.EventEmitter {
    strategyVersions = new Map();
    activeStrategyVersion = null;
    decisionConfigs = new Map();
    // In-memory persistent stores for decision artifacts
    featureSnapshots = new Map();
    regimeResults = new Map();
    decisionCandidates = new Map();
    decisionRuleResults = new Map(); // candidateId -> results
    riskAssessments = new Map(); // candidateId -> assessment
    // Rolling event buffer per symbol for feature computation
    rollingHistory = new Map();
    constructor() {
        super();
    }
    /**
     * Register a strategy version
     */
    registerStrategyVersion(version) {
        this.strategyVersions.set(version.version, version);
        if (version.isActive) {
            this.activeStrategyVersion = version.version;
        }
        this.emit('strategyVersionRegistered', version);
    }
    /**
     * Get active strategy version
     */
    getActiveStrategyVersion() {
        return this.activeStrategyVersion;
    }
    /**
     * Get all registered strategy versions
     */
    getStrategyVersions() {
        return Array.from(this.strategyVersions.values());
    }
    /**
     * Register a decision configuration for a strategy version
     */
    registerDecisionConfig(config) {
        this.decisionConfigs.set(config.strategyVersion, config);
        this.emit('decisionConfigRegistered', config);
    }
    /**
     * Get decision configuration for a strategy version
     */
    getDecisionConfig(strategyVersion) {
        return this.decisionConfigs.get(strategyVersion);
    }
    /**
     * Compute feature snapshot from market event
     */
    computeFeatureSnapshot(userId, symbol, marketEvent, features = {}, detSuffix, timestampOverride) {
        const strategyVersion = this.activeStrategyVersion;
        if (!strategyVersion) {
            throw new Error('No active strategy version');
        }
        const config = this.decisionConfigs.get(strategyVersion);
        if (!config) {
            throw new Error(`No decision config for strategy version: ${strategyVersion}`);
        }
        const normSymbol = symbol.toUpperCase();
        const eventPrice = normSymbol === marketEvent.symbol.toUpperCase()
            ? this.extractPrice(marketEvent)
            : '0';
        // Maintain rolling history for indicators
        const history = this.rollingHistory.get(normSymbol) || [];
        history.push(marketEvent);
        // Prune history to lookback window
        const nowMs = timestampOverride ?? (marketEvent.sourceTime || Date.now());
        const windowStart = nowMs - config.featureConfig.lookbackWindowMs;
        const prunedHistory = history.filter((e) => (e.sourceTime || nowMs) >= windowStart);
        this.rollingHistory.set(normSymbol, prunedHistory);
        const lookbackComplete = config.featureConfig.minLookbackEvents !== undefined
            ? prunedHistory.length >= config.featureConfig.minLookbackEvents
            : true;
        // Compute indicators with FinancialDecimal
        let sumPrice = decimal_1.FinancialDecimal.zero();
        let sumVol = decimal_1.FinancialDecimal.zero();
        let minPrice = (0, decimal_1.financial)(eventPrice);
        let maxPrice = minPrice;
        for (const ev of prunedHistory) {
            const p = (0, decimal_1.financial)(this.extractPrice(ev));
            const q = (0, decimal_1.financial)(this.extractQuantity(ev));
            sumPrice = sumPrice.add(p);
            sumVol = sumVol.add(q);
            if (p.lessThan(minPrice))
                minPrice = p;
            if (p.greaterThan(maxPrice))
                maxPrice = p;
        }
        const count = prunedHistory.length || 1;
        const sma = sumPrice.divide(count).round(4).toString();
        const volume24h = sumVol.round(4).toString();
        // Volatility = (maxPrice - minPrice) / sma
        const avgP = (0, decimal_1.financial)(sma);
        const volatility = avgP.isZero()
            ? '0'
            : maxPrice.subtract(minPrice).divide(avgP).round(6).toString();
        const spread = this.extractSpread(marketEvent, eventPrice);
        const liquidity = volume24h;
        const finalFeatures = Object.keys(features).length > 0
            ? features
            : {
                sma,
                volatility,
                spread,
                lookbackCount: prunedHistory.length,
            };
        const computedAt = timestampOverride ?? (marketEvent.sourceTime || Date.now());
        const snapshotId = detSuffix
            ? `feature-${normSymbol}-${detSuffix}`
            : `feature-${userId}-${normSymbol}-${computedAt}-${Math.random().toString(36).substring(2, 7)}`;
        const snapshot = {
            id: snapshotId,
            userId,
            symbol: normSymbol,
            strategyVersion,
            computedAt,
            marketEventId: marketEvent.id,
            price: eventPrice,
            volume24h,
            volatility,
            spread,
            liquidity,
            lookbackComplete,
            lookbackWindowMs: config.featureConfig.lookbackWindowMs,
            schemaVersion: config.featureConfig.schemaVersion,
            features: finalFeatures,
        };
        // Persist snapshot in memory
        this.featureSnapshots.set(snapshot.id, snapshot);
        this.emit('featureSnapshotComputed', snapshot);
        return snapshot;
    }
    /**
     * Compute regime result from feature snapshot
     */
    computeRegimeResult(userId, symbol, featureSnapshot, detSuffix, timestampOverride) {
        const strategyVersion = featureSnapshot.strategyVersion;
        const config = this.decisionConfigs.get(strategyVersion);
        if (!config) {
            throw new Error(`No decision config for strategy version: ${strategyVersion}`);
        }
        const normSymbol = symbol.toUpperCase();
        const { regime, confidence, flags } = this.classifyRegime(featureSnapshot, config.regimeConfig);
        const eligible = config.regimeConfig.eligibleRegimes.includes(regime) &&
            confidence >= config.regimeConfig.confidenceThreshold;
        const computedAt = timestampOverride ?? featureSnapshot.computedAt;
        const resultId = detSuffix
            ? `regime-${normSymbol}-${detSuffix}`
            : `regime-${userId}-${normSymbol}-${computedAt}-${Math.random().toString(36).substring(2, 7)}`;
        const result = {
            id: resultId,
            userId,
            symbol: normSymbol,
            strategyVersion,
            featureSnapshotId: featureSnapshot.id,
            computedAt,
            regime,
            confidence,
            eligible,
            regimeFlags: flags,
            lookbackStart: featureSnapshot.computedAt - featureSnapshot.lookbackWindowMs,
            lookbackEnd: featureSnapshot.computedAt,
        };
        // Persist regime result in memory
        this.regimeResults.set(result.id, result);
        this.emit('regimeResultComputed', result);
        return result;
    }
    /**
     * Create decision candidate from regime and features
     */
    createDecisionCandidate(userId, symbol, regimeResult, featureSnapshot, action, quantity, price = null, orderType = 'MARKET', detSuffix, timestampOverride) {
        const strategyVersion = regimeResult.strategyVersion;
        const config = this.decisionConfigs.get(strategyVersion);
        if (!config) {
            throw new Error(`No decision config for strategy version: ${strategyVersion}`);
        }
        const normSymbol = symbol.toUpperCase();
        const proposedAt = timestampOverride ?? Date.now();
        const candidateId = detSuffix
            ? `decision-${normSymbol}-${detSuffix}`
            : `decision-${userId}-${normSymbol}-${proposedAt}-${Math.random().toString(36).substring(2, 7)}`;
        // Evaluate signal rules from config
        const signalRules = config.signalRules.map((rule) => {
            let ruleResult = true;
            if (rule.ruleId === 'trend_following') {
                ruleResult = regimeResult.regime === 'trending_up' || regimeResult.regime === 'trending_down';
            }
            else if (rule.ruleId === 'volatility_guard') {
                ruleResult = regimeResult.regime !== 'volatile';
            }
            else if (rule.ruleId === 'lookback_complete') {
                ruleResult = featureSnapshot.lookbackComplete;
            }
            return {
                ...rule,
                result: ruleResult,
            };
        });
        const candidate = {
            id: candidateId,
            userId,
            symbol: normSymbol,
            strategyVersion,
            regimeResultId: regimeResult.id,
            featureSnapshotId: featureSnapshot.id,
            proposedAt,
            action,
            quantity,
            price,
            orderType,
            signalRules,
            reproducibleFrom: {
                marketEventId: featureSnapshot.marketEventId,
                strategyVersion,
            },
            status: 'PENDING',
            approvedAt: null,
            rejectedAt: null,
            rejectionReason: null,
        };
        // Persist candidate in memory
        this.decisionCandidates.set(candidate.id, candidate);
        this.emit('decisionCandidateCreated', candidate);
        return candidate;
    }
    /**
     * Evaluate rule for decision candidate
     */
    evaluateRule(userId, decisionCandidateId, ruleId, ruleName, ruleVersion, ruleType, context, evaluatedBy = 'risk_gate') {
        let result = 'PASS';
        let reason = 'Rule passed';
        switch (ruleType) {
            case 'SYMBOL_ENABLED':
                if (context.enabledSymbols && Array.isArray(context.enabledSymbols)) {
                    const sym = String(context.symbol || '');
                    if (!context.enabledSymbols.includes(sym)) {
                        result = 'FAIL';
                        reason = `Symbol ${sym} is not enabled for trading`;
                    }
                }
                break;
            case 'GLOBAL_HALT':
                if (context.globalHaltActive === true) {
                    result = 'FAIL';
                    reason = 'Global halt active';
                }
                break;
            case 'PER_SYMBOL_HALT':
                if (context.symbolHaltActive === true || context.symbolHalted === true) {
                    result = 'FAIL';
                    reason = 'Per-symbol halt active';
                }
                break;
            case 'OBSERVER_STATE':
                if (context.isObserver === true) {
                    result = 'FAIL';
                    reason = 'Account is in observer-only mode; live execution blocked';
                }
                break;
            case 'MAX_EXPOSURE':
                if (context.currentExposure !== undefined && context.maxExposure !== undefined) {
                    const notional = (0, decimal_1.financial)(String(context.notional || 0));
                    const currentExp = (0, decimal_1.financial)(String(context.currentExposure));
                    const maxExp = (0, decimal_1.financial)(String(context.maxExposure));
                    if (currentExp.add(notional).greaterThan(maxExp)) {
                        result = 'FAIL';
                        reason = `Order notional exceeds maximum account exposure ${maxExp.toString()}`;
                    }
                }
                break;
            case 'MAX_POSITION':
                if (context.maxPosition !== undefined) {
                    const notional = (0, decimal_1.financial)(String(context.notional || 0));
                    const maxPos = (0, decimal_1.financial)(String(context.maxPosition));
                    if (notional.greaterThan(maxPos)) {
                        result = 'FAIL';
                        reason = `Order size exceeds max position limit ${maxPos.toString()}`;
                    }
                }
                break;
            case 'AVAILABLE_BALANCE':
                if (context.availableBalance !== undefined) {
                    const notional = (0, decimal_1.financial)(String(context.notional || 0));
                    const balance = (0, decimal_1.financial)(String(context.availableBalance));
                    if (notional.greaterThan(balance)) {
                        result = 'FAIL';
                        reason = `Insufficient available balance: required ${notional.toString()}, available ${balance.toString()}`;
                    }
                }
                break;
            case 'DAILY_LOSS_LIMIT':
                if (context.dailyLoss !== undefined && context.dailyLossLimit !== undefined) {
                    const loss = (0, decimal_1.financial)(String(context.dailyLoss));
                    const limit = (0, decimal_1.financial)(String(context.dailyLossLimit));
                    if (loss.greaterThanOrEqual(limit)) {
                        result = 'FAIL';
                        reason = `Daily loss limit reached (${loss.toString()} >= ${limit.toString()})`;
                    }
                }
                break;
            case 'DAILY_TRADE_LIMIT':
                if (context.dailyTradeCount !== undefined && context.dailyTradeLimit !== undefined) {
                    const count = Number(context.dailyTradeCount);
                    const limit = Number(context.dailyTradeLimit);
                    if (count >= limit) {
                        result = 'FAIL';
                        reason = `Daily trade limit reached (${count}/${limit})`;
                    }
                }
                break;
            case 'VOLATILITY':
                if (context.volatility !== undefined && context.volatilityThreshold !== undefined) {
                    const vol = (0, decimal_1.financial)(String(context.volatility));
                    const thresh = (0, decimal_1.financial)(String(context.volatilityThreshold));
                    if (vol.greaterThan(thresh)) {
                        result = 'FAIL';
                        reason = `Market volatility ${vol.toString()} exceeds threshold ${thresh.toString()}`;
                    }
                }
                break;
            case 'SPREAD':
                if (context.spread !== undefined && context.spreadThreshold !== undefined) {
                    const sp = (0, decimal_1.financial)(String(context.spread));
                    const thresh = (0, decimal_1.financial)(String(context.spreadThreshold));
                    if (sp.greaterThan(thresh)) {
                        result = 'FAIL';
                        reason = `Market spread ${sp.toString()} exceeds threshold ${thresh.toString()}`;
                    }
                }
                break;
            case 'LIQUIDITY':
                if (context.liquidity !== undefined && context.liquidityThreshold !== undefined) {
                    const liq = (0, decimal_1.financial)(String(context.liquidity));
                    const thresh = (0, decimal_1.financial)(String(context.liquidityThreshold));
                    if (liq.lessThan(thresh)) {
                        result = 'FAIL';
                        reason = `Market liquidity ${liq.toString()} is below required threshold ${thresh.toString()}`;
                    }
                }
                break;
            case 'MIN_NOTIONAL':
                if (context.notional !== undefined && context.minNotional !== undefined) {
                    const notional = (0, decimal_1.financial)(String(context.notional));
                    const minNotional = (0, decimal_1.financial)(String(context.minNotional));
                    if (notional.lessThan(minNotional)) {
                        result = 'FAIL';
                        reason = `Order notional ${notional.toString()} is below exchange minimum ${minNotional.toString()}`;
                    }
                }
                break;
            case 'EXCHANGE_FILTERS':
                if (context.isSpotOnly === false) {
                    result = 'FAIL';
                    reason = 'Non-spot order rejected: Binance spot only is permitted';
                }
                break;
            case 'STALE_DATA':
                if (context.stale === true || context.isStale === true) {
                    result = 'FAIL';
                    reason = 'Market data is stale; trade execution blocked';
                }
                break;
            case 'IDEMPOTENCY':
                if (context.isDuplicate === true) {
                    result = 'FAIL';
                    reason = 'Duplicate command detected; idempotent rejection';
                }
                break;
            default:
                break;
        }
        const evalTime = typeof context.evaluatedAt === 'number' ? context.evaluatedAt : Date.now();
        const resultId = context.deterministicId
            ? `rule-${decisionCandidateId}-${ruleId}`
            : `rule-result-${ruleId}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const ruleResult = {
            id: resultId,
            userId,
            decisionCandidateId,
            ruleId,
            ruleName,
            ruleVersion,
            evaluatedAt: evalTime,
            result,
            reason,
            ruleType,
            context,
            evaluatedBy,
        };
        // Persist rule result
        const existing = this.decisionRuleResults.get(decisionCandidateId) || [];
        existing.push(ruleResult);
        this.decisionRuleResults.set(decisionCandidateId, existing);
        this.emit('ruleEvaluated', ruleResult);
        return ruleResult;
    }
    /**
     * Create risk assessment for decision candidate
     */
    createRiskAssessment(userId, decisionCandidateId, authorized, authorizationId, vetoReason, riskMetrics, riskFlags, ruleResultIds, detSuffix, timestampOverride) {
        const assessedAt = timestampOverride ?? Date.now();
        const assessmentId = detSuffix
            ? `risk-assessment-${decisionCandidateId}`
            : `risk-assessment-${decisionCandidateId}-${assessedAt}-${Math.random().toString(36).substring(2, 7)}`;
        const assessment = {
            id: assessmentId,
            userId,
            decisionCandidateId,
            assessedAt,
            authorized,
            authorizationId,
            vetoReason,
            maxExposure: riskMetrics.maxExposure,
            currentExposure: riskMetrics.currentExposure,
            availableBalance: riskMetrics.availableBalance,
            dailyLoss: riskMetrics.dailyLoss,
            dailyLossLimit: riskMetrics.dailyLossLimit,
            dailyTradeCount: riskMetrics.dailyTradeCount,
            dailyTradeLimit: riskMetrics.dailyTradeLimit,
            riskFlags,
            ruleResultIds,
        };
        // Persist assessment
        this.riskAssessments.set(decisionCandidateId, assessment);
        this.emit('riskAssessmentCreated', assessment);
        return assessment;
    }
    /**
     * Generate replay dataset for deterministic replay
     * Exports all decision artifacts for a given strategy version sorted deterministically
     */
    generateReplayDataset(strategyVersion) {
        const featureSnapshots = Array.from(this.featureSnapshots.values())
            .filter((f) => f.strategyVersion === strategyVersion)
            .sort((a, b) => a.computedAt - b.computedAt || a.id.localeCompare(b.id));
        const regimeResults = Array.from(this.regimeResults.values())
            .filter((r) => r.strategyVersion === strategyVersion)
            .sort((a, b) => a.computedAt - b.computedAt || a.id.localeCompare(b.id));
        const decisionCandidates = Array.from(this.decisionCandidates.values())
            .filter((d) => d.strategyVersion === strategyVersion)
            .sort((a, b) => a.proposedAt - b.proposedAt || a.id.localeCompare(b.id));
        const ruleResults = [];
        for (const candidate of decisionCandidates) {
            const rules = this.decisionRuleResults.get(candidate.id) || [];
            ruleResults.push(...rules.sort((a, b) => a.id.localeCompare(b.id)));
        }
        const riskAssessments = [];
        for (const candidate of decisionCandidates) {
            const assessment = this.riskAssessments.get(candidate.id);
            if (assessment) {
                riskAssessments.push(assessment);
            }
        }
        const payload = {
            strategyVersion,
            featureSnapshots,
            regimeResults,
            decisionCandidates,
            ruleResults,
            riskAssessments,
        };
        const serialized = JSON.stringify(payload);
        const datasetChecksum = (0, crypto_1.createHash)('sha256').update(serialized).digest('hex');
        const dataset = {
            ...payload,
            generatedAt: Date.now(),
            datasetChecksum,
        };
        this.emit('replayDatasetGenerated', dataset);
        return dataset;
    }
    /**
     * Execute deterministic replay of market events
     */
    replayMarketEvents(events, options) {
        const { userId, symbol, strategyVersion, deterministicIds = true, riskPolicy } = options;
        // Reset state for deterministic fresh run
        this.reset();
        // Ensure strategy version is registered and active
        if (!this.strategyVersions.has(strategyVersion)) {
            this.registerStrategyVersion({
                version: strategyVersion,
                schemaVersion: '1.0.0',
                createdAt: 1700000000000,
                isActive: true,
                description: `Replay strategy ${strategyVersion}`,
            });
        }
        else {
            this.activeStrategyVersion = strategyVersion;
        }
        // Ensure decision configuration is registered
        if (!this.decisionConfigs.has(strategyVersion)) {
            this.registerDecisionConfig({
                strategyVersion,
                featureConfig: {
                    lookbackWindowMs: 300000,
                    indicators: ['sma', 'volatility', 'spread'],
                    schemaVersion: '1.0.0',
                    minLookbackEvents: 3,
                },
                regimeConfig: {
                    eligibleRegimes: ['trending_up', 'trending_down'],
                    confidenceThreshold: 0.70,
                    schemaVersion: '1.0.0',
                    volatilityThreshold: 0.04,
                    trendThreshold: 0.015,
                },
                signalRules: [
                    {
                        ruleId: 'trend_following',
                        ruleName: 'Trend Following Signal',
                        ruleVersion: '1.0.0',
                        result: true,
                        weight: 0.6,
                        metadata: {},
                    },
                    {
                        ruleId: 'volatility_guard',
                        ruleName: 'Volatility Guard',
                        ruleVersion: '1.0.0',
                        result: true,
                        weight: 0.4,
                        metadata: {},
                    },
                ],
            });
        }
        // Sort events deterministically
        const sortedEvents = [...events].sort((a, b) => a.sequence - b.sequence || a.sourceTime - b.sourceTime);
        for (const event of sortedEvents) {
            const timestamp = deterministicIds ? event.sourceTime : Date.now();
            const detSuffix = deterministicIds ? `${event.symbol}-${event.sequence}` : undefined;
            // 1. Feature snapshot
            const snapshot = this.computeFeatureSnapshot(userId, symbol, event, {}, detSuffix, timestamp);
            if (!snapshot)
                continue;
            // 2. Regime result
            const regime = this.computeRegimeResult(userId, symbol, snapshot, detSuffix, timestamp);
            if (!regime)
                continue;
            // 3. Decision candidate action
            let action = 'HOLD';
            if (regime.eligible) {
                if (regime.regime === 'trending_up')
                    action = 'BUY';
                else if (regime.regime === 'trending_down')
                    action = 'SELL';
            }
            const candidate = this.createDecisionCandidate(userId, symbol, regime, snapshot, action, '0.05', snapshot.price, 'LIMIT', detSuffix, timestamp);
            // 4. Rule evaluations (risk checks) if risk policy provided
            if (riskPolicy) {
                const notional = (0, decimal_1.financial)(candidate.quantity).multiply(candidate.price || snapshot.price).toString();
                const baseContext = {
                    symbol,
                    notional,
                    deterministicId: deterministicIds,
                    evaluatedAt: timestamp,
                    ...riskPolicy,
                    volatility: snapshot.volatility,
                    spread: snapshot.spread,
                    stale: event.stale,
                };
                const rulesToEvaluate = [
                    { id: 'sym_enabled', name: 'Symbol Enabled', type: 'SYMBOL_ENABLED' },
                    { id: 'observer_mode', name: 'Observer Mode', type: 'OBSERVER_STATE' },
                    { id: 'global_halt', name: 'Global Halt', type: 'GLOBAL_HALT' },
                    { id: 'symbol_halt', name: 'Symbol Halt', type: 'PER_SYMBOL_HALT' },
                    { id: 'max_exposure', name: 'Max Exposure', type: 'MAX_EXPOSURE' },
                    { id: 'daily_trades', name: 'Daily Trades', type: 'DAILY_TRADE_LIMIT' },
                    { id: 'volatility', name: 'Volatility Limit', type: 'VOLATILITY' },
                    { id: 'stale_data', name: 'Stale Data Guard', type: 'STALE_DATA' },
                ];
                const ruleResults = [];
                let anyFailed = false;
                let vetoReason = null;
                for (const r of rulesToEvaluate) {
                    const res = this.evaluateRule(userId, candidate.id, r.id, r.name, '1.0.0', r.type, baseContext);
                    ruleResults.push(res);
                    if (res.result === 'FAIL' && !anyFailed) {
                        anyFailed = true;
                        vetoReason = res.reason;
                    }
                }
                if (anyFailed) {
                    candidate.status = 'REJECTED';
                    candidate.rejectedAt = timestamp;
                    candidate.rejectionReason = vetoReason;
                }
                else if (candidate.action !== 'HOLD') {
                    candidate.status = 'APPROVED';
                    candidate.approvedAt = timestamp;
                }
                // 5. Risk assessment
                this.createRiskAssessment(userId, candidate.id, !anyFailed && candidate.action !== 'HOLD', !anyFailed && candidate.action !== 'HOLD' ? `auth-${candidate.id}` : null, vetoReason, {
                    maxExposure: riskPolicy.maxExposure || '10000',
                    currentExposure: '500',
                    availableBalance: riskPolicy.availableBalance || '5000',
                    dailyLoss: riskPolicy.dailyLoss || '0',
                    dailyLossLimit: riskPolicy.dailyLossLimit || '500',
                    dailyTradeCount: riskPolicy.dailyTradeCount || 0,
                    dailyTradeLimit: riskPolicy.dailyTradeLimit || 20,
                }, anyFailed ? ['RISK_VETO'] : [], ruleResults.map((r) => r.id), detSuffix, timestamp);
            }
        }
        return this.generateReplayDataset(strategyVersion);
    }
    // --- Query and registration methods for stored artifacts ---
    registerFeatureSnapshot(snapshot) {
        this.featureSnapshots.set(snapshot.id, snapshot);
        this.emit('featureSnapshotRegistered', snapshot);
    }
    registerRegimeResult(result) {
        this.regimeResults.set(result.id, result);
        this.emit('regimeResultRegistered', result);
    }
    getFeatureSnapshot(id) {
        return this.featureSnapshots.get(id);
    }
    getFeatureSnapshots(filter) {
        let list = Array.from(this.featureSnapshots.values());
        if (filter?.userId !== undefined) {
            const uid = filter.userId;
            list = list.filter((f) => f.userId === uid);
        }
        if (filter?.symbol) {
            const sym = filter.symbol.toUpperCase();
            list = list.filter((f) => f.symbol === sym);
        }
        if (filter?.strategyVersion) {
            const ver = filter.strategyVersion;
            list = list.filter((f) => f.strategyVersion === ver);
        }
        return list;
    }
    getRegimeResult(id) {
        return this.regimeResults.get(id);
    }
    getRegimeResults(filter) {
        let list = Array.from(this.regimeResults.values());
        if (filter?.userId !== undefined) {
            const uid = filter.userId;
            list = list.filter((r) => r.userId === uid);
        }
        if (filter?.symbol) {
            const sym = filter.symbol.toUpperCase();
            list = list.filter((r) => r.symbol === sym);
        }
        if (filter?.strategyVersion) {
            const ver = filter.strategyVersion;
            list = list.filter((r) => r.strategyVersion === ver);
        }
        return list;
    }
    getDecisionCandidate(id) {
        return this.decisionCandidates.get(id);
    }
    getDecisionCandidates(filter) {
        let list = Array.from(this.decisionCandidates.values());
        if (filter?.userId !== undefined) {
            const uid = filter.userId;
            list = list.filter((d) => d.userId === uid);
        }
        if (filter?.symbol) {
            const sym = filter.symbol.toUpperCase();
            list = list.filter((d) => d.symbol === sym);
        }
        if (filter?.strategyVersion) {
            const ver = filter.strategyVersion;
            list = list.filter((d) => d.strategyVersion === ver);
        }
        if (filter?.status) {
            const st = filter.status;
            list = list.filter((d) => d.status === st);
        }
        return list;
    }
    getDecisionRuleResults(candidateId) {
        return this.decisionRuleResults.get(candidateId) || [];
    }
    getRiskAssessment(candidateId) {
        return this.riskAssessments.get(candidateId);
    }
    // --- Private Helpers ---
    /**
     * Extract price from market event
     */
    extractPrice(event) {
        if (event.channel === 'trades') {
            return event.price || '0';
        }
        if (event.channel === 'ticker') {
            return event.lastPrice || '0';
        }
        if (event.channel === 'candles') {
            return event.close || '0';
        }
        return '0';
    }
    /**
     * Extract quantity from market event
     */
    extractQuantity(event) {
        if (event.channel === 'trades') {
            return event.quantity || '0';
        }
        if (event.channel === 'ticker') {
            return event.volume24h || '0';
        }
        if (event.channel === 'candles') {
            return event.volume || '0';
        }
        return '0';
    }
    /**
     * Extract spread from event
     */
    extractSpread(event, priceStr) {
        if (event.channel === 'ticker') {
            const ticker = event;
            if (ticker.askPrice && ticker.bidPrice) {
                return (0, decimal_1.financial)(ticker.askPrice).subtract((0, decimal_1.financial)(ticker.bidPrice)).round(4).toString();
            }
        }
        // Default simulated tight spread (0.01% of price)
        return (0, decimal_1.financial)(priceStr).multiply('0.0001').round(4).toString();
    }
    /**
     * Classify regime based on features
     */
    classifyRegime(featureSnapshot, regimeConfig) {
        const volThreshold = regimeConfig.volatilityThreshold ?? 0.04;
        const trendThreshold = regimeConfig.trendThreshold ?? 0.015;
        const vol = parseFloat(featureSnapshot.volatility);
        const currentPrice = (0, decimal_1.financial)(featureSnapshot.price);
        const smaVal = (0, decimal_1.financial)(featureSnapshot.features.sma || featureSnapshot.price);
        let regime = 'ranging';
        let confidence = 0.80;
        const flags = [];
        if (vol >= volThreshold) {
            regime = 'volatile';
            confidence = Math.min(0.98, 0.75 + (vol - volThreshold) * 5);
            flags.push('HIGH_VOLATILITY');
        }
        else if (!smaVal.isZero()) {
            const deviation = currentPrice.subtract(smaVal).divide(smaVal).toNumber();
            if (deviation >= trendThreshold) {
                regime = 'trending_up';
                confidence = Math.min(0.95, 0.70 + deviation * 10);
                flags.push('BULLISH_TREND', 'ABOVE_SMA');
            }
            else if (deviation <= -trendThreshold) {
                regime = 'trending_down';
                confidence = Math.min(0.95, 0.70 + Math.abs(deviation) * 10);
                flags.push('BEARISH_TREND', 'BELOW_SMA');
            }
            else {
                regime = 'ranging';
                confidence = 0.8;
                flags.push('CONSOLIDATING', 'NEAR_SMA');
            }
        }
        confidence = Math.round(confidence * 1000) / 1000;
        return { regime, confidence, flags };
    }
    /**
     * Reset all in-memory state (useful for test isolation)
     */
    reset() {
        this.strategyVersions.clear();
        this.activeStrategyVersion = null;
        this.decisionConfigs.clear();
        this.featureSnapshots.clear();
        this.regimeResults.clear();
        this.decisionCandidates.clear();
        this.decisionRuleResults.clear();
        this.riskAssessments.clear();
        this.rollingHistory.clear();
    }
}
exports.DecisionService = DecisionService;
exports.decisionService = new DecisionService();
//# sourceMappingURL=decisionService.js.map