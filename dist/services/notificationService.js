"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendAdminNotification = sendAdminNotification;
exports.notifyTradeExecuted = notifyTradeExecuted;
exports.notifyPriceAlertTriggered = notifyPriceAlertTriggered;
exports.notifyCopierEvent = notifyCopierEvent;
exports.notifyOnboardingCompleted = notifyOnboardingCompleted;
exports.notifyObserverOnboardingCompleted = notifyObserverOnboardingCompleted;
exports.notifyObserverModeChange = notifyObserverModeChange;
exports.notifyTradePlanStatusChanged = notifyTradePlanStatusChanged;
exports.resetCopierAccountFailureCooldown = resetCopierAccountFailureCooldown;
exports.resetAllCopierAccountFailureCooldownsForTesting = resetAllCopierAccountFailureCooldownsForTesting;
exports.notifyCopierAccountFailure = notifyCopierAccountFailure;
const crypto_1 = require("crypto");
const database_1 = __importDefault(require("../config/database"));
const firebase_1 = require("../config/firebase");
function displaySymbol(symbol) {
    const quote = ['USDT', 'USDC', 'FDUSD', 'BTC', 'ETH', 'BNB'].find((candidate) => symbol.endsWith(candidate));
    return quote ? `${symbol.slice(0, -quote.length)}/${quote}` : symbol;
}
async function sendAdminNotification(userId, message) {
    // Store notification in database
    await (0, database_1.default) `
    INSERT INTO notifications (user_id, type, message, read)
    VALUES (${userId}, 'admin', ${message}, false)
  `;
    // In production, integrate with email/SMS/push notification service
    console.log(`Admin notification for user ${userId}: ${message}`);
}
async function notifyTradeExecuted(userId, trade) {
    try {
        const rows = await (0, database_1.default) `
      SELECT token, id
      FROM user_push_tokens
      WHERE user_id = ${userId}
        AND EXISTS (
          SELECT 1 FROM user_settings
          WHERE user_id = ${userId} AND notifications_enabled = TRUE
        )
    `;
        if (!rows.length)
            return;
        const price = Number(trade.price);
        const invalidTokenIds = [];
        for (let offset = 0; offset < rows.length; offset += 500) {
            const batch = rows.slice(offset, offset + 500);
            const response = await firebase_1.firebaseMessaging.sendEachForMulticast({
                tokens: batch.map((row) => row.token),
                notification: {
                    title: 'GeneTrader trade executed',
                    body: `${trade.side} ${trade.symbol} at ${Number.isFinite(price) ? price : 'unknown price'}`,
                },
                data: {
                    type: 'trade',
                    tradeId: String(trade.id),
                    symbol: trade.symbol,
                    side: trade.side,
                },
            });
            response.responses.forEach((result, index) => {
                const code = result.error?.code;
                if (!result.success && (code === 'messaging/registration-token-not-registered'
                    || code === 'messaging/invalid-registration-token')) {
                    invalidTokenIds.push(batch[index].id);
                }
            });
        }
        for (const id of invalidTokenIds) {
            await (0, database_1.default) `DELETE FROM user_push_tokens WHERE id = ${id} AND user_id = ${userId}`;
        }
    }
    catch (error) {
        console.error('[PushNotifs] Trade notification delivery failed', error instanceof Error ? error.name : 'Unknown error');
    }
}
async function notifyPriceAlertTriggered(userId, alert) {
    try {
        const rows = await (0, database_1.default) `
      SELECT token, id
      FROM user_push_tokens
      WHERE user_id = ${userId}
        AND EXISTS (
          SELECT 1 FROM user_settings
          WHERE user_id = ${userId} AND notifications_enabled = TRUE
        )
    `;
        if (!rows.length)
            return 'SKIPPED';
        const invalidTokenIds = [];
        let successfulDeliveries = 0;
        for (let offset = 0; offset < rows.length; offset += 500) {
            const batch = rows.slice(offset, offset + 500);
            const response = await firebase_1.firebaseMessaging.sendEachForMulticast({
                tokens: batch.map((row) => row.token),
                notification: {
                    title: `Price alert · ${displaySymbol(alert.symbol)}`,
                    body: `${displaySymbol(alert.symbol)} moved ${alert.direction.toLowerCase()} ${alert.targetPrice} (now ${alert.triggerPrice}).${alert.note ? ` ${alert.note}` : ''}`,
                },
                data: {
                    type: 'price_alert',
                    alertId: alert.alertId,
                    symbol: alert.symbol,
                    direction: alert.direction,
                    targetPrice: alert.targetPrice,
                    triggerPrice: alert.triggerPrice,
                    ...(alert.note ? { note: alert.note } : {}),
                },
            });
            successfulDeliveries += response.successCount;
            response.responses.forEach((result, index) => {
                const code = result.error?.code;
                if (!result.success && (code === 'messaging/registration-token-not-registered'
                    || code === 'messaging/invalid-registration-token')) {
                    invalidTokenIds.push(batch[index].id);
                }
            });
        }
        for (const id of invalidTokenIds) {
            await (0, database_1.default) `DELETE FROM user_push_tokens WHERE id = ${id} AND user_id = ${userId}`;
        }
        return successfulDeliveries > 0 ? 'SENT' : 'FAILED';
    }
    catch (error) {
        console.error('[PushNotifs] Price alert notification delivery failed', error instanceof Error ? error.name : 'Unknown error');
        return 'FAILED';
    }
}
function getMasterEmails() {
    return (process.env.MASTER_ACCOUNT_EMAIL ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
}
function getSourceMonitorEmails() {
    return (process.env.COPIER_SOURCE_MONITOR_EMAIL ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
}
async function notifyCopierEvent(event) {
    try {
        const masterEmails = getMasterEmails();
        const sourceMonitorEmails = getSourceMonitorEmails();
        const rows = await (0, database_1.default) `
      SELECT DISTINCT user_push_tokens.token, user_push_tokens.id
      FROM user_push_tokens
      JOIN users u ON u.id = user_push_tokens.user_id
      JOIN user_settings settings ON settings.user_id = u.id
      WHERE u.is_active = TRUE
        AND settings.notifications_enabled = TRUE
        AND (
          (
            ${masterEmails.length > 0}
            AND LOWER(u.email) IN ${(0, database_1.default)(masterEmails.length > 0 ? masterEmails : [''])}
            AND u.identity_verified_at IS NOT NULL
          )
          OR (
            ${sourceMonitorEmails.length > 0}
            AND LOWER(u.email) IN ${(0, database_1.default)(sourceMonitorEmails.length > 0 ? sourceMonitorEmails : [''])}
            AND u.email_verified_at IS NOT NULL
          )
          OR EXISTS (
            SELECT 1
            FROM copier_memberships membership
            JOIN copier_instances instance
              ON instance.instance_id = membership.instance_id AND instance.enabled = TRUE
            WHERE membership.user_id = u.id
              AND membership.desired_state IN ('OBSERVER', 'PAID_ACTIVE')
              AND membership.observed_state = membership.desired_state
              AND (
                (membership.desired_state = 'PAID_ACTIVE' AND membership.paid_through_at > NOW()
                  AND EXISTS (
                    SELECT 1 FROM subscriptions subscription
                    WHERE subscription.user_id = u.id
                      AND subscription.status = 'ACTIVE'
                      AND subscription.paid_through_at > NOW()
                  ))
                OR (membership.desired_state = 'OBSERVER' AND membership.observer_expires_at > NOW())
              )
          )
        )
    `;
        const invalidTokenIds = [];
        for (let offset = 0; offset < rows.length; offset += 500) {
            const batch = rows.slice(offset, offset + 500);
            const response = await firebase_1.firebaseMessaging.sendEachForMulticast({
                tokens: batch.map((row) => row.token),
                notification: {
                    title: 'GeneTrader copier update',
                    body: event.message,
                },
                data: { type: 'copier_event', eventId: event.eventId },
            });
            response.responses.forEach((result, index) => {
                const code = result.error?.code;
                if (!result.success && (code === 'messaging/registration-token-not-registered'
                    || code === 'messaging/invalid-registration-token')) {
                    invalidTokenIds.push(batch[index].id);
                }
            });
        }
        for (const id of invalidTokenIds) {
            await (0, database_1.default) `DELETE FROM user_push_tokens WHERE id = ${id}`;
        }
    }
    catch (error) {
        console.error('[PushNotifs] Copier event delivery failed', error instanceof Error ? error.name : 'Unknown error');
    }
}
async function notifyOnboardingCompleted(userId, accountSize) {
    await sendAdminNotification(userId, `User completed onboarding with account size: $${accountSize}`);
}
async function notifyObserverOnboardingCompleted() {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const chatIds = [...new Set((process.env.TELEGRAM_CHAT_ID ?? '')
            .split(',')
            .map((chatId) => chatId.trim())
            .filter(Boolean))];
    if (!token || chatIds.length === 0) {
        console.warn('[TelegramNotifs] Observer onboarding notification skipped: Telegram bot configuration is missing');
        return;
    }
    const text = 'A new user completed observer onboarding and is trying to start as an observer.';
    const results = await Promise.allSettled(chatIds.map(async (chatId) => {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text }),
            signal: AbortSignal.timeout(10_000),
        });
        const telegram = await response.json();
        if (!response.ok || telegram.ok !== true) {
            throw new Error(`Telegram API returned HTTP ${response.status}`);
        }
    }));
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length) {
        console.error(`[TelegramNotifs] Observer onboarding notification delivery failed for ${failures.length} admin chat(s)`, failures.map((failure) => failure.status === 'rejected'
            ? (failure.reason instanceof Error ? failure.reason.name : 'Unknown error')
            : 'Unknown error'));
    }
}
async function notifyObserverModeChange(userId, observerMode) {
    await sendAdminNotification(userId, `User ${observerMode ? 'enabled' : 'disabled'} observer mode`);
}
async function notifyTradePlanStatusChanged(userId, plan) {
    try {
        const rows = await (0, database_1.default) `
      SELECT token, id
      FROM user_push_tokens
      WHERE user_id = ${userId}
        AND EXISTS (
          SELECT 1 FROM user_settings
          WHERE user_id = ${userId} AND notifications_enabled = TRUE
        )
    `;
        if (!rows.length)
            return 'SKIPPED';
        let title = '';
        let body = '';
        const sym = displaySymbol(plan.symbol);
        if (plan.state === 'POSITION_PROTECTED') {
            title = `Trade Protected · ${sym}`;
            body = `${plan.side} position entered at ${plan.entryPrice ?? '—'}. TP at ${plan.takeProfitPrice ?? '—'}, SL at ${plan.stopLossPrice ?? '—'}.`;
        }
        else if (plan.state === 'TRAILING_ACTIVE') {
            title = `Trailing Stop Active · ${sym}`;
            const pctStr = plan.trailingPercentage ? ` (${plan.trailingPercentage}%)` : '';
            body = `${plan.side} position entered at ${plan.entryPrice ?? '—'}. Protective trailing stop active at ${plan.trailingStopPrice ?? '—'}${pctStr}.`;
        }
        else if (plan.state === 'CLOSED') {
            title = `Trade Plan Closed · ${sym}`;
            const pnlStr = (plan.pnl !== undefined && plan.pnl !== null)
                ? ` | P&L: ${plan.pnl >= 0 ? '+' : ''}${plan.pnl.toFixed(2)} USDT`
                : '';
            body = `${sym} closed via ${plan.exitReason || 'protective exit'} at ${plan.exitPrice ?? 'market'}${pnlStr}.`;
        }
        const invalidTokenIds = [];
        let successfulDeliveries = 0;
        for (let offset = 0; offset < rows.length; offset += 500) {
            const batch = rows.slice(offset, offset + 500);
            const response = await firebase_1.firebaseMessaging.sendEachForMulticast({
                tokens: batch.map((row) => row.token),
                notification: { title, body },
                data: {
                    type: 'trade_plan',
                    planId: plan.planId,
                    symbol: plan.symbol,
                    state: plan.state,
                    side: plan.side,
                    orderType: plan.orderType,
                },
            });
            successfulDeliveries += response.successCount;
            response.responses.forEach((result, index) => {
                const code = result.error?.code;
                if (!result.success && (code === 'messaging/registration-token-not-registered'
                    || code === 'messaging/invalid-registration-token')) {
                    invalidTokenIds.push(batch[index].id);
                }
            });
        }
        for (const id of invalidTokenIds) {
            await (0, database_1.default) `DELETE FROM user_push_tokens WHERE id = ${id} AND user_id = ${userId}`;
        }
        return successfulDeliveries > 0 ? 'SENT' : 'FAILED';
    }
    catch (error) {
        console.error('[PushNotifs] Trade plan notification delivery failed', error instanceof Error ? error.name : 'Unknown error');
        return 'FAILED';
    }
}
const failureNotificationCooldowns = new Map();
const FAILURE_NOTIFICATION_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
function resetCopierAccountFailureCooldown(accountRef) {
    for (const key of failureNotificationCooldowns.keys()) {
        if (key.startsWith(`${accountRef}:`)) {
            failureNotificationCooldowns.delete(key);
        }
    }
}
function resetAllCopierAccountFailureCooldownsForTesting() {
    failureNotificationCooldowns.clear();
}
async function notifyCopierAccountFailure(accountRef, details) {
    try {
        const errorKey = `${accountRef}:${details.status}:${details.errorCode ?? 'none'}`;
        const now = Date.now();
        const lastSent = failureNotificationCooldowns.get(errorKey);
        if (lastSent && now - lastSent < FAILURE_NOTIFICATION_COOLDOWN_MS) {
            return { sent: false, reason: 'cooldown' };
        }
        const isMainAccount = accountRef === 'Main_Live_Bot' || accountRef.toLowerCase().includes('main');
        let recipientUserIds = [];
        const masterEmails = getMasterEmails();
        const sourceMonitorEmails = getSourceMonitorEmails();
        if (isMainAccount) {
            // Main account failure affects ALL copier participants!
            const rows = await (0, database_1.default) `
        SELECT DISTINCT u.id
        FROM users u
        WHERE u.is_active = TRUE
          AND (
            (
              ${masterEmails.length > 0}
              AND LOWER(u.email) IN ${(0, database_1.default)(masterEmails.length > 0 ? masterEmails : [''])}
            )
            OR (
              ${sourceMonitorEmails.length > 0}
              AND LOWER(u.email) IN ${(0, database_1.default)(sourceMonitorEmails.length > 0 ? sourceMonitorEmails : [''])}
            )
            OR EXISTS (
              SELECT 1 FROM operator_managed_live_accounts managed
              WHERE managed.account_ref = ${accountRef} AND managed.user_id = u.id AND managed.active = TRUE
            )
            OR EXISTS (
              SELECT 1
              FROM copier_memberships membership
              JOIN copier_instances instance
                ON instance.instance_id = membership.instance_id AND instance.enabled = TRUE
              WHERE membership.user_id = u.id
                AND membership.desired_state IN ('OBSERVER', 'PAID_ACTIVE')
            )
          )
      `;
            recipientUserIds = rows.map((r) => r.id);
        }
        else {
            // Follower account failure: notify the owner of the account AND always alert master accounts and monitors!
            const rows = await (0, database_1.default) `
        SELECT DISTINCT u.id
        FROM users u
        WHERE u.is_active = TRUE
          AND (
            (
              ${masterEmails.length > 0}
              AND LOWER(u.email) IN ${(0, database_1.default)(masterEmails.length > 0 ? masterEmails : [''])}
            )
            OR (
              ${sourceMonitorEmails.length > 0}
              AND LOWER(u.email) IN ${(0, database_1.default)(sourceMonitorEmails.length > 0 ? sourceMonitorEmails : [''])}
            )
            OR EXISTS (
              SELECT 1 FROM operator_managed_live_accounts managed
              WHERE managed.account_ref = ${accountRef} AND managed.user_id = u.id AND managed.active = TRUE
            )
            OR EXISTS (
              SELECT 1 FROM copier_memberships membership
              WHERE membership.copier_account_ref = ${accountRef} AND membership.user_id = u.id
            )
          )
      `;
            recipientUserIds = rows.map((r) => r.id);
        }
        if (recipientUserIds.length === 0) {
            return { sent: false, reason: 'no_recipients' };
        }
        failureNotificationCooldowns.set(errorKey, now);
        let title;
        let body;
        if (isMainAccount) {
            title = `🚨 Main Copier Bot Alert: ${accountRef}`;
            body = details.errorCode === '-2015'
                ? `Main trading bot rejected by Binance (-2015). Signal copy trading is paused for all followers.`
                : `Main trading bot connection is ${details.status.toLowerCase()}${details.errorCode ? ` (${details.errorCode})` : ''}: ${details.errorMessage || 'Check source bot connectivity'}. Copy trading paused.`;
        }
        else {
            title = `⚠️ Trade Copier Alert: ${accountRef}`;
            if (details.errorCode === '-2015') {
                body = `Binance rejected API credentials for ${accountRef} (-2015). This can be caused by IP whitelist restrictions, missing permissions, or an expired key. Check settings.`;
            }
            else if (details.status === 'UNAVAILABLE') {
                body = `Exchange connection unavailable for ${accountRef}: ${details.errorMessage || 'Exchange connection timed out'}.`;
            }
            else {
                body = `Copier error on ${accountRef} (${details.status}): ${details.errorMessage || details.errorCode || 'Action required'}.`;
            }
        }
        // Persist event in copier_notification_events so copier source activity feed displays it
        try {
            const eventId = (0, crypto_1.randomUUID)();
            await (0, database_1.default) `
        INSERT INTO copier_notification_events (event_id, message, occurred_at)
        VALUES (${eventId}, ${`[${accountRef}] ${body}`}, NOW())
        ON CONFLICT (event_id) DO NOTHING
      `;
        }
        catch (err) {
            console.warn('[PushNotifs] Failed to store copier failure event in copier_notification_events:', err);
        }
        // Insert in-app notifications
        for (const uid of recipientUserIds) {
            try {
                await (0, database_1.default) `
          INSERT INTO notifications (user_id, type, message, read)
          VALUES (${uid}, 'copier_alert', ${body}, false)
        `;
            }
            catch {
                // Safe fallback
            }
        }
        // Fetch device tokens for these users
        const tokenRows = await (0, database_1.default) `
      SELECT upt.token, upt.id, upt.user_id
      FROM user_push_tokens upt
      JOIN user_settings settings ON settings.user_id = upt.user_id
      WHERE upt.user_id IN ${(0, database_1.default)(recipientUserIds)}
        AND settings.notifications_enabled = TRUE
    `;
        if (!tokenRows.length) {
            return { sent: true, reason: 'in_app_only_no_push_tokens' };
        }
        const invalidTokenIds = [];
        for (let offset = 0; offset < tokenRows.length; offset += 500) {
            const batch = tokenRows.slice(offset, offset + 500);
            const response = await firebase_1.firebaseMessaging.sendEachForMulticast({
                tokens: batch.map((row) => row.token),
                notification: { title, body },
                data: {
                    type: 'copier_account_failure',
                    accountRef,
                    status: details.status,
                    errorCode: details.errorCode ?? '',
                    isMainAccount: String(isMainAccount),
                },
            });
            response.responses.forEach((result, index) => {
                const code = result.error?.code;
                if (!result.success &&
                    (code === 'messaging/registration-token-not-registered' ||
                        code === 'messaging/invalid-registration-token')) {
                    invalidTokenIds.push(batch[index].id);
                }
            });
        }
        for (const id of invalidTokenIds) {
            await (0, database_1.default) `DELETE FROM user_push_tokens WHERE id = ${id}`;
        }
        return { sent: true };
    }
    catch (error) {
        console.error('[PushNotifs] Copier account failure notification failed', error instanceof Error ? error.name : 'Unknown error');
        return { sent: false, reason: 'error' };
    }
}
//# sourceMappingURL=notificationService.js.map