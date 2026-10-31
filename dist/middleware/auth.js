"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireVerifiedIdentity = requireVerifiedIdentity;
exports.requireMasterAccount = requireMasterAccount;
exports.isMasterAccount = isMasterAccount;
exports.requireAuth = requireAuth;
exports.optionalAuth = optionalAuth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const jwt_1 = require("../config/jwt");
const database_1 = __importDefault(require("../config/database"));
/** Observer/billing actions require a verified email or a stronger verified identity. */
async function requireVerifiedIdentity(req, res, next) {
    if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }
    try {
        const rows = await (0, database_1.default) `
      SELECT identity_verified_at, email_verified_at, is_active
      FROM users WHERE id = ${req.user.userId} LIMIT 1
    `;
        if (!rows[0]?.is_active) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }
        if (!rows[0].identity_verified_at && !rows[0].email_verified_at) {
            res.status(403).json({ error: 'Verified email required', code: 'IDENTITY_UNVERIFIED' });
            return;
        }
        next();
    }
    catch (error) {
        next(error);
    }
}
async function requireMasterAccount(req, res, next) {
    if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }
    const masterEmails = (process.env.MASTER_ACCOUNT_EMAIL ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
    if (masterEmails.length === 0) {
        res.status(503).json({ error: 'Master account is not configured' });
        return;
    }
    try {
        const rows = await (0, database_1.default) `
      SELECT email, identity_verified_at, is_active
      FROM users WHERE id = ${req.user.userId} LIMIT 1
    `;
        const account = rows[0];
        if (!account?.is_active) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }
        if (!account.identity_verified_at) {
            res.status(403).json({ error: 'Verified identity required', code: 'IDENTITY_UNVERIFIED' });
            return;
        }
        if (!masterEmails.includes(account.email.trim().toLowerCase())) {
            res.status(403).json({ error: 'Master account required' });
            return;
        }
        next();
    }
    catch (error) {
        next(error);
    }
}
async function isMasterAccount(userId) {
    const masterEmails = (process.env.MASTER_ACCOUNT_EMAIL ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
    if (masterEmails.length === 0)
        return false;
    const rows = await (0, database_1.default) `
    SELECT email, identity_verified_at, is_active
    FROM users WHERE id = ${userId} LIMIT 1
  `;
    const account = rows[0];
    return Boolean(account?.is_active
        && account.identity_verified_at
        && masterEmails.includes(account.email.trim().toLowerCase()));
}
function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing or invalid Authorization header' });
        return;
    }
    const token = header.slice(7);
    try {
        const payload = jsonwebtoken_1.default.verify(token, jwt_1.JWT_SECRET);
        req.user = payload;
        next();
    }
    catch {
        res.status(401).json({ error: 'Token expired or invalid' });
    }
}
function optionalAuth(req, _res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
        next();
        return;
    }
    const token = header.slice(7);
    try {
        const payload = jsonwebtoken_1.default.verify(token, jwt_1.JWT_SECRET);
        req.user = payload;
    }
    catch {
        // Gracefully ignore token errors for optional auth
    }
    next();
}
//# sourceMappingURL=auth.js.map