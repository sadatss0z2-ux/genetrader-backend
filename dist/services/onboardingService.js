"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OBSERVER_DISCLOSURE_VERSION = void 0;
exports.completeObserverOnboarding = completeObserverOnboarding;
exports.completeOnboarding = completeOnboarding;
exports.getOnboardingStatus = getOnboardingStatus;
exports.getDecryptedApiKeys = getDecryptedApiKeys;
exports.updateObserverMode = updateObserverMode;
const database_1 = __importDefault(require("../config/database"));
const encryptionService_1 = require("./encryptionService");
const notificationService_1 = require("./notificationService");
const binanceService_1 = require("./binanceService");
exports.OBSERVER_DISCLOSURE_VERSION = 'observer-v1';
async function completeObserverOnboarding(userId, disclosureVersion, accepted, ipAddress, userAgent) {
    if (!accepted) {
        return { success: false, message: 'Observer disclosure acknowledgement is required.' };
    }
    if (disclosureVersion !== exports.OBSERVER_DISCLOSURE_VERSION) {
        return { success: false, message: 'Observer disclosure has changed. Review it and try again.' };
    }
    const newlyAcceptedObserver = await database_1.default.begin(async (tx) => {
        await tx `
      UPDATE users
      SET onboarding_completed = true, observer_mode = true
      WHERE id = ${userId}
    `;
        await tx `
      INSERT INTO account_settings (user_id, observer_mode)
      VALUES (${userId}, true)
      ON CONFLICT (user_id) DO UPDATE SET observer_mode = true, updated_at = NOW()
    `;
        await tx `
      INSERT INTO global_halts (user_id, halted, reason, halted_by, halted_at, resumed_at)
      VALUES (${userId}, true, 'Observer onboarding; trading remains disabled', 'SYSTEM', NOW(), NULL)
      ON CONFLICT (user_id) DO UPDATE SET
        halted = true,
        reason = 'Observer onboarding; trading remains disabled',
        halted_by = 'SYSTEM',
        halted_at = NOW(),
        resumed_at = NULL,
        updated_at = NOW()
    `;
        const priorAcceptance = await tx `
      SELECT EXISTS (
        SELECT 1 FROM observer_onboarding_acceptances WHERE user_id = ${userId}
      ) AS has_prior_acceptance
    `;
        const acceptance = await tx `
      INSERT INTO observer_onboarding_acceptances (user_id, disclosure_version, ip_address, user_agent)
      VALUES (${userId}, ${disclosureVersion}, ${ipAddress || null}, ${userAgent || null})
      ON CONFLICT (user_id, disclosure_version) DO NOTHING
      RETURNING user_id
    `;
        return acceptance.length > 0 && priorAcceptance[0]?.has_prior_acceptance !== true;
    });
    if (newlyAcceptedObserver) {
        await (0, notificationService_1.notifyObserverOnboardingCompleted)();
    }
    return { success: true, message: 'Observer onboarding completed. Trading remains disabled.' };
}
async function completeOnboarding(userId, data) {
    // Validate Binance API keys and inspect permissions (skip in test mode)
    if (process.env.NODE_ENV !== 'test' && process.env.SKIP_BINANCE_VALIDATION !== 'true') {
        const validation = await (0, binanceService_1.inspectExchangeKeyPermissions)(data.binanceApiKey, data.binanceApiSecret);
        if (!validation.valid) {
            return { success: false, message: validation.error || 'Invalid Binance API keys' };
        }
    }
    // Encrypt API keys
    const encryptedKey = (0, encryptionService_1.encrypt)(data.binanceApiKey, {
        userId,
        secretType: 'binance_api_key',
        service: 'onboardingService',
    });
    const encryptedSecret = (0, encryptionService_1.encrypt)(data.binanceApiSecret, {
        userId,
        secretType: 'binance_api_secret',
        service: 'onboardingService',
    });
    // Update user with onboarding data
    await (0, database_1.default) `
    UPDATE users
    SET
      onboarding_completed = true,
      account_size = ${data.accountSize},
      account_size_currency = ${data.accountSizeCurrency},
      observer_mode = true,
      binance_api_key_encrypted = ${encryptedKey.encrypted},
      binance_api_secret_encrypted = ${encryptedSecret.encrypted},
      api_key_added_at = NOW()
    WHERE id = ${userId}
  `;
    // Create account settings
    await (0, database_1.default) `
    INSERT INTO account_settings (user_id, observer_mode, max_position_size, max_daily_trades)
    VALUES (${userId}, true, ${data.riskSettings?.maxPositionSize || 1000}, ${data.riskSettings?.maxOpenTrades || 10})
    ON CONFLICT (user_id) DO UPDATE SET
      observer_mode = EXCLUDED.observer_mode,
      max_position_size = COALESCE(EXCLUDED.max_position_size, account_settings.max_position_size),
      max_daily_trades = COALESCE(EXCLUDED.max_daily_trades, account_settings.max_daily_trades)
  `;
    // Store API keys in separate table
    await (0, database_1.default) `
    INSERT INTO api_keys (user_id, key_name, exchange, public_key_encrypted, secret_key_encrypted, testnet, environment)
    VALUES (${userId}, 'Testnet', 'binance', ${encryptedKey.encrypted}, ${encryptedSecret.encrypted}, true, 'testnet')
    ON CONFLICT (user_id, public_key_encrypted) DO UPDATE SET
      secret_key_encrypted = EXCLUDED.secret_key_encrypted,
      environment = 'testnet',
      last_used_at = NOW()
  `;
    // Send admin notification
    await (0, notificationService_1.notifyOnboardingCompleted)(userId, data.accountSize);
    return { success: true, message: 'Onboarding completed successfully' };
}
async function getOnboardingStatus(userId) {
    const result = await (0, database_1.default) `
    SELECT 
      onboarding_completed,
      observer_mode,
      account_size,
      api_key_added_at
    FROM users
    WHERE id = ${userId}
  `;
    if (result.length === 0) {
        return { completed: false, observerMode: true, exchangeConnected: false };
    }
    return {
        completed: result[0].onboarding_completed || false,
        observerMode: result[0].observer_mode !== false,
        accountSize: result[0].account_size,
        exchangeConnected: result[0].api_key_added_at != null,
    };
}
/**
 * @internal
 * Decrypts and returns user's Binance API keys.
 * WARNING: This function is for server-side service calls only.
 * It must NEVER be exposed via an HTTP route or returned to a client.
 * Use only in trusted server-side contexts (e.g., exchange adapter initialization).
 */
async function getDecryptedApiKeys(userId) {
    const result = await (0, database_1.default) `
    SELECT 
      public_key_encrypted,
      secret_key_encrypted
    FROM api_keys
    WHERE user_id = ${userId}
      AND exchange = 'binance'
      AND environment = 'testnet'
      AND active = TRUE
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `;
    if (result.length === 0 || !result[0].public_key_encrypted || !result[0].secret_key_encrypted) {
        throw new Error('No API keys found for user');
    }
    const apiKey = (0, encryptionService_1.decrypt)(result[0].public_key_encrypted, '', '', { userId, secretType: 'binance_api_key', service: 'onboardingService' });
    const apiSecret = (0, encryptionService_1.decrypt)(result[0].secret_key_encrypted, '', '', { userId, secretType: 'binance_api_secret', service: 'onboardingService' });
    return { apiKey, apiSecret };
}
async function updateObserverMode(userId, observerMode) {
    await (0, database_1.default) `
    UPDATE users SET observer_mode = ${observerMode} WHERE id = ${userId}
  `;
    await (0, database_1.default) `
    UPDATE account_settings SET observer_mode = ${observerMode} WHERE user_id = ${userId}
  `;
}
//# sourceMappingURL=onboardingService.js.map