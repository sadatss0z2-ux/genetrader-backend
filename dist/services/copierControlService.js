"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pollCopierCommands = pollCopierCommands;
exports.acknowledgeCopierCommand = acknowledgeCopierCommand;
exports.acceptCopierReconciliation = acceptCopierReconciliation;
const node_crypto_1 = require("node:crypto");
const database_1 = __importDefault(require("../config/database"));
const errorHandler_1 = require("../middleware/errorHandler");
const entitlementPolicy_1 = require("./entitlementPolicy");
const entitlementService_1 = require("./entitlementService");
const OBSERVED_STATES = new Set(['OBSERVER', 'PAID_ACTIVE', 'CLOSEOUT_ONLY', 'REVOKED', 'UNKNOWN']);
const SAFE_ERROR_CODES = new Set(['UNSUPPORTED_SCHEMA', 'UNKNOWN_MEMBERSHIP', 'REVISION_CONFLICT', 'STALE_COMMAND', 'COPIER_UNAVAILABLE', 'STATE_REJECTED']);
async function pollCopierCommands(instanceId, afterRevision) {
    if (!Number.isSafeInteger(afterRevision) || afterRevision < 0)
        throw (0, errorHandler_1.createError)('after_revision must be a non-negative integer', 400);
    return database_1.default.begin(async (tx) => {
        const rows = await tx `
      SELECT o.command_id, o.revision, o.payload, o.attempt_count, o.membership_id, m.user_id, o.operation, o.state
      FROM copier_sync_outbox o JOIN copier_memberships m ON m.membership_id = o.membership_id
      WHERE o.instance_id = ${instanceId} AND o.revision > ${afterRevision}
        AND o.status = 'PENDING' AND o.next_attempt_at <= NOW()
      ORDER BY o.revision ASC LIMIT 100 FOR UPDATE OF o SKIP LOCKED
    `;
        const commands = [];
        for (const row of rows) {
            const nextAttempt = row.attempt_count + 1;
            if (nextAttempt > 8) {
                await tx `UPDATE copier_sync_outbox SET status = 'DEAD_LETTER', last_error_code = 'RETRY_LIMIT' WHERE command_id = ${row.command_id}`;
                if (row.state === 'OBSERVER')
                    await tx `UPDATE observer_access_requests SET status = 'PROVISIONING_ERROR' WHERE user_id = ${row.user_id}`;
                await tx `INSERT INTO entitlement_incidents (id, user_id, membership_id, incident_code, severity)
          VALUES (${(0, node_crypto_1.randomUUID)()}, ${row.user_id}, ${row.membership_id}, 'COPIER_COMMAND_RETRY_EXHAUSTED', 'CRITICAL')`;
                continue;
            }
            const issuedAt = new Date();
            const notAfter = new Date(issuedAt.getTime() + 5 * 60 * 1000);
            const parsedPayload = typeof row.payload === 'string'
                ? JSON.parse(row.payload)
                : (typeof row.payload === 'object' && row.payload !== null && '0' in row.payload)
                    ? JSON.parse(Object.values(row.payload).filter((v) => typeof v === 'string').join(''))
                    : row.payload;
            const payload = { ...parsedPayload, issued_at: issuedAt.toISOString(), not_after: notAfter.toISOString() };
            await tx `
        UPDATE copier_sync_outbox SET attempt_count = ${nextAttempt}, issued_at = ${issuedAt}, not_after = ${notAfter},
          payload = ${JSON.stringify(payload)}::jsonb
        WHERE command_id = ${row.command_id}
      `;
            commands.push(payload);
        }
        return { schema_version: 1, server_time: new Date().toISOString(), commands };
    });
}
async function acknowledgeCopierCommand(input) {
    if (!OBSERVED_STATES.has(input.observedState) || !Number.isSafeInteger(input.revision) || input.revision < 1) {
        throw (0, errorHandler_1.createError)('Acknowledgement schema is invalid', 400);
    }
    if (input.copierAccountRef && !/^[A-Za-z0-9._:-]{1,255}$/.test(input.copierAccountRef)) {
        throw (0, errorHandler_1.createError)('Acknowledgement schema is invalid', 400);
    }
    const now = new Date();
    if (!Number.isFinite(input.observedAt.getTime()) || input.observedAt.getTime() > now.getTime() + 60_000) {
        throw (0, errorHandler_1.createError)('Acknowledgement timestamp is invalid', 400);
    }
    const safeError = input.errorCode && SAFE_ERROR_CODES.has(input.errorCode) ? input.errorCode : undefined;
    return database_1.default.begin(async (tx) => {
        const rows = await tx `
      SELECT o.command_id, o.instance_id, o.membership_id, m.user_id, m.copier_account_ref, o.revision, o.operation, o.state,
        o.status, o.attempt_count, o.payload, o.not_after
      FROM copier_sync_outbox o JOIN copier_memberships m ON m.membership_id = o.membership_id
      WHERE o.command_id = ${input.commandId} AND o.instance_id = ${input.instanceId} FOR UPDATE OF o, m
    `;
        const command = rows[0];
        if (!command || Number(command.revision) !== input.revision)
            throw (0, errorHandler_1.createError)('Command not found for this instance/revision', 404);
        if (command.status === 'ACKED')
            return { accepted: true, duplicate: true };
        if (command.status === 'DEAD_LETTER')
            throw (0, errorHandler_1.createError)('Command is no longer retryable', 409);
        if (input.result === 'retryable_error') {
            const delaySeconds = (0, entitlementPolicy_1.retryDelaySeconds)(command.attempt_count);
            const nextAttempt = new Date(now.getTime() + delaySeconds * 1000);
            const error = safeError ?? 'COPIER_UNAVAILABLE';
            await tx `UPDATE copier_sync_outbox SET next_attempt_at = ${nextAttempt}, last_error_code = ${error} WHERE command_id = ${input.commandId}`;
            if (command.attempt_count >= 8) {
                await tx `UPDATE copier_sync_outbox SET status = 'DEAD_LETTER' WHERE command_id = ${input.commandId}`;
                if (command.state === 'OBSERVER')
                    await tx `UPDATE observer_access_requests SET status = 'PROVISIONING_ERROR' WHERE user_id = ${command.user_id}`;
                await tx `INSERT INTO entitlement_incidents (id, user_id, membership_id, incident_code, severity, safe_details)
          VALUES (${(0, node_crypto_1.randomUUID)()}, ${command.user_id}, ${command.membership_id}, 'COPIER_COMMAND_RETRY_EXHAUSTED', 'CRITICAL', ${JSON.stringify({ command_id: input.commandId, error_code: error })}::jsonb)`;
            }
            await (0, entitlementService_1.writeEntitlementAudit)(tx, { userId: command.user_id, actorType: 'COPIER', actorRef: input.instanceId, eventType: 'COPIER_COMMAND_RETRYABLE_ERROR', subjectType: 'copier_command', subjectRef: input.commandId, details: { revision: input.revision, error_code: error } });
            return { accepted: true };
        }
        if (command.not_after.getTime() < now.getTime()) {
            await tx `UPDATE copier_sync_outbox SET status = 'DEAD_LETTER', last_error_code = 'STALE_COMMAND' WHERE command_id = ${input.commandId}`;
            await tx `INSERT INTO entitlement_incidents (id, user_id, membership_id, incident_code, severity, safe_details)
        VALUES (${(0, node_crypto_1.randomUUID)()}, ${command.user_id}, ${command.membership_id}, 'STALE_COMMAND_ACKNOWLEDGED', 'CRITICAL', ${JSON.stringify({ command_id: input.commandId, revision: input.revision })}::jsonb)`;
            return { accepted: false, error_code: 'STALE_COMMAND' };
        }
        const lastAck = await tx `
      SELECT MAX(revision) AS revision FROM copier_sync_outbox WHERE instance_id = ${input.instanceId} AND status = 'ACKED'
    `;
        if (input.result === 'applied' && input.observedState !== command.state) {
            throw (0, errorHandler_1.createError)('Applied acknowledgement state does not match command state', 409);
        }
        if (input.copierAccountRef && command.copier_account_ref
            && input.copierAccountRef !== command.copier_account_ref) {
            throw (0, errorHandler_1.createError)('Copier account reference cannot be changed', 409);
        }
        if (input.revision !== Number(lastAck[0]?.revision ?? 0) + 1)
            throw (0, errorHandler_1.createError)('Acknowledgements must be applied in revision order', 409);
        await tx `
      UPDATE copier_sync_outbox SET status = 'ACKED', ack_result = ${input.result}, ack_observed_state = ${input.observedState},
        ack_observed_at = ${input.observedAt}, last_error_code = ${safeError ?? null}
      WHERE command_id = ${input.commandId}
    `;
        if (input.result === 'rejected') {
            if (command.operation === 'GRANT' && command.state === 'OBSERVER') {
                await tx `UPDATE observer_access_requests SET status = 'PROVISIONING_ERROR' WHERE user_id = ${command.user_id}`;
            }
            await tx `INSERT INTO entitlement_incidents (id, user_id, membership_id, incident_code, severity, safe_details)
        VALUES (${(0, node_crypto_1.randomUUID)()}, ${command.user_id}, ${command.membership_id}, 'COPIER_COMMAND_REJECTED', 'HIGH', ${JSON.stringify({ command_id: input.commandId, error_code: safeError ?? 'STATE_REJECTED' })}::jsonb)`;
        }
        else {
            await tx `
        UPDATE copier_memberships SET observed_state = ${input.observedState},
          copier_account_ref = COALESCE(copier_account_ref, ${input.copierAccountRef ?? null}),
          last_synced_at = ${input.observedAt}, updated_at = NOW()
        WHERE membership_id = ${command.membership_id}
      `;
            if (command.operation === 'GRANT' && command.state === 'OBSERVER' && input.observedState === 'OBSERVER') {
                const startsAt = now;
                const expiresAt = new Date(startsAt.getTime() + 14 * 24 * 60 * 60 * 1000);
                await tx `UPDATE observer_access_requests SET starts_at = ${startsAt}, expires_at = ${expiresAt}, status = 'PROVISIONING' WHERE user_id = ${command.user_id}`;
                await tx `UPDATE entitlement_grants SET starts_at = ${startsAt}, expires_at = ${expiresAt}, status = 'PENDING'
          WHERE user_id = ${command.user_id} AND grant_type = 'OBSERVER'`;
                await tx `UPDATE copier_memberships SET observer_starts_at = ${startsAt}, observer_expires_at = ${expiresAt} WHERE membership_id = ${command.membership_id}`;
                const member = { ...command, desired_state: 'OBSERVER', revision: Number(command.revision) };
                await (0, entitlementService_1.enqueueCopierCommand)(tx, member, 'UPDATE_ROLE', 'OBSERVER', expiresAt, null, []);
            }
            else if (command.operation === 'UPDATE_ROLE' && command.state === 'OBSERVER' && input.observedState === 'OBSERVER') {
                await tx `UPDATE observer_access_requests SET status = 'ACTIVE' WHERE user_id = ${command.user_id}`;
                await tx `UPDATE entitlement_grants SET status = 'ACTIVE' WHERE user_id = ${command.user_id} AND grant_type = 'OBSERVER'`;
            }
            else if (command.operation === 'REVOKE' && command.state === 'REVOKED' && input.observedState === 'REVOKED') {
                await tx `UPDATE copier_memberships SET final_revoked_at = ${input.observedAt} WHERE membership_id = ${command.membership_id}`;
            }
        }
        await (0, entitlementService_1.writeEntitlementAudit)(tx, {
            userId: command.user_id, actorType: 'COPIER', actorRef: input.instanceId,
            eventType: input.result === 'applied' ? 'COPIER_COMMAND_APPLIED' : 'COPIER_COMMAND_REJECTED',
            subjectType: 'copier_command', subjectRef: input.commandId,
            details: { revision: input.revision, operation: command.operation, state: command.state, observed_state: input.observedState, error_code: safeError ?? null },
        });
        return { accepted: true };
    });
}
async function acceptCopierReconciliation(input) {
    if (input.positions.length > 500)
        throw (0, errorHandler_1.createError)('Too many positions in one snapshot', 400);
    const refs = new Set(input.positions.map((position) => position.positionRef));
    if (refs.size !== input.positions.length)
        throw (0, errorHandler_1.createError)('Duplicate position reference', 400);
    const now = new Date();
    if (!Number.isFinite(input.observedAt.getTime()) || input.observedAt.getTime() > now.getTime() + 60_000)
        throw (0, errorHandler_1.createError)('Snapshot timestamp is invalid', 400);
    return database_1.default.begin(async (tx) => {
        const memberRows = await tx `
      SELECT membership_id, user_id, instance_id, copier_account_ref, desired_state, revision, observed_state, paid_through_at
      FROM copier_memberships WHERE membership_id = ${input.membershipId} AND instance_id = ${input.instanceId} FOR UPDATE
    `;
        const member = memberRows[0];
        if (!member)
            throw (0, errorHandler_1.createError)('Membership not found for this instance', 404);
        const duplicate = await tx `
      SELECT id FROM copier_position_snapshots WHERE instance_id = ${input.instanceId} AND snapshot_id = ${input.snapshotId}
    `;
        if (duplicate.length)
            return { accepted: true, revocationQueued: false };
        const latest = await tx `
      SELECT observed_at FROM copier_position_snapshots WHERE membership_id = ${input.membershipId}
      ORDER BY observed_at DESC LIMIT 1
    `;
        if (latest[0] && input.observedAt.getTime() <= latest[0].observed_at.getTime())
            throw (0, errorHandler_1.createError)('Stale reconciliation snapshot', 409);
        const freshSnapshot = input.observedAt.getTime() >= now.getTime() - 60_000 && input.observedAt.getTime() <= now.getTime();
        const oldScopes = await tx `
      SELECT position_ref, allowed_actions FROM position_closeout_grants
      WHERE membership_id = ${input.membershipId} AND status IN ('ACTIVE','INCIDENT') ORDER BY position_ref
    `;
        const snapshotPk = (0, node_crypto_1.randomUUID)();
        await tx `
      INSERT INTO copier_position_snapshots (id, membership_id, instance_id, snapshot_id, observed_at, authoritative, membership_inflight_entry_commands)
      VALUES (${snapshotPk}, ${input.membershipId}, ${input.instanceId}, ${input.snapshotId}, ${input.observedAt}, ${input.authoritative}, ${input.inflightEntryCommands})
    `;
        for (const position of input.positions) {
            await tx `
        INSERT INTO copier_position_snapshot_items (snapshot_row_id, snapshot_id, position_ref, state, pending_executable_orders, inflight_entry_commands)
        VALUES (${(0, node_crypto_1.randomUUID)()}, ${snapshotPk}, ${position.positionRef}, ${position.state}, ${position.pendingExecutableOrders}, ${position.inflightEntryCommands})
      `;
            if (member.desired_state === 'CLOSEOUT_ONLY' && member.observed_state === 'CLOSEOUT_ONLY') {
                if (input.authoritative && freshSnapshot && position.state === 'FLAT' && !position.pendingExecutableOrders
                    && !position.inflightEntryCommands && !input.inflightEntryCommands) {
                    await tx `UPDATE position_closeout_grants SET status = 'COMPLETED', completed_at = ${now}
            WHERE membership_id = ${input.membershipId} AND position_ref = ${position.positionRef} AND status IN ('ACTIVE','INCIDENT')`;
                }
                else if (position.state === 'OPEN' || position.state === 'UNKNOWN') {
                    const allowedActions = position.state === 'OPEN' ? [...entitlementPolicy_1.CLOSEOUT_ACTIONS] : ['RECONCILE'];
                    const status = position.state === 'OPEN' ? 'ACTIVE' : 'INCIDENT';
                    await tx `
            INSERT INTO position_closeout_grants (id, user_id, membership_id, position_ref, allowed_actions, status)
            VALUES (${(0, node_crypto_1.randomUUID)()}, ${member.user_id}, ${input.membershipId}, ${position.positionRef}, ${allowedActions}, ${status})
            ON CONFLICT (membership_id, position_ref) DO UPDATE SET allowed_actions = EXCLUDED.allowed_actions,
              status = EXCLUDED.status, completed_at = NULL
          `;
                }
            }
        }
        const grants = await tx `
      SELECT position_ref, status, allowed_actions FROM position_closeout_grants WHERE membership_id = ${input.membershipId}
    `;
        const allLinkedIncludedFlat = grants.every((grant) => {
            const position = input.positions.find((candidate) => candidate.positionRef === grant.position_ref);
            return grant.status === 'COMPLETED' && position?.state === 'FLAT'
                && !position.pendingExecutableOrders && !position.inflightEntryCommands;
        });
        const safeSnapshot = (0, entitlementPolicy_1.canRevokeMembership)({
            authoritative: input.authoritative && !input.inflightEntryCommands && freshSnapshot,
            positions: input.positions,
        });
        const pendingCommands = await tx `
      SELECT COUNT(*) AS count FROM copier_sync_outbox WHERE membership_id = ${input.membershipId} AND status = 'PENDING'
    `;
        const revocationQueued = member.desired_state === 'CLOSEOUT_ONLY' && safeSnapshot && allLinkedIncludedFlat && Number(pendingCommands[0]?.count ?? 0) === 0;
        const currentScopes = grants.filter((grant) => grant.status === 'ACTIVE' || grant.status === 'INCIDENT')
            .map((grant) => ({ position_ref: grant.position_ref, allowed_actions: [...grant.allowed_actions].sort() }))
            .sort((a, b) => a.position_ref.localeCompare(b.position_ref));
        const previousScopes = oldScopes.map((grant) => ({ position_ref: grant.position_ref, allowed_actions: [...grant.allowed_actions].sort() }))
            .sort((a, b) => a.position_ref.localeCompare(b.position_ref));
        const scopesChanged = JSON.stringify(currentScopes) !== JSON.stringify(previousScopes);
        if (revocationQueued) {
            await (0, entitlementService_1.enqueueCopierCommand)(tx, member, 'REVOKE', 'REVOKED', null, null, []);
        }
        else if (scopesChanged && member.desired_state === 'CLOSEOUT_ONLY' && member.observed_state === 'CLOSEOUT_ONLY') {
            await (0, entitlementService_1.enqueueCopierCommand)(tx, member, 'SET_CLOSEOUT_ONLY', 'CLOSEOUT_ONLY', null, member.paid_through_at, currentScopes);
        }
        if (!input.authoritative || input.inflightEntryCommands || input.positions.some((position) => position.state === 'UNKNOWN')
            || input.observedAt.getTime() < now.getTime() - 60_000 || input.observedAt.getTime() > now.getTime()) {
            await tx `INSERT INTO entitlement_incidents (id, user_id, membership_id, incident_code, severity, safe_details)
        VALUES (${(0, node_crypto_1.randomUUID)()}, ${member.user_id}, ${member.membership_id}, 'RECONCILIATION_UNKNOWN', 'HIGH', ${JSON.stringify({ snapshot_id: input.snapshotId })}::jsonb)`;
            await tx `UPDATE position_closeout_grants SET status = 'INCIDENT' WHERE membership_id = ${input.membershipId} AND status = 'ACTIVE'`;
        }
        await (0, entitlementService_1.writeEntitlementAudit)(tx, {
            userId: member.user_id, actorType: 'COPIER', actorRef: input.instanceId, eventType: 'COPIER_RECONCILIATION_ACCEPTED',
            subjectType: 'membership', subjectRef: input.membershipId,
            details: { snapshot_id: input.snapshotId, authoritative: input.authoritative, position_count: input.positions.length, revocation_queued: revocationQueued },
        });
        return { accepted: true, revocationQueued };
    });
}
//# sourceMappingURL=copierControlService.js.map