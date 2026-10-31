export declare const DEFAULT_EGRESS_IP_MAX_AGE_MS: number;
export declare const DEFAULT_EGRESS_IP_STALE_TOLERANCE_MS: number;
export type EgressIpStatus = 'VERIFIED' | 'STALE' | 'UNAVAILABLE';
export interface EgressIpResult {
    ip: string | null;
    checkedAt: Date | null;
    status: EgressIpStatus;
    stale: boolean;
    ageSeconds: number | null;
    error?: string;
}
export declare function setCustomEgressIpFetcherForTesting(fetcher: (() => Promise<string>) | null): void;
export declare function resetEgressIpCacheForTesting(): void;
export declare function isValidIpv4(value: unknown): value is string;
/**
 * Resolves the public egress IP of the PC running the service.
 * Verifies the result format and manages in-memory caching and staleness.
 */
export declare function getVerifiedEgressIp(options?: {
    forceFresh?: boolean;
    maxAgeMs?: number;
    staleToleranceMs?: number;
}): Promise<EgressIpResult>;
//# sourceMappingURL=egressIpService.d.ts.map