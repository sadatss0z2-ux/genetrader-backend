import { Request } from 'express';
/**
 * Derive a stable device fingerprint from the request.
 * Not cryptographically binding — used as a heuristic signal alongside IP.
 */
export declare function getDeviceId(req: Request): string;
/**
 * Extract the best-effort real IP from the request.
 * Trusts X-Forwarded-For for use behind a reverse proxy / Railway / Render.
 */
export declare function getRealIp(req: Request): string;
//# sourceMappingURL=deviceFingerprint.d.ts.map