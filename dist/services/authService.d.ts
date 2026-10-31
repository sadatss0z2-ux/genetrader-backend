export interface UserRow {
    id: number;
    email: string;
    google_id: string | null;
    display_name: string | null;
    photo_url: string | null;
    referral_code: string;
    referred_by_id: number | null;
    plan: string;
    created_at: Date;
    last_login_at: Date | null;
    is_active: boolean;
    identity_verified_at?: Date | null;
    email_verified_at?: Date | null;
    password_hash?: string | null;
    auth_provider?: string | null;
}
export interface TokenPair {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}
export interface EmailVerificationChallenge {
    verificationRequired: true;
    challengeId: string;
    email: string;
    expiresIn: number;
}
export type AuthFlowResult = {
    user: UserRow;
    tokens: TokenPair;
} | EmailVerificationChallenge;
/**
 * Verify a Firebase Google ID token, upsert the user, and return JWT pair.
 * @param idToken   Firebase ID token from the mobile client.
 * @param referralCode  Optional referral code used at sign-up.
 */
export declare function googleSignIn(idToken: string, referralCode?: string): Promise<AuthFlowResult>;
export declare function refreshTokens(rawRefreshToken: string): Promise<TokenPair>;
export declare function revokeRefreshToken(rawRefreshToken: string): Promise<void>;
export declare function revokeAllTokensForUser(userId: number): Promise<void>;
export declare function emailRegister(email: string, password: string, displayName: string, referralCode?: string): Promise<EmailVerificationChallenge>;
export declare function emailLogin(email: string, password: string): Promise<AuthFlowResult>;
export declare function requestPasswordReset(email: string): Promise<EmailVerificationChallenge>;
export declare function completePasswordReset(challengeId: string, code: string, newPassword: string): Promise<void>;
export declare function completeEmailVerification(challengeId: string, code: string, attribution?: {
    ip: string;
    deviceId: string;
}): Promise<{
    user: UserRow;
    tokens: TokenPair;
}>;
export declare function resendEmailVerification(challengeId: string): Promise<EmailVerificationChallenge>;
/**
 * Verifies user's password for sensitive reauthentication operations (P4-03).
 *
 * Reads the bcrypt hash from users.password_hash (the correct column).
 * The previous stop-gap that read from user_settings.theme has been removed
 * as part of the P1-04 migration.
 */
export declare function verifyPassword(userId: number, password: string): Promise<boolean>;
//# sourceMappingURL=authService.d.ts.map