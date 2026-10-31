/**
 * Orders Route (P5-03)
 * Exposes P5-01 OrderService and P5-02 PositionService via REST endpoints.
 * Covers: order submission, cancel, list, position list, close-position, flatten.
 */
import { OrderService } from '../services/orderService';
import { PositionService } from '../services/positionService';
declare const router: import("express-serve-static-core").Router;
export declare const orderService: OrderService;
export declare const positionService: PositionService;
export default router;
//# sourceMappingURL=orders.d.ts.map