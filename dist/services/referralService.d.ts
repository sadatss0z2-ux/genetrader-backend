import type postgres from 'postgres';
export declare const REFERRAL_POINTS_PER_QUALIFIED_REFERRAL = 100;
export declare const MONTHLY_SUBSCRIPTION_POINTS_COST = 1000;
type Tx = postgres.TransactionSql;
export interface ReferralStats {
    totalClicks: number;
    totalSignups: number;
    activeReferrals: number;
    pendingReferrals: number;
    fraudReferrals: number;
    pointsBalance: number;
    pointsEarned: number;
    pointsRedeemed: number;
    pointsPerReferral: number;
    monthlyPointsCost: number;
}
export interface ReferralFriend {
    id: number;
    displayName: string | null;
    email: string;
    plan: string;
    status: string;
    joinedAt: Date;
    activatedAt: Date | null;
    pointsAwarded: number;
    rewardStatus: 'pending' | 'earned' | 'ineligible';
}
export declare function validateReferralCode(code: string, requesterId?: number): Promise<{
    valid: boolean;
    referrerName: string | null;
}>;
export declare function trackClick(params: {
    code: string;
    ip: string;
    deviceId: string;
    userAgent: string;
}): Promise<void>;
export declare function activateReferral(referrerId: number, refereeId: number, ip: string, deviceId: string, referralCode: string): Promise<void>;
export declare function getReferralStats(userId: number): Promise<ReferralStats>;
export declare function getReferralFriends(userId: number): Promise<ReferralFriend[]>;
export declare function awardQualifiedReferralPoints(tx: Tx, refereeId: number): Promise<{
    referrerId: number;
    points: number;
} | null>;
export declare function redeemMonthlySubscriptionWithPoints(userId: number): Promise<{
    id: string;
    status: 'PENDING';
    pointsCost: number;
}>;
export {};
//# sourceMappingURL=referralService.d.ts.map