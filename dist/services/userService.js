"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserProfile = getUserProfile;
exports.updateUserProfile = updateUserProfile;
exports.replaceUserProfileImage = replaceUserProfileImage;
exports.getUserSettings = getUserSettings;
exports.updateUserSettings = updateUserSettings;
const database_1 = __importDefault(require("../config/database"));
const errorHandler_1 = require("../middleware/errorHandler");
const logger_1 = __importDefault(require("../utils/logger"));
const profileImageStorage_1 = require("./profileImageStorage");
// ── Get profile ───────────────────────────────────────────────────────────────
async function getUserProfile(userId) {
    const rows = await (0, database_1.default) `
    SELECT id, email, display_name, photo_url, referral_code, referred_by_id, plan, created_at, last_login_at
    FROM users WHERE id = ${userId} AND is_active = true LIMIT 1
  `;
    if (!rows.length)
        throw (0, errorHandler_1.createError)('User not found', 404);
    const r = rows[0];
    return {
        id: r.id,
        email: r.email,
        displayName: r.display_name,
        photoUrl: await (0, profileImageStorage_1.resolveProfileImageUrl)(r.photo_url),
        referralCode: r.referral_code,
        referredById: r.referred_by_id,
        plan: r.plan,
        createdAt: r.created_at,
        lastLoginAt: r.last_login_at,
    };
}
// ── Update profile ────────────────────────────────────────────────────────────
async function updateUserProfile(userId, updates) {
    if (updates.displayName === undefined && updates.photoUrl === undefined) {
        return getUserProfile(userId);
    }
    await (0, database_1.default) `
    UPDATE users
    SET display_name = COALESCE(${updates.displayName ?? null}, display_name),
        photo_url    = CASE WHEN ${updates.photoUrl !== undefined} THEN ${updates.photoUrl ?? null} ELSE photo_url END
    WHERE id = ${userId}
  `;
    return getUserProfile(userId);
}
async function replaceUserProfileImage(userId, imageReference) {
    const previousReference = await database_1.default.begin(async (tx) => {
        const rows = await tx `
      SELECT photo_url FROM users WHERE id = ${userId} AND is_active = true FOR UPDATE
    `;
        if (!rows.length)
            throw (0, errorHandler_1.createError)('User not found', 404);
        await tx `
      UPDATE users SET photo_url = ${imageReference} WHERE id = ${userId}
    `;
        return rows[0].photo_url;
    });
    try {
        await (0, profileImageStorage_1.deleteStoredProfileImage)(previousReference);
    }
    catch (error) {
        logger_1.default.error({ err: error, userId }, 'Could not remove the replaced profile image');
    }
    return getUserProfile(userId);
}
// ── Get settings ──────────────────────────────────────────────────────────────
async function getUserSettings(userId) {
    // Upsert defaults if missing
    await (0, database_1.default) `
    INSERT INTO user_settings (user_id)
    VALUES (${userId})
    ON CONFLICT (user_id) DO NOTHING
  `;
    const rows = await (0, database_1.default) `
    SELECT notifications_enabled, biometric_enabled, theme
    FROM user_settings WHERE user_id = ${userId} LIMIT 1
  `;
    if (!rows.length)
        throw (0, errorHandler_1.createError)('Settings not found', 404);
    return {
        notificationsEnabled: rows[0].notifications_enabled,
        biometricEnabled: rows[0].biometric_enabled,
        theme: rows[0].theme,
    };
}
// ── Update settings ───────────────────────────────────────────────────────────
async function updateUserSettings(userId, updates) {
    await (0, database_1.default) `
    UPDATE user_settings
    SET notifications_enabled = COALESCE(${updates.notificationsEnabled ?? null}, notifications_enabled),
        biometric_enabled     = COALESCE(${updates.biometricEnabled ?? null}, biometric_enabled),
        theme                 = COALESCE(${updates.theme ?? null}, theme)
    WHERE user_id = ${userId}
  `;
    return getUserSettings(userId);
}
//# sourceMappingURL=userService.js.map