"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueCopierCommand = enqueueCopierCommand;
exports.writeEntitlementAudit = writeEntitlementAudit;
exports.selectSingleEnabledInstance = selectSingleEnabledInstance;
exports.requestObserverAccess = requestObserverAccess;
exports.createPublicAccessRequest = createPublicAccessRequest;
exports.getEntitlements = getEntitlements;
exports.sweepExpiredEntitlements = sweepExpiredEntitlements;
const node_crypto_1 = require("node:crypto");
const database_1 = __importDefault(require("../config/database"));
const errorHandler_1 = require("../middleware/errorHandler");
const entitlementPolicy_1 = require("./entitlementPolicy");
const idempotencyService_1 = require("./idempotencyService");
async function enqueueCopierCommand(tx, membership, operation, state, observerExpiresAt, paidThroughAt, positionScopes) {
    const commandId = (0, node_crypto_1.randomUUID)();
    const revisionRows = await tx `
    UPDATE copier_instances SET next_revision = next_revision + 1
    WHERE instance_id = ${membership.instance_id} AND enabled = TRUE
    RETURNING next_revision
  `;
    if (!revisionRows.length)
        throw (0, errorHandler_1.createError)('Copier instance unavailable', 503);
    const revision = Number(revisionRows[0].next_revision);
    if (!Number.isSafeInteger(revision))
        throw (0, errorHandler_1.createError)('Copier revision exhausted', 503);
    const issuedAt = new Date();
    const notAfter = new Date(issuedAt.getTime() + 5 * 60 * 1000);
    const payload = {
        schema_version: 1,
        command_id: commandId,
        instance_id: membership.instance_id,
        revision,
        operation,
        membership_id: membership.membership_id,
        copier_account_ref: membership.copier_account_ref,
        state,
        observer_expires_at: observerExpiresAt?.toISOString() ?? null,
        paid_through_at: paidThroughAt?.toISOString() ?? null,
        position_scopes: positionScopes,
        issued_at: issuedAt.toISOString(),
        not_after: notAfter.toISOString(),
    };
    await tx `
    INSERT INTO copier_sync_outbox
      (command_id, instance_id, membership_id, revision, operation, state, payload, issued_at, not_after)
    VALUES (${commandId}, ${membership.instance_id}, ${membership.membership_id}, ${revision},
      ${operation}, ${state}, ${JSON.stringify(payload)}::jsonb, ${issuedAt}, ${notAfter})
  `;
    await tx `
    UPDATE copier_memberships SET desired_state = ${state}, revision = ${revision}, paid_through_at = ${paidThroughAt}, updated_at = NOW()
    WHERE membership_id = ${membership.membership_id}
  `;
    return { commandId, revision };
}
async function writeEntitlementAudit(tx, input) {
    await tx `
    INSERT INTO entitlement_audit_events
      (id, user_id, actor_type, actor_ref, event_type, subject_type, subject_ref, request_id, details)
    VALUES (${(0, node_crypto_1.randomUUID)()}, ${input.userId}, ${input.actorType}, ${input.actorRef ?? null}, ${input.eventType},
      ${input.subjectType}, ${input.subjectRef}, ${input.requestId ?? null}, ${JSON.stringify(input.details ?? {})}::jsonb)
  `;
}
async function selectSingleEnabledInstance(tx) {
    const rows = await tx `
    SELECT instance_id FROM copier_instances WHERE enabled = TRUE ORDER BY instance_id LIMIT 2
  `;
    if (rows.length !== 1)
        throw (0, errorHandler_1.createError)('Copier provisioning is not configured', 503);
    return rows[0].instance_id;
}
async function requestObserverAccess(userId, consentVersion, idempotencyKey) {
    const requestHash = (0, idempotencyService_1.hashObserverRequest)(consentVersion);
    const scopeRef = String(userId);
    return database_1.default.begin(async (tx) => {
        const replay = await (0, idempotencyService_1.loadIdempotentReplay)(tx, {
            endpoint: idempotencyService_1.ENDPOINT_OBSERVER_ACCESS,
            scopeRef,
            idempotencyKey,
            requestHash,
        });
        if (replay) {
            return {
                status: (0, idempotencyService_1.requireStoredString)(replay.body, 'status'),
                requestId: (0, idempotencyService_1.requireStoredString)(replay.body, 'request_id'),
                httpStatus: replay.httpStatus,
                replayed: true,
            };
        }
        const prior = await tx `
      SELECT id, status FROM observer_access_requests WHERE user_id = ${userId} FOR UPDATE
    `;
        if (prior.length) {
            if (['PENDING', 'PROVISIONING', 'ACTIVE'].includes(prior[0].status)) {
                const requestId = (0, node_crypto_1.randomUUID)();
                const status = prior[0].status.toLowerCase();
                const httpStatus = ['pending', 'provisioning'].includes(status) ? 202 : 200;
                const body = { request_id: requestId, status };
                await (0, idempotencyService_1.persistIdempotentResponse)(tx, {
                    id: (0, node_crypto_1.randomUUID)(),
                    endpoint: idempotencyService_1.ENDPOINT_OBSERVER_ACCESS,
                    scopeRef,
                    idempotencyKey,
                    requestHash,
                    httpStatus,
                    body,
                });
                return { status, requestId, httpStatus, replayed: false };
            }
            throw (0, errorHandler_1.createError)('Observer access has already been used; contact support', 409);
        }
        const paid = await tx `
      SELECT EXISTS (SELECT 1 FROM subscriptions WHERE user_id = ${userId} AND status = 'ACTIVE' AND paid_through_at > NOW()) AS active
    `;
        if (paid[0]?.active)
            throw (0, errorHandler_1.createError)('Paid access is already active', 409);
        const requestPk = (0, node_crypto_1.randomUUID)();
        await tx `
      INSERT INTO observer_access_requests (id, user_id, consent_version, status)
      VALUES (${requestPk}, ${userId}, ${consentVersion}, 'PENDING')
    `;
        const requestId = (0, node_crypto_1.randomUUID)();
        await writeEntitlementAudit(tx, {
            userId, actorType: 'USER', actorRef: String(userId), eventType: 'OBSERVER_ACCESS_REQUESTED',
            subjectType: 'observer_request', subjectRef: requestPk, requestId, details: { consent_version: consentVersion },
        });
        const body = { request_id: requestId, status: 'pending' };
        await (0, idempotencyService_1.persistIdempotentResponse)(tx, {
            id: (0, node_crypto_1.randomUUID)(),
            endpoint: idempotencyService_1.ENDPOINT_OBSERVER_ACCESS,
            scopeRef,
            idempotencyKey,
            requestHash,
            httpStatus: 202,
            body,
        });
        return { status: 'pending', requestId, httpStatus: 202, replayed: false };
    });
}
async function createPublicAccessRequest(email, consentVersion, idempotencyKey) {
    const normalizedEmail = email.trim().toLowerCase();
    const requestHash = (0, idempotencyService_1.hashPublicAccessRequest)(normalizedEmail, consentVersion);
    const scopeRef = 'public';
    return database_1.default.begin(async (tx) => {
        const replay = await (0, idempotencyService_1.loadIdempotentReplay)(tx, {
            endpoint: idempotencyService_1.ENDPOINT_PUBLIC_ACCESS,
            scopeRef,
            idempotencyKey,
            requestHash,
        });
        if (replay) {
            return {
                requestId: (0, idempotencyService_1.requireStoredString)(replay.body, 'request_id'),
                httpStatus: replay.httpStatus,
                replayed: true,
            };
        }
        const requestId = (0, node_crypto_1.randomUUID)();
        await tx `
      INSERT INTO access_requests (id, email_normalized, consent_version, request_id)
      VALUES (${(0, node_crypto_1.randomUUID)()}, ${normalizedEmail}, ${consentVersion}, ${requestId})
    `;
        const body = { request_id: requestId, status: 'pending' };
        await (0, idempotencyService_1.persistIdempotentResponse)(tx, {
            id: (0, node_crypto_1.randomUUID)(),
            endpoint: idempotencyService_1.ENDPOINT_PUBLIC_ACCESS,
            scopeRef,
            idempotencyKey,
            requestHash,
            httpStatus: 202,
            body,
        });
        return { requestId, httpStatus: 202, replayed: false };
    });
}
async function getEntitlements(userId) {
    const rows = await (0, database_1.default) `
    SELECT
      (SELECT status FROM observer_access_requests WHERE user_id = ${userId}) AS observer_status,
      (SELECT starts_at FROM observer_access_requests WHERE user_id = ${userId}) AS observer_starts_at,
      (SELECT expires_at FROM observer_access_requests WHERE user_id = ${userId}) AS observer_expires_at,
      (SELECT status FROM subscriptions WHERE user_id = ${userId} ORDER BY updated_at DESC LIMIT 1) AS subscription_status,
      (SELECT plan FROM subscriptions WHERE user_id = ${userId} ORDER BY updated_at DESC LIMIT 1) AS plan,
      (SELECT paid_through_at FROM subscriptions WHERE user_id = ${userId} ORDER BY updated_at DESC LIMIT 1) AS paid_through_at,
      EXISTS (
        SELECT 1 FROM operator_managed_live_accounts
        WHERE user_id = ${userId} AND active = TRUE AND fee_exempt = TRUE
      ) AS operator_fee_exempt,
      (SELECT live_copy_opt_in_at FROM users WHERE id = ${userId}) AS live_copy_opt_in_at,
      (SELECT live_copy_opt_in_version FROM users WHERE id = ${userId}) AS live_copy_opt_in_version,
      (SELECT status FROM copier_pending_activations
        WHERE user_id = ${userId} AND status IN ('WAITING_FOR_COPIER','WAITING_FOR_FLAT','WAITING_FOR_KEY')
        ORDER BY approved_at DESC LIMIT 1) AS pending_activation_status,
      m.desired_state, m.observed_state, m.last_synced_at, m.final_revoked_at,
      (SELECT COUNT(*) FROM position_closeout_grants g WHERE g.membership_id = m.membership_id AND g.status IN ('ACTIVE','INCIDENT')) AS closeout_position_count,
      EXISTS (SELECT 1 FROM copier_sync_outbox o WHERE o.membership_id = m.membership_id AND o.status = 'DEAD_LETTER') AS has_provisioning_error
    FROM (SELECT 1) seed LEFT JOIN LATERAL (
      SELECT membership_id, desired_state, observed_state, last_synced_at, final_revoked_at
      FROM copier_memberships WHERE user_id = ${userId} ORDER BY updated_at DESC LIMIT 1
    ) m ON TRUE
  `;
    const row = rows[0];
    const state = row?.desired_state;
    const now = new Date();
    const operatorFeeExempt = row?.operator_fee_exempt === true;
    const subscriptionStatus = operatorFeeExempt
        ? 'ACTIVE'
        : (0, entitlementPolicy_1.effectiveSubscriptionStatus)(row?.subscription_status?.toUpperCase() ?? null, row?.paid_through_at ?? null, now);
    const subscriptionPlan = operatorFeeExempt ? 'operator_fee_exempt' : row?.plan ?? null;
    const observerStatus = (0, entitlementPolicy_1.effectiveObserverStatus)(row?.observer_status ?? null, row?.observer_expires_at ?? null, now);
    const paidThroughReached = subscriptionStatus === 'EXPIRED';
    const copierState = row?.observer_status === 'PROVISIONING_ERROR' || row?.has_provisioning_error ? 'provisioning_error'
        : ['PENDING', 'PROVISIONING'].includes(row?.observer_status ?? '') ? 'pending'
            : observerStatus === 'expired' && state === 'OBSERVER' ? 'revocation_pending'
                : state === 'REVOKED' && !row?.final_revoked_at ? 'revocation_pending'
                    : state === 'REVOKED' ? 'revoked'
                        : state === 'CLOSEOUT_ONLY' && row?.observed_state === 'CLOSEOUT_ONLY' ? 'closeout_only'
                            : paidThroughReached && state === 'PAID_ACTIVE' ? 'pending'
                                : !state ? 'none'
                                    : state !== row?.observed_state ? 'pending' : 'active';
    return {
        schema_version: 1,
        server_time: now.toISOString(),
        observer: {
            status: observerStatus,
            starts_at: row?.observer_starts_at?.toISOString() ?? null,
            expires_at: row?.observer_expires_at?.toISOString() ?? null,
        },
        subscription: {
            status: subscriptionStatus.toLowerCase(),
            plan: subscriptionPlan,
            paid_through_at: row?.paid_through_at?.toISOString() ?? null,
            fee_exempt: operatorFeeExempt,
        },
        live_copy: {
            consented_at: row?.live_copy_opt_in_at?.toISOString() ?? null,
            consent_version: row?.live_copy_opt_in_version ?? null,
            pending_activation_status: row?.pending_activation_status ?? null,
        },
        copier: {
            state: copierState,
            closeout_position_count: Number(row?.closeout_position_count ?? 0),
            last_synced_at: row?.last_synced_at?.toISOString() ?? null,
            final_revoked_at: row?.final_revoked_at?.toISOString() ?? null,
        },
    };
}
/** Durable sweep; safe to call from multiple API replicas due to row locks. */
async function sweepExpiredEntitlements(now = new Date()) {
    return database_1.default.begin(async (tx) => {
        let transitions = 0;
        const expiredObservers = await tx `
      SELECT m.membership_id, m.user_id, m.instance_id, m.copier_account_ref, m.desired_state, m.revision
      FROM copier_memberships m JOIN observer_access_requests o ON o.user_id = m.user_id
      WHERE m.desired_state = 'OBSERVER' AND o.status IN ('ACTIVE','PROVISIONING') AND o.expires_at IS NOT NULL AND o.expires_at <= ${now}
      FOR UPDATE OF m SKIP LOCKED
    `;
        for (const membership of expiredObservers) {
            await tx `UPDATE observer_access_requests SET status = 'EXPIRED' WHERE user_id = ${membership.user_id}`;
            await tx `UPDATE entitlement_grants SET status = 'EXPIRED' WHERE user_id = ${membership.user_id} AND grant_type = 'OBSERVER' AND status = 'ACTIVE'`;
            await enqueueCopierCommand(tx, membership, 'REVOKE', 'REVOKED', null, null, []);
            await writeEntitlementAudit(tx, { userId: membership.user_id, actorType: 'SYSTEM', eventType: 'OBSERVER_EXPIRED', subjectType: 'membership', subjectRef: membership.membership_id });
            transitions++;
        }
        const expired = await tx `
      SELECT m.membership_id, m.user_id, m.instance_id, m.copier_account_ref, m.desired_state, m.revision,
        s.id AS subscription_id, s.paid_through_at
      FROM subscriptions s JOIN copier_memberships m ON m.user_id = s.user_id
      WHERE s.status IN ('ACTIVE','PAST_DUE','CANCELED') AND s.paid_through_at <= ${now}
        AND m.desired_state IN ('PAID_ACTIVE','OBSERVER')
      FOR UPDATE OF s, m SKIP LOCKED
    `;
        for (const row of expired) {
            const snapshots = await tx `
        SELECT id, authoritative, observed_at, membership_inflight_entry_commands FROM copier_position_snapshots
        WHERE membership_id = ${row.membership_id} AND observed_at <= ${row.paid_through_at}
          AND observed_at >= ${row.paid_through_at} - INTERVAL '60 seconds'
        ORDER BY observed_at DESC LIMIT 1
      `;
            const scopes = [];
            let safeToRevoke = false;
            const pendingCommands = await tx `
        SELECT COUNT(*) AS count FROM copier_sync_outbox WHERE membership_id = ${row.membership_id} AND status = 'PENDING'
      `;
            if (snapshots.length) {
                const positions = await tx `
          SELECT i.position_ref, i.state, i.pending_executable_orders, i.inflight_entry_commands
          FROM copier_position_snapshot_items i WHERE i.snapshot_id = ${snapshots[0].id}
        `;
                safeToRevoke = snapshots[0].authoritative && !snapshots[0].membership_inflight_entry_commands
                    && Number(pendingCommands[0]?.count ?? 0) === 0
                    && positions.every((p) => p.state === 'FLAT' && !p.pending_executable_orders && !p.inflight_entry_commands);
                for (const position of positions) {
                    if (position.state === 'OPEN' || position.state === 'UNKNOWN' || position.pending_executable_orders || position.inflight_entry_commands) {
                        scopes.push({ position_ref: position.position_ref, allowed_actions: entitlementPolicy_1.CLOSEOUT_ACTIONS });
                        await tx `
              INSERT INTO position_closeout_grants (id, user_id, membership_id, position_ref, source_subscription_id, allowed_actions, status)
              VALUES (${(0, node_crypto_1.randomUUID)()}, ${row.user_id}, ${row.membership_id}, ${position.position_ref}, ${row.subscription_id}, ${entitlementPolicy_1.CLOSEOUT_ACTIONS}, 'ACTIVE')
              ON CONFLICT (membership_id, position_ref) DO UPDATE SET status = 'ACTIVE', completed_at = NULL
            `;
                    }
                }
            }
            await tx `UPDATE subscriptions SET status = 'EXPIRED', updated_at = NOW() WHERE id = ${row.subscription_id}`;
            await tx `UPDATE entitlement_grants SET status = 'EXPIRED' WHERE user_id = ${row.user_id} AND grant_type = 'SUBSCRIPTION' AND status = 'ACTIVE'`;
            if (safeToRevoke) {
                await enqueueCopierCommand(tx, row, 'REVOKE', 'REVOKED', null, row.paid_through_at, []);
            }
            else {
                await enqueueCopierCommand(tx, row, 'SET_CLOSEOUT_ONLY', 'CLOSEOUT_ONLY', null, row.paid_through_at, scopes);
                await tx `INSERT INTO entitlement_incidents (id, user_id, membership_id, incident_code, severity, safe_details)
          VALUES (${(0, node_crypto_1.randomUUID)()}, ${row.user_id}, ${row.membership_id}, ${pendingCommands[0]?.count && Number(pendingCommands[0].count) > 0 ? 'INFLIGHT_COMMAND_AT_EXPIRY' : snapshots.length ? 'CLOSEOUT_NOT_FLAT' : 'POSITION_SNAPSHOT_MISSING'},
            'HIGH', ${JSON.stringify({ subscription_id: row.subscription_id })}::jsonb)`;
            }
            await writeEntitlementAudit(tx, {
                userId: row.user_id, actorType: 'SYSTEM', eventType: 'SUBSCRIPTION_PAID_THROUGH_REACHED',
                subjectType: 'subscription', subjectRef: row.subscription_id,
                details: { closeout_position_count: scopes.length, revocation_queued: safeToRevoke },
            });
            transitions++;
        }
        return transitions;
    });
}
//# sourceMappingURL=entitlementService.js.map