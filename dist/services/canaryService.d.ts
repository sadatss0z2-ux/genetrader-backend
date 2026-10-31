/**
 * Canary Cohort Management Service (P6-01)
 *
 * Implements small-account canary cohort validation, enrollment, and order restrictions
 * for staged release and live canary review.
 */
export interface CanaryCohortMember {
    userId: number;
    email: string;
    enrolledAt: Date;
    enrolledBy: string;
    maxNotionalUsd: number;
    active: boolean;
    notes?: string;
}
export interface CanaryValidationResult {
    allowed: boolean;
    reason?: string;
    maxAllowedNotional?: number;
}
export interface CanaryStatusSummary {
    enabled: boolean;
    maxCohortSize: number;
    currentEnrolledCount: number;
    maxNotionalLimitUsd: number;
    members: Array<{
        userId: number;
        email: string;
        enrolledAt: string;
        maxNotionalUsd: number;
        active: boolean;
    }>;
}
declare class CanaryService {
    private members;
    constructor();
    /**
     * Hydrates initial allowed canary users from CANARY_ALLOWED_USER_IDS env var.
     */
    hydrateFromEnv(): void;
    /**
     * Checks whether a user is an active member of the canary cohort.
     */
    isUserInCanaryCohort(userId: number): boolean;
    /**
     * Enrolls a user into the canary cohort.
     */
    enrollCanaryUser(params: {
        userId: number;
        email: string;
        enrolledBy: string;
        maxNotionalUsd?: number;
        notes?: string;
    }): CanaryCohortMember;
    /**
     * Deactivates or removes a user from the canary cohort.
     */
    removeCanaryUser(userId: number, removedBy: string): boolean;
    /**
     * Validates whether a proposed order complies with canary cohort constraints.
     */
    validateCanaryOrder(userId: number, notionalUsd: number): CanaryValidationResult;
    /**
     * Retrieves overall status summary of the canary cohort.
     */
    getCanaryStatus(): CanaryStatusSummary;
    /**
     * Resets registry for testing purposes.
     */
    reset(): void;
}
export declare const canaryService: CanaryService;
export {};
//# sourceMappingURL=canaryService.d.ts.map