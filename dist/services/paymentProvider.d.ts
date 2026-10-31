import { ProviderEventType } from './entitlementPolicy';
export interface NormalizedPaymentEvent {
    provider: string;
    eventId: string;
    transactionRef: string | null;
    subscriptionRef: string | null;
    customerRef: string;
    eventType: ProviderEventType;
    occurredAt: Date;
    sequence: number | null;
    plan: string | null;
    paidThroughAt: Date | null;
    payloadSha256: string;
}
export interface PaymentProviderAdapter {
    readonly provider: string;
    verifyAndNormalize(rawBody: Buffer, signature: string | undefined): NormalizedPaymentEvent;
}
/** A signed deterministic fixture. It refuses to operate outside NODE_ENV=test. */
export declare class TestOnlyPaymentProvider implements PaymentProviderAdapter {
    readonly provider = "test-fixture";
    verifyAndNormalize(rawBody: Buffer, signature: string | undefined): NormalizedPaymentEvent;
}
export declare function signTestFixturePayload(rawBody: Buffer, secret: string): string;
//# sourceMappingURL=paymentProvider.d.ts.map