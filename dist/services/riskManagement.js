"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRiskSettings = getRiskSettings;
exports.updateRiskSettings = updateRiskSettings;
exports.validateTrade = validateTrade;
const database_1 = __importDefault(require("../config/database"));
const DEFAULT_RISK_SETTINGS = {
    riskPerTrade: 1,
    maxPositionSize: 1000,
    autoTakeProfit: false,
    takeProfitPercent: 5,
    autoStopLoss: false,
    stopLossPercent: 3,
    maxOpenTrades: 5,
};
async function getRiskSettings(userId) {
    const result = await (0, database_1.default) `
    SELECT risk_per_trade, max_position_size, auto_take_profit, take_profit_percent,
           auto_stop_loss, stop_loss_percent, max_open_trades
    FROM trading_settings WHERE user_id = ${userId}
  `;
    if (result.length === 0) {
        return { ...DEFAULT_RISK_SETTINGS };
    }
    const row = result[0];
    return {
        riskPerTrade: Number(row.risk_per_trade ?? DEFAULT_RISK_SETTINGS.riskPerTrade),
        maxPositionSize: Number(row.max_position_size ?? DEFAULT_RISK_SETTINGS.maxPositionSize),
        autoTakeProfit: row.auto_take_profit ?? DEFAULT_RISK_SETTINGS.autoTakeProfit,
        takeProfitPercent: Number(row.take_profit_percent ?? DEFAULT_RISK_SETTINGS.takeProfitPercent),
        autoStopLoss: row.auto_stop_loss ?? DEFAULT_RISK_SETTINGS.autoStopLoss,
        stopLossPercent: Number(row.stop_loss_percent ?? DEFAULT_RISK_SETTINGS.stopLossPercent),
        maxOpenTrades: row.max_open_trades ?? DEFAULT_RISK_SETTINGS.maxOpenTrades,
    };
}
async function updateRiskSettings(userId, settings) {
    // postgres tagged templates reject undefined values. Materialising a complete
    // policy also makes the upsert deterministic when callers update one field.
    const current = await getRiskSettings(userId);
    const next = { ...current, ...settings };
    await (0, database_1.default) `
    INSERT INTO trading_settings (user_id, risk_per_trade, max_position_size, auto_take_profit, take_profit_percent, auto_stop_loss, stop_loss_percent, max_open_trades)
    VALUES (${userId}, ${next.riskPerTrade}, ${next.maxPositionSize}, ${next.autoTakeProfit}, ${next.takeProfitPercent}, ${next.autoStopLoss}, ${next.stopLossPercent}, ${next.maxOpenTrades})
    ON CONFLICT (user_id) DO UPDATE SET
      risk_per_trade = COALESCE(EXCLUDED.risk_per_trade, trading_settings.risk_per_trade),
      max_position_size = COALESCE(EXCLUDED.max_position_size, trading_settings.max_position_size),
      auto_take_profit = COALESCE(EXCLUDED.auto_take_profit, trading_settings.auto_take_profit),
      take_profit_percent = COALESCE(EXCLUDED.take_profit_percent, trading_settings.take_profit_percent),
      auto_stop_loss = COALESCE(EXCLUDED.auto_stop_loss, trading_settings.auto_stop_loss),
      stop_loss_percent = COALESCE(EXCLUDED.stop_loss_percent, trading_settings.stop_loss_percent),
      max_open_trades = COALESCE(EXCLUDED.max_open_trades, trading_settings.max_open_trades)
  `;
}
async function validateTrade(userId, symbol, quantity, price) {
    const settings = await getRiskSettings(userId);
    const portfolio = await (0, database_1.default) `
    SELECT * FROM portfolio WHERE user_id = ${userId}
  `;
    // Check max position size
    const positionValue = quantity * price;
    if (positionValue > settings.maxPositionSize) {
        return { valid: false, reason: 'Position size exceeds maximum allowed' };
    }
    // Check max open trades
    const openTrades = await (0, database_1.default) `
    SELECT COUNT(*) as count FROM trades WHERE user_id = ${userId} AND status = 'FILLED'
  `;
    if (openTrades[0].count >= settings.maxOpenTrades) {
        return { valid: false, reason: 'Maximum open trades reached' };
    }
    return { valid: true };
}
//# sourceMappingURL=riskManagement.js.map