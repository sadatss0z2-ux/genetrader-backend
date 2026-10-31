/**
 * Reauthentication Control Middleware (P6-01)
 *
 * Enforces mandatory reauthentication (password re-verification or short-lived scoped reauth token)
 * for high-risk actions such as live trading enablement, canary enrollment, exchange credential
 * rotation/revocation, and live order submission.
 */
import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
export interface ReauthPayload {
    userId: number;
    action: string;
    scope: 'reauth';
    iat?: number;
    exp?: number;
}
export interface ReauthRequest extends AuthRequest {
    reauthenticated?: boolean;
    reauthAction?: string;
}
/**
 * Issues a short-lived scoped JWT reauthentication token.
 */
export declare function issueReauthToken(userId: number, action?: string, ttlSeconds?: number): {
    token: string;
    expiresIn: number;
    expiresAt: string;
};
/**
 * Verifies a scoped reauthentication token.
 */
export declare function verifyReauthToken(token: string, expectedUserId: number, expectedAction?: string): boolean;
/**
 * Middleware factory requiring reauthentication for a specific action or generally.
 */
export declare function requireReauth(actionName?: string): (req: ReauthRequest, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=requireReauth.d.ts.map