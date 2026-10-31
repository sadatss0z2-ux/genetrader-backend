"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertLiveCopyReady = assertLiveCopyReady;
exports.setLiveCopyOptIn = setLiveCopyOptIn;
exports.activatePendingLivePayments = activatePendingLivePayments;
exports.recordCopierSourceState = recordCopierSourceState;
exports.getCopierMemberCredentials = getCopierMemberCredentials;
exports.listCopierLiveMemberships = listCopierLiveMemberships;
const node_crypto_1 = require("node:crypto");
const database_1 = __importDefault(require("../config/database"));
const paymentPlans_1 = require("../config/paymentPlans");
const errorHandler_1 = require("../middleware/errorHandler");
const encryptionService_1 = require("./encryptionService");
const entitlementService_1 = require("./entitlementService");
function hasTradingPermission(value) {
    if (Array.isArray(value))
        return value.includes('trade');
    if (value && typeof value === 'object')
        return value.canTrade === true;
    return false;
}
function hasWithdrawalPermission(value) {
    if (Array.isArray(value))
        return value.includes('withdraw');
    if (value && typeof value === 'object')
        return value.canWithdraw === true;
    return false;
}
async function assertLiveCopyReady(tx, userId, requireOptIn = true) {
    const users = await tx `
    SELECT is_active, identity_verified_at, live_copy_opt_in_at, live_copy_opt_in_version
    FROM users WHERE id = ${userId} FOR UPDATE
  `;
    const user = users[0];
    if (!user?.is_active || !user.identity_verified_at) {
        throw (0, errorHandler_1.createError)('An active account with verified identity is required for live copying.', 403);
    }
    if (requireOptIn) {
        const currentConsentVersion = process.env.LIVE_COPY_CONSENT_VERSION;
        if (!currentConsentVersion)
            throw (0, errorHandler_1.createError)('Live-copy consent is not configured.', 503);
        if (!user.live_copy_opt_in_at || user.live_copy_opt_in_version !== currentConsentVersion) {
            throw (0, errorHandler_1.createError)('Current explicit live-copy consent is required before submitting or approving payment.', 409);
        }
    }
    const keys = await tx `
    SELECT permissions
    FROM api_keys
    WHERE user_id = ${userId} AND exchange = 'binance'
      AND environment = 'live' AND active = TRUE
    FOR UPDATE
  `;
    if (keys.length !== 1 || !hasTradingPermission(keys[0].permissions) || hasWithdrawalPermission(keys[0].permissions)) {
        throw (0, errorHandler_1.createError)('Connect exactly one Binance key with trading permission and withdrawals disabled before requesting live access.', 409, 'LIVE_COPY_KEY_REQUIRED');
    }
}
async function setLiveCopyOptIn(userId, enabled, consentVersion) {
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(consentVersion)) {
        throw (0, errorHandler_1.createError)('A valid live-copy consent version is required.', 400);
    }
    return database_1.default.begin(async (tx) => {
        if (enabled) {
            await assertLiveCopyReady(tx, userId, false);
        }
        else {
            await tx `SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
            const activeMemberships = await tx `
        SELECT membership_id FROM copier_memberships
        WHERE user_id = ${userId} AND desired_state IN ('PAID_ACTIVE','CLOSEOUT_ONLY')
        LIMIT 1 FOR UPDATE
      `;
            const pending = await tx `
        SELECT payment_proof_id FROM copier_pending_activations
        WHERE user_id = ${userId} AND status IN ('WAITING_FOR_FLAT','WAITING_FOR_KEY')
        LIMIT 1 FOR UPDATE
      `;
            if (activeMemberships.length || pending.length) {
                throw (0, errorHandler_1.createError)('Live-copy consent cannot be withdrawn while live access or an approved activation is pending.', 409);
            }
        }
        const rows = enabled
            ? await tx `
          UPDATE users SET live_copy_opt_in_at = NOW(), live_copy_opt_in_version = ${consentVersion}, updated_at = NOW()
          WHERE id = ${userId} RETURNING live_copy_opt_in_at
        `
            : await tx `
          UPDATE users SET live_copy_opt_in_at = NULL, live_copy_opt_in_version = NULL, updated_at = NOW()
          WHERE id = ${userId} RETURNING live_copy_opt_in_at
        `;
        if (!rows.length)
            throw (0, errorHandler_1.createError)('Account was not found.', 404);
        await (0, entitlementService_1.writeEntitlementAudit)(tx, {
            userId,
            actorType: 'USER',
            actorRef: String(userId),
            eventType: enabled ? 'LIVE_COPY_CONSENT_GRANTED' : 'LIVE_COPY_CONSENT_WITHDRAWN',
            subjectType: 'user',
            subjectRef: String(userId),
            details: enabled ? { consent_version: consentVersion } : {},
        });
        return { enabled, consentedAt: rows[0].live_copy_opt_in_at?.toISOString() ?? null };
    });
}
async function activatePendingLivePayments(tx, instanceId, snapshotId, flat) {
    if (!flat)
        return 0;
    const rows = await tx `
    SELECT payment_proof_id, user_id, instance_id, approved_by_user_id, plan_key
    FROM copier_pending_activations
    WHERE instance_id = ${instanceId} AND status IN ('WAITING_FOR_FLAT','WAITING_FOR_KEY')
    ORDER BY approved_at ASC
    FOR UPDATE SKIP LOCKED
  `;
    let activated = 0;
    for (const activation of rows) {
        try {
            await assertLiveCopyReady(tx, activation.user_id);
        }
        catch (error) {
            if (error.code !== 'LIVE_COPY_KEY_REQUIRED')
                throw error;
            await tx `
        UPDATE copier_pending_activations SET status = 'WAITING_FOR_KEY'
        WHERE payment_proof_id = ${activation.payment_proof_id}
      `;
            continue;
        }
        const plan = (0, paymentPlans_1.getPaymentPlan)(activation.plan_key);
        if (!plan)
            throw (0, errorHandler_1.createError)('The approved subscription plan is no longer available.', 409);
        const now = new Date();
        const paidThroughAt = (0, paymentPlans_1.addPaymentPlanDuration)(now, plan);
        const instanceRows = await tx `
      SELECT instance_id FROM copier_instances WHERE instance_id = ${instanceId} AND enabled = TRUE
      FOR UPDATE
    `;
        if (!instanceRows.length)
            continue;
        const membershipRows = await tx `
      SELECT membership_id, user_id, instance_id, copier_account_ref, desired_state, revision
      FROM copier_memberships WHERE user_id = ${activation.user_id} AND instance_id = ${instanceId}
      FOR UPDATE
    `;
        const existing = membershipRows[0];
        const membershipId = existing?.membership_id ?? (0, node_crypto_1.randomUUID)();
        const accountRef = existing?.copier_account_ref ?? `member-${membershipId}`;
        if (!existing) {
            await tx `
        INSERT INTO copier_memberships (membership_id, user_id, instance_id, copier_account_ref, desired_state)
        VALUES (${membershipId}, ${activation.user_id}, ${instanceId}, ${accountRef}, 'PAID_ACTIVE')
      `;
        }
        else {
            await tx `
        UPDATE copier_memberships SET copier_account_ref = ${accountRef}, updated_at = NOW()
        WHERE membership_id = ${membershipId}
      `;
        }
        await tx `
      UPDATE subscriptions SET status = 'EXPIRED', updated_at = NOW()
      WHERE user_id = ${activation.user_id} AND provider = 'manual' AND status IN ('ACTIVE','PAST_DUE')
    `;
        const subscriptionId = (0, node_crypto_1.randomUUID)();
        await tx `
      INSERT INTO subscriptions
        (id, user_id, provider, provider_subscription_ref, plan, status, paid_through_at)
      VALUES (${subscriptionId}, ${activation.user_id}, 'manual', ${activation.payment_proof_id},
        ${plan.key}, 'ACTIVE', ${paidThroughAt})
    `;
        await tx `
      INSERT INTO entitlement_grants
        (id, user_id, grant_type, source_id, status, starts_at, expires_at, revision)
      VALUES (${(0, node_crypto_1.randomUUID)()}, ${activation.user_id}, 'SUBSCRIPTION', ${subscriptionId},
        'ACTIVE', ${now}, ${paidThroughAt}, 0)
    `;
        await tx `
      UPDATE observer_access_requests SET status = 'EXPIRED'
      WHERE user_id = ${activation.user_id} AND status IN ('ACTIVE','PROVISIONING')
    `;
        await (0, entitlementService_1.enqueueCopierCommand)(tx, {
            membership_id: membershipId,
            user_id: activation.user_id,
            instance_id: instanceId,
            copier_account_ref: accountRef,
            desired_state: existing?.desired_state ?? 'PAID_ACTIVE',
            revision: Number(existing?.revision ?? 0),
        }, existing?.copier_account_ref ? 'UPDATE_ROLE' : 'GRANT', 'PAID_ACTIVE', null, paidThroughAt, []);
        await tx `
      UPDATE manual_payment_proofs SET paid_through_at = ${paidThroughAt}, updated_at = NOW()
      WHERE id = ${activation.payment_proof_id}
    `;
        await tx `
      UPDATE copier_pending_activations
      SET status = 'ACTIVATED', activated_at = ${now}, subscription_id = ${subscriptionId},
        source_snapshot_id = ${snapshotId}
      WHERE payment_proof_id = ${activation.payment_proof_id}
    `;
        await (0, entitlementService_1.writeEntitlementAudit)(tx, {
            userId: activation.user_id,
            actorType: 'SYSTEM',
            actorRef: instanceId,
            eventType: 'LIVE_COPY_ACTIVATED',
            subjectType: 'manual_payment_proof',
            subjectRef: activation.payment_proof_id,
            details: { plan: plan.key, paid_through_at: paidThroughAt.toISOString(), source_snapshot_id: snapshotId },
        });
        activated += 1;
    }
    return activated;
}
async function recordCopierSourceState(input) {
    const now = new Date();
    if (!Number.isSafeInteger(input.openTradeCount) || input.openTradeCount < 0
        || !Number.isFinite(input.observedAt.getTime())
        || input.observedAt.getTime() > now.getTime()
        || now.getTime() - input.observedAt.getTime() > 30_000) {
        throw (0, errorHandler_1.createError)('Source-state snapshot is invalid or stale.', 400);
    }
    return database_1.default.begin(async (tx) => {
        const instances = await tx `
      SELECT instance_id FROM copier_instances WHERE instance_id = ${input.instanceId} AND enabled = TRUE FOR UPDATE
    `;
        if (!instances.length)
            throw (0, errorHandler_1.createError)('Copier instance is unavailable.', 503);
        await tx `
      UPDATE copier_pending_activations
      SET instance_id = ${input.instanceId}, status = 'WAITING_FOR_FLAT'
      WHERE instance_id IS NULL AND status = 'WAITING_FOR_COPIER'
    `;
        await tx `
      INSERT INTO copier_source_state
        (instance_id, snapshot_id, observed_at, open_trade_count, inflight_entry_commands, received_at)
      VALUES (${input.instanceId}, ${input.snapshotId}, ${input.observedAt},
        ${input.openTradeCount}, ${input.inflightEntryCommands}, NOW())
      ON CONFLICT (instance_id) DO UPDATE SET
        snapshot_id = EXCLUDED.snapshot_id, observed_at = EXCLUDED.observed_at,
        open_trade_count = EXCLUDED.open_trade_count,
        inflight_entry_commands = EXCLUDED.inflight_entry_commands, received_at = NOW()
      WHERE copier_source_state.observed_at <= EXCLUDED.observed_at
    `;
        const latest = await tx `
      SELECT snapshot_id, observed_at, open_trade_count, inflight_entry_commands, received_at
      FROM copier_source_state WHERE instance_id = ${input.instanceId} FOR UPDATE
    `;
        const snapshot = latest[0];
        const fresh = !!snapshot && snapshot.observed_at.getTime() >= now.getTime() - 30_000
            && snapshot.observed_at.getTime() <= now.getTime()
            && snapshot.received_at.getTime() >= now.getTime() - 30_000;
        const flat = fresh && snapshot.open_trade_count === 0 && !snapshot.inflight_entry_commands;
        const activations = await activatePendingLivePayments(tx, input.instanceId, snapshot.snapshot_id, flat);
        return { accepted: true, activations };
    });
}
async function getCopierMemberCredentials(instanceId, membershipId) {
    const rows = await (0, database_1.default) `
    SELECT u.id AS user_id, m.membership_id, m.copier_account_ref, m.desired_state,
      k.testnet, k.permissions, k.public_key_encrypted, k.secret_key_encrypted
    FROM copier_memberships m
    JOIN copier_instances i ON i.instance_id = m.instance_id AND i.enabled = TRUE
    JOIN users u ON u.id = m.user_id AND u.is_active = TRUE
      AND u.identity_verified_at IS NOT NULL AND u.live_copy_opt_in_at IS NOT NULL
    JOIN api_keys k ON k.user_id = u.id AND k.exchange = 'binance'
      AND k.environment = 'live' AND k.active = TRUE
    WHERE m.instance_id = ${instanceId} AND m.membership_id = ${membershipId}
      AND m.desired_state IN ('PAID_ACTIVE','CLOSEOUT_ONLY')
      AND (
        (m.desired_state = 'PAID_ACTIVE' AND EXISTS (
          SELECT 1 FROM subscriptions s WHERE s.user_id = u.id AND s.status = 'ACTIVE'
            AND s.paid_through_at > NOW()
        ))
        OR m.desired_state = 'CLOSEOUT_ONLY'
      )
    ORDER BY k.created_at DESC
    LIMIT 2
  `;
    if (rows.length !== 1)
        throw (0, errorHandler_1.createError)('Live copier credentials are unavailable for this membership.', 404);
    const row = rows[0];
    if (!row.copier_account_ref || typeof row.testnet !== 'boolean'
        || !hasTradingPermission(row.permissions) || hasWithdrawalPermission(row.permissions)) {
        throw (0, errorHandler_1.createError)('Live copier credentials failed the required permission or account checks.', 409);
    }
    return {
        membership_id: row.membership_id,
        account_ref: row.copier_account_ref,
        testnet: row.testnet,
        api_key: (0, encryptionService_1.decrypt)(row.public_key_encrypted, '', '', {
            userId: row.user_id,
            secretType: 'binance_api_key',
            service: 'binanceService',
        }),
        api_secret: (0, encryptionService_1.decrypt)(row.secret_key_encrypted, '', '', {
            userId: row.user_id,
            secretType: 'binance_api_secret',
            service: 'binanceService',
        }),
    };
}
async function listCopierLiveMemberships(instanceId) {
    return (0, database_1.default) `
    SELECT m.membership_id, m.copier_account_ref AS account_ref, m.desired_state AS state,
      COALESCE((
        SELECT json_agg(json_build_object('position_ref', g.position_ref, 'allowed_actions', g.allowed_actions))
        FROM position_closeout_grants g
        WHERE g.membership_id = m.membership_id AND g.status IN ('ACTIVE','INCIDENT')
      ), '[]'::json) AS position_scopes
    FROM copier_memberships m
    JOIN copier_instances i ON i.instance_id = m.instance_id AND i.enabled = TRUE
    JOIN users u ON u.id = m.user_id AND u.is_active = TRUE
      AND u.identity_verified_at IS NOT NULL AND u.live_copy_opt_in_at IS NOT NULL
    WHERE m.instance_id = ${instanceId}
      AND m.desired_state IN ('PAID_ACTIVE','CLOSEOUT_ONLY')
      AND m.copier_account_ref IS NOT NULL
      AND (
        (m.desired_state = 'PAID_ACTIVE' AND EXISTS (
          SELECT 1 FROM subscriptions s WHERE s.user_id = u.id AND s.status = 'ACTIVE'
            AND s.paid_through_at > NOW()
        ))
        OR m.desired_state = 'CLOSEOUT_ONLY'
      )
    ORDER BY m.created_at
  `;
}
//# sourceMappingURL=liveCopyService.js.map