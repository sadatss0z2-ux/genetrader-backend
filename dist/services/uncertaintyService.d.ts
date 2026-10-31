/**
 * Uncertainty Service (P5-04)
 * Uncertainty incident detection and fail-closed behavior.
 */
import { EventEmitter } from 'events';
import { IncidentRecord, IncidentType, IncidentSeverity, CircuitBreakerRecord, CircuitBreakerState, HealthCheckResult, FailClosedConfig } from '../models/uncertainty';
export interface UncertaintyServiceOptions {
    config?: FailClosedConfig;
}
export declare class UncertaintyService extends EventEmitter {
    private config;
    private incidents;
    private circuitBreakers;
    private healthChecks;
    constructor(options?: UncertaintyServiceOptions);
    /**
     * Get default fail-closed configuration
     */
    private getDefaultConfig;
    /**
     * Initialize circuit breakers for all dependencies
     */
    private initializeCircuitBreakers;
    /**
     * Detect stale data incident
     */
    detectStaleData(source: string, dataAgeMs: number, context: Record<string, unknown>): IncidentRecord | null;
    /**
     * Detect KMS failure
     */
    detectKMSFailure(error: Error, context: Record<string, unknown>): IncidentRecord;
    /**
     * Detect exchange failure
     */
    detectExchangeFailure(error: Error, context: Record<string, unknown>): IncidentRecord;
    /**
     * Detect queue failure
     */
    detectQueueFailure(error: Error, context: Record<string, unknown>): IncidentRecord;
    /**
     * Detect database failure
     */
    detectDatabaseFailure(error: Error, context: Record<string, unknown>): IncidentRecord;
    /**
     * Detect network failure
     */
    detectNetworkFailure(error: Error, context: Record<string, unknown>): IncidentRecord;
    /**
     * Create an incident record
     */
    private createIncident;
    /**
     * Resolve an incident
     */
    resolveIncident(incidentId: string, resolution: string): IncidentRecord;
    /**
     * Record circuit breaker failure
     */
    recordCircuitBreakerFailure(dependency: string): CircuitBreakerRecord;
    /**
     * Attempt circuit breaker recovery
     */
    attemptCircuitBreakerRecovery(dependency: string): CircuitBreakerRecord;
    /**
     * Confirm circuit breaker recovery
     */
    confirmCircuitBreakerRecovery(dependency: string): CircuitBreakerRecord;
    /**
     * Perform health check on dependency
     */
    performHealthCheck(dependency: string): Promise<HealthCheckResult>;
    /**
     * Check if dependency is available (fail-closed check)
     */
    isDependencyAvailable(dependency: string): boolean;
    /**
     * Get circuit breaker state
     */
    getCircuitBreakerState(dependency: string): CircuitBreakerState | null;
    /**
     * Get circuit breaker record (for testing)
     */
    getCircuitBreakerRecord(dependency: string): CircuitBreakerRecord | null;
    /**
     * Set circuit breaker record (for testing)
     */
    setCircuitBreakerRecord(dependency: string, breaker: CircuitBreakerRecord): void;
    /**
     * Get open incidents
     */
    getOpenIncidents(): IncidentRecord[];
    /**
     * Get incidents by type
     */
    getIncidentsByType(type: IncidentType): IncidentRecord[];
    /**
     * Get incidents by severity
     */
    getIncidentsBySeverity(severity: IncidentSeverity): IncidentRecord[];
    /**
     * Get all health check results
     */
    getAllHealthChecks(): HealthCheckResult[];
    /**
     * Reset all in-memory state (useful for test isolation)
     */
    reset(): void;
}
//# sourceMappingURL=uncertaintyService.d.ts.map