"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireCopierInstance = requireCopierInstance;
exports.requireMatchingCopierInstance = requireMatchingCopierInstance;
const node_crypto_1 = require("node:crypto");
const database_1 = __importDefault(require("../config/database"));
/** Per-instance machine auth. Missing configuration, token or instance always denies. */
async function requireCopierInstance(req, res, next) {
    const instanceId = req.header('x-copier-instance');
    const authorization = req.header('authorization');
    const match = authorization?.match(/^Bearer ([A-Za-z0-9._~-]{32,512})$/);
    if (!instanceId || !/^[A-Za-z0-9._-]{1,100}$/.test(instanceId) || !match) {
        res.status(401).json({ error: 'Machine authentication required' });
        return;
    }
    try {
        const rows = await (0, database_1.default) `
      SELECT auth_token_sha256 FROM copier_instances WHERE instance_id = ${instanceId} AND enabled = TRUE LIMIT 1
    `;
        if (!rows.length) {
            res.status(401).json({ error: 'Machine authentication required' });
            return;
        }
        const expected = Buffer.from(rows[0].auth_token_sha256, 'hex');
        const actual = Buffer.from((0, node_crypto_1.createHash)('sha256').update(match[1]).digest('hex'), 'hex');
        if (expected.length !== actual.length || !(0, node_crypto_1.timingSafeEqual)(expected, actual)) {
            res.status(401).json({ error: 'Machine authentication required' });
            return;
        }
        req.copierInstanceId = instanceId;
        next();
    }
    catch (error) {
        next(error);
    }
}
function requireMatchingCopierInstance(req, value, res) {
    if (typeof value !== 'string' || value !== req.copierInstanceId) {
        res.status(403).json({ error: 'Instance scope mismatch' });
        return false;
    }
    return true;
}
//# sourceMappingURL=copierAuth.js.map