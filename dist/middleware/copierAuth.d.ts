import { Request, Response, NextFunction } from 'express';
export interface CopierRequest extends Request {
    copierInstanceId?: string;
}
/** Per-instance machine auth. Missing configuration, token or instance always denies. */
export declare function requireCopierInstance(req: CopierRequest, res: Response, next: NextFunction): Promise<void>;
export declare function requireMatchingCopierInstance(req: CopierRequest, value: unknown, res: Response): boolean;
//# sourceMappingURL=copierAuth.d.ts.map