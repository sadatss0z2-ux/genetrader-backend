"use strict";
/**
 * Fail-Closed Middleware (P5-04)
 * Fail-closed behavior for stale data, KMS, exchange, and queue failures.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.failClosedMiddleware = failClosedMiddleware;
exports.failClosedForTrading = failClosedForTrading;
exports.failClosedForMarketData = failClosedForMarketData;
exports.failClosedForEntitlement = failClosedForEntitlement;
/**
 * Fail-closed middleware - check if dependencies are available before processing request
 */
function failClosedMiddleware(options) {
    const { uncertaintyService, requireKMS = false, requireExchange = false, requireQueue = false, requireDatabase = false, } = options;
    return (req, res, next) => {
        // Check KMS availability if required
        if (requireKMS && !uncertaintyService.isDependencyAvailable('KMS')) {
            return res.status(503).json({
                error: 'Service Unavailable',
                message: 'KMS dependency is unavailable',
                circuitBreakerState: uncertaintyService.getCircuitBreakerState('KMS'),
            });
        }
        // Check exchange availability if required
        if (requireExchange && !uncertaintyService.isDependencyAvailable('EXCHANGE')) {
            return res.status(503).json({
                error: 'Service Unavailable',
                message: 'Exchange dependency is unavailable',
                circuitBreakerState: uncertaintyService.getCircuitBreakerState('EXCHANGE'),
            });
        }
        // Check queue availability if required
        if (requireQueue && !uncertaintyService.isDependencyAvailable('QUEUE')) {
            return res.status(503).json({
                error: 'Service Unavailable',
                message: 'Queue dependency is unavailable',
                circuitBreakerState: uncertaintyService.getCircuitBreakerState('QUEUE'),
            });
        }
        // Check database availability if required
        if (requireDatabase && !uncertaintyService.isDependencyAvailable('DATABASE')) {
            return res.status(503).json({
                error: 'Service Unavailable',
                message: 'Database dependency is unavailable',
                circuitBreakerState: uncertaintyService.getCircuitBreakerState('DATABASE'),
            });
        }
        // All dependencies available, proceed
        next();
    };
}
/**
 * Fail-closed for trading routes - requires all dependencies
 */
function failClosedForTrading(uncertaintyService) {
    return failClosedMiddleware({
        uncertaintyService,
        requireKMS: true,
        requireExchange: true,
        requireQueue: true,
        requireDatabase: true,
    });
}
/**
 * Fail-closed for market data routes - requires exchange only
 */
function failClosedForMarketData(uncertaintyService) {
    return failClosedMiddleware({
        uncertaintyService,
        requireExchange: true,
    });
}
/**
 * Fail-closed for entitlement routes - requires database only
 */
function failClosedForEntitlement(uncertaintyService) {
    return failClosedMiddleware({
        uncertaintyService,
        requireDatabase: true,
    });
}
//# sourceMappingURL=failClosed.js.map