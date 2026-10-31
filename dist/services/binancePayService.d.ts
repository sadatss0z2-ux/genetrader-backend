type CheckoutStatus = 'CREATING' | 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'REVIEW_REQUIRED';
export interface CheckoutSession {
    id: string;
    plan_key: string;
    amount: string;
    currency: string;
    status: CheckoutStatus;
    checkout_url: string | null;
    expires_at: Date;
    created_at: Date;
}
export declare function createCheckoutSession(userId: number, planKey: string, terminalType: 'APP' | 'WEB' | 'WAP'): Promise<CheckoutSession>;
export declare function listCheckoutSessions(userId: number): Promise<CheckoutSession[]>;
export {};
//# sourceMappingURL=binancePayService.d.ts.map