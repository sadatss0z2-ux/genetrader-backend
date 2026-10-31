"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logPolicyAudit = logPolicyAudit;
exports.getPolicyAuditLogs = getPolicyAuditLogs;
exports.getGlobalHaltStatus = getGlobalHaltStatus;
exports.setGlobalHalt = setGlobalHalt;
exports.getSymbolConfigs = getSymbolConfigs;
exports.getEnabledStrategySymbols = getEnabledStrategySymbols;
exports.getSymbolConfig = getSymbolConfig;
exports.upsertSymbolConfig = upsertSymbolConfig;
exports.enableSymbolWithReauth = enableSymbolWithReauth;
exports.disableSymbol = disableSymbol;
exports.setSymbolHalt = setSymbolHalt;
exports.getRiskDraft = getRiskDraft;
exports.saveRiskDraft = saveRiskDraft;
exports.commitRiskDraft = commitRiskDraft;
exports.discardRiskDraft = discardRiskDraft;
exports.verifyTradeAllowed = verifyTradeAllowed;
const database_1 = __importDefault(require("../config/database"));
const errorHandler_1 = require("../middleware/errorHandler");
const authService_1 = require("./authService");
/**
 * Inserts an immutable audit record into symbol_policy_audit.
 */
async function logPolicyAudit(params) {
    const rows = await (0, database_1.default) `
    INSERT INTO symbol_policy_audit (
      user_id, symbol, action, actor, reason, consent_version, ip_address, user_agent
    ) VALUES (
      ${params.userId},
      ${params.symbol ? params.symbol.toUpperCase() : null},
      ${params.action},
      ${params.actor || 'USER'},
      ${params.reason || null},
      ${params.consentVersion || null},
      ${params.ipAddress || null},
      ${params.userAgent || null}
    )
    RETURNING id, user_id, symbol, action, actor, reason, consent_version, ip_address, user_agent, created_at
  `;
    const r = rows[0];
    return {
        id: r.id,
        userId: r.user_id,
        symbol: r.symbol,
        action: r.action,
        actor: r.actor,
        reason: r.reason,
        consentVersion: r.consent_version,
        ipAddress: r.ip_address,
        userAgent: r.user_agent,
        createdAt: r.created_at,
    };
}
/**
 * Returns audit records for a given user.
 */
