/** Strict limiter for auth endpoints (prevents brute-force). */
export declare const authLimiter: import("express-rate-limit").RateLimitRequestHandler;
/** Tighter rate limit for password reset requests and code submissions. */
export declare const passwordResetLimiter: import("express-rate-limit").RateLimitRequestHandler;
/** General API limiter for all routes. */
export declare const apiLimiter: import("express-rate-limit").RateLimitRequestHandler;
/** Referral click limiter (prevents click spam). */
export declare const clickLimiter: import("express-rate-limit").RateLimitRequestHandler;
/** Trading limiter (prevents excessive trading). */
export declare const tradingLimiter: import("express-rate-limit").RateLimitRequestHandler;
/** Isolated rate cap for the authenticated copier control plane. */
export declare const copierLimiter: import("express-rate-limit").RateLimitRequestHandler;
//# sourceMappingURL=rateLimiter.d.ts.map