import { Response, NextFunction } from 'express';
import type { RequestWithId } from './requestId';
export interface AppError extends Error {
    statusCode?: number;
    code?: string;
    details?: unknown;
}
export declare function errorHandler(err: AppError, req: RequestWithId, res: Response, _next: NextFunction): void;
export declare function notFound(req: RequestWithId, res: Response): void;
/** Convenience: create an AppError with a status code. */
export declare function createError(message: string, statusCode: number, code?: string): AppError;
//# sourceMappingURL=errorHandler.d.ts.map