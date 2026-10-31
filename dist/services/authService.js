"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.googleSignIn = googleSignIn;
exports.refreshTokens = refreshTokens;
exports.revokeRefreshToken = revokeRefreshToken;
exports.revokeAllTokensForUser = revokeAllTokensForUser;
exports.emailRegister = emailRegister;
exports.emailLogin = emailLogin;
exports.requestPasswordReset = requestPasswordReset;
exports.completePasswordReset = completePasswordReset;
exports.completeEmailVerification = completeEmailVerification;
exports.resendEmailVerification = resendEmailVerification;
exports.verifyPassword = verifyPassword;
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const firebase_1 = require("../config/firebase");
const database_1 = __importDefault(require("../config/database"));
const jwt_1 = require("../config/jwt");
const referralCodeGenerator_1 = require("../utils/referralCodeGenerator");
const errorHandler_1 = require("../middleware/errorHandler");
const verificationEmailService_1 = require("./verificationEmailService");
const referralService_1 = require("./referralService");
const logger_1 = __importDefault(require("../utils/logger"));
const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
const EMAIL_CODE_RESEND_MS = 60 * 1000;
const EMAIL_CODE_MAX_ATTEMPTS = 5;
// ── Helpers ──────────────────────────────────────────────────────────────────
function signAccess(user) {
    return jsonwebtoken_1.default.sign({ userId: user.id, email: user.email, googleId: user.google_id }, jwt_1.JWT_SECRET, { expiresIn: jwt_1.JWT_EXPIRES_IN });
}
function hashToken(token) {
    return crypto_1.default.createHash('sha256').update(token).digest('hex');
}
async function issueRefreshToken(userId) {
    const token = crypto_1.default.randomBytes(48).toString('hex');
    const hash = hashToken(token);
    const days = parseInt(jwt_1.JWT_REFRESH_EXPIRES_IN) || 30;
    const exp = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    await (0, database_1.default) `
    INSERT INTO sessions (user_id, token_hash, expires_at)
    VALUES (${userId}, ${hash}, ${exp})
  `;
    return token;
}
function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
function isConfiguredMasterEmail(email) {
    const configuredEmail = process.env.MASTER_ACCOUNT_EMAIL?.trim();
    return Boolean(configuredEmail && normalizeEmail(email) === normalizeEmail(configuredEmail));
}
function makeEmailCodeHash(challengeId, code) {
    return crypto_1.default.createHmac('sha256', jwt_1.JWT_SECRET).update(`${challengeId}:${code}`).digest();
}
async function createEmailVerificationChallenge(input) {
    const email = normalizeEmail(input.email);
    const challengeId = crypto_1.default.randomUUID();
    const code = crypto_1.default.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = makeEmailCodeHash(challengeId, code).toString('hex');
    const expiresAt = new Date(Date.now() + EMAIL_CODE_TTL_MS);
    await (0, database_1.default) `
    UPDATE email_verification_challenges
    SET consumed_at = NOW()
    WHERE email = ${email} AND consumed_at IS NULL
  `;
    await (0, database_1.default) `
    INSERT INTO email_verification_challenges
      (challenge_id, email, purpose, display_name, referral_code, password_hash, google_id, photo_url, code_hash, expires_at, last_sent_at)
    VALUES
      (${challengeId}, ${email}, ${input.purpose}, ${input.displayName ?? null}, ${input.referralCode ?? null},
       ${input.passwordHash ?? null}, ${input.googleId ?? null}, ${input.photoUrl ?? null}, ${codeHash},
       ${expiresAt}, NOW())
  `;
    try {
        if (input.purpose === 'password_reset') {
            await (0, verificationEmailService_1.sendVerificationEmail)(email, code, input.displayName ?? undefined, 'password_reset');
        }
        else {
            await (0, verificationEmailService_1.sendVerificationEmail)(email, code, input.displayName ?? undefined);
        }
    }
    catch (error) {
        await (0, database_1.default) `DELETE FROM email_verification_challenges WHERE challenge_id = ${challengeId}`;
        throw error;
    }
    return { verificationRequired: true, challengeId, email, expiresIn: EMAIL_CODE_TTL_MS / 1000 };
}
async function issueTokensForUser(user) {
    const accessToken = signAccess(user);
    const refreshToken = await issueRefreshToken(user.id);
    return { user, tokens: { accessToken, refreshToken, expiresIn: 15 * 60 } };
}
async function signInConfiguredMasterWithGoogle(input) {
    const email = normalizeEmail(input.email);
    const user = await database_1.default.begin(async (tx) => {
        const linked = await tx `
      SELECT * FROM users
      WHERE google_id = ${input.uid} AND is_active = TRUE
      LIMIT 1 FOR UPDATE
    `;
        if (linked.length) {
            if (normalizeEmail(linked[0].email) !== email) {
                throw (0, errorHandler_1.createError)('The Google account email changed. Contact support to restore master access.', 409);
            }
            const updated = await tx `
        UPDATE users
        SET display_name = COALESCE(${input.name ?? null}, display_name),
            photo_url = COALESCE(${input.picture ?? null}, photo_url),
            email_verified_at = COALESCE(email_verified_at, NOW()),
            identity_verified_at = COALESCE(identity_verified_at, NOW()),
            plan = 'master',
            observer_mode = FALSE,
            last_login_at = NOW()
        WHERE id = ${linked[0].id}
        RETURNING *
      `;
            if (!updated.length)
                throw (0, errorHandler_1.createError)('The master account could not be loaded.', 404);
            return updated[0];
        }
        const emailOwner = await tx `
      SELECT * FROM users WHERE email = ${email} LIMIT 1 FOR UPDATE
    `;
        if (emailOwner.length) {
            const provisionedMaster = emailOwner[0].auth_provider === 'local'
                && emailOwner[0].google_id === null
                && emailOwner[0].plan === 'master';
            if (provisionedMaster) {
                const updated = await tx `
          UPDATE users
          SET google_id = ${input.uid},
              display_name = COALESCE(${input.name ?? null}, display_name),
              photo_url = COALESCE(${input.picture ?? null}, photo_url),
              auth_provider = 'google',
              email_verified_at = COALESCE(email_verified_at, NOW()),
              identity_verified_at = COALESCE(identity_verified_at, NOW()),
              plan = 'master',
              observer_mode = FALSE,
              last_login_at = NOW()
          WHERE id = ${emailOwner[0].id}
          RETURNING *
        `;
                if (!updated.length)
                    throw (0, errorHandler_1.createError)('The master account could not be loaded.', 404);
                return updated[0];
            }
            throw (0, errorHandler_1.createError)('An account already uses this email. Sign in with that account to link Google.', 409);
        }
        const referralCode = await (0, referralCodeGenerator_1.generateUniqueReferralCode)(async (code) => {
            const existing = await tx `
        SELECT id FROM users WHERE referral_code = ${code} LIMIT 1
      `;
            return existing.length > 0;
        });
        const inserted = await tx `
      INSERT INTO users
        (email, google_id, display_name, photo_url, referral_code, last_login_at,
         auth_provider, email_verified_at, identity_verified_at, plan, observer_mode, is_active)
      VALUES
        (${email}, ${input.uid}, ${input.name ?? email.split('@')[0]}, ${input.picture ?? null},
         ${referralCode}, NOW(), 'google', NOW(), NOW(), 'master', FALSE, TRUE)
      RETURNING *
    `;
        if (!inserted.length)
            throw (0, errorHandler_1.createError)('The master account could not be created.', 500);
        await tx `INSERT INTO user_settings (user_id) VALUES (${inserted[0].id}) ON CONFLICT (user_id) DO NOTHING`;
        return inserted[0];
    });
    return issueTokensForUser(user);
}
// ── Google Sign-In (main entry point) ────────────────────────────────────────
/**
 * Verify a Firebase Google ID token, upsert the user, and return JWT pair.
 * @param idToken   Firebase ID token from the mobile client.
 * @param referralCode  Optional referral code used at sign-up.
 */
