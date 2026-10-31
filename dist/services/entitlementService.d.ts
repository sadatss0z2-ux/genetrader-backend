import type postgres from 'postgres';
type Tx = postgres.TransactionSql;
type CopierState = 'OBSERVER' | 'PAID_ACTIVE' | 'CLOSEOUT_ONLY' | 'REVOKED';
type Operation = 'GRANT' | 'UPDATE_ROLE' | 'SET_CLOSEOUT_ONLY' | 'REVOKE';
interface Membership {
    membership_id: string;
    user_id: number;
    instance_id: string;
    copier_account_ref: string | null;
    desired_state: CopierState;
    revision: number;
}
export declare function enqueueCopierCommand(tx: Tx, membership: Membership, operation: Operation, state: CopierState, observerExpiresAt: Date | null, paidThroughAt: Date | null, positionScopes: Array<{
    position_ref: string;
    allowed_actions: readonly string[];
}>): Promise<{
    commandId: string;
    revision: number;
}>;
export declare function writeEntitlementAudit(tx: Tx, input: {
    userId: number | null;
    actorType: 'USER' | 'SYSTEM' | 'COPIER' | 'PAYMENT_PROVIDER' | 'OPERATOR';
    actorRef?: string | null;
    eventType: string;
    subjectType: string;
    subjectRef: string;
    requestId?: string | null;
    details?: Record<string, unknown>;
}): Promise<void>;
export declare function selectSingleEnabledInstance(tx: Tx): Promise<string>;
export declare function requestObserverAccess(userId: number, consentVersion: string, idempotencyKey: string): Promise<{
    status: string;
    requestId: string;
    httpStatus: number;
    replayed: boolean;
}>;
export declare function createPublicAccessRequest(email: string, consentVersion: string, idempotencyKey: string): Promise<{
    requestId: string;
    httpStatus: number;
    replayed: boolean;
}>;
export declare function getEntitlements(userId: number): Promise<Record<string, unknown>>;
/** Durable sweep; safe to call from multiple API replicas due to row locks. */
export declare function sweepExpiredEntitlements(now?: Date): Promise<number>;
export {};
//# sourceMappingURL=entitlementService.d.ts.map