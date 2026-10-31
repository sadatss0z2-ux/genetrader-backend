"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resource = exports.provider = void 0;
const sdk_trace_node_1 = require("@opentelemetry/sdk-trace-node");
const sdk_trace_base_1 = require("@opentelemetry/sdk-trace-base");
const exporter_trace_otlp_http_1 = require("@opentelemetry/exporter-trace-otlp-http");
const resources_1 = require("@opentelemetry/resources");
const semantic_conventions_1 = require("@opentelemetry/semantic-conventions");
const instrumentation_http_1 = require("@opentelemetry/instrumentation-http");
const instrumentation_express_1 = require("@opentelemetry/instrumentation-express");
const instrumentation_pg_1 = require("@opentelemetry/instrumentation-pg");
const sdk_trace_base_2 = require("@opentelemetry/sdk-trace-base");
const isProduction = process.env.NODE_ENV === 'production';
const resource = (0, resources_1.resourceFromAttributes)({
    [semantic_conventions_1.ATTR_SERVICE_NAME]: 'geneTrader-backend',
    [semantic_conventions_1.ATTR_SERVICE_VERSION]: '1.0.0',
    'deployment.environment': process.env.NODE_ENV || 'development',
});
exports.resource = resource;
// Create tracer provider
const provider = new sdk_trace_node_1.NodeTracerProvider({
    resource,
    // Sample 10% of traces in production, 100% in development
    sampler: isProduction ? new sdk_trace_base_2.TraceIdRatioBasedSampler(0.1) : new sdk_trace_base_2.AlwaysOnSampler(),
    spanProcessors: [new sdk_trace_base_1.SimpleSpanProcessor(new exporter_trace_otlp_http_1.OTLPTraceExporter({
            url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
                ?? process.env.JAEGER_OTLP_ENDPOINT
                ?? 'http://localhost:4318/v1/traces',
        }))],
});
exports.provider = provider;
// Configure OTLP/HTTP for Jaeger ≥1.35, Grafana Tempo, or another OTLP backend.
// Register the provider
provider.register();
// Enable instrumentation
const httpInstrumentation = new instrumentation_http_1.HttpInstrumentation();
httpInstrumentation.enable();
const expressInstrumentation = new instrumentation_express_1.ExpressInstrumentation();
expressInstrumentation.enable();
const pgInstrumentation = new instrumentation_pg_1.PgInstrumentation();
pgInstrumentation.enable();
//# sourceMappingURL=tracing.js.map