async function googleSignIn(idToken, referralCode) {
    // 1. Verify with Firebase Admin SDK
    let decoded;
    try {
        decoded = await firebase_1.firebaseAuth.verifyIdToken(idToken);
    }
    catch (error) {
        if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 503) {
            throw error;
        }
        throw (0, errorHandler_1.createError)('Invalid or expired Firebase ID token', 401);
    }
    const { uid, email, name, picture } = decoded;
    if (!email)
        throw (0, errorHandler_1.createError)('Google account has no email', 400);
    if (decoded.email_verified !== true)
        throw (0, errorHandler_1.createError)('Verified email is required', 403);
    const normalizedEmail = normalizeEmail(email);
    if (isConfiguredMasterEmail(normalizedEmail)) {
        return signInConfiguredMasterWithGoogle({
            uid,
            email: normalizedEmail,
            name,
            picture,
        });
    }
    const existing = await (0, database_1.default) `
    SELECT * FROM users WHERE google_id = ${uid} AND is_active = true LIMIT 1
  `;
    if (existing.length > 0) {
        if (!existing[0].email_verified_at) {
            return createEmailVerificationChallenge({
                email: normalizedEmail,
                purpose: 'verify_existing',
                displayName: name,
                googleId: uid,
            });
        }
        await (0, database_1.default) `
      UPDATE users
      SET display_name = COALESCE(${name ?? null}, display_name),
          photo_url = COALESCE(${picture ?? null}, photo_url),
          identity_verified_at = COALESCE(identity_verified_at, NOW()),
          last_login_at = NOW()
      WHERE id = ${existing[0].id}
    `;
        return issueTokensForUser({ ...existing[0], display_name: name ?? existing[0].display_name });
    }
    const emailOwner = await (0, database_1.default) `
    SELECT * FROM users WHERE email = ${normalizedEmail} AND is_active = true LIMIT 1
  `;
    if (emailOwner.length) {
        throw (0, errorHandler_1.createError)('An account already uses this email. Sign in with that account to link Google.', 409);
    }
    return createEmailVerificationChallenge({
        email: normalizedEmail,
        purpose: 'google_register',
        displayName: name,
        referralCode,
        googleId: uid,
        photoUrl: picture,
    });
}
// ── Token refresh ────────────────────────────────────────────────────────────
async function refreshTokens(rawRefreshToken) {
    const hash = hashToken(rawRefreshToken);
    const rows = await (0, database_1.default) `
    SELECT user_id, expires_at, revoked_at
    FROM sessions
    WHERE token_hash = ${hash}
    LIMIT 1
  `;
    if (!rows.length)
        throw (0, errorHandler_1.createError)('Invalid refresh token', 401);
    if (rows[0].revoked_at)
        throw (0, errorHandler_1.createError)('Refresh token has been revoked', 401);
    if (rows[0].expires_at < new Date())
        throw (0, errorHandler_1.createError)('Refresh token expired', 401);
    // Rotate: revoke old, issue new
    await (0, database_1.default) `UPDATE sessions SET revoked_at = NOW() WHERE token_hash = ${hash}`;
    const user = await (0, database_1.default) `SELECT * FROM users WHERE id = ${rows[0].user_id} LIMIT 1`;
    if (!user.length)
        throw (0, errorHandler_1.createError)('User not found', 404);
    const accessToken = signAccess(user[0]);
    const newRefresh = await issueRefreshToken(user[0].id);
    return { accessToken, refreshToken: newRefresh, expiresIn: 15 * 60 };
}
// ── Logout ───────────────────────────────────────────────────────────────────
async function revokeRefreshToken(rawRefreshToken) {
    const hash = hashToken(rawRefreshToken);
    await (0, database_1.default) `UPDATE sessions SET revoked_at = NOW() WHERE token_hash = ${hash}`;
}
async function revokeAllTokensForUser(userId) {
    await (0, database_1.default) `UPDATE sessions SET revoked_at = NOW() WHERE user_id = ${userId} AND revoked_at IS NULL`;
}
// ── Email / Password Auth (Phase 1) ─────────────────────────────────────────
const bcryptjs_1 = __importDefault(require("bcryptjs"));
async function emailRegister(email, password, displayName, referralCode) {
    const emailNorm = normalizeEmail(email);
    const existing = await (0, database_1.default) `SELECT id FROM users WHERE email = ${emailNorm} LIMIT 1`;
    if (existing.length)
        throw (0, errorHandler_1.createError)('An account with this email already exists', 409);
    const passwordHash = await bcryptjs_1.default.hash(password, 12);
    return createEmailVerificationChallenge({
        email: emailNorm,
        purpose: 'register',
        displayName: displayName.trim() || emailNorm.split('@')[0],
        referralCode,
        passwordHash,
    });
}
async function emailLogin(email, password) {
    const emailNorm = normalizeEmail(email);
    const rows = await (0, database_1.default) `SELECT * FROM users WHERE email = ${emailNorm} AND is_active = true LIMIT 1`;
    if (!rows.length)
        throw (0, errorHandler_1.createError)('No account found for this email', 401);
    const user = rows[0];
    // Check if user is a local auth user
    if (user.auth_provider !== 'local') {
        throw (0, errorHandler_1.createError)('Account uses Google Sign-In. Please sign in with Google.', 401);
    }
    // Retrieve stored hash from password_hash column
    if (!user.password_hash || !user.password_hash.startsWith('$2')) {
        throw (0, errorHandler_1.createError)('Account uses Google Sign-In. Please sign in with Google.', 401);
    }
    const valid = await bcryptjs_1.default.compare(password, user.password_hash);
    if (!valid)
        throw (0, errorHandler_1.createError)('Incorrect password', 401);
    if (!user.email_verified_at) {
        return createEmailVerificationChallenge({
            email: emailNorm,
            purpose: 'verify_existing',
            displayName: user.display_name,
        });
    }
    const configuredMaster = isConfiguredMasterEmail(emailNorm);
    const updated = await (0, database_1.default) `
    UPDATE users
    SET last_login_at = NOW(),
        identity_verified_at = CASE
          WHEN ${configuredMaster} THEN COALESCE(identity_verified_at, NOW())
          ELSE identity_verified_at
        END,
        plan = CASE WHEN ${configuredMaster} THEN 'master' ELSE plan END,
        observer_mode = CASE WHEN ${configuredMaster} THEN FALSE ELSE observer_mode END
    WHERE id = ${user.id}
    RETURNING *
  `;
    if (!updated.length)
        throw (0, errorHandler_1.createError)('The account could not be loaded.', 404);
    return issueTokensForUser(updated[0]);
}
async function requestPasswordReset(email) {
    const emailNorm = normalizeEmail(email);
    const rows = await (0, database_1.default) `
    SELECT display_name
    FROM users
    WHERE email = ${emailNorm}
      AND is_active = TRUE
      AND email_verified_at IS NOT NULL
      AND auth_provider = 'local'
      AND password_hash IS NOT NULL
    LIMIT 1
  `;
    const account = rows[0];
    if (!account) {
        return {
            verificationRequired: true,
            challengeId: crypto_1.default.randomUUID(),
            email: emailNorm,
            expiresIn: EMAIL_CODE_TTL_MS / 1000,
        };
    }
    return createEmailVerificationChallenge({
        email: emailNorm,
        purpose: 'password_reset',
        displayName: account.display_name,
    });
}
async function completePasswordReset(challengeId, code, newPassword) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(challengeId)) {
        throw (0, errorHandler_1.createError)('A valid password reset request is required.', 400);
    }
    if (!/^\d{6}$/.test(code)) {
        throw (0, errorHandler_1.createError)('Enter the six-digit password reset code.', 400);
    }
    if (newPassword.length < 8) {
        throw (0, errorHandler_1.createError)('Password must be at least 8 characters.', 400);
    }
    const rows = await (0, database_1.default) `
    SELECT challenge_id, email, purpose, display_name, referral_code, password_hash, google_id,
           photo_url, code_hash, expires_at, last_sent_at, attempts, consumed_at
    FROM email_verification_challenges
    WHERE challenge_id = ${challengeId}
    LIMIT 1
  `;
    const challenge = rows[0];
    if (!challenge || challenge.purpose !== 'password_reset' || challenge.consumed_at) {
        throw (0, errorHandler_1.createError)('Password reset request is invalid or already used.', 400);
    }
    if (challenge.expires_at < new Date()) {
        throw (0, errorHandler_1.createError)('Password reset code expired. Request a new code.', 400);
    }
    if (challenge.attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
        throw (0, errorHandler_1.createError)('Too many incorrect codes. Request a new password reset code.', 429);
    }
    const expected = Buffer.from(challenge.code_hash, 'hex');
    const supplied = makeEmailCodeHash(challenge.challenge_id, code);
    if (expected.length !== supplied.length || !crypto_1.default.timingSafeEqual(expected, supplied)) {
        await (0, database_1.default) `
      UPDATE email_verification_challenges
      SET attempts = attempts + 1
      WHERE challenge_id = ${challengeId}
        AND purpose = 'password_reset'
        AND consumed_at IS NULL
        AND attempts < ${EMAIL_CODE_MAX_ATTEMPTS}
    `;
        throw (0, errorHandler_1.createError)('Password reset code is incorrect.', 400);
    }
    const passwordHash = await bcryptjs_1.default.hash(newPassword, 12);
    await database_1.default.begin(async (tx) => {
        const claimed = await tx `
      UPDATE email_verification_challenges
      SET consumed_at = NOW()
      WHERE challenge_id = ${challengeId}
        AND purpose = 'password_reset'
        AND consumed_at IS NULL
        AND expires_at > NOW()
        AND attempts < ${EMAIL_CODE_MAX_ATTEMPTS}
      RETURNING email
    `;
        if (!claimed.length) {
            throw (0, errorHandler_1.createError)('Password reset request expired or already used.', 400);
        }
        const updated = await tx `
      UPDATE users
      SET password_hash = ${passwordHash}, updated_at = NOW()
      WHERE email = ${claimed[0].email}
        AND is_active = TRUE
        AND email_verified_at IS NOT NULL
        AND auth_provider = 'local'
        AND password_hash IS NOT NULL
      RETURNING id
    `;
        if (!updated.length) {
            throw (0, errorHandler_1.createError)('Password reset request is invalid or expired.', 400);
        }
        await tx `
      UPDATE sessions
      SET revoked_at = NOW()
      WHERE user_id = ${updated[0].id} AND revoked_at IS NULL
    `;
    });
}
async function completeEmailVerification(challengeId, code, attribution) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(challengeId)) {
        throw (0, errorHandler_1.createError)('A valid verification request is required.', 400);
    }
    if (!/^\d{6}$/.test(code)) {
        throw (0, errorHandler_1.createError)('Enter the six-digit email code.', 400);
    }
    const rows = await (0, database_1.default) `
    SELECT challenge_id, email, purpose, display_name, referral_code, password_hash, google_id,
           photo_url, code_hash, expires_at, last_sent_at, attempts, consumed_at
    FROM email_verification_challenges WHERE challenge_id = ${challengeId} LIMIT 1
  `;
    const challenge = rows[0];
    if (!challenge || challenge.consumed_at)
        throw (0, errorHandler_1.createError)('Verification request is invalid or already used.', 400);
    if (challenge.purpose === 'password_reset') {
        throw (0, errorHandler_1.createError)('Password reset codes cannot be used to verify or sign in to an account.', 400);
    }
    if (challenge.expires_at < new Date())
        throw (0, errorHandler_1.createError)('Verification code expired. Request a new code.', 400);
    if (challenge.attempts >= EMAIL_CODE_MAX_ATTEMPTS)
        throw (0, errorHandler_1.createError)('Too many incorrect verification codes. Request a new code.', 429);
    const expected = Buffer.from(challenge.code_hash, 'hex');
    const supplied = makeEmailCodeHash(challenge.challenge_id, code);
    if (expected.length !== supplied.length || !crypto_1.default.timingSafeEqual(expected, supplied)) {
        await (0, database_1.default) `
      UPDATE email_verification_challenges
      SET attempts = attempts + 1
      WHERE challenge_id = ${challengeId} AND consumed_at IS NULL AND attempts < ${EMAIL_CODE_MAX_ATTEMPTS}
    `;
        throw (0, errorHandler_1.createError)('Verification code is incorrect.', 400);
    }
    const result = await database_1.default.begin(async (tx) => {
        const claimed = await tx `
      UPDATE email_verification_challenges
      SET consumed_at = NOW()
      WHERE challenge_id = ${challengeId} AND consumed_at IS NULL
        AND expires_at > NOW() AND attempts < ${EMAIL_CODE_MAX_ATTEMPTS}
      RETURNING challenge_id, email, purpose, display_name, referral_code, password_hash, google_id,
                photo_url, code_hash, expires_at, last_sent_at, attempts, consumed_at
    `;
        if (!claimed.length)
            throw (0, errorHandler_1.createError)('Verification request expired or already used.', 400);
        let user;
        if (challenge.purpose === 'register' || challenge.purpose === 'google_register') {
            const duplicate = await tx `
        SELECT id FROM users WHERE email = ${challenge.email} LIMIT 1
      `;
            if (duplicate.length)
                throw (0, errorHandler_1.createError)('An account with this email already exists. Sign in instead.', 409);
            const referrer = challenge.referral_code
                ? await tx `
            SELECT id FROM users
            WHERE referral_code = ${challenge.referral_code.toUpperCase()} AND is_active = true LIMIT 1
          `
                : [];
            const referralCode = await (0, referralCodeGenerator_1.generateUniqueReferralCode)(async (code) => {
                const existingCode = await tx `
          SELECT id FROM users WHERE referral_code = ${code} LIMIT 1
        `;
                return existingCode.length > 0;
            });
            const googleId = challenge.google_id ?? `email:${challenge.email}`;
            const configuredMaster = isConfiguredMasterEmail(challenge.email);
            const inserted = await tx `
        INSERT INTO users
          (email, google_id, display_name, photo_url, referral_code, referred_by_id, last_login_at,
           password_hash, auth_provider, email_verified_at, identity_verified_at, plan, observer_mode, is_active)
        VALUES
          (${challenge.email}, ${googleId}, ${challenge.display_name}, ${challenge.photo_url},
           ${referralCode}, ${referrer[0]?.id ?? null}, NOW(), ${challenge.password_hash},
           ${challenge.purpose === 'register' ? 'local' : 'google'}, NOW(),
           ${challenge.purpose === 'google_register' || configuredMaster ? new Date() : null},
           CASE WHEN ${configuredMaster} THEN 'master' ELSE 'observer' END, NOT ${configuredMaster}, true)
        RETURNING *
      `;
            user = inserted[0];
            await tx `INSERT INTO user_settings (user_id) VALUES (${user.id}) ON CONFLICT (user_id) DO NOTHING`;
            if (referrer[0] && referrer[0].id !== user.id && challenge.referral_code) {
                await tx `
          INSERT INTO referrals (referrer_id, referee_id, referral_code, attribution_window_end)
          VALUES (${referrer[0].id}, ${user.id}, ${challenge.referral_code.toUpperCase()}, ${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)})
          ON CONFLICT (referrer_id, referee_id) DO NOTHING
        `;
            }
        }
        else {
            const configuredMaster = isConfiguredMasterEmail(challenge.email);
            const updated = await tx `
        UPDATE users
        SET email_verified_at = COALESCE(email_verified_at, NOW()),
            identity_verified_at = CASE
              WHEN ${challenge.google_id}::text IS NOT NULL OR ${configuredMaster}
                THEN COALESCE(identity_verified_at, NOW())
              ELSE identity_verified_at
            END,
            plan = CASE WHEN ${configuredMaster} THEN 'master' ELSE plan END,
            observer_mode = CASE WHEN ${configuredMaster} THEN FALSE ELSE observer_mode END,
            last_login_at = NOW()
        WHERE email = ${challenge.email} AND is_active = true
          AND (${challenge.google_id}::text IS NULL OR google_id = ${challenge.google_id})
        RETURNING *
      `;
            if (!updated.length)
                throw (0, errorHandler_1.createError)('The account could not be verified. Please sign in again.', 404);
            user = updated[0];
        }
        const accessToken = signAccess(user);
        const refreshToken = crypto_1.default.randomBytes(48).toString('hex');
        const tokenHash = hashToken(refreshToken);
        const days = parseInt(jwt_1.JWT_REFRESH_EXPIRES_IN, 10) || 30;
        const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        await tx `
      INSERT INTO sessions (user_id, token_hash, expires_at)
      VALUES (${user.id}, ${tokenHash}, ${expiresAt})
    `;
        return {
            user,
            tokens: { accessToken, refreshToken, expiresIn: 15 * 60 },
            referralCode: challenge.purpose === 'register' || challenge.purpose === 'google_register'
                ? challenge.referral_code
                : null,
        };
    });
    if (attribution && result.referralCode && result.user.referred_by_id) {
        try {
            await (0, referralService_1.activateReferral)(result.user.referred_by_id, result.user.id, attribution.ip, attribution.deviceId, result.referralCode);
        }
        catch (error) {
            logger_1.default.error({ err: error, referrerId: result.user.referred_by_id, refereeId: result.user.id }, 'Could not complete referral abuse checks; this referral will not earn points');
        }
    }
    return { user: result.user, tokens: result.tokens };
}
async function resendEmailVerification(challengeId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(challengeId)) {
        throw (0, errorHandler_1.createError)('A valid verification request is required.', 400);
    }
    const rows = await (0, database_1.default) `
    SELECT challenge_id, email, purpose, display_name, referral_code, password_hash, google_id,
           photo_url, code_hash, expires_at, last_sent_at, attempts, consumed_at
    FROM email_verification_challenges WHERE challenge_id = ${challengeId} LIMIT 1
  `;
    const challenge = rows[0];
    if (!challenge || challenge.consumed_at)
        throw (0, errorHandler_1.createError)('Verification request is invalid or already used.', 400);
    if (Date.now() - new Date(challenge.last_sent_at).getTime() < EMAIL_CODE_RESEND_MS) {
        throw (0, errorHandler_1.createError)('Please wait before requesting another verification email.', 429);
    }
    const code = crypto_1.default.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = makeEmailCodeHash(challengeId, code).toString('hex');
    const expiresAt = new Date(Date.now() + EMAIL_CODE_TTL_MS);
    if (challenge.purpose === 'password_reset') {
        await (0, verificationEmailService_1.sendVerificationEmail)(challenge.email, code, challenge.display_name ?? undefined, 'password_reset');
    }
    else {
        await (0, verificationEmailService_1.sendVerificationEmail)(challenge.email, code, challenge.display_name ?? undefined);
    }
    const updated = await (0, database_1.default) `
    UPDATE email_verification_challenges
    SET code_hash = ${codeHash}, expires_at = ${expiresAt}, attempts = 0, last_sent_at = NOW()
    WHERE challenge_id = ${challengeId} AND consumed_at IS NULL
    RETURNING challenge_id
  `;
    if (!updated.length)
        throw (0, errorHandler_1.createError)('Verification request is invalid or already used.', 400);
    return { verificationRequired: true, challengeId, email: challenge.email, expiresIn: EMAIL_CODE_TTL_MS / 1000 };
}
/**
 * Verifies user's password for sensitive reauthentication operations (P4-03).
 *
 * Reads the bcrypt hash from users.password_hash (the correct column).
 * The previous stop-gap that read from user_settings.theme has been removed
 * as part of the P1-04 migration.
 */
async function verifyPassword(userId, password) {
    if (!password || typeof password !== 'string' || password.trim() === '') {
        return false;
    }
    const rows = await (0, database_1.default) `
    SELECT password_hash FROM users WHERE id = ${userId} AND is_active = true LIMIT 1
  `;
    const storedHash = rows[0]?.password_hash ?? '';
    if (!storedHash.startsWith('$2')) {
        return false;
    }
    return bcryptjs_1.default.compare(password, storedHash);
}
//# sourceMappingURL=authService.js.map