"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = exports.metrics = void 0;
const prom_client_1 = __importDefault(require("prom-client"));
// Collect default metrics (CPU, memory, etc.)
prom_client_1.default.collectDefaultMetrics();
// HTTP request counter
const httpRequestsTotal = new prom_client_1.default.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
});
// HTTP request duration histogram
const httpRequestDuration = new prom_client_1.default.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});
// HTTP response size histogram
const httpResponseSize = new prom_client_1.default.Histogram({
    name: 'http_response_size_bytes',
    help: 'HTTP response size in bytes',
    labelNames: ['route'],
    buckets: [100, 1000, 10000, 100000, 1000000],
});
// Database query duration histogram
const dbQueryDuration = new prom_client_1.default.Histogram({
    name: 'db_query_duration_seconds',
    help: 'Database query duration in seconds',
    labelNames: ['operation', 'table'],
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
});
// Database query counter
const dbQueriesTotal = new prom_client_1.default.Counter({
    name: 'db_queries_total',
    help: 'Total number of database queries',
    labelNames: ['operation', 'table', 'status'],
});
// Error counter
const errorTotal = new prom_client_1.default.Counter({
    name: 'errors_total',
    help: 'Total number of errors',
    labelNames: ['type', 'route'],
});
exports.metrics = {
    httpRequestsTotal,
    httpRequestDuration,
    httpResponseSize,
    dbQueryDuration,
    dbQueriesTotal,
    errorTotal,
};
var prom_client_2 = require("prom-client");
Object.defineProperty(exports, "register", { enumerable: true, get: function () { return prom_client_2.register; } });
//# sourceMappingURL=metrics.js.map