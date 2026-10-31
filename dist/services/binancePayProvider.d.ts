import { NormalizedPaymentEvent, PaymentProviderAdapter, ProviderSignatureHeaders } from './paymentProvider';
export interface BinancePayCheckoutRequest {
    merchantTradeNo: string;
    amount: string;
    planLabel: string;
    terminalType: 'APP' | 'WEB' | 'WAP';
    expiresAtMs: number;
}
export interface BinancePayCheckoutResponse {
    checkoutUrl: string;
    prepayId: string | null;
}
export declare function isBinancePayConfigured(): boolean;
export declare function createBinancePayCheckout(input: BinancePayCheckoutRequest): Promise<BinancePayCheckoutResponse>;
export declare class BinancePayPaymentProvider implements PaymentProviderAdapter {
    readonly provider = "binance-pay";
    verifyAndNormalize(rawBody: Buffer, signature: string | undefined, headers?: ProviderSignatureHeaders): NormalizedPaymentEvent;
}
//# sourceMappingURL=binancePayProvider.d.ts.map