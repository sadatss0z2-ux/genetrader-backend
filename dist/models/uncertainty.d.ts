/**
 * Uncertainty Incident Models (P5-04)
 * Uncertainty incident detection and fail-closed behavior.
 */
/**
 * Incident type - type of uncertainty incident
 */
export type IncidentType = 'STALE_DATA' | 'KMS_FAILURE' | 'EXCHANGE_FAILURE' | 'QUEUE_FAILURE' | 'DATABASE_FAILURE' | 'NETWORK_FAILURE';
/**
 * Incident severity - severity level of incident
 */
export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
/**
 * Incident status - status of incident
 */
export type IncidentStatus = 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'CLOSED';
/**
 * Incident record - record of an uncertainty incident
 */
export interface IncidentRecord {
    id: string;
    type: IncidentType;
    severity: IncidentSeverity;
    status: IncidentStatus;
    source: string;
    message: string;
    context: Record<string, unknown>;
    detectedAt: number;
    resolvedAt: number | null;
    resolution: string | null;
    createdAt: number;
    updatedAt: number;
}
/**
 * Circuit breaker state - state of circuit breaker
 */
export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
/**
 * Circuit breaker record - record of circuit breaker state
 */
export interface CircuitBreakerRecord {
    id: string;
    dependency: string;
    state: CircuitBreakerState;
    failureCount: number;
    failureThreshold: number;
    lastFailureAt: number | null;
    nextAttemptAt: number | null;
    createdAt: number;
    updatedAt: number;
}
/**
 * Health check result - result of health check
 */
export interface HealthCheckResult {
    dependency: string;
    healthy: boolean;
    latency: number;
    message: string;
    checkedAt: number;
}
/**
 * Fail-closed configuration - configuration for fail-closed behavior
 */
export interface FailClosedConfig {
    staleDataThresholdMs: number;
    kmsTimeoutMs: number;
    exchangeTimeoutMs: number;
    queueTimeoutMs: number;
    databaseTimeoutMs: number;
    circuitBreakerThreshold: number;
    circuitBreakerHalfOpenTimeoutMs: number;
    enableChaosTesting: boolean;
}
//# sourceMappingURL=uncertainty.d.ts.map