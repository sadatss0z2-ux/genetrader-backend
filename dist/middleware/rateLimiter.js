"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.copierLimiter = exports.tradingLimiter = exports.clickLimiter = exports.apiLimiter = exports.passwordResetLimiter = exports.authLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const validate = { xForwardedForHeader: false };
/** Strict limiter for auth endpoints (prevents brute-force). */
exports.authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
    validate,
});
/** Tighter rate limit for password reset requests and code submissions. */
exports.passwordResetLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many password reset attempts. Please wait and try again.' },
    validate,
});
/** General API limiter for all routes. */
exports.apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000, // 1 min
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Rate limit exceeded.' },
    validate,
});
/** Referral click limiter (prevents click spam). */
exports.clickLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many referral clicks from this IP.' },
    validate,
});
/** Trading limiter (prevents excessive trading). */
exports.tradingLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many trading requests, please slow down.' },
    validate,
});
/** Isolated rate cap for the authenticated copier control plane. */
exports.copierLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Copier control rate limit exceeded.' },
    validate,
});
//# sourceMappingURL=rateLimiter.js.map