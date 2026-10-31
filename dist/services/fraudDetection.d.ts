export interface FraudCheckInput {
    referrerId: number;
    refereeId: number;
    refereeIp: string;
    deviceId: string;
    referralCode: string;
}
export interface FraudResult {
    isFraud: boolean;
    reasons: string[];
}
/**
 * Run all fraud detection checks for a new referral.
 * Returns { isFraud, reasons } — caller decides whether to block or flag.
 */
export declare function checkReferralFraud(input: FraudCheckInput): Promise<FraudResult>;
/**
 * Mark an existing referral record as fraud.
 */
export declare function markReferralFraud(referrerId: number, refereeId: number): Promise<void>;
//# sourceMappingURL=fraudDetection.d.ts.map