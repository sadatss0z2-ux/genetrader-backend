"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestIdMiddleware = requestIdMiddleware;
const crypto_1 = require("crypto");
function requestIdMiddleware(req, res, next) {
    // Use existing request ID from header if present
    const existingId = req.headers['x-request-id'];
    // Validate existing ID is a valid UUID
    if (existingId && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existingId)) {
        req.request_id = existingId;
    }
    else {
        // Generate new UUID v4
        req.request_id = (0, crypto_1.randomUUID)();
    }
    // Add to response headers
    res.setHeader('X-Request-ID', req.request_id);
    next();
}
//# sourceMappingURL=requestId.js.map