import { NormalizedPaymentEvent } from './paymentProvider';
/** Applies only provider-verified events. No checkout/client path calls this service. */
export declare function applyProviderEvent(event: NormalizedPaymentEvent): Promise<{
    disposition: string;
    duplicate: boolean;
}>;
//# sourceMappingURL=billingService.d.ts.map