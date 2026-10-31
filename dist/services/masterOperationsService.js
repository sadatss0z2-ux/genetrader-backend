"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMasterSystemStatus = getMasterSystemStatus;
exports.getMasterOverview = getMasterOverview;
exports.listMasterUsers = listMasterUsers;
exports.listMasterRequests = listMasterRequests;
exports.listManualPaymentProofs = listManualPaymentProofs;
exports.submitManualPaymentProof = submitManualPaymentProof;
exports.decideObserverRequest = decideObserverRequest;
exports.decideWaitlistRequest = decideWaitlistRequest;
exports.decideManualPaymentProof = decideManualPaymentProof;
exports.listMasterAuditEvents = listMasterAuditEvents;
const node_crypto_1 = require("node:crypto");
const database_1 = __importDefault(require("../config/database"));
const errorHandler_1 = require("../middleware/errorHandler");
const paymentPlans_1 = require("../config/paymentPlans");
const entitlementService_1 = require("./entitlementService");
const referralService_1 = require("./referralService");
const liveCopyService_1 = require("./liveCopyService");
function asNumber(value) {
    return Number(value ?? 0);
}
function asTimestamp(value) {
    if (value instanceof Date)
        return value.toISOString();
    return typeof value === 'string' && value.length > 0 ? value : null;
}
function epochMillisToTimestamp(value) {
    const epochMillis = Number(value);
    return Number.isFinite(epochMillis) && epochMillis > 0 ? new Date(epochMillis).toISOString() : null;
}
/**
 * Returns operational-only telemetry for the master account. It deliberately
 * excludes exchange credentials, payment references, and all secret values.
 */
