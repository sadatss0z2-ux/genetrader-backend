"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MONTHLY_SUBSCRIPTION_POINTS_COST = exports.REFERRAL_POINTS_PER_QUALIFIED_REFERRAL = void 0;
exports.validateReferralCode = validateReferralCode;
exports.trackClick = trackClick;
exports.activateReferral = activateReferral;
exports.getReferralStats = getReferralStats;
exports.getReferralFriends = getReferralFriends;
exports.awardQualifiedReferralPoints = awardQualifiedReferralPoints;
exports.redeemMonthlySubscriptionWithPoints = redeemMonthlySubscriptionWithPoints;
const node_crypto_1 = require("node:crypto");
const database_1 = __importDefault(require("../config/database"));
const fraudDetection_1 = require("./fraudDetection");
const errorHandler_1 = require("../middleware/errorHandler");
const liveCopyService_1 = require("./liveCopyService");
exports.REFERRAL_POINTS_PER_QUALIFIED_REFERRAL = 100;
exports.MONTHLY_SUBSCRIPTION_POINTS_COST = 1000;
// ── Validate referral code ────────────────────────────────────────────────────
async function validateReferralCode(code, requesterId) {
    const rows = await (0, database_1.default) `
    SELECT id, display_name
    FROM users
    WHERE referral_code = ${code.toUpperCase()} AND is_active = true
    LIMIT 1
  `;
    if (!rows.length)
        return { valid: false, referrerName: null };
    // Cannot use your own code
    if (requesterId && rows[0].id === requesterId) {
        return { valid: false, referrerName: null };
    }
    return { valid: true, referrerName: rows[0].display_name };
}
// ── Track referral link click ─────────────────────────────────────────────────
async function trackClick(params) {
    const codeUp = params.code.toUpperCase();
    // Verify code exists
    const exists = await (0, database_1.default) `SELECT 1 FROM users WHERE referral_code = ${codeUp} LIMIT 1`;
    if (!exists.length)
        throw (0, errorHandler_1.createError)('Referral code not found', 404);
    await (0, database_1.default) `
    INSERT INTO referral_clicks (referral_code, ip_address, device_id, user_agent)
    VALUES (${codeUp}, ${params.ip}, ${params.deviceId}, ${params.userAgent})
  `;
}
// ── Activate a referral (called after new user is confirmed real) ─────────────
async function activateReferral(referrerId, refereeId, ip, deviceId, referralCode) {
    // Run fraud checks
    const fraud = await (0, fraudDetection_1.checkReferralFraud)({ referrerId, refereeId, refereeIp: ip, deviceId, referralCode });
    if (fraud.isFraud) {
        await (0, fraudDetection_1.markReferralFraud)(referrerId, refereeId);
        // Don't throw — just flag it; the referral is stored but won't earn credits
        return;
    }
    await (0, database_1.default) `
    UPDATE referrals
    SET status       = 'active',
        activated_at = NOW(),
        ip_address   = ${ip},
        device_id    = ${deviceId}
    WHERE referrer_id = ${referrerId}
      AND referee_id  = ${refereeId}
      AND status      = 'pending'
  `;
    // Mark any pre-signup click as converted
    await (0, database_1.default) `
    UPDATE referral_clicks
    SET converted_at = NOW(), referee_id = ${refereeId}
    WHERE id = (
      SELECT id
      FROM referral_clicks
      WHERE referral_code = ${referralCode}
        AND referee_id IS NULL
        AND ip_address = ${ip}
        AND converted_at IS NULL
      ORDER BY clicked_at DESC, id DESC
      LIMIT 1
    )
  `;
}
// ── Get referral stats for a user ─────────────────────────────────────────────
async function getReferralStats(userId) {
    const [statsRows, clickRows, pointRows] = await Promise.all([
        (0, database_1.default) `
      SELECT status, COUNT(*)::int AS cnt
      FROM referrals
      WHERE referrer_id = ${userId}
      GROUP BY status
    `,
        (0, database_1.default) `
      SELECT COUNT(*)::int AS cnt
      FROM referral_clicks
      WHERE referral_code = (SELECT referral_code FROM users WHERE id = ${userId})
    `,
        (0, database_1.default) `
      SELECT
        COALESCE(SUM(points_delta), 0)::int AS balance,
        COALESCE(SUM(points_delta) FILTER (WHERE entry_type = 'REFERRAL_REWARD'), 0)::int AS earned,
        COALESCE(-SUM(points_delta) FILTER (
          WHERE entry_type IN ('MONTHLY_REDEMPTION', 'MONTHLY_REDEMPTION_REFUND')
        ), 0)::int AS redeemed
      FROM referral_points_ledger
      WHERE user_id = ${userId}
    `,
    ]);
    const byStatus = {};
    for (const r of statsRows)
        byStatus[r.status] = r.cnt;
    const active = byStatus['active'] ?? 0;
    const pending = byStatus['pending'] ?? 0;
    const fraud = byStatus['fraud'] ?? 0;
    return {
        totalClicks: clickRows[0]?.cnt ?? 0,
        totalSignups: Object.values(byStatus).reduce((total, count) => total + count, 0),
        activeReferrals: active,
        pendingReferrals: pending,
        fraudReferrals: fraud,
        pointsBalance: Number(pointRows[0]?.balance ?? 0),
        pointsEarned: Number(pointRows[0]?.earned ?? 0),
        pointsRedeemed: Number(pointRows[0]?.redeemed ?? 0),
        pointsPerReferral: exports.REFERRAL_POINTS_PER_QUALIFIED_REFERRAL,
        monthlyPointsCost: exports.MONTHLY_SUBSCRIPTION_POINTS_COST,
    };
}
// ── Get list of referred friends ──────────────────────────────────────────────
async function getReferralFriends(userId) {
    const rows = await (0, database_1.default) `
    SELECT
      u.id, u.display_name, u.email, u.plan,
      r.status, u.created_at, r.activated_at, r.reward_awarded_at,
      CASE
        WHEN r.reward_awarded_at IS NOT NULL THEN 'earned'
        WHEN r.status IN ('fraud', 'expired')
          OR r.attribution_window_end <= NOW()
          OR EXISTS (SELECT 1 FROM subscriptions prior WHERE prior.user_id = u.id)
          OR EXISTS (
            SELECT 1 FROM users referrer
            WHERE referrer.id = r.referrer_id
              AND referrer.phone_verified_at IS NOT NULL
              AND u.phone_verified_at IS NOT NULL
              AND referrer.phone_number = u.phone_number
          )
          THEN 'ineligible'
        ELSE 'pending'
      END AS reward_status
    FROM referrals r
    JOIN users u ON u.id = r.referee_id
    WHERE r.referrer_id = ${userId}
    ORDER BY r.created_at DESC
  `;
    return rows.map(r => ({
        id: r.id,
        displayName: r.display_name,
        email: r.email,
        plan: r.plan,
        status: r.status,
        joinedAt: r.created_at,
        activatedAt: r.activated_at,
        pointsAwarded: r.reward_awarded_at ? exports.REFERRAL_POINTS_PER_QUALIFIED_REFERRAL : 0,
        rewardStatus: r.reward_status,
    }));
}
async function awardQualifiedReferralPoints(tx, refereeId) {
    const referrals = await tx `
    SELECT r.id, r.referrer_id, r.status
    FROM referrals r
    JOIN users referee ON referee.id = r.referee_id
    WHERE r.referee_id = ${refereeId}
      AND r.reward_awarded_at IS NULL
      AND r.status = 'active'
      AND r.attribution_window_end > NOW()
      AND referee.is_active = TRUE
      AND referee.email_verified_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM users referrer
        WHERE referrer.id = r.referrer_id
          AND referrer.phone_verified_at IS NOT NULL
          AND referee.phone_verified_at IS NOT NULL
          AND referrer.phone_number = referee.phone_number
      )
      AND NOT EXISTS (
        SELECT 1 FROM subscriptions prior
        WHERE prior.user_id = referee.id
      )
    LIMIT 1
    FOR UPDATE OF r
  `;
    const referral = referrals[0];
    if (!referral)
        return null;
    const ledgerEntry = await tx `
    INSERT INTO referral_points_ledger (id, user_id, points_delta, entry_type, reference_id)
    VALUES (${(0, node_crypto_1.randomUUID)()}, ${referral.referrer_id}, ${exports.REFERRAL_POINTS_PER_QUALIFIED_REFERRAL},
      'REFERRAL_REWARD', ${referral.id})
    ON CONFLICT (entry_type, reference_id) DO NOTHING
    RETURNING id
  `;
    if (!ledgerEntry.length)
        return null;
    await tx `
    UPDATE referrals
    SET status = 'active',
        activated_at = COALESCE(activated_at, NOW()),
        reward_awarded_at = NOW()
    WHERE id = ${referral.id} AND reward_awarded_at IS NULL
  `;
    return { referrerId: referral.referrer_id, points: exports.REFERRAL_POINTS_PER_QUALIFIED_REFERRAL };
}
async function redeemMonthlySubscriptionWithPoints(userId) {
    return database_1.default.begin(async (tx) => {
        await (0, liveCopyService_1.assertLiveCopyReady)(tx, userId);
        const users = await tx `
      SELECT id, is_active, email_verified_at, identity_verified_at
      FROM users WHERE id = ${userId} FOR UPDATE
    `;
        if (!users[0]?.is_active || !users[0].email_verified_at || !users[0].identity_verified_at) {
            throw (0, errorHandler_1.createError)('An active account with verified email and identity is required to redeem points.', 403);
        }
        const pending = await tx `
      SELECT p.id FROM manual_payment_proofs p
      WHERE p.user_id = ${userId}
        AND (
          p.status = 'PENDING'
          OR EXISTS (
            SELECT 1 FROM copier_pending_activations activation
            WHERE activation.payment_proof_id = p.id
              AND activation.status IN ('WAITING_FOR_COPIER','WAITING_FOR_FLAT','WAITING_FOR_KEY')
          )
        )
      LIMIT 1
    `;
        if (pending.length)
            throw (0, errorHandler_1.createError)('A subscription request or approved activation is already awaiting processing.', 409);
        const totals = await tx `
      SELECT COALESCE(SUM(points_delta), 0)::int AS balance
      FROM referral_points_ledger WHERE user_id = ${userId}
    `;
        if (Number(totals[0]?.balance ?? 0) < exports.MONTHLY_SUBSCRIPTION_POINTS_COST) {
            throw (0, errorHandler_1.createError)(`At least ${exports.MONTHLY_SUBSCRIPTION_POINTS_COST} referral points are required.`, 409);
        }
        const proofId = (0, node_crypto_1.randomUUID)();
        const proof = await tx `
      INSERT INTO manual_payment_proofs
        (id, user_id, plan_key, transaction_ref, reference_key, amount, currency, payment_details,
         payment_method, points_cost)
      VALUES (${proofId}, ${userId}, 'monthly', ${`POINTS:${proofId}`}, ${`points:${proofId}`},
        0, 'POINTS', 'Monthly subscription requested with referral points.',
        'referral_points', ${exports.MONTHLY_SUBSCRIPTION_POINTS_COST})
      RETURNING id
    `;
        if (!proof.length)
            throw (0, errorHandler_1.createError)('The points redemption request could not be created.', 500);
        const debit = await tx `
      INSERT INTO referral_points_ledger (id, user_id, points_delta, entry_type, reference_id)
      VALUES (${(0, node_crypto_1.randomUUID)()}, ${userId}, ${-exports.MONTHLY_SUBSCRIPTION_POINTS_COST},
        'MONTHLY_REDEMPTION', ${proofId})
      RETURNING id
    `;
        if (!debit.length)
            throw (0, errorHandler_1.createError)('Referral points could not be reserved for this request.', 500);
        return { id: proofId, status: 'PENDING', pointsCost: exports.MONTHLY_SUBSCRIPTION_POINTS_COST };
    });
}
//# sourceMappingURL=referralService.js.map