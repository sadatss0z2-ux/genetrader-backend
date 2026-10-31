export declare const OBSERVER_DURATION_MS: number;
export declare const CLOSEOUT_ACTIONS: readonly ["EXIT", "CANCEL_ENTRY", "PROTECTIVE_UPDATE", "RECONCILE"];
export type CloseoutAction = (typeof CLOSEOUT_ACTIONS)[number];
export type SubscriptionStatus = 'PENDING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'REFUNDED' | 'DISPUTED' | 'EXPIRED';
export type ProviderEventType = 'payment_succeeded' | 'subscription_renewed' | 'payment_failed' | 'subscription_canceled' | 'refund' | 'dispute_opened' | 'dispute_resolved';
export declare function effectiveSubscriptionStatus(status: SubscriptionStatus | null, paidThrough: Date | null, now: Date): SubscriptionStatus | 'NONE';
export declare function effectiveObserverStatus(status: string | null, expiresAt: Date | null, now: Date): string;
export declare function observerExpiryFromAcknowledgement(acknowledgedAt: Date): Date;
export declare function isPaidEntitlementActive(status: SubscriptionStatus, paidThrough: Date | null, now: Date): boolean;
export declare function canSubmitAppOrder(input: {
    observerMode: boolean;
    subscriptionStatus: SubscriptionStatus;
    paidThroughAt: Date | null;
    desiredCopierState: string | null;
    observedCopierState: string | null;
    now: Date;
}): boolean;
export declare function closeoutActionAllowed(input: {
    action: string;
    positionRef: string;
    grantPositionRefs: ReadonlySet<string>;
    paidThroughAt: Date;
    now: Date;
}): boolean;
export declare function isStaleProviderEvent(input: {
    incomingSequence: number | null;
    lastSequence: number | null;
    occurredAt: Date;
    lastOccurredAt: Date | null;
}): boolean;
export declare function transitionForProviderEvent(current: SubscriptionStatus, event: ProviderEventType): SubscriptionStatus;
export declare function canRevokeMembership(snapshot: {
    authoritative: boolean;
    positions: Array<{
        state: 'OPEN' | 'FLAT' | 'UNKNOWN';
        pendingExecutableOrders: boolean;
        inflightEntryCommands: boolean;
    }>;
}): boolean;
export declare function retryDelaySeconds(attemptCount: number): number;
//# sourceMappingURL=entitlementPolicy.d.ts.map