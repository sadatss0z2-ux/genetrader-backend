"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importStar(require("express"));
const express_validator_1 = require("express-validator");
const auth_1 = require("../middleware/auth");
const database_1 = __importDefault(require("../config/database"));
const userService_1 = require("../services/userService");
const profileImageStorage_1 = require("../services/profileImageStorage");
const logger_1 = __importDefault(require("../utils/logger"));
const router = (0, express_1.Router)();
const profileImageBodyParser = express_1.default.raw({
    type: ['image/jpeg', 'image/png', 'image/webp'],
    limit: '5mb',
});
// All user routes require authentication
router.use(auth_1.requireAuth);
// ── POST /api/users/push-token ────────────────────────────────────────────────
router.post('/push-token', (0, express_validator_1.body)('token').isString().trim().isLength({ min: 20, max: 4096 }), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    try {
        const token = req.body.token.trim();
        await (0, database_1.default) `
        INSERT INTO user_push_tokens (user_id, token)
        VALUES (${req.user.userId}, ${token})
        ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, updated_at = NOW()
      `;
        res.status(204).end();
    }
    catch (err) {
        next(err);
    }
});
// ── DELETE /api/users/push-token ──────────────────────────────────────────────
router.delete('/push-token', (0, express_validator_1.body)('token').isString().trim().isLength({ min: 20, max: 4096 }), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    try {
        await (0, database_1.default) `
        DELETE FROM user_push_tokens
        WHERE user_id = ${req.user.userId} AND token = ${req.body.token.trim()}
      `;
        res.status(204).end();
    }
    catch (err) {
        next(err);
    }
});
// ── GET /api/users/profile ───────────────────────────────────────────────────
router.get('/profile', async (req, res, next) => {
    try {
        const profile = await (0, userService_1.getUserProfile)(req.user.userId);
        res.json({ profile });
    }
    catch (err) {
        next(err);
    }
});
// ── PUT /api/users/profile ───────────────────────────────────────────────────
router.put('/profile', (0, express_validator_1.body)('displayName').optional().isString().trim().isLength({ min: 1, max: 255 }), async (req, res, next) => {
    if (Object.keys(req.body ?? {}).some(key => key !== 'displayName')) {
        res.status(400).json({ error: 'Only the display name can be updated here. Upload profile images using the photo endpoint.' });
        return;
    }
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    try {
        const profile = await (0, userService_1.updateUserProfile)(req.user.userId, {
            displayName: req.body.displayName,
        });
        res.json({ profile });
    }
    catch (err) {
        next(err);
    }
});
// ── PUT /api/users/profile/photo ─────────────────────────────────────────────
router.put('/profile/photo', (req, res, next) => {
    const contentType = req.header('content-type')?.split(';', 1)[0].trim().toLowerCase();
    if (!contentType || !['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
        res.status(415).json({ error: 'Choose a JPEG, PNG or WebP image.' });
        return;
    }
    next();
}, (req, res, next) => {
    profileImageBodyParser(req, res, error => {
        if (!error) {
            next();
            return;
        }
        if (typeof error === 'object' && error !== null && 'status' in error
            && typeof error.status === 'number' && error.status >= 400 && error.status < 500) {
            res.status(error.status).json({
                error: error.status === 413
                    ? 'Profile images must be smaller than 5 MB.'
                    : 'The uploaded image request could not be read.',
            });
            return;
        }
        next(error);
    });
}, async (req, res, next) => {
    if (!Buffer.isBuffer(req.body)) {
        res.status(400).json({ error: 'The uploaded image could not be read.' });
        return;
    }
    try {
        const contentType = req.header('content-type').split(';', 1)[0].trim().toLowerCase();
        const reference = await (0, profileImageStorage_1.storeProfileImage)(req.user.userId, req.body, contentType);
        try {
            const profile = await (0, userService_1.replaceUserProfileImage)(req.user.userId, reference);
            res.json({ profile });
        }
        catch (error) {
            try {
                await (0, profileImageStorage_1.deleteStoredProfileImage)(reference);
            }
            catch (cleanupError) {
                logger_1.default.error({ err: cleanupError, userId: req.user.userId }, 'Could not clean up an unlinked profile image');
            }
            throw error;
        }
    }
    catch (err) {
        next(err);
    }
});
// ── GET /api/users/settings ──────────────────────────────────────────────────
router.get('/settings', async (req, res, next) => {
    try {
        const settings = await (0, userService_1.getUserSettings)(req.user.userId);
        res.json({ settings });
    }
    catch (err) {
        next(err);
    }
});
// ── PUT /api/users/settings ──────────────────────────────────────────────────
router.put('/settings', (0, express_validator_1.body)('notificationsEnabled').optional().isBoolean(), (0, express_validator_1.body)('biometricEnabled').optional().isBoolean(), (0, express_validator_1.body)('theme').optional().isIn(['dark', 'light']).withMessage('theme must be dark or light'), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    try {
        const settings = await (0, userService_1.updateUserSettings)(req.user.userId, {
            notificationsEnabled: req.body.notificationsEnabled,
            biometricEnabled: req.body.biometricEnabled,
            theme: req.body.theme,
        });
        res.json({ settings });
    }
    catch (err) {
        next(err);
    }
});
// ── GET /api/users/notifications ─────────────────────────────────────────────
router.get('/notifications', async (req, res, next) => {
    try {
        const rows = await (0, database_1.default) `
      SELECT id, type, message, read, created_at
      FROM notifications
      WHERE user_id = ${req.user.userId}
      ORDER BY created_at DESC
      LIMIT 50
    `;
        res.json({ notifications: rows });
    }
    catch (err) {
        next(err);
    }
});
// ── POST /api/users/notifications/read-all ─────────────────────────────────────
router.post('/notifications/read-all', async (req, res, next) => {
    try {
        await (0, database_1.default) `
      UPDATE notifications
      SET read = TRUE
      WHERE user_id = ${req.user.userId} AND read = FALSE
    `;
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
// ── PUT /api/users/notifications/:id/read ──────────────────────────────────────
router.put('/notifications/:id/read', async (req, res, next) => {
    try {
        const notifId = Number(req.params.id);
        if (!Number.isSafeInteger(notifId)) {
            res.status(400).json({ error: 'Invalid notification id' });
            return;
        }
        await (0, database_1.default) `
      UPDATE notifications
      SET read = TRUE
      WHERE id = ${notifId} AND user_id = ${req.user.userId}
    `;
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=users.js.map