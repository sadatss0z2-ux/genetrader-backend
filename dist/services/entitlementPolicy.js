"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLOSEOUT_ACTIONS = exports.OBSERVER_DURATION_MS = void 0;
exports.effectiveSubscriptionStatus = effectiveSubscriptionStatus;
exports.effectiveObserverStatus = effectiveObserverStatus;
exports.observerExpiryFromAcknowledgement = observerExpiryFromAcknowledgement;
exports.isPaidEntitlementActive = isPaidEntitlementActive;
exports.canSubmitAppOrder = canSubmitAppOrder;
exports.closeoutActionAllowed = closeoutActionAllowed;
exports.isStaleProviderEvent = isStaleProviderEvent;
exports.transitionForProviderEvent = transitionForProviderEvent;
exports.canRevokeMembership = canRevokeMembership;
exports.retryDelaySeconds = retryDelaySeconds;
exports.OBSERVER_DURATION_MS = 14 * 24 * 60 * 60 * 1000;
exports.CLOSEOUT_ACTIONS = ['EXIT', 'CANCEL_ENTRY', 'PROTECTIVE_UPDATE', 'RECONCILE'];
function effectiveSubscriptionStatus(status, paidThrough, now) {
    if (!status)
        return 'NONE';
    if (['ACTIVE', 'PAST_DUE', 'CANCELED'].includes(status) && paidThrough !== null && paidThrough.getTime() <= now.getTime())
        return 'EXPIRED';
    return status;
}
function effectiveObserverStatus(status, expiresAt, now) {
    if (!status)
        return 'none';
    if (['ACTIVE', 'PROVISIONING'].includes(status) && expiresAt !== null && expiresAt.getTime() <= now.getTime())
        return 'expired';
    return status.toLowerCase();
}
function observerExpiryFromAcknowledgement(acknowledgedAt) {
    return new Date(acknowledgedAt.getTime() + exports.OBSERVER_DURATION_MS);
}
function isPaidEntitlementActive(status, paidThrough, now) {
    return status === 'ACTIVE' && paidThrough !== null && paidThrough.getTime() > now.getTime();
}
function canSubmitAppOrder(input) {
    return !input.observerMode
        && isPaidEntitlementActive(input.subscriptionStatus, input.paidThroughAt, input.now)
        && input.desiredCopierState === 'PAID_ACTIVE'
        && input.observedCopierState === 'PAID_ACTIVE';
}
function closeoutActionAllowed(input) {
    return input.now.getTime() >= input.paidThroughAt.getTime()
        && exports.CLOSEOUT_ACTIONS.includes(input.action)
        && input.positionRef.length > 0
        && input.grantPositionRefs.has(input.positionRef);
}
function isStaleProviderEvent(input) {
    if (input.incomingSequence !== null && input.lastSequence !== null) {
        return input.incomingSequence <= input.lastSequence;
    }
    return input.lastOccurredAt !== null && input.occurredAt.getTime() <= input.lastOccurredAt.getTime();
}
function transitionForProviderEvent(current, event) {
    switch (event) {
        case 'payment_succeeded':
        case 'subscription_renewed':
            return 'ACTIVE';
        case 'payment_failed':
            return current === 'ACTIVE' ? 'PAST_DUE' : current;
        case 'subscription_canceled':
            return 'CANCELED';
        case 'refund':
            return 'REFUNDED';
        case 'dispute_opened':
            return 'DISPUTED';
        case 'dispute_resolved':
            return current === 'DISPUTED' ? 'PAST_DUE' : current;
    }
}
function canRevokeMembership(snapshot) {
    return snapshot.authoritative && snapshot.positions.every((position) => position.state === 'FLAT' && !position.pendingExecutableOrders && !position.inflightEntryCommands);
}
function retryDelaySeconds(attemptCount) {
    if (!Number.isSafeInteger(attemptCount) || attemptCount < 0)
        throw new Error('attempt count must be a non-negative integer');
    return Math.min(300, 2 ** Math.min(attemptCount, 8));
}
//# sourceMappingURL=entitlementPolicy.js.map