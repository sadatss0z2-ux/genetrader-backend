"use strict";
/**
 * Canary Cohort Management Service (P6-01)
 *
 * Implements small-account canary cohort validation, enrollment, and order restrictions
 * for staged release and live canary review.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.canaryService = void 0;
const environment_1 = require("../config/environment");
const MAX_CANARY_COHORT_SIZE = 10;
class CanaryService {
    members = new Map();
    constructor() {
        this.hydrateFromEnv();
    }
    /**
     * Hydrates initial allowed canary users from CANARY_ALLOWED_USER_IDS env var.
     */
    hydrateFromEnv() {
        const rawIds = process.env.CANARY_ALLOWED_USER_IDS || '';
        if (!rawIds.trim())
            return;
        const ids = rawIds
            .split(',')
            .map((s) => parseInt(s.trim(), 10))
            .filter((id) => !isNaN(id) && id > 0);
        for (const userId of ids) {
            if (!this.members.has(userId)) {
                this.members.set(userId, {
                    userId,
                    email: `canary-user-${userId}@internal.genetrader`,
                    enrolledAt: new Date(),
                    enrolledBy: 'OPERATOR_ENV_CONFIG',
                    maxNotionalUsd: environment_1.DEFAULT_CANARY_MAX_NOTIONAL_USD,
                    active: true,
                    notes: 'Pre-configured via CANARY_ALLOWED_USER_IDS',
                });
            }
        }
    }
    /**
     * Checks whether a user is an active member of the canary cohort.
     */
    isUserInCanaryCohort(userId) {
        const envConfig = (0, environment_1.getEnvironmentConfig)();
        if (!envConfig.canaryCohortEnabled) {
            return false;
        }
        const member = this.members.get(userId);
        return !!member && member.active;
    }
    /**
     * Enrolls a user into the canary cohort.
     */
    enrollCanaryUser(params) {
        if (this.members.size >= MAX_CANARY_COHORT_SIZE) {
            throw new Error(`Canary cohort limit reached (max ${MAX_CANARY_COHORT_SIZE} accounts). Cannot enroll user ${params.userId}.`);
        }
        const envConfig = (0, environment_1.getEnvironmentConfig)();
        const maxNotionalUsd = params.maxNotionalUsd ?? envConfig.maxCanaryOrderNotionalUsd;
        const member = {
            userId: params.userId,
            email: params.email,
            enrolledAt: new Date(),
            enrolledBy: params.enrolledBy,
            maxNotionalUsd,
            active: true,
            notes: params.notes,
        };
        this.members.set(params.userId, member);
        return member;
    }
    /**
     * Deactivates or removes a user from the canary cohort.
     */
    removeCanaryUser(userId, removedBy) {
        const member = this.members.get(userId);
        if (!member)
            return false;
        member.active = false;
        member.notes = `Deactivated by ${removedBy} at ${new Date().toISOString()}`;
        return true;
    }
    /**
     * Validates whether a proposed order complies with canary cohort constraints.
     */
    validateCanaryOrder(userId, notionalUsd) {
        const envConfig = (0, environment_1.getEnvironmentConfig)();
        // If canary is disabled, orders are evaluated by standard risk gate
        if (!envConfig.canaryCohortEnabled) {
            return { allowed: true };
        }
        // User must be an active canary member
        const member = this.members.get(userId);
        if (!member || !member.active) {
            return {
                allowed: false,
                reason: 'User is not enrolled in the active live canary cohort.',
            };
        }
        const maxAllowed = Math.min(member.maxNotionalUsd, envConfig.maxCanaryOrderNotionalUsd);
        if (notionalUsd > maxAllowed) {
            return {
                allowed: false,
                reason: `Order notional $${notionalUsd.toFixed(2)} exceeds canary maximum allowed notional of $${maxAllowed.toFixed(2)}.`,
                maxAllowedNotional: maxAllowed,
            };
        }
        return {
            allowed: true,
            maxAllowedNotional: maxAllowed,
        };
    }
    /**
     * Retrieves overall status summary of the canary cohort.
     */
    getCanaryStatus() {
        const envConfig = (0, environment_1.getEnvironmentConfig)();
        const activeMembers = Array.from(this.members.values());
        return {
            enabled: envConfig.canaryCohortEnabled,
            maxCohortSize: MAX_CANARY_COHORT_SIZE,
            currentEnrolledCount: activeMembers.filter((m) => m.active).length,
            maxNotionalLimitUsd: envConfig.maxCanaryOrderNotionalUsd,
            members: activeMembers.map((m) => ({
                userId: m.userId,
                email: m.email,
                enrolledAt: m.enrolledAt.toISOString(),
                maxNotionalUsd: m.maxNotionalUsd,
                active: m.active,
            })),
        };
    }
    /**
     * Resets registry for testing purposes.
     */
    reset() {
        this.members.clear();
        this.hydrateFromEnv();
    }
}
exports.canaryService = new CanaryService();
//# sourceMappingURL=canaryService.js.map