async function getMasterSystemStatus() {
    const [rows, copierInstances] = await Promise.all([
        (0, database_1.default) `
    SELECT
      NOW() AS observed_at,
      (SELECT COUNT(*) FROM users) AS users_total,
      (SELECT COUNT(*) FROM users WHERE is_active = TRUE) AS users_active,
      (SELECT COUNT(*) FROM users WHERE is_active = TRUE AND identity_verified_at IS NOT NULL) AS users_verified,
      (SELECT COUNT(DISTINCT user_id) FROM subscriptions
        WHERE status = 'ACTIVE' AND paid_through_at > NOW()) AS subscriptions_active,
      (SELECT COUNT(*) FROM observer_access_requests WHERE status = 'PENDING') AS observer_requests_pending,
      (SELECT COUNT(*) FROM access_requests WHERE status = 'PENDING') AS waitlist_requests_pending,
      (SELECT COUNT(*) FROM manual_payment_proofs WHERE status = 'PENDING') AS payments_pending,
      (SELECT COUNT(*) FROM copier_pending_activations WHERE status = 'WAITING_FOR_COPIER') AS activations_waiting_for_copier,
      (SELECT COUNT(*) FROM copier_pending_activations WHERE status = 'WAITING_FOR_FLAT') AS activations_waiting_for_flat,
      (SELECT COUNT(*) FROM copier_pending_activations WHERE status = 'WAITING_FOR_KEY') AS activations_waiting_for_key,
      (SELECT COUNT(*) FROM copier_instances WHERE enabled = TRUE) AS instances_enabled,
      (SELECT COUNT(*) FROM copier_instances WHERE enabled = TRUE AND last_seen_at >= NOW() - INTERVAL '15 minutes') AS instances_seen_5m,
      (SELECT COUNT(*) FROM copier_memberships) AS memberships_total,
      (SELECT COUNT(*) FROM copier_memberships
        WHERE desired_state <> observed_state) AS memberships_out_of_sync,
      (SELECT COUNT(*) FROM copier_sync_outbox WHERE status = 'PENDING') AS sync_outbox_pending,
      (SELECT COUNT(*) FROM copier_sync_outbox
        WHERE status = 'PENDING' AND next_attempt_at <= NOW()) AS sync_outbox_due,
      (SELECT COUNT(*) FROM copier_sync_outbox WHERE status = 'DEAD_LETTER') AS sync_outbox_dead_letter,
      (SELECT COUNT(*) FROM entitlement_incidents WHERE status = 'OPEN') AS incidents_open,
      (SELECT COUNT(*) FROM entitlement_incidents WHERE status = 'OPEN' AND severity = 'HIGH') AS incidents_high,
      (SELECT COUNT(*) FROM entitlement_incidents WHERE status = 'OPEN' AND severity = 'CRITICAL') AS incidents_critical,
      (SELECT COUNT(*) FROM strategy_versions WHERE is_active = TRUE) AS strategies_active,
      (SELECT COUNT(*) FROM feature_snapshots
        WHERE computed_at >= (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT - 300000) AS feature_snapshots_5m,
      (SELECT COUNT(*) FROM regime_results
        WHERE eligible = TRUE AND computed_at >= (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT - 300000) AS eligible_regimes_5m,
      (SELECT COUNT(*) FROM decision_candidates WHERE status = 'PENDING') AS decisions_pending,
      (SELECT COUNT(*) FROM decision_candidates
        WHERE proposed_at >= (EXTRACT(EPOCH FROM NOW() - INTERVAL '24 hours') * 1000)::BIGINT) AS decisions_proposed_24h,
      (SELECT COUNT(*) FROM decision_candidates
        WHERE status = 'APPROVED' AND approved_at >= (EXTRACT(EPOCH FROM NOW() - INTERVAL '24 hours') * 1000)::BIGINT) AS decisions_approved_24h,
      (SELECT COUNT(*) FROM trades WHERE timestamp >= NOW() - INTERVAL '24 hours') AS app_trades_24h,
      (SELECT MAX(computed_at) FROM feature_snapshots) AS feature_computed_at_ms,
      (SELECT MAX(proposed_at) FROM decision_candidates) AS decision_proposed_at_ms,
      (SELECT MAX(timestamp) FROM trades) AS trade_executed_at,
      (SELECT MAX(last_seen_at) FROM copier_instances) AS instance_seen_at,
      (SELECT MAX(observed_at) FROM copier_source_state) AS source_observed_at,
      (SELECT MAX(observed_at) FROM copier_portfolio_reports WHERE is_complete = TRUE) AS portfolio_observed_at,
      (SELECT MAX(received_at) FROM copier_notification_events) AS notification_received_at,
      (SELECT MAX(last_synced_at) FROM copier_memberships) AS membership_synced_at,
      (SELECT MAX(created_at) FROM entitlement_audit_events) AS entitlement_audit_at
    `,
        (0, database_1.default) `
      SELECT
        instance.instance_id,
        instance.enabled,
        instance.last_seen_at,
        (SELECT MAX(source.observed_at) FROM copier_source_state source
          WHERE source.instance_id = instance.instance_id) AS source_observed_at,
        (SELECT MAX(report.observed_at) FROM copier_portfolio_reports report
          WHERE report.instance_id = instance.instance_id AND report.is_complete = TRUE) AS portfolio_observed_at,
        (SELECT COUNT(*) FROM copier_memberships membership
          WHERE membership.instance_id = instance.instance_id) AS memberships_total,
        (SELECT COUNT(*) FROM copier_memberships membership
          WHERE membership.instance_id = instance.instance_id
            AND membership.desired_state <> membership.observed_state) AS memberships_out_of_sync,
        (SELECT COUNT(*) FROM copier_sync_outbox command
          WHERE command.instance_id = instance.instance_id AND command.status = 'PENDING') AS pending_commands,
        (SELECT COUNT(*) FROM copier_sync_outbox command
          WHERE command.instance_id = instance.instance_id AND command.status = 'DEAD_LETTER') AS dead_letter_commands
      FROM copier_instances instance
      ORDER BY instance.enabled DESC, instance.instance_id ASC
    `,
    ]);
    const row = rows[0] ?? {};
    const count = (key) => asNumber(row[key]);
    const timestamp = (key) => asTimestamp(row[key]);
    const copierHealth = count('instances_enabled') === 0
        ? 'IDLE'
        : count('instances_seen_5m') === count('instances_enabled')
            && count('memberships_out_of_sync') === 0
            && count('sync_outbox_dead_letter') === 0
            ? 'ONLINE'
            : 'DEGRADED';
    const featureComputedAt = epochMillisToTimestamp(row.feature_computed_at_ms);
    const instanceSeenAt = timestamp('instance_seen_at');
    const copierHeartbeatIsFresh = instanceSeenAt !== null
        && Date.now() - new Date(instanceSeenAt).getTime() <= 15 * 60_000;
    // The local Telegram/copy bot can be healthy while no strategy has a current
    // feature snapshot and while it has zero open trades. A fresh authenticated
    // copier heartbeat is therefore enough to identify the runtime as online.
    const botHealth = copierHeartbeatIsFresh
        ? 'ONLINE'
        : count('strategies_active') > 0
            ? featureComputedAt && Date.now() - new Date(featureComputedAt).getTime() <= 5 * 60_000
                ? 'ONLINE'
                : 'STALE'
            : instanceSeenAt !== null
                ? 'STALE'
                : 'IDLE';
    return {
        observed_at: timestamp('observed_at') ?? new Date().toISOString(),
        database: { status: 'ONLINE' },
        access: {
            users_total: count('users_total'),
            users_active: count('users_active'),
            users_verified: count('users_verified'),
            subscriptions_active: count('subscriptions_active'),
        },
        queues: {
            observer_requests_pending: count('observer_requests_pending'),
            waitlist_requests_pending: count('waitlist_requests_pending'),
            payments_pending: count('payments_pending'),
            activations_waiting_for_copier: count('activations_waiting_for_copier'),
            activations_waiting_for_flat: count('activations_waiting_for_flat'),
            activations_waiting_for_key: count('activations_waiting_for_key'),
        },
        copier: {
            health: copierHealth,
            instances_enabled: count('instances_enabled'),
            instances_seen_5m: count('instances_seen_5m'),
            memberships_total: count('memberships_total'),
            memberships_out_of_sync: count('memberships_out_of_sync'),
            sync_outbox_pending: count('sync_outbox_pending'),
            sync_outbox_due: count('sync_outbox_due'),
            sync_outbox_dead_letter: count('sync_outbox_dead_letter'),
            incidents_open: count('incidents_open'),
            incidents_high: count('incidents_high'),
            incidents_critical: count('incidents_critical'),
        },
        copier_instances: copierInstances.map((instance) => ({
            instance_id: String(instance.instance_id ?? ''),
            enabled: instance.enabled === true || instance.enabled === 'true',
            last_seen_at: asTimestamp(instance.last_seen_at),
            source_observed_at: asTimestamp(instance.source_observed_at),
            portfolio_observed_at: asTimestamp(instance.portfolio_observed_at),
            memberships_total: asNumber(instance.memberships_total),
            memberships_out_of_sync: asNumber(instance.memberships_out_of_sync),
            pending_commands: asNumber(instance.pending_commands),
            dead_letter_commands: asNumber(instance.dead_letter_commands),
        })),
        bot: {
            health: botHealth,
            strategies_active: count('strategies_active'),
            feature_snapshots_5m: count('feature_snapshots_5m'),
            eligible_regimes_5m: count('eligible_regimes_5m'),
            decisions_pending: count('decisions_pending'),
            decisions_proposed_24h: count('decisions_proposed_24h'),
            decisions_approved_24h: count('decisions_approved_24h'),
            app_trades_24h: count('app_trades_24h'),
            feature_computed_at: featureComputedAt,
            decision_proposed_at: epochMillisToTimestamp(row.decision_proposed_at_ms),
            trade_executed_at: timestamp('trade_executed_at'),
        },
        freshness: {
            instance_seen_at: timestamp('instance_seen_at'),
            source_observed_at: timestamp('source_observed_at'),
            portfolio_observed_at: timestamp('portfolio_observed_at'),
            notification_received_at: timestamp('notification_received_at'),
            membership_synced_at: timestamp('membership_synced_at'),
            entitlement_audit_at: timestamp('entitlement_audit_at'),
        },
    };
}
async function getMasterOverview() {
    const rows = await (0, database_1.default) `
    SELECT
      (SELECT COUNT(*) FROM users) AS users_total,
      (SELECT COUNT(*) FROM users WHERE is_active = TRUE) AS users_active,
      (SELECT COUNT(*) FROM users WHERE is_active = TRUE AND identity_verified_at IS NOT NULL) AS users_verified,
      (SELECT COUNT(DISTINCT user_id) FROM subscriptions
        WHERE status = 'ACTIVE' AND paid_through_at > NOW()) AS subscriptions_active,
      (SELECT COUNT(DISTINCT user_id) FROM subscriptions
        WHERE paid_through_at IS NOT NULL AND paid_through_at <= NOW()) AS subscriptions_expired,
      (SELECT COUNT(DISTINCT user_id) FROM subscriptions
        WHERE status = 'ACTIVE' AND paid_through_at > NOW()
          AND paid_through_at <= NOW() + INTERVAL '7 days') AS subscriptions_expiring_7d,
      (SELECT COUNT(*) FROM observer_access_requests WHERE status = 'PENDING') AS observer_requests_pending,
      (SELECT COUNT(*) FROM access_requests WHERE status = 'PENDING') AS waitlist_requests_pending,
      (SELECT COUNT(*) FROM manual_payment_proofs WHERE status = 'PENDING') AS payments_pending,
      (SELECT COUNT(*) FROM referral_clicks) AS referral_clicks_total,
      (SELECT COUNT(*) FROM referrals) AS referrals_total,
      (SELECT COUNT(*) FROM referrals WHERE status = 'active') AS referrals_active,
      (SELECT COUNT(*) FROM referrals WHERE status = 'pending') AS referrals_pending,
      (SELECT COUNT(*) FROM referrals WHERE status = 'fraud') AS referrals_flagged,
      (SELECT COALESCE(SUM(points_delta) FILTER (WHERE entry_type = 'REFERRAL_REWARD'), 0)
        FROM referral_points_ledger) AS referral_points_awarded,
      (SELECT COUNT(*) FROM copier_memberships) AS copier_memberships,
      (SELECT COUNT(*) FROM (
        SELECT DISTINCT ON (membership_id) id
        FROM copier_position_snapshots
        WHERE authoritative = TRUE
        ORDER BY membership_id, observed_at DESC
      ) latest
      JOIN copier_position_snapshot_items item ON item.snapshot_id = latest.id
      WHERE item.state = 'OPEN') AS copier_open_positions
  `;
    const row = rows[0] ?? {};
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, asNumber(value)]));
}
async function listMasterUsers(limit, offset) {
    return (0, database_1.default) `
    SELECT u.id, u.email, u.display_name, u.plan AS account_plan, u.is_active,
      u.identity_verified_at, u.created_at, u.last_login_at,
      u.referral_code, referrer.display_name AS referred_by_display_name,
      referrer.referral_code AS referred_by_code,
      observer.status AS observer_status, observer.expires_at AS observer_expires_at,
      subscription.plan AS subscription_plan, subscription.status AS subscription_status,
      subscription.paid_through_at,
      membership.desired_state AS copier_desired_state,
      membership.observed_state AS copier_observed_state,
      membership.copier_account_ref, membership.last_synced_at,
      (SELECT COUNT(*) FROM trades t WHERE t.user_id = u.id) AS app_trade_count,
      (SELECT COUNT(*) FROM entitlement_incidents i WHERE i.user_id = u.id AND i.status = 'OPEN') AS open_incidents,
      (SELECT COUNT(*) FROM referrals r WHERE r.referrer_id = u.id) AS referred_signups,
      (SELECT COUNT(*) FROM referrals r WHERE r.referrer_id = u.id AND r.status = 'active') AS qualified_referrals,
      (SELECT COALESCE(SUM(points_delta), 0)::int FROM referral_points_ledger p WHERE p.user_id = u.id) AS referral_points_balance
    FROM users u
    LEFT JOIN users referrer ON referrer.id = u.referred_by_id
    LEFT JOIN LATERAL (
      SELECT status, expires_at FROM observer_access_requests
      WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1
    ) observer ON TRUE
    LEFT JOIN LATERAL (
      SELECT plan, status, paid_through_at FROM subscriptions
      WHERE user_id = u.id ORDER BY updated_at DESC LIMIT 1
    ) subscription ON TRUE
    LEFT JOIN LATERAL (
      SELECT desired_state, observed_state, copier_account_ref, last_synced_at
      FROM copier_memberships WHERE user_id = u.id ORDER BY updated_at DESC LIMIT 1
    ) membership ON TRUE
    ORDER BY u.created_at DESC, u.id DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}
async function listMasterRequests() {
    const [observer, waitlist] = await Promise.all([
        (0, database_1.default) `
      SELECT r.id, r.user_id, u.email, u.display_name, r.consent_version,
        r.status, r.requested_at
      FROM observer_access_requests r JOIN users u ON u.id = r.user_id
      WHERE r.status = 'PENDING' ORDER BY r.requested_at ASC
    `,
        (0, database_1.default) `
      SELECT id, email_normalized AS email, consent_version, status, created_at
      FROM access_requests WHERE status = 'PENDING' ORDER BY created_at ASC
    `,
    ]);
    return { observer, waitlist };
}
async function listManualPaymentProofs(userId, limit = 100, offset = 0) {
    if (userId !== undefined) {
        return (0, database_1.default) `
      SELECT p.id, p.transaction_ref, p.amount, p.currency, p.payment_details, p.status,
        p.plan_key, p.payment_method, p.points_cost, p.decision_note, p.approved_plan,
        p.paid_through_at, p.created_at, p.decided_at,
        activation.status AS activation_status
      FROM manual_payment_proofs p
      LEFT JOIN copier_pending_activations activation ON activation.payment_proof_id = p.id
      WHERE p.user_id = ${userId}
      ORDER BY p.created_at DESC LIMIT ${limit} OFFSET ${offset}
    `;
    }
    return (0, database_1.default) `
    SELECT p.id, p.user_id, u.email, u.display_name, p.transaction_ref,
      p.amount, p.currency, p.payment_details, p.status, p.decision_note,
    p.plan_key, p.payment_method, p.points_cost, p.approved_plan,
    p.paid_through_at, p.created_at, p.decided_at, activation.status AS activation_status
    FROM manual_payment_proofs p JOIN users u ON u.id = p.user_id
    LEFT JOIN copier_pending_activations activation ON activation.payment_proof_id = p.id
    ORDER BY CASE p.status WHEN 'PENDING' THEN 0 ELSE 1 END, p.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}
