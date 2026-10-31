"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_1 = require("../middleware/auth");
const riskManagement_1 = require("../services/riskManagement");
const riskService_1 = require("../services/riskService");
const router = (0, express_1.Router)();
function classifyVetoCategory(ruleType, reason) {
    if (ruleType === 'VOLATILITY' || /volatil/i.test(reason || ''))
        return 'Volatility';
    if (ruleType === 'MAX_EXPOSURE' ||
        ruleType === 'MAX_POSITION' ||
        ruleType === 'AVAILABLE_BALANCE' ||
        ruleType === 'DAILY_LOSS_LIMIT' ||
        ruleType === 'DAILY_TRADE_LIMIT' ||
        /exposure|balance|limit|loss/i.test(reason || '')) {
        return 'Exposure';
    }
    if (ruleType === 'LIQUIDITY' ||
        ruleType === 'SPREAD' ||
        ruleType === 'MIN_NOTIONAL' ||
        ruleType === 'STALE_DATA' ||
        /liquid|spread|notional|stale/i.test(reason || '')) {
        return 'Liquidity';
    }
    return 'Regime';
}
// ── GET /api/risk/settings ───────────────────────────────────────────────────
router.get('/settings', auth_1.requireAuth, async (req, res, next) => {
    try {
        const settings = await (0, riskManagement_1.getRiskSettings)(req.user.userId);
        res.json(settings);
    }
    catch (err) {
        next(err);
    }
});
// ── PUT /api/risk/settings ───────────────────────────────────────────────────
router.put('/settings', auth_1.requireAuth, (0, express_validator_1.body)('riskPerTrade').optional().custom((val) => typeof val === 'number' && val >= 0 && val <= 100).withMessage('riskPerTrade must be a number between 0 and 100'), (0, express_validator_1.body)('maxPositionSize').optional().custom((val) => typeof val === 'number' && val >= 0).withMessage('maxPositionSize must be a non-negative number'), (0, express_validator_1.body)('autoTakeProfit').optional().custom((val) => typeof val === 'boolean').withMessage('autoTakeProfit must be a boolean'), (0, express_validator_1.body)('takeProfitPercent').optional().custom((val) => typeof val === 'number' && val >= 0 && val <= 100).withMessage('takeProfitPercent must be a number between 0 and 100'), (0, express_validator_1.body)('autoStopLoss').optional().custom((val) => typeof val === 'boolean').withMessage('autoStopLoss must be a boolean'), (0, express_validator_1.body)('stopLossPercent').optional().custom((val) => typeof val === 'number' && val >= 0 && val <= 100).withMessage('stopLossPercent must be a number between 0 and 100'), (0, express_validator_1.body)('maxOpenTrades').optional().custom((val) => Number.isInteger(val) && val >= 1 && val <= 100).withMessage('maxOpenTrades must be an integer between 1 and 100'), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    try {
        await (0, riskManagement_1.updateRiskSettings)(req.user.userId, req.body);
        const settings = await (0, riskManagement_1.getRiskSettings)(req.user.userId);
        res.json(settings);
    }
    catch (err) {
        next(err);
    }
});
// ── POST /api/risk/validate ──────────────────────────────────────────────────
router.post('/validate', auth_1.requireAuth, (0, express_validator_1.body)('symbol').isString().trim().notEmpty().withMessage('symbol is required'), (0, express_validator_1.body)('quantity').isFloat({ min: 0.00000001 }).withMessage('quantity must be a positive number'), (0, express_validator_1.body)('price').isFloat({ min: 0 }).withMessage('price must be a non-negative number'), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    try {
        const { symbol, quantity, price } = req.body;
        const validation = await (0, riskManagement_1.validateTrade)(req.user.userId, symbol, quantity, price);
        res.json(validation);
    }
    catch (err) {
        next(err);
    }
});
// ── GET /api/risk/assessments ─────────────────────────────────────────────────
router.get('/assessments', auth_1.requireAuth, async (req, res, next) => {
    try {
        const assessments = riskService_1.riskGateService.getAssessmentRecords(req.user.userId);
        res.json({
            assessments,
            count: assessments.length,
        });
    }
    catch (err) {
        next(err);
    }
});
// ── GET /api/risk/vetoes ──────────────────────────────────────────────────────
router.get('/vetoes', auth_1.requireAuth, async (req, res, next) => {
    try {
        const records = riskService_1.riskGateService.getVetoRecords(req.user.userId);
        const vetoes = records.map((r) => {
            const failedCheck = r.riskCheckResults.find((c) => c.result === 'FAIL');
            const category = classifyVetoCategory(failedCheck?.ruleType, r.vetoReason);
            return {
                id: r.id,
                candidateId: r.decisionCandidateId,
                symbol: String(failedCheck?.context?.symbol || 'BTCUSDT'),
                signal: (String(failedCheck?.context?.action || 'BUY')).toUpperCase(),
                confidence: 0.85,
                reason: r.vetoReason || 'Risk check failed',
                reasonCategory: category,
                time: new Date(r.assessedAt).toISOString(),
                timestamp: r.assessedAt,
                ruleResults: r.riskCheckResults,
            };
        });
        const byCategory = vetoes.reduce((acc, v) => {
            acc[v.reasonCategory] = (acc[v.reasonCategory] || 0) + 1;
            return acc;
        }, { Volatility: 0, Exposure: 0, Regime: 0, Liquidity: 0 });
        res.json({
            totalVetoes: vetoes.length,
            byCategory,
            vetoes,
        });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=risk.js.map