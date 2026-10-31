"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireCopierEventToken = requireCopierEventToken;
const node_crypto_1 = require("node:crypto");
function requireCopierEventToken(req, res, next) {
    const expectedToken = process.env.COPIER_EVENT_INGEST_TOKEN?.trim();
    if (!expectedToken || expectedToken.length < 32 || expectedToken.length > 512) {
        res.status(503).json({ error: 'Copier event intake is not configured' });
        return;
    }
    const match = req.header('authorization')?.match(/^Bearer ([^\s]{32,512})$/);
    if (!match) {
        res.status(401).json({ error: 'Machine authentication required' });
        return;
    }
    const expected = (0, node_crypto_1.createHash)('sha256').update(expectedToken).digest();
    const actual = (0, node_crypto_1.createHash)('sha256').update(match[1]).digest();
    if (!(0, node_crypto_1.timingSafeEqual)(expected, actual)) {
        res.status(401).json({ error: 'Machine authentication required' });
        return;
    }
    next();
}
//# sourceMappingURL=copierEventAuth.js.map