async function submitManualPaymentProof(userId, input) {
    const plan = (0, paymentPlans_1.getPaymentPlan)(input.planKey);
    if (!plan || input.amount !== plan.price || input.currency.trim().toUpperCase() !== plan.currency) {
        throw (0, errorHandler_1.createError)('Payment amount and currency do not match the selected plan', 400);
    }
    const reference = input.transactionRef.trim();
    const referenceKey = reference.toLowerCase();
    return database_1.default.begin(async (tx) => {
        await (0, liveCopyService_1.assertLiveCopyReady)(tx, userId);
        const pending = await tx `
      SELECT p.id FROM manual_payment_proofs p
      WHERE p.user_id = ${userId}
        AND (
          p.status = 'PENDING'
          OR EXISTS (
            SELECT 1 FROM copier_pending_activations activation
            WHERE activation.payment_proof_id = p.id
              AND activation.status IN ('WAITING_FOR_COPIER','WAITING_FOR_FLAT','WAITING_FOR_KEY')
          )
        )
      LIMIT 1
    `;
        if (pending.length)
            throw (0, errorHandler_1.createError)('A payment request or approved activation is already awaiting processing', 409);
        const id = (0, node_crypto_1.randomUUID)();
        const inserted = await tx `
      INSERT INTO manual_payment_proofs
        (id, user_id, plan_key, transaction_ref, reference_key, amount, currency, payment_details)
      VALUES (${id}, ${userId}, ${plan.key}, ${reference}, ${referenceKey}, ${input.amount},
        ${input.currency.toUpperCase()}, ${input.paymentDetails.trim()})
      ON CONFLICT (reference_key) DO NOTHING
      RETURNING id
    `;
        if (!inserted.length)
            throw (0, errorHandler_1.createError)('That transaction reference has already been submitted', 409);
        await (0, entitlementService_1.writeEntitlementAudit)(tx, {
            userId,
            actorType: 'USER',
            actorRef: String(userId),
            eventType: 'MANUAL_PAYMENT_PROOF_SUBMITTED',
            subjectType: 'manual_payment_proof',
            subjectRef: id,
            details: { plan: plan.key, amount: input.amount, currency: input.currency.toUpperCase() },
        });
        return { id, status: 'PENDING' };
    });
}
async function decideObserverRequest(requestId, actorUserId, decision, note) {
    return database_1.default.begin(async (tx) => {
        const requests = await tx `
      SELECT id, user_id, status FROM observer_access_requests
      WHERE id = ${requestId} FOR UPDATE
    `;
        const request = requests[0];
        if (!request)
            throw (0, errorHandler_1.createError)('Observer request not found', 404);
        if (request.status !== 'PENDING')
            throw (0, errorHandler_1.createError)('Observer request has already been reviewed', 409);
        if (decision === 'reject') {
            await tx `
        UPDATE observer_access_requests SET status = 'REJECTED'
        WHERE id = ${request.id}
      `;
            await (0, entitlementService_1.writeEntitlementAudit)(tx, {
                userId: request.user_id, actorType: 'OPERATOR', actorRef: String(actorUserId),
                eventType: 'OBSERVER_ACCESS_REJECTED', subjectType: 'observer_request',
                subjectRef: request.id, details: { note },
            });
            return { status: 'REJECTED' };
        }
        const paid = await tx `
      SELECT EXISTS (
        SELECT 1 FROM subscriptions WHERE user_id = ${request.user_id}
          AND status = 'ACTIVE' AND paid_through_at > NOW()
      ) AS active
    `;
        if (paid[0]?.active)
            throw (0, errorHandler_1.createError)('User already has active paid access', 409);
        const instanceId = await (0, entitlementService_1.selectSingleEnabledInstance)(tx);
        const existingRows = await tx `
      SELECT membership_id, user_id, instance_id, copier_account_ref, desired_state, revision
      FROM copier_memberships WHERE user_id = ${request.user_id} AND instance_id = ${instanceId}
      FOR UPDATE
    `;
        const existing = existingRows[0];
        if (existing?.desired_state === 'PAID_ACTIVE') {
            throw (0, errorHandler_1.createError)('User already has paid copier access', 409);
        }
        const membership = existing ?? {
            membership_id: (0, node_crypto_1.randomUUID)(),
            user_id: request.user_id,
            instance_id: instanceId,
            copier_account_ref: null,
            desired_state: 'OBSERVER',
            revision: 0,
        };
        if (!existing) {
            await tx `
        INSERT INTO copier_memberships (membership_id, user_id, instance_id, desired_state)
        VALUES (${membership.membership_id}, ${request.user_id}, ${instanceId}, 'OBSERVER')
      `;
        }
        await tx `
      INSERT INTO entitlement_grants (id, user_id, grant_type, source_id, status, revision)
      VALUES (${(0, node_crypto_1.randomUUID)()}, ${request.user_id}, 'OBSERVER', ${request.id}, 'PENDING', 0)
      ON CONFLICT (grant_type, source_id) DO NOTHING
    `;
        await tx `UPDATE observer_access_requests SET status = 'PROVISIONING' WHERE id = ${request.id}`;
        await (0, entitlementService_1.enqueueCopierCommand)(tx, { ...membership, revision: Number(membership.revision) }, existing?.copier_account_ref ? 'UPDATE_ROLE' : 'GRANT', 'OBSERVER', null, null, []);
        await (0, entitlementService_1.writeEntitlementAudit)(tx, {
            userId: request.user_id, actorType: 'OPERATOR', actorRef: String(actorUserId),
            eventType: 'OBSERVER_ACCESS_APPROVED', subjectType: 'observer_request',
            subjectRef: request.id, details: { note },
        });
        return { status: 'PROVISIONING' };
    });
}
async function decideWaitlistRequest(requestId, actorUserId, decision, note) {
    return database_1.default.begin(async (tx) => {
        const requests = await tx `
      SELECT id, email_normalized, status FROM access_requests
      WHERE id = ${requestId} FOR UPDATE
    `;
        const request = requests[0];
        if (!request)
            throw (0, errorHandler_1.createError)('Waitlist request not found', 404);
        if (request.status !== 'PENDING')
            throw (0, errorHandler_1.createError)('Waitlist request has already been reviewed', 409);
        const status = decision === 'approve' ? 'INVITED' : 'REJECTED';
        await tx `UPDATE access_requests SET status = ${status} WHERE id = ${request.id}`;
        await (0, entitlementService_1.writeEntitlementAudit)(tx, {
            userId: null, actorType: 'OPERATOR', actorRef: String(actorUserId),
            eventType: decision === 'approve' ? 'WAITLIST_REQUEST_APPROVED' : 'WAITLIST_REQUEST_REJECTED',
            subjectType: 'access_request', subjectRef: request.id,
            details: { email: request.email_normalized, note },
        });
        return { status };
    });
}
async function decideManualPaymentProof(proofId, actorUserId, decision, input) {
    return database_1.default.begin(async (tx) => {
        const proofRows = await tx `
      SELECT id, user_id, status, plan_key, amount, currency, payment_method, points_cost
      FROM manual_payment_proofs WHERE id = ${proofId} FOR UPDATE
    `;
        const proof = proofRows[0];
        if (!proof)
            throw (0, errorHandler_1.createError)('Payment proof not found', 404);
        if (proof.status !== 'PENDING')
            throw (0, errorHandler_1.createError)('Payment proof has already been reviewed', 409);
        if (decision === 'reject') {
            await tx `
        UPDATE manual_payment_proofs SET status = 'REJECTED', decision_note = ${input.note},
          decided_by_user_id = ${actorUserId}, decided_at = NOW(), updated_at = NOW()
        WHERE id = ${proof.id}
      `;
            await (0, entitlementService_1.writeEntitlementAudit)(tx, {
                userId: proof.user_id, actorType: 'OPERATOR', actorRef: String(actorUserId),
                eventType: 'MANUAL_PAYMENT_REJECTED', subjectType: 'manual_payment_proof',
                subjectRef: proof.id, details: { note: input.note },
            });
            if (proof.payment_method === 'referral_points') {
                if (proof.points_cost !== referralService_1.MONTHLY_SUBSCRIPTION_POINTS_COST) {
                    throw (0, errorHandler_1.createError)('The points redemption record is invalid; no points were refunded.', 409);
                }
                await tx `
          INSERT INTO referral_points_ledger (id, user_id, points_delta, entry_type, reference_id)
          VALUES (${(0, node_crypto_1.randomUUID)()}, ${proof.user_id}, ${proof.points_cost},
            'MONTHLY_REDEMPTION_REFUND', ${proof.id})
          ON CONFLICT (entry_type, reference_id) DO NOTHING
        `;
            }
            return { status: 'REJECTED' };
        }
        const planKey = proof.plan_key ?? input.plan?.trim() ?? '';
        const paymentPlan = proof.plan_key ? (0, paymentPlans_1.getPaymentPlan)(proof.plan_key) : undefined;
        if (proof.plan_key && (!paymentPlan || (input.plan && input.plan !== proof.plan_key))) {
            throw (0, errorHandler_1.createError)('The approved plan must match the plan selected with the payment proof', 409);
        }
        if (proof.payment_method === 'referral_points') {
            if (planKey !== 'monthly' || Number(proof.amount) !== 0 || proof.currency !== 'POINTS'
                || proof.points_cost !== referralService_1.MONTHLY_SUBSCRIPTION_POINTS_COST) {
                throw (0, errorHandler_1.createError)('The points redemption request is invalid', 409);
            }
        }
        else if (proof.payment_method !== 'external'
            || (paymentPlan && (Number(proof.amount) !== paymentPlan.price || proof.currency.toUpperCase() !== paymentPlan.currency))) {
            throw (0, errorHandler_1.createError)('The payment proof amount and currency do not match the selected plan', 409);
        }
        const userRows = await tx `
      SELECT is_active, identity_verified_at FROM users WHERE id = ${proof.user_id} FOR UPDATE
    `;
        if (!userRows[0]?.is_active || !userRows[0].identity_verified_at) {
            throw (0, errorHandler_1.createError)('Payment owner must be active with a verified identity', 409);
        }
        await (0, liveCopyService_1.assertLiveCopyReady)(tx, proof.user_id);
        const currentCoverage = await tx `
      SELECT MAX(paid_through_at) AS paid_through_at
      FROM subscriptions
      WHERE user_id = ${proof.user_id}
        AND status = 'ACTIVE'
        AND paid_through_at > NOW()
    `;
        const approvedPlan = paymentPlan?.key ?? input.plan?.trim();
        if (!approvedPlan)
            throw (0, errorHandler_1.createError)('A plan is required for approval', 400);
        const referralReward = proof.payment_method === 'external'
            ? await (0, referralService_1.awardQualifiedReferralPoints)(tx, proof.user_id)
            : null;
        const instanceRows = await tx `
      SELECT instance_id FROM copier_instances WHERE enabled = TRUE ORDER BY instance_id LIMIT 2
    `;
        if (instanceRows.length > 1)
            throw (0, errorHandler_1.createError)('Copier provisioning is not configured', 503);
        const instanceId = instanceRows[0]?.instance_id ?? null;
        const membershipRows = await tx `
      SELECT membership_id, user_id, instance_id, copier_account_ref, desired_state, revision
      FROM copier_memberships WHERE user_id = ${proof.user_id}
        AND (${instanceId}::varchar IS NULL OR instance_id = ${instanceId})
      ORDER BY updated_at DESC LIMIT 1 FOR UPDATE
    `;
        const existingMembership = membershipRows[0];
        const now = new Date();
        const coverageThrough = currentCoverage[0]?.paid_through_at;
        const isRenewal = Boolean(instanceId
            && existingMembership?.desired_state === 'PAID_ACTIVE'
            && coverageThrough
            && coverageThrough > now);
        let paidThroughAt = null;
        let activationStatus = 'WAITING_FOR_COPIER';
        if (isRenewal && paymentPlan && existingMembership && instanceId) {
            const startsAt = coverageThrough && coverageThrough > now ? coverageThrough : now;
            paidThroughAt = (0, paymentPlans_1.addPaymentPlanDuration)(startsAt, paymentPlan);
            if (paidThroughAt.getTime() <= startsAt.getTime()) {
                throw (0, errorHandler_1.createError)('A future paid-through date is required for approval', 400);
            }
            await tx `
        UPDATE subscriptions SET status = 'EXPIRED', updated_at = NOW()
        WHERE user_id = ${proof.user_id} AND provider = 'manual' AND status IN ('ACTIVE','PAST_DUE')
      `;
            const subscriptionId = (0, node_crypto_1.randomUUID)();
            await tx `
        INSERT INTO subscriptions
          (id, user_id, provider, provider_subscription_ref, plan, status, paid_through_at)
        VALUES (${subscriptionId}, ${proof.user_id}, 'manual', ${proof.id}, ${approvedPlan}, 'ACTIVE', ${paidThroughAt})
      `;
            await tx `
        INSERT INTO entitlement_grants
          (id, user_id, grant_type, source_id, status, starts_at, expires_at, revision)
        VALUES (${(0, node_crypto_1.randomUUID)()}, ${proof.user_id}, 'SUBSCRIPTION', ${subscriptionId},
          'ACTIVE', ${startsAt}, ${paidThroughAt}, 0)
      `;
            await (0, entitlementService_1.enqueueCopierCommand)(tx, { ...existingMembership, revision: Number(existingMembership.revision) }, 'UPDATE_ROLE', 'PAID_ACTIVE', null, paidThroughAt, []);
            activationStatus = 'ACTIVE';
        }
        else {
            if (!paymentPlan) {
                throw (0, errorHandler_1.createError)('A supported subscription plan is required for deferred live activation', 409);
            }
            const pendingInstanceId = instanceId;
            await tx `
        INSERT INTO copier_pending_activations
          (payment_proof_id, user_id, instance_id, approved_by_user_id, plan_key, duration_ms, status)
        VALUES (${proof.id}, ${proof.user_id}, ${pendingInstanceId}, ${actorUserId}, ${paymentPlan.key},
          0, ${pendingInstanceId ? 'WAITING_FOR_FLAT' : 'WAITING_FOR_COPIER'})
      `;
            activationStatus = pendingInstanceId ? 'WAITING_FOR_FLAT' : 'WAITING_FOR_COPIER';
        }
        await tx `
      UPDATE manual_payment_proofs SET status = 'APPROVED', decision_note = ${input.note},
        decided_by_user_id = ${actorUserId}, decided_at = NOW(), approved_plan = ${approvedPlan},
        paid_through_at = ${paidThroughAt}, updated_at = NOW()
      WHERE id = ${proof.id}
    `;
        await (0, entitlementService_1.writeEntitlementAudit)(tx, {
            userId: proof.user_id, actorType: 'OPERATOR', actorRef: String(actorUserId),
            eventType: 'MANUAL_PAYMENT_APPROVED', subjectType: 'manual_payment_proof',
            subjectRef: proof.id,
            details: {
                plan: approvedPlan,
                plan_key: planKey,
                payment_method: proof.payment_method,
                ...(proof.payment_method === 'referral_points' ? { points_cost: proof.points_cost } : {}),
                ...(referralReward ? { referral_points_awarded: referralReward.points } : {}),
                activation_status: activationStatus,
                ...(paidThroughAt ? { paid_through_at: paidThroughAt.toISOString() } : {}),
            },
        });
        return { status: 'APPROVED', ...(paidThroughAt ? { paidThroughAt: paidThroughAt.toISOString() } : {}) };
    });
}
async function listMasterAuditEvents(limit, offset) {
    return (0, database_1.default) `
    SELECT id, user_id, actor_type, actor_ref, event_type, subject_type,
      subject_ref, request_id, details, created_at
    FROM entitlement_audit_events ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}
//# sourceMappingURL=masterOperationsService.js.map