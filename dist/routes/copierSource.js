"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const copierNotificationService_1 = require("../services/copierNotificationService");
const router = (0, express_1.Router)();
function pageValue(value, fallback, maximum) {
    if (value === undefined)
        return fallback;
    if (typeof value !== 'string' || !/^\d{1,8}$/.test(value))
        return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
}
router.get('/notifications', auth_1.requireAuth, async (req, res, next) => {
    const limit = pageValue(req.query.limit, 50, 100);
    const offset = pageValue(req.query.offset, 0, 10_000_000);
    if (limit === null || limit < 1 || offset === null) {
        res.status(400).json({ error: 'Invalid pagination parameters' });
        return;
    }
    try {
        const enabled = await (0, copierNotificationService_1.isConfiguredCopierSourceMonitor)(req.user.userId);
        if (!enabled) {
            res.json({ enabled: false, events: [], limit, offset });
            return;
        }
        res.json({
            enabled: true,
            events: await (0, copierNotificationService_1.listCopierNotificationEvents)(limit, offset),
            limit,
            offset,
        });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=copierSource.js.map