"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDeviceId = getDeviceId;
exports.getRealIp = getRealIp;
const crypto_1 = __importDefault(require("crypto"));
/**
 * Derive a stable device fingerprint from the request.
 * Not cryptographically binding — used as a heuristic signal alongside IP.
 */
function getDeviceId(req) {
    const ua = req.headers['user-agent'] ?? '';
    const lang = req.headers['accept-language'] ?? '';
    const enc = req.headers['accept-encoding'] ?? '';
    const xForward = req.headers['x-forwarded-for'] ?? '';
    const raw = `${ua}|${lang}|${enc}|${xForward}`;
    return crypto_1.default.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}
/**
 * Extract the best-effort real IP from the request.
 * Trusts X-Forwarded-For for use behind a reverse proxy / Railway / Render.
 */
function getRealIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
        return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress ?? '0.0.0.0';
}
//# sourceMappingURL=deviceFingerprint.js.map