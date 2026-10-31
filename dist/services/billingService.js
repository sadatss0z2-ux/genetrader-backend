"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyProviderEvent = applyProviderEvent;
const node_crypto_1 = require("node:crypto");
const database_1 = __importDefault(require("../config/database"));
const errorHandler_1 = require("../middleware/errorHandler");
const entitlementPolicy_1 = require("./entitlementPolicy");
const entitlementService_1 = require("./entitlementService");
/** Applies only provider-verified events. No checkout/client path calls this service. */
async function applyProviderEvent(event) {
    return database_1.default.begin(async (tx) => {
        const existing = await tx `
      SELECT id FROM payment_receipts WHERE provider = ${event.provider} AND provider_event_id = ${event.eventId}
    `;
        if (existing.length) {
            const receipt = await tx `SELECT user_id FROM payment_receipts WHERE id = ${existing[0].id}`;
            await (0, entitlementService_1.writeEntitlementAudit)(tx, { userId: receipt[0]?.user_id ?? null, actorType: 'PAYMENT_PROVIDER', actorRef: event.provider, eventType: 'PAYMENT_EVENT_DUPLICATE', subjectType: 'payment_receipt', subjectRef: existing[0].id, details: { event_id: event.eventId } });
            return { disposition: 'DUPLICATE', duplicate: true };
        }
        if (event.transactionRef) {
            const transaction = await tx `
        SELECT id FROM payment_receipts WHERE provider = ${event.provider}
          AND provider_transaction_ref = ${event.transactionRef} AND event_type = ${event.eventType} LIMIT 1
      `;
            if (transaction.length) {
                const receipt = await tx `SELECT user_id FROM payment_receipts WHERE id = ${transaction[0].id}`;
                await (0, entitlementService_1.writeEntitlementAudit)(tx, { userId: receipt[0]?.user_id ?? null, actorType: 'PAYMENT_PROVIDER', actorRef: event.provider, eventType: 'PAYMENT_TRANSACTION_DUPLICATE', subjectType: 'payment_receipt', subjectRef: transaction[0].id, details: { event_id: event.eventId } });
                return { disposition: 'DUPLICATE', duplicate: true };
            }
        }
        const customer = await tx `
      SELECT c.user_id FROM billing_customers c JOIN users u ON u.id = c.user_id
      WHERE c.provider = ${event.provider} AND c.provider_customer_ref = ${event.customerRef}
        AND u.is_active = TRUE AND u.identity_verified_at IS NOT NULL
    `;
        const userId = customer[0]?.user_id ?? null;
        const currentRows = userId === null ? [] : await tx `
      SELECT id, status, paid_through_at, last_provider_sequence, last_provider_occurred_at, provider_subscription_ref
      FROM subscriptions WHERE user_id = ${userId} AND provider = ${event.provider}
        AND (${event.subscriptionRef}::text IS NULL OR provider_subscription_ref = ${event.subscriptionRef})
      ORDER BY updated_at DESC LIMIT 1 FOR UPDATE
    `;
        let disposition = userId === null ? 'UNMAPPED' : 'APPLIED';
        const current = currentRows[0];
        if (userId !== null && current && (0, entitlementPolicy_1.isStaleProviderEvent)({
            incomingSequence: event.sequence,
            lastSequence: current.last_provider_sequence === null ? null : Number(current.last_provider_sequence),
            occurredAt: event.occurredAt,
            lastOccurredAt: current.last_provider_occurred_at,
        }))
            disposition = 'STALE';
        const entitlementGrant = ['payment_succeeded', 'subscription_renewed'].includes(event.eventType);
        if (entitlementGrant && (!event.paidThroughAt || event.paidThroughAt.getTime() <= Date.now() || !event.plan))
            disposition = 'REVIEW_REQUIRED';
        const receiptId = (0, node_crypto_1.randomUUID)();
        const receiptRows = await tx `
      INSERT INTO payment_receipts (id, provider, provider_event_id, provider_transaction_ref, user_id, event_type,
        provider_sequence, occurred_at, payload_sha256, disposition)
      VALUES (${receiptId}, ${event.provider}, ${event.eventId}, ${event.transactionRef}, ${userId}, ${event.eventType},
        ${event.sequence}, ${event.occurredAt}, ${event.payloadSha256}, ${disposition})
      ON CONFLICT DO NOTHING RETURNING id
    `;
        if (!receiptRows.length) {
            const racedReceipt = event.transactionRef
                ? await tx `
          SELECT id, user_id FROM payment_receipts WHERE provider = ${event.provider}
            AND (provider_event_id = ${event.eventId} OR provider_transaction_ref = ${event.transactionRef} AND event_type = ${event.eventType})
          ORDER BY received_at DESC LIMIT 1
        `
                : await tx `
          SELECT id, user_id FROM payment_receipts WHERE provider = ${event.provider} AND provider_event_id = ${event.eventId} LIMIT 1
        `;
            if (racedReceipt.length)
                await (0, entitlementService_1.writeEntitlementAudit)(tx, { userId: racedReceipt[0].user_id, actorType: 'PAYMENT_PROVIDER', actorRef: event.provider, eventType: 'PAYMENT_EVENT_DUPLICATE', subjectType: 'payment_receipt', subjectRef: racedReceipt[0].id, details: { event_id: event.eventId } });
            return { disposition: 'DUPLICATE', duplicate: true };
        }
        if (disposition !== 'APPLIED' || userId === null) {
            await (0, entitlementService_1.writeEntitlementAudit)(tx, {
                userId, actorType: 'PAYMENT_PROVIDER', actorRef: event.provider,
                eventType: `PAYMENT_EVENT_${disposition}`, subjectType: 'payment_receipt', subjectRef: receiptId,
                details: { event_type: event.eventType, event_id: event.eventId },
            });
            return { disposition, duplicate: false };
        }
        const status = (0, entitlementPolicy_1.transitionForProviderEvent)((current?.status ?? 'PENDING'), event.eventType);
        let subscriptionId = current?.id ?? (0, node_crypto_1.randomUUID)();
        if (current) {
            await tx `
        UPDATE subscriptions SET status = ${status},
          plan = CASE WHEN ${entitlementGrant} THEN ${event.plan} ELSE plan END,
          paid_through_at = CASE WHEN ${entitlementGrant} THEN ${event.paidThroughAt} ELSE paid_through_at END,
          last_provider_sequence = COALESCE(${event.sequence}, last_provider_sequence),
          last_provider_occurred_at = ${event.occurredAt}, updated_at = NOW()
        WHERE id = ${current.id}
      `;
        }
        else {
            await tx `
        INSERT INTO subscriptions (id, user_id, provider, provider_subscription_ref, plan, status, paid_through_at, last_provider_sequence, last_provider_occurred_at)
        VALUES (${subscriptionId}, ${userId}, ${event.provider}, ${event.subscriptionRef}, ${event.plan}, ${status},
          ${entitlementGrant ? event.paidThroughAt : null}, ${event.sequence}, ${event.occurredAt})
      `;
        }
        if (entitlementGrant) {
            const instances = await tx `
        SELECT instance_id FROM copier_instances WHERE enabled = TRUE ORDER BY instance_id LIMIT 2
      `;
            if (instances.length !== 1)
                throw (0, errorHandler_1.createError)('Copier provisioning is not configured; provider event will retry', 503);
            const membershipRows = await tx `
        SELECT membership_id, user_id, instance_id, copier_account_ref, desired_state, revision
        FROM copier_memberships WHERE user_id = ${userId} AND instance_id = ${instances[0].instance_id} FOR UPDATE
      `;
            let member;
            let operation;
            if (membershipRows.length) {
                member = membershipRows[0];
                operation = 'UPDATE_ROLE';
            }
            else {
                member = {
                    membership_id: (0, node_crypto_1.randomUUID)(), user_id: userId, instance_id: instances[0].instance_id,
                    copier_account_ref: null, desired_state: 'PAID_ACTIVE', revision: 0,
                };
                operation = 'GRANT';
                await tx `INSERT INTO copier_memberships (membership_id, user_id, instance_id, desired_state)
          VALUES (${member.membership_id}, ${userId}, ${member.instance_id}, 'PAID_ACTIVE')`;
            }
            await tx `
        INSERT INTO entitlement_grants (id, user_id, grant_type, source_id, status, starts_at, expires_at)
        VALUES (${(0, node_crypto_1.randomUUID)()}, ${userId}, 'SUBSCRIPTION', ${subscriptionId}, 'ACTIVE', ${event.occurredAt}, ${event.paidThroughAt})
        ON CONFLICT (grant_type, source_id) DO UPDATE SET status = 'ACTIVE', expires_at = EXCLUDED.expires_at
      `;
            await (0, entitlementService_1.enqueueCopierCommand)(tx, member, operation, 'PAID_ACTIVE', null, event.paidThroughAt, []);
        }
        else if (['refund', 'dispute_opened'].includes(event.eventType)) {
            const members = await tx `
        SELECT membership_id, user_id, instance_id, copier_account_ref, desired_state, revision
        FROM copier_memberships WHERE user_id = ${userId} FOR UPDATE
      `;
            for (const member of members) {
                const snapshot = await tx `
          SELECT id, authoritative FROM copier_position_snapshots WHERE membership_id = ${member.membership_id}
            AND observed_at <= ${event.occurredAt} ORDER BY observed_at DESC LIMIT 1
        `;
                const scopes = [];
                if (snapshot.length) {
                    const positions = await tx `
            SELECT position_ref, state FROM copier_position_snapshot_items WHERE snapshot_id = ${snapshot[0].id}
          `;
                    for (const position of positions.filter((candidate) => candidate.state !== 'FLAT')) {
                        scopes.push({ position_ref: position.position_ref, allowed_actions: ['EXIT', 'CANCEL_ENTRY', 'PROTECTIVE_UPDATE', 'RECONCILE'] });
                        await tx `INSERT INTO position_closeout_grants (id, user_id, membership_id, position_ref, source_subscription_id, allowed_actions, status)
              VALUES (${(0, node_crypto_1.randomUUID)()}, ${userId}, ${member.membership_id}, ${position.position_ref}, ${subscriptionId},
                ARRAY['EXIT','CANCEL_ENTRY','PROTECTIVE_UPDATE','RECONCILE']::TEXT[], 'ACTIVE')
              ON CONFLICT (membership_id, position_ref) DO UPDATE SET status = 'ACTIVE', completed_at = NULL`;
                    }
                }
                await (0, entitlementService_1.enqueueCopierCommand)(tx, member, 'SET_CLOSEOUT_ONLY', 'CLOSEOUT_ONLY', null, current?.paid_through_at ?? event.occurredAt, scopes);
                if (!snapshot.length || !snapshot[0].authoritative) {
                    await tx `INSERT INTO entitlement_incidents (id, user_id, membership_id, incident_code, severity)
            VALUES (${(0, node_crypto_1.randomUUID)()}, ${userId}, ${member.membership_id}, 'PAYMENT_RESTRICTION_SNAPSHOT_UNKNOWN', 'HIGH')`;
                }
            }
        }
        await (0, entitlementService_1.writeEntitlementAudit)(tx, {
            userId, actorType: 'PAYMENT_PROVIDER', actorRef: event.provider, eventType: 'PAYMENT_EVENT_APPLIED',
            subjectType: 'payment_receipt', subjectRef: receiptId, details: { event_type: event.eventType, subscription_id: subscriptionId },
        });
        return { disposition, duplicate: false };
    });
}
//# sourceMappingURL=billingService.js.map