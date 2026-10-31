import promClient from 'prom-client';
export declare const metrics: {
    httpRequestsTotal: promClient.Counter<"route" | "method" | "status_code">;
    httpRequestDuration: promClient.Histogram<"route" | "method">;
    httpResponseSize: promClient.Histogram<"route">;
    dbQueryDuration: promClient.Histogram<"operation" | "table">;
    dbQueriesTotal: promClient.Counter<"status" | "operation" | "table">;
    errorTotal: promClient.Counter<"route" | "type">;
};
export { register } from 'prom-client';
//# sourceMappingURL=metrics.d.ts.map