"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const copierEventAuth_1 = require("../middleware/copierEventAuth");
const copierNotificationService_1 = require("../services/copierNotificationService");
const router = (0, express_1.Router)();
router.post('/notifications', copierEventAuth_1.requireCopierEventToken, (0, express_validator_1.body)('event_id').isUUID(), (0, express_validator_1.body)('message').isString().trim().isLength({ min: 1, max: 4096 }), (0, express_validator_1.body)('occurred_at').isISO8601({ strict: true, strictSeparator: true }), async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ error: 'Invalid copier notification event' });
        return;
    }
    if (Object.keys(req.body ?? {}).some((key) => !['event_id', 'message', 'occurred_at'].includes(key))) {
        res.status(400).json({ error: 'Unexpected request field' });
        return;
    }
    const occurredAt = new Date(req.body.occurred_at);
    if (!Number.isFinite(occurredAt.getTime())) {
        res.status(400).json({ error: 'Invalid copier notification event' });
        return;
    }
    try {
        const accepted = await (0, copierNotificationService_1.storeCopierNotificationEvent)({
            eventId: req.body.event_id,
            message: req.body.message.trim(),
            occurredAt,
        });
        res.status(accepted ? 201 : 200).json({ accepted: true, duplicate: !accepted });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=copierEvents.js.map