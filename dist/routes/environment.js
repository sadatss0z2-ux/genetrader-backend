"use strict";
/**
 * Environment & Canary Management Routes (P6-01)
 *
 * Exposes server-authoritative environment status, reauthentication challenge,
 * canary cohort management, and cryptographic environment proofs.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const auth_1 = require("../middleware/auth");
const requireReauth_1 = require("../middleware/requireReauth");
const environment_1 = require("../config/environment");
const canaryService_1 = require("../services/canaryService");
const reauth_1 = __importDefault(require("./reauth"));
const router = (0, express_1.Router)();
router.use(reauth_1.default);
/**
 * GET /api/environment/status
 * Public / authenticated endpoint providing server-authoritative execution environment.
 */
router.get('/status', auth_1.optionalAuth, (req, res) => {
    const config = (0, environment_1.getEnvironmentConfig)();
    const userId = req.user?.userId;
    const isCanaryEnrolled = userId ? canaryService_1.canaryService.isUserInCanaryCohort(userId) : false;
    res.json({
        environment: config.environment,
        isTestnet: config.isTestnet,
        isLive: config.isLive,
        isLiveApproved: config.isLiveApproved,
        liveTradingAcknowledged: config.liveTradingAcknowledged,
        canaryEnabled: config.canaryCohortEnabled,
        maxCanaryOrderNotionalUsd: config.maxCanaryOrderNotionalUsd,
        maxCanaryAccountBalanceUsd: config.maxCanaryAccountBalanceUsd,
        reauthTtlSeconds: config.reauthTtlSeconds,
        binanceBaseUrl: config.binanceBaseUrl,
        userCanaryEnrolled: isCanaryEnrolled,
        serverTime: new Date().toISOString(),
    });
});
/**
 * GET /api/environment/canary
 * Retrieves canary cohort status.
 */
router.get('/canary', auth_1.requireAuth, (req, res) => {
    const userId = req.user.userId;
    const summary = canaryService_1.canaryService.getCanaryStatus();
    const isEnrolled = canaryService_1.canaryService.isUserInCanaryCohort(userId);
    res.json({
        ...summary,
        userEnrolled: isEnrolled,
    });
});
/**
 * POST /api/environment/canary/enroll
 * Enrolls a user into the canary cohort (requires reauth).
 */
router.post('/canary/enroll', auth_1.requireAuth, (0, requireReauth_1.requireReauth)('canary_enrollment'), (req, res) => {
    const userId = req.user.userId;
    const email = req.user.email;
    const { maxNotionalUsd, notes } = req.body || {};
    try {
        const member = canaryService_1.canaryService.enrollCanaryUser({
            userId,
            email,
            enrolledBy: `user:${userId}`,
            maxNotionalUsd: typeof maxNotionalUsd === 'number' ? maxNotionalUsd : undefined,
            notes: typeof notes === 'string' ? notes : undefined,
        });
        res.status(201).json({
            success: true,
            member: {
                userId: member.userId,
                email: member.email,
                enrolledAt: member.enrolledAt.toISOString(),
                maxNotionalUsd: member.maxNotionalUsd,
                active: member.active,
            },
        });
    }
    catch (err) {
        res.status(400).json({
            error: err.message || 'Failed to enroll in canary cohort',
            code: 'CANARY_ENROLLMENT_FAILED',
        });
    }
});
/**
 * GET /api/environment/proof
 * Emits an immutable signed environment proof demonstrating environment isolation and fail-closed state.
 */
router.get('/proof', (_req, res) => {
    const config = (0, environment_1.getEnvironmentConfig)();
    const proofPayload = {
        environment: config.environment,
        isTestnet: config.isTestnet,
        isLiveApproved: config.isLiveApproved,
        binanceBaseUrl: config.binanceBaseUrl,
        binanceWsBaseUrl: config.binanceWsBaseUrl,
        liveTradingAcknowledged: config.liveTradingAcknowledged,
        canaryCohortEnabled: config.canaryCohortEnabled,
        maxCanaryOrderNotionalUsd: config.maxCanaryOrderNotionalUsd,
        reauthTtlSeconds: config.reauthTtlSeconds,
        nodeEnv: process.env.NODE_ENV || 'unknown',
        timestamp: new Date().toISOString(),
    };
    const payloadString = JSON.stringify(proofPayload);
    const proofHash = crypto_1.default.createHash('sha256').update(payloadString).digest('hex');
    res.json({
        proof: proofPayload,
        proofHash,
        isolationGuarantees: [
            'No shared environment API key fallback',
            'Testnet execution strictly isolated from live endpoints',
            'Canary small-account limits ($50 max per order) fail-closed',
            'Reauthentication required for credential rotation and live enrollment',
        ],
    });
});
exports.default = router;
//# sourceMappingURL=environment.js.map