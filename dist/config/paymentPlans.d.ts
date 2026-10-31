export type PaymentPlanKey = 'monthly' | 'yearly';
export interface PaymentPlan {
    key: PaymentPlanKey;
    label: string;
    price: number;
    currency: 'USDT';
    duration: 'month' | 'year';
    paymentUrl: string;
}
export declare const PAYMENT_PLANS: readonly PaymentPlan[];
export declare function getPaymentPlan(key: string): PaymentPlan | undefined;
export declare function addPaymentPlanDuration(from: Date, plan: PaymentPlan): Date;
//# sourceMappingURL=paymentPlans.d.ts.map