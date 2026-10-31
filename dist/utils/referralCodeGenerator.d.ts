/**
 * Generate a unique referral code guaranteed not to collide with existing codes.
 * Tries up to 10 times before throwing (astronomically unlikely to need more).
 */
export declare function generateUniqueReferralCode(isTaken?: (code: string) => Promise<boolean>): Promise<string>;
//# sourceMappingURL=referralCodeGenerator.d.ts.map