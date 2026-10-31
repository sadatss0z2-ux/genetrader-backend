/**
 * Fail-Closed Middleware (P5-04)
 * Fail-closed behavior for stale data, KMS, exchange, and queue failures.
 */
import { Request, Response, NextFunction } from 'express';
import { UncertaintyService } from '../services/uncertaintyService';
export interface FailClosedMiddlewareOptions {
    uncertaintyService: UncertaintyService;
    requireKMS?: boolean;
    requireExchange?: boolean;
    requireQueue?: boolean;
    requireDatabase?: boolean;
}
/**
 * Fail-closed middleware - check if dependencies are available before processing request
 */
export declare function failClosedMiddleware(options: FailClosedMiddlewareOptions): (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
/**
 * Fail-closed for trading routes - requires all dependencies
 */
export declare function failClosedForTrading(uncertaintyService: UncertaintyService): (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
/**
 * Fail-closed for market data routes - requires exchange only
 */
export declare function failClosedForMarketData(uncertaintyService: UncertaintyService): (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
/**
 * Fail-closed for entitlement routes - requires database only
 */
export declare function failClosedForEntitlement(uncertaintyService: UncertaintyService): (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
//# sourceMappingURL=failClosed.d.ts.map