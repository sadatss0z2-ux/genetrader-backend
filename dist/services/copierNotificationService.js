"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isConfiguredCopierSourceMonitor = isConfiguredCopierSourceMonitor;
exports.storeCopierNotificationEvent = storeCopierNotificationEvent;
exports.listCopierNotificationEvents = listCopierNotificationEvents;
const database_1 = __importDefault(require("../config/database"));
const notificationService_1 = require("./notificationService");
async function isConfiguredCopierSourceMonitor(userId) {
    const monitorEmails = (process.env.COPIER_SOURCE_MONITOR_EMAIL ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
    const masterEmails = (process.env.MASTER_ACCOUNT_EMAIL ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
    const allowed = new Set([...monitorEmails, ...masterEmails]);
    if (allowed.size === 0)
        return false;
    const rows = await (0, database_1.default) `
    SELECT email FROM users
    WHERE id = ${userId}
      AND is_active = TRUE
      AND (email_verified_at IS NOT NULL OR identity_verified_at IS NOT NULL)
    LIMIT 1
  `;
    const email = rows[0]?.email?.trim().toLowerCase();
    return Boolean(email && allowed.has(email));
}
async function storeCopierNotificationEvent(input) {
    const inserted = await (0, database_1.default) `
    INSERT INTO copier_notification_events (event_id, message, occurred_at)
    VALUES (${input.eventId}, ${input.message}, ${input.occurredAt})
    ON CONFLICT (event_id) DO NOTHING
    RETURNING event_id
  `;
    if (inserted.length) {
        await (0, notificationService_1.notifyCopierEvent)({ eventId: input.eventId, message: input.message });
    }
    return inserted.length > 0;
}
async function listCopierNotificationEvents(limit, offset) {
    return (0, database_1.default) `
    SELECT event_id, message, occurred_at, received_at
    FROM copier_notification_events
    ORDER BY occurred_at DESC, event_id DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}
//# sourceMappingURL=copierNotificationService.js.map