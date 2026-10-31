"use strict";
/**
 * Uncertainty Service (P5-04)
 * Uncertainty incident detection and fail-closed behavior.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.UncertaintyService = void 0;
const events_1 = require("events");
const crypto_1 = require("crypto");
class UncertaintyService extends events_1.EventEmitter {
    config;
    incidents = new Map();
    circuitBreakers = new Map();
    healthChecks = new Map();
    constructor(options = {}) {
        super();
        this.config = options.config || this.getDefaultConfig();
        this.initializeCircuitBreakers();
    }
    /**
     * Get default fail-closed configuration
     */
    getDefaultConfig() {
        return {
            staleDataThresholdMs: 30000, // 30 seconds
            kmsTimeoutMs: 5000,
            exchangeTimeoutMs: 10000,
            queueTimeoutMs: 5000,
            databaseTimeoutMs: 10000,
            circuitBreakerThreshold: 5,
            circuitBreakerHalfOpenTimeoutMs: 60000, // 1 minute
            enableChaosTesting: false,
        };
    }
    /**
     * Initialize circuit breakers for all dependencies
     */
    initializeCircuitBreakers() {
        const dependencies = ['KMS', 'EXCHANGE', 'QUEUE', 'DATABASE'];
        for (const dependency of dependencies) {
            const breaker = {
                id: (0, crypto_1.randomUUID)(),
                dependency,
                state: 'CLOSED',
                failureCount: 0,
                failureThreshold: this.config.circuitBreakerThreshold,
                lastFailureAt: null,
                nextAttemptAt: null,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            this.circuitBreakers.set(dependency, breaker);
        }
    }
    /**
     * Detect stale data incident
     */
    detectStaleData(source, dataAgeMs, context) {
        if (dataAgeMs > this.config.staleDataThresholdMs) {
            return this.createIncident('STALE_DATA', 'HIGH', source, `Data is stale: ${dataAgeMs}ms old (threshold: ${this.config.staleDataThresholdMs}ms)`, context);
        }
        return null;
    }
    /**
     * Detect KMS failure
     */
    detectKMSFailure(error, context) {
        return this.createIncident('KMS_FAILURE', 'CRITICAL', 'KMS', `KMS failure: ${error.message}`, context);
    }
    /**
     * Detect exchange failure
     */
    detectExchangeFailure(error, context) {
        return this.createIncident('EXCHANGE_FAILURE', 'HIGH', 'EXCHANGE', `Exchange failure: ${error.message}`, context);
    }
    /**
     * Detect queue failure
     */
    detectQueueFailure(error, context) {
        return this.createIncident('QUEUE_FAILURE', 'MEDIUM', 'QUEUE', `Queue failure: ${error.message}`, context);
    }
    /**
     * Detect database failure
     */
    detectDatabaseFailure(error, context) {
        return this.createIncident('DATABASE_FAILURE', 'HIGH', 'DATABASE', `Database failure: ${error.message}`, context);
    }
    /**
     * Detect network failure
     */
    detectNetworkFailure(error, context) {
        return this.createIncident('NETWORK_FAILURE', 'MEDIUM', 'NETWORK', `Network failure: ${error.message}`, context);
    }
    /**
     * Create an incident record
     */
    createIncident(type, severity, source, message, context) {
        const incident = {
            id: (0, crypto_1.randomUUID)(),
            type,
            severity,
            status: 'OPEN',
            source,
            message,
            context,
            detectedAt: Date.now(),
            resolvedAt: null,
            resolution: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        this.incidents.set(incident.id, incident);
        this.emit('incidentDetected', incident);
        return incident;
    }
    /**
     * Resolve an incident
     */
    resolveIncident(incidentId, resolution) {
        const incident = this.incidents.get(incidentId);
        if (!incident) {
            throw new Error(`Incident not found: ${incidentId}`);
        }
        const updatedIncident = {
            ...incident,
            status: 'RESOLVED',
            resolvedAt: Date.now(),
            resolution,
            updatedAt: Date.now(),
        };
        this.incidents.set(incidentId, updatedIncident);
        this.emit('incidentResolved', updatedIncident);
        return updatedIncident;
    }
    /**
     * Record circuit breaker failure
     */
    recordCircuitBreakerFailure(dependency) {
        const breaker = this.circuitBreakers.get(dependency);
        if (!breaker) {
            throw new Error(`Circuit breaker not found for dependency: ${dependency}`);
        }
        const updatedBreaker = {
            ...breaker,
            failureCount: breaker.failureCount + 1,
            lastFailureAt: Date.now(),
            state: 'OPEN',
            nextAttemptAt: Date.now() + this.config.circuitBreakerHalfOpenTimeoutMs,
            updatedAt: Date.now(),
        };
        this.circuitBreakers.set(dependency, updatedBreaker);
        this.emit('circuitBreakerTripped', updatedBreaker);
        return updatedBreaker;
    }
    /**
     * Attempt circuit breaker recovery
     */
    attemptCircuitBreakerRecovery(dependency) {
        const breaker = this.circuitBreakers.get(dependency);
        if (!breaker) {
            throw new Error(`Circuit breaker not found for dependency: ${dependency}`);
        }
        if (breaker.state === 'OPEN' && Date.now() < breaker.nextAttemptAt) {
            // Still in cooldown
            return breaker;
        }
        // Transition to HALF_OPEN to test recovery
        const updatedBreaker = {
            ...breaker,
            state: 'HALF_OPEN',
            updatedAt: Date.now(),
        };
        this.circuitBreakers.set(dependency, updatedBreaker);
        this.emit('circuitBreakerHalfOpen', updatedBreaker);
        return updatedBreaker;
    }
    /**
     * Confirm circuit breaker recovery
     */
    confirmCircuitBreakerRecovery(dependency) {
        const breaker = this.circuitBreakers.get(dependency);
        if (!breaker) {
            throw new Error(`Circuit breaker not found for dependency: ${dependency}`);
        }
        const updatedBreaker = {
            ...breaker,
            state: 'CLOSED',
            failureCount: 0,
            lastFailureAt: null,
            nextAttemptAt: null,
            updatedAt: Date.now(),
        };
        this.circuitBreakers.set(dependency, updatedBreaker);
        this.emit('circuitBreakerClosed', updatedBreaker);
        return updatedBreaker;
    }
    /**
     * Perform health check on dependency
     */
    async performHealthCheck(dependency) {
        const startTime = Date.now();
        // Placeholder: would perform actual health check
        // For now, assume healthy
        const healthy = true;
        const latency = Date.now() - startTime;
        const message = healthy ? 'Health check passed' : 'Health check failed';
        const result = {
            dependency,
            healthy,
            latency,
            message,
            checkedAt: Date.now(),
        };
        this.healthChecks.set(dependency, result);
        this.emit('healthCheckCompleted', result);
        // If unhealthy, record circuit breaker failure
        if (!healthy) {
            this.recordCircuitBreakerFailure(dependency);
        }
        else {
            // If circuit breaker is not closed, attempt recovery
            const breaker = this.circuitBreakers.get(dependency);
            if (breaker && breaker.state !== 'CLOSED') {
                this.confirmCircuitBreakerRecovery(dependency);
            }
        }
        return result;
    }
    /**
     * Check if dependency is available (fail-closed check)
     */
    isDependencyAvailable(dependency) {
        const breaker = this.circuitBreakers.get(dependency);
        if (!breaker) {
            return true; // No circuit breaker, assume available
        }
        if (breaker.state === 'OPEN') {
            return false; // Circuit breaker is open, dependency unavailable
        }
        if (breaker.state === 'HALF_OPEN') {
            // In half-open state, allow single request to test recovery
            return true;
        }
        return true; // Circuit breaker is closed, dependency available
    }
    /**
     * Get circuit breaker state
     */
    getCircuitBreakerState(dependency) {
        const breaker = this.circuitBreakers.get(dependency);
        return breaker ? breaker.state : null;
    }
    /**
     * Get circuit breaker record (for testing)
     */
    getCircuitBreakerRecord(dependency) {
        return this.circuitBreakers.get(dependency) || null;
    }
    /**
     * Set circuit breaker record (for testing)
     */
    setCircuitBreakerRecord(dependency, breaker) {
        this.circuitBreakers.set(dependency, breaker);
    }
    /**
     * Get open incidents
     */
    getOpenIncidents() {
        return Array.from(this.incidents.values()).filter((i) => i.status === 'OPEN');
    }
    /**
     * Get incidents by type
     */
    getIncidentsByType(type) {
        return Array.from(this.incidents.values()).filter((i) => i.type === type);
    }
    /**
     * Get incidents by severity
     */
    getIncidentsBySeverity(severity) {
        return Array.from(this.incidents.values()).filter((i) => i.severity === severity);
    }
    /**
     * Get all health check results
     */
    getAllHealthChecks() {
        return Array.from(this.healthChecks.values());
    }
    /**
     * Reset all in-memory state (useful for test isolation)
     */
    reset() {
        this.incidents.clear();
        this.circuitBreakers.clear();
        this.healthChecks.clear();
        this.initializeCircuitBreakers();
    }
}
exports.UncertaintyService = UncertaintyService;
//# sourceMappingURL=uncertaintyService.js.map