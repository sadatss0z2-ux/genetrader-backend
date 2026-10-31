import type postgres from 'postgres';
type Tx = postgres.TransactionSql;
export interface MasterSystemStatus {
    observed_at: string;
    database: {
        status: 'ONLINE';
    };
    access: {
        users_total: number;
        users_active: number;
        users_verified: number;
        subscriptions_active: number;
    };
    queues: {
        observer_requests_pending: number;
        waitlist_requests_pending: number;
        payments_pending: number;
        activations_waiting_for_copier: number;
        activations_waiting_for_flat: number;
        activations_waiting_for_key: number;
    };
    copier: {
        health: 'ONLINE' | 'DEGRADED' | 'IDLE';
        instances_enabled: number;
        instances_seen_5m: number;
        memberships_total: number;
        memberships_out_of_sync: number;
        sync_outbox_pending: number;
        sync_outbox_due: number;
        sync_outbox_dead_letter: number;
        incidents_open: number;
        incidents_high: number;
        incidents_critical: number;
    };
    copier_instances: Array<{
        instance_id: string;
        enabled: boolean;
        last_seen_at: string | null;
        source_observed_at: string | null;
        portfolio_observed_at: string | null;
        memberships_total: number;
        memberships_out_of_sync: number;
        pending_commands: number;
        dead_letter_commands: number;
    }>;
    bot: {
        health: 'ONLINE' | 'STALE' | 'IDLE';
        strategies_active: number;
        feature_snapshots_5m: number;
        eligible_regimes_5m: number;
        decisions_pending: number;
        decisions_proposed_24h: number;
        decisions_approved_24h: number;
        app_trades_24h: number;
        feature_computed_at: string | null;
        decision_proposed_at: string | null;
        trade_executed_at: string | null;
    };
    freshness: {
        instance_seen_at: string | null;
        source_observed_at: string | null;
        portfolio_observed_at: string | null;
        notification_received_at: string | null;
        membership_synced_at: string | null;
        entitlement_audit_at: string | null;
    };
}
/**
 * Returns operational-only telemetry for the master account. It deliberately
 * excludes exchange credentials, payment references, and all secret values.
 */
export declare function getMasterSystemStatus(): Promise<MasterSystemStatus>;
export declare function getMasterOverview(): Promise<Record<string, number>>;
export declare function listMasterUsers(limit: number, offset: number): Promise<readonly unknown[]>;
export declare function listMasterRequests(): Promise<{
    observer: readonly unknown[];
    waitlist: readonly unknown[];
}>;
export declare function listManualPaymentProofs(userId?: number, limit?: number, offset?: number): Promise<readonly unknown[]>;
export declare function submitManualPaymentProof(userId: number, input: {
    planKey: 'monthly' | 'yearly';
    transactionRef: string;
    amount: number;
    currency: string;
    paymentDetails: string;
}): Promise<{
    id: string;
    status: 'PENDING';
}>;
export declare function decideObserverRequest(requestId: string, actorUserId: number, decision: 'approve' | 'reject', note: string): Promise<{
    status: string;
}>;
export declare function decideWaitlistRequest(requestId: string, actorUserId: number, decision: 'approve' | 'reject', note: string): Promise<{
    status: string;
}>;
export declare function decideManualPaymentProof(proofId: string, actorUserId: number, decision: 'approve' | 'reject', input: {
    plan?: string;
    paidThroughAt?: Date;
    note: string;
}): Promise<{
    status: string;
    paidThroughAt?: string;
}>;
export declare function listMasterAuditEvents(limit: number, offset: number): Promise<readonly unknown[]>;
export type MasterTransaction = Tx;
export {};
//# sourceMappingURL=masterOperationsService.d.ts.map