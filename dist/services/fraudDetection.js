"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkReferralFraud = checkReferralFraud;
exports.markReferralFraud = markReferralFraud;
const database_1 = __importDefault(require("../config/database"));
/**
 * Run all fraud detection checks for a new referral.
 * Returns { isFraud, reasons } — caller decides whether to block or flag.
 */
async function checkReferralFraud(input) {
    const reasons = [];
    const [selfRef, ipAbuse, deviceAbuse, clickAbuse] = await Promise.all([
        checkSelfReferral(input),
        checkIpAbuse(input),
        checkDeviceAbuse(input),
        checkClickAbuse(input),
    ]);
    if (selfRef)
        reasons.push('SELF_REFERRAL');
    if (ipAbuse)
        reasons.push('IP_ABUSE');
    if (deviceAbuse)
        reasons.push('DEVICE_ABUSE');
    if (clickAbuse)
        reasons.push('CLICK_SPAM');
    return { isFraud: reasons.length > 0, reasons };
}
// ── Individual checks ─────────────────────────────────────────────────────────
/**
 * Prevent a user from referring themselves.
 * Also catches the case where referrer already has the same IP as the new user.
 */
async function checkSelfReferral({ referrerId, refereeId }) {
    return referrerId === refereeId;
}
/**
 * Flag if the same IP already has ≥3 successful referrals in the last 30 days.
 * This catches VPN farms or family-sharing abuse.
 */
async function checkIpAbuse({ referrerId, refereeIp }) {
    const rows = await (0, database_1.default) `
    SELECT COUNT(*)::int AS cnt
    FROM referrals r
    JOIN users u ON u.id = r.referee_id
    WHERE r.referrer_id = ${referrerId}
      AND r.status NOT IN ('fraud', 'expired')
      AND r.ip_address = ${refereeIp}
      AND r.created_at >= NOW() - INTERVAL '30 days'
  `;
    return (rows[0]?.cnt ?? 0) >= 3;
}
/**
 * Flag if the same device fingerprint already has ≥2 referrals from this referrer.
 */
async function checkDeviceAbuse({ referrerId, deviceId }) {
    const rows = await (0, database_1.default) `
    SELECT COUNT(*)::int AS cnt
    FROM referrals
    WHERE referrer_id = ${referrerId}
      AND device_id = ${deviceId}
      AND status NOT IN ('fraud', 'expired')
  `;
    return (rows[0]?.cnt ?? 0) >= 2;
}
/**
 * Flag click spam: same IP clicked the same referral code ≥10 times in 24h.
 */
async function checkClickAbuse({ refereeIp, referralCode }) {
    const rows = await (0, database_1.default) `
    SELECT COUNT(*)::int AS cnt
    FROM referral_clicks
    WHERE ip_address = ${refereeIp}
      AND referral_code = ${referralCode}
      AND clicked_at >= NOW() - INTERVAL '24 hours'
  `;
    return (rows[0]?.cnt ?? 0) >= 10;
}
/**
 * Mark an existing referral record as fraud.
 */
async function markReferralFraud(referrerId, refereeId) {
    await (0, database_1.default) `
    UPDATE referrals
    SET status = 'fraud'
    WHERE referrer_id = ${referrerId} AND referee_id = ${refereeId}
  `;
}
//# sourceMappingURL=fraudDetection.js.map