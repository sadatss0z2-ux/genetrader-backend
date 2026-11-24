"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_AI_PREFERENCES = void 0;
exports.getAiUserProfile = getAiUserProfile;
exports.saveAiUserProfile = saveAiUserProfile;
exports.appendAiConversation = appendAiConversation;
exports.clearAiUserProfile = clearAiUserProfile;
const database_1 = __importDefault(require("../config/database"));
exports.DEFAULT_AI_PREFERENCES = {
    goal: '',
    experienceLevel: 'unspecified',
    timeHorizon: 'unspecified',
    riskComfort: 'unspecified',
    watchlist: [],
    responseStyle: 'concise',
};
function safePreferences(value) {
    if (!value || typeof value !== 'object')
        return { ...exports.DEFAULT_AI_PREFERENCES };
    return {
        goal: typeof value.goal === 'string' ? value.goal : '',
        experienceLevel: value.experienceLevel ?? 'unspecified',
        timeHorizon: value.timeHorizon ?? 'unspecified',
        riskComfort: value.riskComfort ?? 'unspecified',
        watchlist: Array.isArray(value.watchlist) ? value.watchlist : [],
        responseStyle: value.responseStyle ?? 'concise',
    };
}
function toProfile(row) {
    if (!row) {
        return {
            memoryEnabled: false,
            preferences: { ...exports.DEFAULT_AI_PREFERENCES },
            recentMessages: [],
            updatedAt: null,
        };
    }
    return {
        memoryEnabled: row.memory_enabled,
        preferences: safePreferences(row.preferences),
        recentMessages: row.memory_enabled && Array.isArray(row.recent_messages)
            ? row.recent_messages.slice(-12)
            : [],
        updatedAt: new Date(row.updated_at).toISOString(),
    };
}
async function getAiUserProfile(userId) {
    const rows = await (0, database_1.default) `
    SELECT memory_enabled, preferences, recent_messages, updated_at
    FROM ai_user_profiles WHERE user_id = ${userId} LIMIT 1
  `;
    return toProfile(rows[0]);
}
async function saveAiUserProfile(userId, memoryEnabled, preferences, recentMessages) {
    const preferencesJson = JSON.stringify(safePreferences(preferences));
    const recentMessagesJson = recentMessages
        ? JSON.stringify(recentMessages.slice(-12).map((message) => ({
            role: message.role,
            text: message.text.slice(0, 2_000),
            createdAt: Number.isFinite(Date.parse(message.createdAt))
                ? new Date(message.createdAt).toISOString()
                : new Date().toISOString(),
        })))
        : null;
    const rows = await (0, database_1.default) `
    INSERT INTO ai_user_profiles (user_id, memory_enabled, preferences, recent_messages, updated_at)
    VALUES (
      ${userId}, ${memoryEnabled}, ${preferencesJson}::jsonb,
      COALESCE(${recentMessagesJson}::jsonb, '[]'::jsonb), NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      memory_enabled = EXCLUDED.memory_enabled,
      preferences = EXCLUDED.preferences,
      recent_messages = CASE
        WHEN EXCLUDED.memory_enabled THEN COALESCE(${recentMessagesJson}::jsonb, ai_user_profiles.recent_messages)
        ELSE '[]'::jsonb
      END,
      updated_at = NOW()
    RETURNING memory_enabled, preferences, recent_messages, updated_at
  `;
    return toProfile(rows[0]);
}
async function appendAiConversation(userId, userText, assistantText) {
    const createdAt = new Date().toISOString();
    const additions = [
        { role: 'user', text: userText.slice(0, 500), createdAt },
        { role: 'assistant', text: assistantText.slice(0, 2_000), createdAt },
    ];
    const additionsJson = JSON.stringify(additions);
    await (0, database_1.default) `
    UPDATE ai_user_profiles
    SET recent_messages = (
      SELECT COALESCE(jsonb_agg(message ORDER BY ordinal), '[]'::jsonb)
      FROM jsonb_array_elements(recent_messages || ${additionsJson}::jsonb)
        WITH ORDINALITY AS saved(message, ordinal)
      WHERE ordinal > jsonb_array_length(recent_messages || ${additionsJson}::jsonb) - 12
    ),
    updated_at = NOW()
    WHERE user_id = ${userId} AND memory_enabled = TRUE
  `;
}
async function clearAiUserProfile(userId) {
    await (0, database_1.default) `DELETE FROM ai_user_profiles WHERE user_id = ${userId}`;
}
//# sourceMappingURL=aiProfileService.js.map