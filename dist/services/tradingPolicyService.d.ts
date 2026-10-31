export interface GlobalHaltStatus {
    halted: boolean;
    reason?: string | null;
    haltedBy?: string;
    haltedAt?: Date;
    resumedAt?: Date | null;
}
export interface SymbolConfig {
    id: number;
    userId: number;
    symbol: string;
    enabled: boolean;
    halted: boolean;
    maxPositionSize: number;
    createdAt: Date;
    updatedAt: Date;
}
export interface RiskDraft {
    id: number;
    userId: number;
    draftData: Record<string, any>;
    status: 'DRAFT' | 'COMMITTED' | 'DISCARDED';
    version: number;
    createdAt: Date;
    updatedAt: Date;
}
export interface SymbolPolicyAuditEntry {
    id: number;
    userId: number;
    symbol: string | null;
    action: string;
    actor: string;
    reason: string | null;
    consentVersion: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date;
}
/**
 * Inserts an immutable audit record into symbol_policy_audit.
 */
export declare function logPolicyAudit(params: {
    userId: number;
    symbol?: string | null;
    action: string;
    actor?: string;
    reason?: string | null;
    consentVersion?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
}): Promise<SymbolPolicyAuditEntry>;
/**
 * Returns audit records for a given user.
 */
export declare function getPolicyAuditLogs(userId: number, limit?: number): Promise<SymbolPolicyAuditEntry[]>;
/**
 * Returns the global halt status for a user.
 * In accordance with blueprint line 317 ("All new accounts remain globally halted and observer-only"),
 * accounts without an explicit record fail closed and default to halted: true.
 */
export declare function getGlobalHaltStatus(userId: number): Promise<GlobalHaltStatus>;
/**
 * Sets or updates the global halt status for an account.
 */
export declare function setGlobalHalt(userId: number, halted: boolean, reason?: string, actor?: string, ipAddress?: string, userAgent?: string): Promise<GlobalHaltStatus>;
/**
 * Returns all configured symbols/pairs for a user.
 */
export declare function getSymbolConfigs(userId: number): Promise<SymbolConfig[]>;
/**
 * Returns the union of enabled pairs referenced by account symbol configs and
 * risk policies so the shared public feed can cover active strategy markets.
 */
export declare function getEnabledStrategySymbols(): Promise<string[]>;
/**
 * Returns the symbol config for a specific pair and user.
 */
export declare function getSymbolConfig(userId: number, symbol: string): Promise<SymbolConfig | null>;
/**
 * Upserts a per-pair configuration for a user.
 * Newly configured symbols default to enabled: false and halted: true.
 */
export declare function upsertSymbolConfig(userId: number, symbol: string, data: {
    enabled?: boolean;
    halted?: boolean;
    maxPositionSize?: number;
}): Promise<SymbolConfig>;
/**
 * Enables a symbol for live trading.
 * MANDATORY POLICY GATE (P4-03):
 * 1. Requires valid explicit consentVersion.
 * 2. Requires reauthentication with the user's password.
 * 3. Sets enabled: true and unhalts the symbol (halted: false).
 * 4. Logs an immutable audit record to symbol_policy_audit.
 */
export declare function enableSymbolWithReauth(params: {
    userId: number;
    symbol: string;
    password?: string;
    consentVersion: string;
    maxPositionSize?: number;
    ipAddress?: string;
    userAgent?: string;
}): Promise<SymbolConfig>;
/**
 * Disables a symbol from live trading.
 */
export declare function disableSymbol(params: {
    userId: number;
    symbol: string;
    actor?: string;
    reason?: string;
    ipAddress?: string;
    userAgent?: string;
}): Promise<SymbolConfig>;
/**
 * Sets symbol-specific halt state (halt or resume).
 */
export declare function setSymbolHalt(params: {
    userId: number;
    symbol: string;
    halted: boolean;
    reason?: string;
    actor?: string;
    ipAddress?: string;
    userAgent?: string;
}): Promise<SymbolConfig>;
/**
 * Gets the current uncommitted or active risk policy draft for a user.
 */
export declare function getRiskDraft(userId: number): Promise<RiskDraft | null>;
/**
 * Saves/updates an uncommitted risk policy draft.
 */
export declare function saveRiskDraft(userId: number, draftData: Record<string, any>): Promise<RiskDraft>;
/**
 * Validates and commits a risk draft, applying values to active trading_settings and account_settings.
 */
export declare function commitRiskDraft(userId: number): Promise<{
    success: boolean;
    appliedSettings: any;
}>;
/**
 * Discards the current draft.
 */
export declare function discardRiskDraft(userId: number): Promise<void>;
/**
 * Verifies that all trading policy conditions are met before an order can be enqueued or executed.
 * Fails closed if:
 * 1. Account is in observer mode.
 * 2. Account is globally halted.
 * 3. The symbol/pair is not configured, not enabled, or halted.
 */
export declare function verifyTradeAllowed(userId: number, symbol: string): Promise<void>;
//# sourceMappingURL=tradingPolicyService.d.ts.map