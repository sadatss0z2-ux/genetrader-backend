"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditMiddleware = auditMiddleware;
const database_1 = __importDefault(require("../config/database"));
const SENSITIVE_PATH_KEYS = /(?:password|secret|token|authorization|cookie|session|jwt|api[_-]?key|bearer)/i;
function normalizeAuditPath(req) {
    const value = (req.originalUrl ?? req.url ?? req.path ?? '/').split('?')[0] || '/';
    return value.length > 2048 ? value.slice(0, 2048) : value;
}
function redactSensitiveValue(value) {
    if (typeof value !== 'string')
        return 'REDACTED';
    return value.length > 0 ? 'REDACTED' : '';
}
function sanitizeAuditObject(value) {
    if (Array.isArray(value)) {
        return value.map((entry) => sanitizeAuditObject(entry));
    }
    if (value && typeof value === 'object') {
        const sanitized = {};
        for (const [key, entryValue] of Object.entries(value)) {
            if (SENSITIVE_PATH_KEYS.test(key)) {
                sanitized[key] = redactSensitiveValue(entryValue);
            }
            else if (entryValue && typeof entryValue === 'object') {
                sanitized[key] = sanitizeAuditObject(entryValue);
            }
            else {
                sanitized[key] = entryValue;
            }
        }
        return sanitized;
    }
    return value;
}
async function auditMiddleware(req, res, next) {
    // Skip audit logging in test environment
    if (process.env.NODE_ENV === 'test') {
        next();
        return;
    }
    const originalSend = res.send;
    res.send = function (body) {
        if (res.statusCode >= 400) {
            const metadata = {
                method: req.method,
                path: normalizeAuditPath(req),
                status: res.statusCode,
            };
            const auditEvent = {
                event_type: `HTTP_${res.statusCode}`,
                user_id: req.user?.userId ?? null,
                request_id: req.request_id || 'unknown',
                ip_address: (req.ip || req.socket.remoteAddress || null),
                user_agent: req.get('user-agent') || null,
                metadata: sanitizeAuditObject(metadata),
            };
            (0, database_1.default) `
        INSERT INTO audit_events (event_type, user_id, request_id, ip_address, user_agent, metadata)
        VALUES (${auditEvent.event_type}, ${auditEvent.user_id}, ${auditEvent.request_id},
                ${auditEvent.ip_address}, ${auditEvent.user_agent}, ${JSON.stringify(auditEvent.metadata)}::jsonb)
      `.catch((err) => {
                if (!err.message?.includes('audit_events') && !err.message?.includes('ENOTFOUND')) {
                    console.error('[AUDIT] Failed to log audit event:', err);
                }
            });
        }
        return originalSend.call(this, body);
    };
    next();
}
//# sourceMappingURL=audit.js.map