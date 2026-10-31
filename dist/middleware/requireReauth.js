"use strict";
/**
 * Reauthentication Control Middleware (P6-01)
 *
 * Enforces mandatory reauthentication (password re-verification or short-lived scoped reauth token)
 * for high-risk actions such as live trading enablement, canary enrollment, exchange credential
 * rotation/revocation, and live order submission.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.issueReauthToken = issueReauthToken;
exports.verifyReauthToken = verifyReauthToken;
exports.requireReauth = requireReauth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const jwt_1 = require("../config/jwt");
const authService_1 = require("../services/authService");
const environment_1 = require("../config/environment");
/**
 * Issues a short-lived scoped JWT reauthentication token.
 */
function issueReauthToken(userId, action = 'sensitive_action', ttlSeconds) {
    const envConfig = (0, environment_1.getEnvironmentConfig)();
    const expiresIn = ttlSeconds ?? envConfig.reauthTtlSeconds ?? environment_1.DEFAULT_REAUTH_TTL_SECONDS;
    const payload = {
        userId,
        action,
        scope: 'reauth',
    };
    const token = jsonwebtoken_1.default.sign(payload, jwt_1.JWT_SECRET, {
        expiresIn: `${expiresIn}s`,
    });
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    return { token, expiresIn, expiresAt };
}
/**
 * Verifies a scoped reauthentication token.
 */
function verifyReauthToken(token, expectedUserId, expectedAction) {
    try {
        const payload = jsonwebtoken_1.default.verify(token, jwt_1.JWT_SECRET);
        if (payload.scope !== 'reauth')
            return false;
        if (payload.userId !== expectedUserId)
            return false;
        if (expectedAction && payload.action !== 'all' && payload.action !== expectedAction) {
            return false;
        }
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Middleware factory requiring reauthentication for a specific action or generally.
 */
function requireReauth(actionName = 'sensitive_operation') {
    return async (req, res, next) => {
        if (!req.user || !req.user.userId) {
            res.status(401).json({
                error: 'Authentication required before reauthentication challenge',
                code: 'UNAUTHENTICATED',
            });
            return;
        }
        const userId = req.user.userId;
        // 1. Check for X-Reauth-Token header
        const tokenHeader = req.headers['x-reauth-token'] || '';
        if (tokenHeader && verifyReauthToken(tokenHeader, userId, actionName)) {
            req.reauthenticated = true;
            req.reauthAction = actionName;
            next();
            return;
        }
        // 2. Check for X-Reauth-Password header
        const passwordHeader = req.headers['x-reauth-password'] || '';
        if (passwordHeader) {
            const isValid = await (0, authService_1.verifyPassword)(userId, passwordHeader);
            if (isValid) {
                req.reauthenticated = true;
                req.reauthAction = actionName;
                next();
                return;
            }
        }
        // 3. Check for password in body
        const bodyPassword = req.body?.reauthPassword || req.body?.password;
        if (typeof bodyPassword === 'string' && bodyPassword.trim().length > 0) {
            const isValid = await (0, authService_1.verifyPassword)(userId, bodyPassword);
            if (isValid) {
                req.reauthenticated = true;
                req.reauthAction = actionName;
                next();
                return;
            }
        }
        // Reauthentication required and none was valid
        res.status(403).json({
            error: `Reauthentication required for action: ${actionName}`,
            code: 'REAUTH_REQUIRED',
            action: actionName,
            requiresPassword: true,
            message: 'Please provide a valid X-Reauth-Token header or user password to proceed.',
        });
    };
}
//# sourceMappingURL=requireReauth.js.map