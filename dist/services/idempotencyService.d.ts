import type postgres from 'postgres';
type Tx = postgres.TransactionSql;
export declare const IDEMPOTENCY_KEY_PATTERN: RegExp;
export declare const IDEMPOTENCY_RETENTION_DAYS = 30;
export declare const ENDPOINT_OBSERVER_ACCESS = "POST /v1/observer-access-requests";
export declare const ENDPOINT_PUBLIC_ACCESS = "POST /v1/access-requests";
export declare function assertValidIdempotencyKey(raw: unknown): string;
export declare function hashObserverRequest(consentVersion: string): string;
export declare function hashPublicAccessRequest(email: string, consentVersion: string): string;
export interface StoredIdempotentResponse {
    httpStatus: number;
    body: Record<string, unknown>;
}
export declare function requireStoredString(body: Record<string, unknown>, field: string): string;
export declare function loadIdempotentReplay(tx: Tx, input: {
    endpoint: string;
    scopeRef: string;
    idempotencyKey: string;
    requestHash: string;
}): Promise<StoredIdempotentResponse | null>;
export declare function persistIdempotentResponse(tx: Tx, input: {
    id: string;
    endpoint: string;
    scopeRef: string;
    idempotencyKey: string;
    requestHash: string;
    httpStatus: number;
    body: Record<string, unknown>;
}): Promise<void>;
export {};
//# sourceMappingURL=idempotencyService.d.ts.map