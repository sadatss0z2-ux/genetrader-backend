import { Response, NextFunction } from 'express';
import type { RequestWithId } from './requestId';
export interface AuditEvent {
    event_type: string;
    user_id: number | null;
    request_id: string;
    ip_address: string | null;
    user_agent: string | null;
    metadata: unknown;
}
export declare function auditMiddleware(req: RequestWithId, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=audit.d.ts.map