async function getPolicyAuditLogs(userId, limit = 50) {
    const rows = await (0, database_1.default) `
    SELECT id, user_id, symbol, action, actor, reason, consent_version, ip_address, user_agent, created_at
    FROM symbol_policy_audit
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
    return rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        symbol: r.symbol,
        action: r.action,
        actor: r.actor,
        reason: r.reason,
        consentVersion: r.consent_version,
        ipAddress: r.ip_address,
        userAgent: r.user_agent,
        createdAt: r.created_at,
    }));
}
/**
 * Returns the global halt status for a user.
 * In accordance with blueprint line 317 ("All new accounts remain globally halted and observer-only"),
 * accounts without an explicit record fail closed and default to halted: true.
 */
async function getGlobalHaltStatus(userId) {
    const rows = await (0, database_1.default) `
    SELECT halted, reason, halted_by, halted_at, resumed_at
    FROM global_halts
    WHERE user_id = ${userId}
    LIMIT 1
  `;
    if (rows.length === 0) {
        return {
            halted: true,
            reason: 'Default global halt for unverified / newly initialized account',
            haltedBy: 'SYSTEM',
        };
    }
    return {
        halted: rows[0].halted === true,
        reason: rows[0].reason,
        haltedBy: rows[0].halted_by,
        haltedAt: rows[0].halted_at,
        resumedAt: rows[0].resumed_at,
    };
}
/**
 * Sets or updates the global halt status for an account.
 */
async function setGlobalHalt(userId, halted, reason, actor = 'USER', ipAddress, userAgent) {
    const rows = await (0, database_1.default) `
    INSERT INTO global_halts (user_id, halted, reason, halted_by, halted_at, resumed_at)
    VALUES (
      ${userId},
      ${halted},
      ${reason || null},
      ${actor},
      ${halted ? new Date() : null},
      ${halted ? null : new Date()}
    )
    ON CONFLICT (user_id) DO UPDATE SET
      halted = EXCLUDED.halted,
      reason = EXCLUDED.reason,
      halted_by = EXCLUDED.halted_by,
      halted_at = CASE WHEN EXCLUDED.halted THEN NOW() ELSE global_halts.halted_at END,
      resumed_at = CASE WHEN NOT EXCLUDED.halted THEN NOW() ELSE NULL END,
      updated_at = NOW()
    RETURNING halted, reason, halted_by, halted_at, resumed_at
  `;
    // Immutable audit log
    await logPolicyAudit({
        userId,
        symbol: 'GLOBAL',
        action: halted ? 'GLOBAL_HALT' : 'GLOBAL_RESUME',
        actor,
        reason: reason || (halted ? 'Account globally halted' : 'Account global halt lifted'),
        ipAddress,
        userAgent,
    }).catch((err) => {
        // Non-blocking in case audit table is not yet migrated in transient test environments
        console.warn('Failed to write global halt audit entry:', err.message);
    });
    return {
        halted: rows[0].halted === true,
        reason: rows[0].reason,
        haltedBy: rows[0].halted_by,
        haltedAt: rows[0].halted_at,
        resumedAt: rows[0].resumed_at,
    };
}
/**
 * Returns all configured symbols/pairs for a user.
 */
async function getSymbolConfigs(userId) {
    const rows = await (0, database_1.default) `
    SELECT id, user_id, symbol, enabled, halted, max_position_size, created_at, updated_at
    FROM symbol_configs
    WHERE user_id = ${userId}
    ORDER BY symbol ASC
  `;
    return rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        symbol: r.symbol,
        enabled: r.enabled === true,
        halted: r.halted === true,
        maxPositionSize: parseFloat(r.max_position_size ?? '1000'),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
    }));
}
/**
 * Returns the union of enabled pairs referenced by account symbol configs and
 * risk policies so the shared public feed can cover active strategy markets.
 */
async function getEnabledStrategySymbols() {
    const rows = await (0, database_1.default) `
    SELECT DISTINCT REGEXP_REPLACE(UPPER(BTRIM(enabled_symbols.symbol)), '/', '', 'g') AS symbol
    FROM (
      SELECT symbol
      FROM symbol_configs
      WHERE enabled = TRUE
      UNION ALL
      SELECT UNNEST(enabled_symbols) AS symbol
      FROM risk_policy_configs
    ) AS enabled_symbols
    WHERE REGEXP_REPLACE(UPPER(BTRIM(enabled_symbols.symbol)), '/', '', 'g') ~ '^[A-Z0-9]{5,20}$'
    ORDER BY symbol ASC
  `;
    return rows.map((row) => row.symbol);
}
/**
 * Returns the symbol config for a specific pair and user.
 */
async function getSymbolConfig(userId, symbol) {
    const normalized = symbol.trim().toUpperCase();
    const rows = await (0, database_1.default) `
    SELECT id, user_id, symbol, enabled, halted, max_position_size, created_at, updated_at
    FROM symbol_configs
    WHERE user_id = ${userId} AND symbol = ${normalized}
    LIMIT 1
  `;
    if (rows.length === 0)
        return null;
    const r = rows[0];
    return {
        id: r.id,
        userId: r.user_id,
        symbol: r.symbol,
        enabled: r.enabled === true,
        halted: r.halted === true,
        maxPositionSize: parseFloat(r.max_position_size ?? '1000'),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
    };
}
/**
 * Upserts a per-pair configuration for a user.
 * Newly configured symbols default to enabled: false and halted: true.
 */
async function upsertSymbolConfig(userId, symbol, data) {
    const normalized = symbol.trim().toUpperCase();
    const rows = await (0, database_1.default) `
    INSERT INTO symbol_configs (user_id, symbol, enabled, halted, max_position_size)
    VALUES (
      ${userId},
      ${normalized},
      ${data.enabled ?? false},
      ${data.halted ?? true},
      ${data.maxPositionSize ?? 1000}
    )
    ON CONFLICT (user_id, symbol) DO UPDATE SET
      enabled = COALESCE(${data.enabled !== undefined ? data.enabled : null}, symbol_configs.enabled),
      halted = COALESCE(${data.halted !== undefined ? data.halted : null}, symbol_configs.halted),
      max_position_size = COALESCE(${data.maxPositionSize !== undefined ? data.maxPositionSize : null}, symbol_configs.max_position_size),
      updated_at = NOW()
    RETURNING id, user_id, symbol, enabled, halted, max_position_size, created_at, updated_at
  `;
    const r = rows[0];
    return {
        id: r.id,
        userId: r.user_id,
        symbol: r.symbol,
        enabled: r.enabled === true,
        halted: r.halted === true,
        maxPositionSize: parseFloat(r.max_position_size ?? '1000'),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
    };
}
/**
 * Enables a symbol for live trading.
 * MANDATORY POLICY GATE (P4-03):
 * 1. Requires valid explicit consentVersion.
 * 2. Requires reauthentication with the user's password.
 * 3. Sets enabled: true and unhalts the symbol (halted: false).
 * 4. Logs an immutable audit record to symbol_policy_audit.
 */
async function enableSymbolWithReauth(params) {
    const { userId, symbol, password, consentVersion, maxPositionSize, ipAddress, userAgent } = params;
    // 1. Validate consent
    if (!consentVersion || typeof consentVersion !== 'string' || consentVersion.trim() === '') {
        throw (0, errorHandler_1.createError)('Explicit risk consent version is required to enable live symbol trading.', 400);
    }
    // 2. Reauthenticate password
    if (!password) {
        throw (0, errorHandler_1.createError)('Password reauthentication is required to enable live symbol trading.', 401);
    }
    const isPasswordValid = await (0, authService_1.verifyPassword)(userId, password);
    if (!isPasswordValid) {
        throw (0, errorHandler_1.createError)('Invalid password for reauthentication.', 401);
    }
    // 3. Upsert symbol config to enabled = true, halted = false
    const updated = await upsertSymbolConfig(userId, symbol, {
        enabled: true,
        halted: false,
        maxPositionSize,
    });
    // 4. Log immutable audit entry
    await logPolicyAudit({
        userId,
        symbol,
        action: 'ENABLE_LIVE_SYMBOL',
        actor: 'USER',
        reason: 'Live symbol enablement with reauthentication and risk consent',
        consentVersion,
        ipAddress,
        userAgent,
    }).catch((err) => {
        console.warn('Failed to write symbol enablement audit entry:', err.message);
    });
    return updated;
}
/**
 * Disables a symbol from live trading.
 */
async function disableSymbol(params) {
    const { userId, symbol, actor = 'USER', reason, ipAddress, userAgent } = params;
    const updated = await upsertSymbolConfig(userId, symbol, {
        enabled: false,
        halted: true,
    });
    await logPolicyAudit({
        userId,
        symbol,
        action: 'DISABLE_SYMBOL',
        actor,
        reason: reason || 'Symbol disabled by user',
        ipAddress,
        userAgent,
    }).catch((err) => {
        console.warn('Failed to write symbol disable audit entry:', err.message);
    });
    return updated;
}
/**
 * Sets symbol-specific halt state (halt or resume).
 */
async function setSymbolHalt(params) {
    const { userId, symbol, halted, reason, actor = 'USER', ipAddress, userAgent } = params;
    const updated = await upsertSymbolConfig(userId, symbol, {
        halted,
    });
    await logPolicyAudit({
        userId,
        symbol,
        action: halted ? 'HALT_SYMBOL' : 'RESUME_SYMBOL',
        actor,
        reason: reason || (halted ? 'Symbol halted' : 'Symbol resumed'),
        ipAddress,
        userAgent,
    }).catch((err) => {
        console.warn('Failed to write symbol halt audit entry:', err.message);
    });
    return updated;
}
/**
 * Gets the current uncommitted or active risk policy draft for a user.
 */
async function getRiskDraft(userId) {
    const rows = await (0, database_1.default) `
    SELECT id, user_id, draft_data, status, version, created_at, updated_at
    FROM risk_drafts
    WHERE user_id = ${userId}
    LIMIT 1
  `;
    if (rows.length === 0)
        return null;
    const r = rows[0];
    return {
        id: r.id,
        userId: r.user_id,
        draftData: typeof r.draft_data === 'string' ? JSON.parse(r.draft_data) : r.draft_data,
        status: r.status,
        version: r.version,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
    };
}
/**
 * Saves/updates an uncommitted risk policy draft.
 */
async function saveRiskDraft(userId, draftData) {
    const payload = JSON.stringify(draftData);
    const rows = await (0, database_1.default) `
    INSERT INTO risk_drafts (user_id, draft_data, status, version)
    VALUES (${userId}, ${payload}::jsonb, 'DRAFT', 1)
    ON CONFLICT (user_id) DO UPDATE SET
      draft_data = ${payload}::jsonb,
      status = 'DRAFT',
      version = risk_drafts.version + 1,
      updated_at = NOW()
    RETURNING id, user_id, draft_data, status, version, created_at, updated_at
  `;
    const r = rows[0];
    return {
        id: r.id,
        userId: r.user_id,
        draftData: typeof r.draft_data === 'string' ? JSON.parse(r.draft_data) : r.draft_data,
        status: r.status,
        version: r.version,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
    };
}
/**
 * Validates and commits a risk draft, applying values to active trading_settings and account_settings.
 */
async function commitRiskDraft(userId) {
    const draft = await getRiskDraft(userId);
    if (!draft || draft.status !== 'DRAFT') {
        throw (0, errorHandler_1.createError)('No uncommitted risk draft found to commit.', 400);
    }
    const d = draft.draftData;
    // Validate bounds
    if (d.riskPerTrade !== undefined) {
        if (typeof d.riskPerTrade !== 'number' || d.riskPerTrade < 0 || d.riskPerTrade > 100) {
            throw (0, errorHandler_1.createError)('Draft riskPerTrade must be a number between 0 and 100.', 400);
        }
    }
    if (d.maxPositionSize !== undefined) {
        if (typeof d.maxPositionSize !== 'number' || d.maxPositionSize < 0) {
            throw (0, errorHandler_1.createError)('Draft maxPositionSize must be a non-negative number.', 400);
        }
    }
    if (d.maxOpenTrades !== undefined) {
        if (!Number.isInteger(d.maxOpenTrades) || d.maxOpenTrades < 1 || d.maxOpenTrades > 100) {
            throw (0, errorHandler_1.createError)('Draft maxOpenTrades must be an integer between 1 and 100.', 400);
        }
    }
    // Atomically apply settings and mark draft committed
    await database_1.default.begin(async (tx) => {
        // 1. Update trading_settings
        await tx `
      INSERT INTO trading_settings (
        user_id, risk_per_trade, max_position_size, auto_take_profit, take_profit_percent,
        auto_stop_loss, stop_loss_percent, max_open_trades, updated_at
      )
      VALUES (
        ${userId},
        ${d.riskPerTrade ?? 1.0},
        ${d.maxPositionSize ?? 1000},
        ${d.autoTakeProfit ?? false},
        ${d.takeProfitPercent ?? 5.0},
        ${d.autoStopLoss ?? false},
        ${d.stopLossPercent ?? 3.0},
        ${d.maxOpenTrades ?? 5},
        NOW()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        risk_per_trade = COALESCE(${d.riskPerTrade !== undefined ? d.riskPerTrade : null}, trading_settings.risk_per_trade),
        max_position_size = COALESCE(${d.maxPositionSize !== undefined ? d.maxPositionSize : null}, trading_settings.max_position_size),
        auto_take_profit = COALESCE(${d.autoTakeProfit !== undefined ? d.autoTakeProfit : null}, trading_settings.auto_take_profit),
        take_profit_percent = COALESCE(${d.takeProfitPercent !== undefined ? d.takeProfitPercent : null}, trading_settings.take_profit_percent),
        auto_stop_loss = COALESCE(${d.autoStopLoss !== undefined ? d.autoStopLoss : null}, trading_settings.auto_stop_loss),
        stop_loss_percent = COALESCE(${d.stopLossPercent !== undefined ? d.stopLossPercent : null}, trading_settings.stop_loss_percent),
        max_open_trades = COALESCE(${d.maxOpenTrades !== undefined ? d.maxOpenTrades : null}, trading_settings.max_open_trades),
        updated_at = NOW()
    `;
        // 2. Update account_settings
        if (d.maxPositionSize !== undefined || d.maxOpenTrades !== undefined) {
            await tx `
        INSERT INTO account_settings (user_id, max_position_size, max_daily_trades, updated_at)
        VALUES (${userId}, ${d.maxPositionSize ?? 1000}, ${d.maxOpenTrades ?? 10}, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          max_position_size = COALESCE(${d.maxPositionSize !== undefined ? d.maxPositionSize : null}, account_settings.max_position_size),
          max_daily_trades = COALESCE(${d.maxOpenTrades !== undefined ? d.maxOpenTrades : null}, account_settings.max_daily_trades),
          updated_at = NOW()
      `;
        }
        // 3. Mark draft committed
        await tx `
      UPDATE risk_drafts
      SET status = 'COMMITTED', updated_at = NOW()
      WHERE user_id = ${userId}
    `;
    });
    return { success: true, appliedSettings: d };
}
/**
 * Discards the current draft.
 */
async function discardRiskDraft(userId) {
    await (0, database_1.default) `
    UPDATE risk_drafts
    SET status = 'DISCARDED', updated_at = NOW()
    WHERE user_id = ${userId}
  `;
}
/**
 * Verifies that all trading policy conditions are met before an order can be enqueued or executed.
 * Fails closed if:
 * 1. Account is in observer mode.
 * 2. Account is globally halted.
 * 3. The symbol/pair is not configured, not enabled, or halted.
 */
async function verifyTradeAllowed(userId, symbol) {
    // 1. Observer mode check
    const userRows = await (0, database_1.default) `
    SELECT observer_mode FROM users WHERE id = ${userId} LIMIT 1
  `;
    const isObserver = userRows.length === 0 || userRows[0].observer_mode !== false;
    if (isObserver) {
        throw (0, errorHandler_1.createError)('Cannot execute trades in observer mode.', 403);
    }
    // 2. Global halt check
    const haltStatus = await getGlobalHaltStatus(userId);
    if (haltStatus.halted) {
        throw (0, errorHandler_1.createError)(`Trading is globally halted for this account: ${haltStatus.reason || 'Halt active'}`, 403);
    }
    // 3. Per-pair configuration check
    const config = await getSymbolConfig(userId, symbol);
    if (!config || !config.enabled || config.halted) {
        throw (0, errorHandler_1.createError)(`Trading for symbol ${symbol.toUpperCase()} is disabled or halted in your pair configuration.`, 403);
    }
}
//# sourceMappingURL=tradingPolicyService.js.map