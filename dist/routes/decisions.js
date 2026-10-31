"use strict";
/**
 * Decision Routes (P4-04)
 * Provides endpoints for querying immutable decision candidates, rule-level results,
 * feature snapshots, regime classifications, and deterministic replay datasets.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_1 = require("../middleware/auth");
const decisionService_1 = require("../services/decisionService");
const router = (0, express_1.Router)();
// ── GET /api/decisions/candidates ─────────────────────────────────────────────
router.get('/candidates', auth_1.requireAuth, (0, express_validator_1.query)('symbol').optional().isString().trim(), (0, express_validator_1.query)('status').optional().isIn(['PENDING', 'APPROVED', 'REJECTED']), (0, express_validator_1.query)('strategyVersion').optional().isString().trim(), (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 200 }).toInt(), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    try {
        const userId = req.user.userId;
        const symbol = req.query.symbol;
        const status = req.query.status;
        const strategyVersion = req.query.strategyVersion;
        const limit = req.query.limit || 50;
        const candidates = decisionService_1.decisionService.getDecisionCandidates({
            userId,
            symbol,
            status,
            strategyVersion,
        });
        // Sort newest proposedAt first
        const sorted = candidates.sort((a, b) => b.proposedAt - a.proposedAt).slice(0, limit);
        res.json({
            candidates: sorted,
            count: sorted.length,
            total: candidates.length,
        });
    }
    catch (err) {
        next(err);
    }
});
// ── GET /api/decisions/candidates/:id ─────────────────────────────────────────
router.get('/candidates/:id', auth_1.requireAuth, (0, express_validator_1.param)('id').isString().trim().notEmpty(), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    try {
        const candidateId = String(req.params.id);
        const candidate = decisionService_1.decisionService.getDecisionCandidate(candidateId);
        if (!candidate) {
            res.status(404).json({ error: `Decision candidate '${candidateId}' not found` });
            return;
        }
        // Check ownership if candidate has a userId
        if (candidate.userId && candidate.userId !== req.user.userId) {
            res.status(403).json({ error: 'Access denied to decision candidate' });
            return;
        }
        const ruleResults = decisionService_1.decisionService.getDecisionRuleResults(candidateId);
        const featureSnapshot = candidate.featureSnapshotId
            ? decisionService_1.decisionService.getFeatureSnapshot(candidate.featureSnapshotId)
            : undefined;
        const regimeResult = candidate.regimeResultId
            ? decisionService_1.decisionService.getRegimeResult(candidate.regimeResultId)
            : undefined;
        const riskAssessment = decisionService_1.decisionService.getRiskAssessment(candidateId);
        res.json({
            candidate,
            ruleResults,
            featureSnapshot,
            regimeResult,
            riskAssessment,
        });
    }
    catch (err) {
        next(err);
    }
});
// ── GET /api/decisions/regimes/:symbol ─────────────────────────────────────────
router.get('/regimes/:symbol', auth_1.requireAuth, (0, express_validator_1.param)('symbol').isString().trim().notEmpty(), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    try {
        const symbol = String(req.params.symbol).toUpperCase();
        const regimes = decisionService_1.decisionService.getRegimeResults({ symbol });
        if (regimes.length === 0) {
            res.status(404).json({ error: `No regime records found for symbol ${symbol}` });
            return;
        }
        // Latest first
        const latest = regimes.sort((a, b) => b.computedAt - a.computedAt)[0];
        res.json(latest);
    }
    catch (err) {
        next(err);
    }
});
// ── GET /api/decisions/features/:symbol ───────────────────────────────────────
router.get('/features/:symbol', auth_1.requireAuth, (0, express_validator_1.param)('symbol').isString().trim().notEmpty(), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    try {
        const symbol = String(req.params.symbol).toUpperCase();
        const snapshots = decisionService_1.decisionService.getFeatureSnapshots({ symbol });
        if (snapshots.length === 0) {
            res.status(404).json({ error: `No feature snapshots found for symbol ${symbol}` });
            return;
        }
        // Latest first
        const latest = snapshots.sort((a, b) => b.computedAt - a.computedAt)[0];
        res.json(latest);
    }
    catch (err) {
        next(err);
    }
});
// ── GET /api/decisions/replay ─────────────────────────────────────────────────
router.get('/replay', auth_1.requireAuth, (0, express_validator_1.query)('strategyVersion').optional().isString().trim(), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    try {
        const strategyVersion = req.query.strategyVersion ||
            decisionService_1.decisionService.getActiveStrategyVersion() ||
            '1.0.0';
        const dataset = decisionService_1.decisionService.generateReplayDataset(strategyVersion);
        res.json(dataset);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=decisions.js.map