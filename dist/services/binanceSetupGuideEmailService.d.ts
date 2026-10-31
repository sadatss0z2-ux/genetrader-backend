export declare function resetSendCooldownForTesting(): void;
export interface BinanceIpGuideTemplateData {
    accountRef: string;
    recipientEmail: string;
    displayName?: string | null;
    egressIp: string;
    ipCheckedAt: Date;
    currentErrorCode?: string | null;
    currentErrorMessage?: string | null;
}
export interface BinanceIpGuideTemplateResult {
    subject: string;
    html: string;
    text: string;
}
export declare function binanceIpGuideEmailTemplate(data: BinanceIpGuideTemplateData): BinanceIpGuideTemplateResult;
export interface SendBinanceIpGuideInput {
    masterUserId: number;
    accountRef: string;
    egressIp: string;
    ipCheckedAt: Date;
}
export interface SendBinanceIpGuideResult {
    sent: true;
    messageId: string;
    recipientEmail: string;
    accountRef: string;
    egressIp: string;
    ipCheckedAt: string;
}
/**
 * Validates the operator-managed account, rate limits, sends the setup guide via Resend,
 * and records an entitlement audit event without sensitive credentials.
 */
export declare function sendBinanceIpGuideEmail(input: SendBinanceIpGuideInput): Promise<SendBinanceIpGuideResult>;
//# sourceMappingURL=binanceSetupGuideEmailService.d.ts.map