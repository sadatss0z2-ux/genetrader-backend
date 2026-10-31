"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestOnlyPaymentProvider = void 0;
exports.signTestFixturePayload = signTestFixturePayload;
const node_crypto_1 = require("node:crypto");
const ALLOWED_EVENTS = new Set([
    'payment_succeeded', 'subscription_renewed', 'payment_failed', 'subscription_canceled',
    'refund', 'dispute_opened', 'dispute_resolved',
]);
/** A signed deterministic fixture. It refuses to operate outside NODE_ENV=test. */
class TestOnlyPaymentProvider {
    provider = 'test-fixture';
    verifyAndNormalize(rawBody, signature) {
        if (process.env.NODE_ENV !== 'test')
            throw new Error('PROVIDER_DISABLED');
        const secret = process.env.TEST_PAYMENT_WEBHOOK_SECRET;
        if (!secret || !signature || !/^[a-f0-9]{64}$/i.test(signature))
            throw new Error('SIGNATURE_INVALID');
        const expected = (0, node_crypto_1.createHmac)('sha256', secret).update(rawBody).digest();
        const actual = Buffer.from(signature, 'hex');
        if (actual.length !== expected.length || !(0, node_crypto_1.timingSafeEqual)(actual, expected))
            throw new Error('SIGNATURE_INVALID');
        const parsed = JSON.parse(rawBody.toString('utf8'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
            throw new Error('EVENT_INVALID');
        const value = parsed;
        const text = (field, max = 255) => {
            const candidate = value[field];
            if (typeof candidate !== 'string' || candidate.length < 1 || candidate.length > max)
                throw new Error('EVENT_INVALID');
            return candidate;
        };
        const eventType = text('event_type', 48);
        const occurredAtText = text('occurred_at', 40);
        const occurredAt = new Date(occurredAtText);
        const sequenceValue = value.sequence;
        const sequence = sequenceValue === undefined || sequenceValue === null ? null : Number(sequenceValue);
        const paidThroughValue = value.paid_through_at;
        const paidThroughText = paidThroughValue === undefined || paidThroughValue === null ? null : String(paidThroughValue);
        const paidThroughAt = paidThroughText === null ? null : new Date(paidThroughText);
        if (!ALLOWED_EVENTS.has(eventType) || !Number.isFinite(occurredAt.getTime())
            || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(occurredAtText)
            || (sequence !== null && (!Number.isSafeInteger(sequence) || sequence < 0))
            || (paidThroughAt !== null && (!Number.isFinite(paidThroughAt.getTime()) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(paidThroughText ?? ''))))
            throw new Error('EVENT_INVALID');
        return {
            provider: this.provider,
            eventId: text('event_id'),
            transactionRef: typeof value.transaction_ref === 'string' ? value.transaction_ref.slice(0, 255) : null,
            subscriptionRef: typeof value.subscription_ref === 'string' ? value.subscription_ref.slice(0, 255) : null,
            customerRef: text('customer_ref'),
            eventType,
            occurredAt,
            sequence,
            plan: typeof value.plan === 'string' ? value.plan.slice(0, 64) : null,
            paidThroughAt,
            payloadSha256: (0, node_crypto_1.createHash)('sha256').update(rawBody).digest('hex'),
        };
    }
}
exports.TestOnlyPaymentProvider = TestOnlyPaymentProvider;
function signTestFixturePayload(rawBody, secret) {
    return (0, node_crypto_1.createHmac)('sha256', secret).update(rawBody).digest('hex');
}
//# sourceMappingURL=paymentProvider.js.map