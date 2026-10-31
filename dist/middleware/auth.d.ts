import { Request, Response, NextFunction } from 'express';
export interface AuthPayload {
    userId: number;
    email: string;
    googleId: string;
}
export interface AuthRequest extends Request {
    user?: AuthPayload;
}
/** Observer/billing actions require a verified email or a stronger verified identity. */
export declare function requireVerifiedIdentity(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
export declare function requireMasterAccount(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
export declare function isMasterAccount(userId: number): Promise<boolean>;
export declare function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void;
export declare function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction): void;
//# sourceMappingURL=auth.d.ts.map