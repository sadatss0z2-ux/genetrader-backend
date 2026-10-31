"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENDPOINT_PUBLIC_ACCESS = exports.ENDPOINT_OBSERVER_ACCESS = exports.IDEMPOTENCY_RETENTION_DAYS = exports.IDEMPOTENCY_KEY_PATTERN = void 0;
exports.assertValidIdempotencyKey = assertValidIdempotencyKey;
exports.hashObserverRequest = hashObserverRequest;
exports.hashPublicAccessRequest = hashPublicAccessRequest;
exports.requireStoredString = requireStoredString;
exports.loadIdempotentReplay = loadIdempotentReplay;
exports.persistIdempotentResponse = persistIdempotentResponse;
const node_crypto_1 = require("node:crypto");
const errorHandler_1 = require("../middleware/errorHandler");
exports.IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;
exports.IDEMPOTENCY_RETENTION_DAYS = 30;
exports.ENDPOINT_OBSERVER_ACCESS = 'POST /v1/observer-access-requests';
exports.ENDPOINT_PUBLIC_ACCESS = 'POST /v1/access-requests';
function assertValidIdempotencyKey(raw) {
    if (typeof raw !== 'string' || !exports.IDEMPOTENCY_KEY_PATTERN.test(raw.trim())) {
        throw (0, errorHandler_1.createError)('Missing or invalid Idempotency-Key header', 400);
    }
    return raw.trim();
}
function hashObserverRequest(consentVersion) {
    return (0, node_crypto_1.createHash)('sha256')
        .update(JSON.stringify({ consent_accepted: true, consent_version: consentVersion }), 'utf8')
        .digest('hex');
}
function hashPublicAccessRequest(email, consentVersion) {
    return (0, node_crypto_1.createHash)('sha256')
        .update(JSON.stringify({
        email: email.trim().toLowerCase(),
        consent_accepted: true,
        consent_version: consentVersion,
    }), 'utf8')
        .digest('hex');
}
function advisoryLockParts(endpoint, scopeRef, idempotencyKey) {
    const digest = (0, node_crypto_1.createHash)('sha256').update(`${endpoint}\0${scopeRef}\0${idempotencyKey}`, 'utf8').digest();
    return {
        high: digest.readInt32BE(0),
        low: digest.readInt32BE(4),
    };
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function requireStoredString(body, field) {
    const value = body[field];
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`Stored idempotency response is missing ${field}`);
    }
    return value;
}
async function loadIdempotentReplay(tx, input) {
    const lock = advisoryLockParts(input.endpoint, input.scopeRef, input.idempotencyKey);
    await tx `SELECT pg_advisory_xact_lock(${lock.high}, ${lock.low})`;
    const existing = await tx `
    SELECT request_hash, http_status, response_body::text AS response_body
    FROM api_idempotency_records
    WHERE endpoint = ${input.endpoint}
      AND scope_ref = ${input.scopeRef}
      AND idempotency_key = ${input.idempotencyKey}
      AND expires_at > NOW()
    FOR UPDATE
  `;
    if (!existing.length)
        return null;
    if (existing[0].request_hash !== input.requestHash) {
        throw (0, errorHandler_1.createError)('Idempotency-Key was already used with a different request body', 409, 'IDEMPOTENCY_KEY_REUSED');
    }
    // postgres may deserialize JSONB values even when the query casts them to
    // text, while test and HTTP adapters can return the text representation.
    const rawBody = existing[0].response_body;
    let body = rawBody;
    for (let attempt = 0; attempt < 2 && typeof body === 'string'; attempt += 1) {
        body = JSON.parse(body);
    }
    if (!isRecord(body))
        throw new Error('Stored idempotency response body must be a JSON object');
    return { httpStatus: existing[0].http_status, body };
}
async function persistIdempotentResponse(tx, input) {
    const expiresAt = new Date(Date.now() + exports.IDEMPOTENCY_RETENTION_DAYS * 86_400_000);
    await tx `
    INSERT INTO api_idempotency_records
      (id, endpoint, scope_ref, idempotency_key, request_hash, http_status, response_body, expires_at)
    VALUES (${input.id}, ${input.endpoint}, ${input.scopeRef}, ${input.idempotencyKey}, ${input.requestHash},
      ${input.httpStatus}, ${JSON.stringify(input.body)}::jsonb, ${expiresAt})
  `;
}
//# sourceMappingURL=idempotencyService.js.map