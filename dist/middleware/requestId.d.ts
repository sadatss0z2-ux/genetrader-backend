import { Request, Response, NextFunction } from 'express';
export interface RequestWithId extends Request {
    request_id: string;
}
export declare function requestIdMiddleware(req: RequestWithId, res: Response, next: NextFunction): void;
//# sourceMappingURL=requestId.d.ts.map