"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeTrade = executeTrade;
exports.getUserPortfolio = getUserPortfolio;
exports.getUserTrades = getUserTrades;
exports.syncBalances = syncBalances;
exports.cancelOrder = cancelOrder;
exports.closePosition = closePosition;
exports.setStopTakeProfit = setStopTakeProfit;
exports.flattenAllPositions = flattenAllPositions;
const database_1 = __importDefault(require("../config/database"));
const binanceService_1 = require("./binanceService");
const crypto_1 = __importDefault(require("crypto"));
const errorHandler_1 = require("../middleware/errorHandler");
const entitlementPolicy_1 = require("./entitlementPolicy");
const tradingPolicyService_1 = require("./tradingPolicyService");
const notificationService_1 = require("./notificationService");
// Inline decrypt to avoid circular dependency with encryptionService.
// IMPORTANT: must fail closed when ENCRYPTION_KEY is absent — no silent fallback.
function decryptInline(encrypted, iv, authTag) {
    const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.trim() === '') {
        throw new Error('ENCRYPTION_KEY is not configured. The service cannot decrypt credentials without it.');
    }
    const ALGORITHM = 'aes-256-gcm';
    const decipher = crypto_1.default.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
// Execute trade and record in database
async function executeTrade(userId, symbol, side, type, quantity, price, stopPrice) {
    // Check if trading is allowed (observer mode, global halt, and symbol configuration)
    await (0, tradingPolicyService_1.verifyTradeAllowed)(userId, symbol);
    // Entitlement is checked in the database immediately before the exchange call.
    // This denies entries/DCA at the exact paid-through boundary and fails closed
    // when billing state or copier acknowledgement cannot be verified.
    const entitlement = await (0, database_1.default) `
    SELECT s.status, s.paid_through_at, m.desired_state, m.observed_state
    FROM subscriptions s JOIN copier_memberships m ON m.user_id = s.user_id
    JOIN copier_instances ci ON ci.instance_id = m.instance_id AND ci.enabled = TRUE
    JOIN users u ON u.id = s.user_id AND u.is_active = TRUE AND u.identity_verified_at IS NOT NULL
    WHERE s.user_id = ${userId}
    ORDER BY s.updated_at DESC LIMIT 1
  `;
    // Get observer mode from users table
    const user = await (0, database_1.default) `
    SELECT observer_mode FROM users WHERE id = ${userId}
  `;
    const observerMode = user[0]?.observer_mode !== false;
    if (!entitlement[0] || !(0, entitlementPolicy_1.canSubmitAppOrder)({
        observerMode,
        subscriptionStatus: entitlement[0].status,
        paidThroughAt: entitlement[0].paid_through_at,
        desiredCopierState: entitlement[0].desired_state,
        observedCopierState: entitlement[0].observed_state,
        now: new Date(),
    })) {
        throw (0, errorHandler_1.createError)('A confirmed active subscription and copier acknowledgement are required to submit orders.', 403);
    }
    // Place order on Binance
    let binanceOrder;
    if (type === 'MARKET') {
        binanceOrder = await (0, binanceService_1.placeMarketOrder)(symbol, side, quantity, userId);
    }
    else if (type === 'LIMIT') {
        binanceOrder = await (0, binanceService_1.placeLimitOrder)(symbol, side, quantity, price, userId);
    }
    else {
        binanceOrder = await (0, binanceService_1.placeStopLimitOrder)(symbol, side, quantity, price, stopPrice, userId);
    }
    // Record trade in database
    const persistedStopPrice = type === 'STOP_LIMIT' ? stopPrice ?? null : null;
    const result = await (0, database_1.default) `
    INSERT INTO trades (user_id, symbol, side, type, quantity, price, stop_price, status, binance_order_id, binance_client_order_id)
    VALUES (${userId}, ${symbol}, ${side}, ${type}, ${quantity}, ${binanceOrder.price}, ${persistedStopPrice}, ${binanceOrder.status}, ${binanceOrder.orderId}, ${binanceOrder.clientOrderId})
    RETURNING *
  `;
    if (binanceOrder.status === 'FILLED') {
        await updatePortfolio(userId, symbol, side, quantity, binanceOrder.price);
    }
    await (0, notificationService_1.notifyTradeExecuted)(userId, result[0]);
    return result[0];
}
// Update portfolio position
async function updatePortfolio(userId, symbol, side, quantity, price) {
    const existing = await (0, database_1.default) `
    SELECT * FROM portfolio WHERE user_id = ${userId} AND symbol = ${symbol}
  `;
    if (existing.length === 0) {
        // New position
        if (side === 'BUY') {
            await (0, database_1.default) `
        INSERT INTO portfolio (user_id, symbol, quantity, average_buy_price, current_price)
        VALUES (${userId}, ${symbol}, ${quantity}, ${price}, ${price})
      `;
        }
    }
    else {
        const position = existing[0];
        if (side === 'BUY') {
            // Average in new price
            const totalValue = (position.quantity * position.averageBuyPrice) + (quantity * price);
            const newQuantity = position.quantity + quantity;
            const newAvgPrice = totalValue / newQuantity;
            await (0, database_1.default) `
        UPDATE portfolio
        SET quantity = ${newQuantity},
            average_buy_price = ${newAvgPrice},
            current_price = ${price}
        WHERE user_id = ${userId} AND symbol = ${symbol}
      `;
        }
        else {
            // SELL - reduce position
            const newQuantity = position.quantity - quantity;
            const realizedPnl = (price - position.averageBuyPrice) * quantity;
            await (0, database_1.default) `
        UPDATE portfolio
        SET quantity = ${newQuantity},
            current_price = ${price},
            realized_pnl = realized_pnl + position.realizedPnl
        WHERE user_id = ${userId} AND symbol = ${symbol}
      `;
            // Remove position if quantity is zero
            if (newQuantity <= 0) {
                await (0, database_1.default) `DELETE FROM portfolio WHERE user_id = ${userId} AND symbol = ${symbol}`;
            }
        }
    }
}
// Get user portfolio
async function getUserPortfolio(userId) {
    const portfolio = await (0, database_1.default) `
    SELECT * FROM portfolio WHERE user_id = ${userId}
  `;
    // Update unrealized PNL based on current prices
    for (const position of portfolio) {
        try {
            const ticker = await (0, binanceService_1.getTicker)(position.symbol);
            const currentPrice = ticker.price;
            const unrealizedPnl = (currentPrice - position.averageBuyPrice) * position.quantity;
            await (0, database_1.default) `
        UPDATE portfolio
        SET current_price = ${currentPrice},
            unrealized_pnl = ${unrealizedPnl}
        WHERE id = ${position.id}
      `;
        }
        catch (err) {
            // If ticker fetch fails, continue with current price
            console.error(`Failed to fetch ticker for ${position.symbol}:`, err);
        }
    }
    // Return updated portfolio
    return await (0, database_1.default) `
    SELECT * FROM portfolio WHERE user_id = ${userId}
  `;
}
// Get user trades
async function getUserTrades(userId, limit = 50, offset = 0) {
    try {
        const count = await (0, database_1.default) `SELECT count(*) FROM trades WHERE user_id = ${userId}`;
        if (parseInt(count[0]?.count || '0', 10) === 0) {
            await (0, binanceService_1.syncUserTradesFromBinance)(userId, 'BTCUSDT');
        }
    }
    catch (err) {
        console.warn('[tradingService] Background sync of user trades failed:', err);
    }
    return await (0, database_1.default) `
    SELECT * FROM trades
    WHERE user_id = ${userId}
    ORDER BY timestamp DESC, id DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;
}
// Sync balances from Binance
async function syncBalances(userId) {
    const account = await (0, binanceService_1.getAccountInfo)(userId);
    for (const [asset, balance] of Object.entries(account.balances)) {
        if (parseFloat(balance.free) > 0 || parseFloat(balance.locked) > 0) {
            await (0, database_1.default) `
        INSERT INTO balances (user_id, asset, free_balance, locked_balance)
        VALUES (${userId}, ${asset}, ${balance.free}, ${balance.locked})
        ON CONFLICT (user_id, asset) DO UPDATE SET
          free_balance = EXCLUDED.free_balance,
          locked_balance = EXCLUDED.locked_balance,
          last_updated = NOW()
      `;
        }
    }
}
// Cancel order
async function cancelOrder(userId, tradeId) {
    // Get trade from database
    const trade = await (0, database_1.default) `
    SELECT
      id,
      user_id AS "userId",
      symbol,
      side,
      type,
      quantity,
      price,
      status,
      binance_order_id AS "binanceOrderId",
      timestamp
    FROM trades
    WHERE id = ${tradeId} AND user_id = ${userId}
  `;
    if (trade.length === 0) {
        throw (0, errorHandler_1.createError)('Trade not found', 404);
    }
    const tradeRecord = trade[0];
    // Only cancel if order is still open
    if (tradeRecord.status !== 'NEW' && tradeRecord.status !== 'PARTIALLY_FILLED') {
        throw (0, errorHandler_1.createError)('Order cannot be cancelled in current state', 400);
    }
    // Cancel on exchange if binanceOrderId exists
    if (tradeRecord.binanceOrderId) {
        try {
            await (0, binanceService_1.cancelOrder)(tradeRecord.symbol, tradeRecord.binanceOrderId, userId);
        }
        catch (err) {
            console.error('Failed to cancel order on exchange:', err);
            throw (0, errorHandler_1.createError)('Failed to cancel order on exchange', 500);
        }
    }
    // Update trade status in database
    const result = await (0, database_1.default) `
    UPDATE trades
    SET status = 'CANCELED'
    WHERE id = ${tradeId} AND user_id = ${userId}
    RETURNING *
  `;
    return result[0];
}
// Close position
async function closePosition(userId, symbol) {
    // Get position from portfolio
    const position = await (0, database_1.default) `
    SELECT * FROM portfolio WHERE user_id = ${userId} AND symbol = ${symbol}
  `;
    if (position.length === 0) {
        throw (0, errorHandler_1.createError)('Position not found', 404);
    }
    const positionRecord = position[0];
    // Check if trading is allowed
    await (0, tradingPolicyService_1.verifyTradeAllowed)(userId, symbol);
    // Place market sell order to close position
    const trade = await executeTrade(userId, symbol, 'SELL', 'MARKET', positionRecord.quantity);
    return trade;
}
// Set stop-loss and take-profit for a position
async function setStopTakeProfit(userId, symbol, stopLossPrice, takeProfitPrice) {
    // Get position from portfolio
    const position = await (0, database_1.default) `
    SELECT * FROM portfolio WHERE user_id = ${userId} AND symbol = ${symbol}
  `;
    if (position.length === 0) {
        throw (0, errorHandler_1.createError)('Position not found', 404);
    }
    // Store stop-loss and take-profit in database
    await (0, database_1.default) `
    INSERT INTO position_stops (user_id, symbol, stop_loss_price, take_profit_price)
    VALUES (${userId}, ${symbol}, ${stopLossPrice || null}, ${takeProfitPrice || null})
    ON CONFLICT (user_id, symbol) DO UPDATE SET
      stop_loss_price = EXCLUDED.stop_loss_price,
      take_profit_price = EXCLUDED.take_profit_price,
      updated_at = NOW()
  `;
}
// Flatten all positions (close all open positions)
async function flattenAllPositions(userId) {
    // Get all open positions
    const positions = await (0, database_1.default) `
    SELECT * FROM portfolio WHERE user_id = ${userId} AND quantity > 0
  `;
    if (positions.length === 0) {
        return [];
    }
    // Close each position
    const trades = [];
    for (const position of positions) {
        try {
            const trade = await closePosition(userId, position.symbol);
            trades.push(trade);
        }
        catch (err) {
            console.error(`Failed to close position ${position.symbol}:`, err);
            // Continue with other positions even if one fails
        }
    }
    return trades;
}
exports.default = { executeTrade, getUserPortfolio, getUserTrades, syncBalances, cancelOrder, closePosition, setStopTakeProfit, flattenAllPositions };
//# sourceMappingURL=tradingService.js.map