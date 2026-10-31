"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetSendCooldownForTesting = resetSendCooldownForTesting;
exports.binanceIpGuideEmailTemplate = binanceIpGuideEmailTemplate;
exports.sendBinanceIpGuideEmail = sendBinanceIpGuideEmail;
const errorHandler_1 = require("../middleware/errorHandler");
const database_1 = __importDefault(require("../config/database"));
const entitlementService_1 = require("./entitlementService");
const RESEND_API_URL = 'https://api.resend.com/emails';
const SEND_COOLDOWN_MS = 60 * 1000; // 60 seconds per account
const lastSendByAccount = new Map();
function resetSendCooldownForTesting() {
    lastSendByAccount.clear();
}
function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    })[character]);
}
function binanceIpGuideEmailTemplate(data) {
    const safeName = data.displayName?.trim() ? escapeHtml(data.displayName.trim()) : 'there';
    const safeAccount = escapeHtml(data.accountRef);
    const safeIp = escapeHtml(data.egressIp);
    const checkedIso = data.ipCheckedAt.toISOString();
    const checkedHuman = data.ipCheckedAt.toUTCString();
    const subject = `[GeneTrader] Action Required: Binance API Setup & IP Whitelist Guide for ${data.accountRef}`;
    const text = `Hi ${data.displayName?.trim() || 'there'},

We detected that your linked live account "${data.accountRef}" is experiencing a Binance API connection issue.

Current Status:
${data.currentErrorCode ? `- Binance Error Code: ${data.currentErrorCode}` : '- Connection state: Unavailable / Timeout'}
${data.currentErrorMessage ? `- Details: ${data.currentErrorMessage}` : ''}

Important Context on Binance Error -2015:
Binance error -2015 ("Invalid API-key, IP, or permissions for action") can be caused by:
1. An IP restriction whitelist on Binance that does not include the bot host PC's current public IP.
2. Missing API permissions (such as Spot & Margin Reading or Trading not being enabled).
3. The API key being revoked, deleted, expired, or mistyped.
IP whitelisting is a common cause, but not definitely the only cause.

Host PC Public Egress IP (Checked at ${checkedHuman}):
${data.egressIp}

Required Setup Steps in Binance API Management:
1. Log in to your Binance account and navigate to API Management:
   https://www.binance.com/en/my/settings/api-management
2. Locate the API key associated with your GeneTrader account ("${data.accountRef}").
3. Click "Edit restrictions" (complete your 2FA verification if prompted).
4. In "IP Access Restrictions", select "Restrict access to trusted IPs only (Recommended)".
5. Add the following public IP address:
   ${data.egressIp}
   Click "Confirm".
6. Under "API Restrictions", verify the permissions:
   - Enable Reading: CHECKED (REQUIRED)
   - Enable Spot & Margin Trading: CHECKED (REQUIRED)
   - Enable Withdrawals: UNCHECKED / DISABLED (CRITICAL SECURITY REQUIREMENT)
   GeneTrader is strictly non-custodial and will NEVER require withdrawal permissions. Keep withdrawals disabled.
7. Click "Save" and complete the 2FA confirmation prompt.

What if your API Key is revoked or invalid?
If the key itself was deleted, expired, or revoked, generate a fresh API key and secret on Binance. Then update your credentials securely through the GeneTrader app's credential flow or contact your system administrator.
SECURITY WARNING: NEVER send API keys or API secrets via email, chat, or support tickets.

Official Binance Instructions & Verification:
- Binance API Management Console: https://www.binance.com/en/my/settings/api-management
- How to Create API Keys & IP Restrictions on Binance: https://www.binance.com/en/support/faq/how-to-create-api-keys-on-binance-360002502072
- Official Guide on IP Whitelisting: https://www.binance.com/en/support/faq/how-to-use-ip-whitelist-for-api-keys-on-binance-6506d51381e44ae5b0907d4b29bb88ff
- Binance FAQ: Error -2015 Troubleshooting: https://www.binance.com/en/support/faq/why-do-i-see-the-error-invalid-api-key-ip-or-permissions-for-action-2015-188846c4f03c4f749504f76235b2e987

(Note: To comply with strict security standards, official documentation links are provided above rather than AI-generated mock screenshots.)

Regards,
GeneTrader Platform Operations
support@genetrader.site
`;
    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#080d16;color:#f4f7fb;font-family:Arial,-apple-system,BlinkMacSystemFont,sans-serif;-webkit-font-smoothing:antialiased">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px;background:#080d16">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;background:#111927;border:1px solid #253146;border-radius:16px;overflow:hidden">
          <tr>
            <td style="padding:32px">
              <!-- Header Brand -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="font-weight:700;letter-spacing:2px;color:#f7931a;font-size:14px">GENETRADER</div>
                    <div style="font-size:11px;color:#748197;margin-top:2px">Non-custodial Binance Trading Systems</div>
                  </td>
                  <td align="right">
                    <span style="display:inline-block;padding:4px 10px;font-size:10px;font-weight:600;letter-spacing:0.5px;color:#f7931a;background:rgba(247,147,26,0.12);border:1px solid rgba(247,147,26,0.3);border-radius:9999px">
                      API SETUP GUIDE
                    </span>
                  </td>
                </tr>
              </table>

              <!-- Title -->
              <h1 style="font-size:22px;margin:24px 0 8px;color:#ffffff;line-height:1.3">
                Binance API &amp; IP Restriction Setup
              </h1>
              <p style="color:#b4c0d0;font-size:13px;line-height:1.5;margin:0 0 20px">
                Hi ${safeName}, your linked live account <strong style="color:#ffffff">${safeAccount}</strong> is reporting a Binance exchange connection failure. Follow the verified steps below to inspect your key permissions and whitelist the trading bot host IP.
              </p>

              <!-- Diagnostic Notice -->
              <div style="margin:20px 0;padding:14px 16px;background:#171f30;border-left:4px solid #f7931a;border-radius:6px">
                <div style="font-size:11px;font-weight:700;color:#f7931a;text-transform:uppercase;letter-spacing:0.5px">Important Diagnostic Notice</div>
                <div style="font-size:12px;color:#d0d8e2;margin-top:6px;line-height:1.5">
                  ${data.currentErrorCode ? `<strong>Reported Code:</strong> Binance error <code>${escapeHtml(data.currentErrorCode)}</code><br>` : ''}
                  ${data.currentErrorMessage ? `<strong>Exchange message:</strong> ${escapeHtml(data.currentErrorMessage)}<br>` : ''}
                  <strong>What Binance error -2015 means:</strong> A <code>-2015</code> ("Invalid API-key, IP, or permissions for action") code can indicate an IP restriction mismatch, missing Spot trading permissions, or an expired/revoked key. <em>IP whitelisting is a likely cause, but not definitely the only cause.</em>
                </div>
              </div>

              <!-- Egress IP Highlight Box -->
              <div style="margin:24px 0;padding:20px;background:#080d16;border:1px solid #2d3b55;border-radius:12px;text-align:center">
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#8f9fb5">Host PC Public Egress IP</div>
                <div style="margin:10px 0;font:700 28px monospace;letter-spacing:1px;color:#f7931a">
                  ${safeIp}
                </div>
                <div style="font-size:11px;color:#6b7a90">
                  Verified from the bot host PC · Checked at <span style="color:#a0afc5">${escapeHtml(checkedHuman)}</span>
                </div>
              </div>

              <!-- Step-by-Step Instructions -->
              <div style="margin:28px 0 16px">
                <h2 style="font-size:15px;color:#ffffff;margin:0 0 14px;border-bottom:1px solid #253146;padding-bottom:8px">
                  Step-by-Step Binance Configuration
                </h2>

                <ol style="margin:0;padding-left:20px;color:#d0d8e2;font-size:13px;line-height:1.7">
                  <li style="margin-bottom:10px">
                    Log in to <a href="https://www.binance.com/en/my/settings/api-management" style="color:#f7931a;text-decoration:none;font-weight:600">Binance API Management</a> on your verified account.
                  </li>
                  <li style="margin-bottom:10px">
                    Locate the API key created for <strong style="color:#ffffff">${safeAccount}</strong> and click <strong style="color:#ffffff">Edit restrictions</strong>. Complete 2FA verification.
                  </li>
                  <li style="margin-bottom:10px">
                    Under <strong style="color:#ffffff">IP Access Restrictions</strong>, select:
                    <div style="margin:6px 0 6px;padding:8px 12px;background:#0d1422;border-radius:6px;font-size:12px">
                      🔘 <strong>Restrict access to trusted IPs only (Recommended)</strong>
                    </div>
                    Enter the public IP above: <code style="color:#f7931a;font-weight:bold">${safeIp}</code> and click <strong style="color:#ffffff">Confirm</strong>.
                  </li>
                  <li style="margin-bottom:10px">
                    Under <strong style="color:#ffffff">API Restrictions</strong>, configure permissions:
                    <div style="margin:6px 0;padding:10px 14px;background:#0d1422;border-radius:6px;font-size:12px;line-height:1.6">
                      ✅ <strong>Enable Reading</strong> — <em>Checked</em> (Required for balance sync)<br>
                      ✅ <strong>Enable Spot &amp; Margin Trading</strong> — <em>Checked</em> (Required for trade execution)<br>
                      ❌ <strong style="color:#f87171">Enable Withdrawals</strong> — <strong style="color:#f87171">DISABLED</strong> (CRITICAL SECURITY RULE)
                    </div>
                  </li>
                  <li style="margin-bottom:10px">
                    Click <strong style="color:#ffffff">Save</strong> and complete your 2FA verification prompt.
                  </li>
                </ol>
              </div>

              <!-- Security Caution -->
              <div style="margin:24px 0;padding:14px 16px;background:rgba(244,63,94,0.08);border:1px solid rgba(244,63,94,0.25);border-radius:8px">
                <div style="font-size:12px;font-weight:700;color:#f87171">⚠️ Security Warning on Revoked / Invalid Keys</div>
                <div style="font-size:12px;color:#e2b6be;margin-top:4px;line-height:1.5">
                  If your API key was revoked, expired, or deleted, create a new API key on Binance. Then update it securely through the GeneTrader mobile app credential flow or contact the platform administrator.<br>
                  <strong style="color:#ffffff">NEVER share or send your API Key or Secret Key via email or messaging platforms.</strong>
                </div>
              </div>

              <!-- Official Binance Documentation Links -->
              <div style="margin:24px 0;padding:16px;background:#0d1422;border:1px solid #1f2a3e;border-radius:10px">
                <div style="font-size:11px;font-weight:700;color:#9bb0cc;text-transform:uppercase;letter-spacing:0.5px">Official Binance Documentation</div>
                <ul style="margin:8px 0 0;padding-left:18px;font-size:12px;color:#a0afc5;line-height:1.7">
                  <li><a href="https://www.binance.com/en/my/settings/api-management" style="color:#f7931a;text-decoration:none">Binance API Management Console</a></li>
                  <li><a href="https://www.binance.com/en/support/faq/how-to-create-api-keys-on-binance-360002502072" style="color:#f7931a;text-decoration:none">Binance FAQ: How to Create API Keys &amp; Set IP Whitelist</a></li>
                  <li><a href="https://www.binance.com/en/support/faq/how-to-use-ip-whitelist-for-api-keys-on-binance-6506d51381e44ae5b0907d4b29bb88ff" style="color:#f7931a;text-decoration:none">Binance FAQ: How to Use IP Whitelist for API Keys</a></li>
                  <li><a href="https://www.binance.com/en/support/faq/why-do-i-see-the-error-invalid-api-key-ip-or-permissions-for-action-2015-188846c4f03c4f749504f76235b2e987" style="color:#f7931a;text-decoration:none">Binance FAQ: Troubleshooting Error -2015</a></li>
                </ul>
                <div style="margin-top:10px;font-size:11px;color:#6b7a90;font-style:italic">
                  Note: Official Binance documentation is linked directly above. In accordance with platform security standards, no simulated UI mockups are presented.
                </div>
              </div>

              <!-- Footer -->
              <div style="margin-top:32px;padding-top:20px;border-top:1px solid #202b3f;color:#6b7a90;font-size:11px;line-height:1.5">
                Sent to <span style="color:#9bb0cc">${escapeHtml(data.recipientEmail)}</span> regarding live account <span style="color:#9bb0cc">${safeAccount}</span>.<br>
                GeneTrader Platform Operations · Non-custodial Binance Spot automated trading.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
    return { subject, html, text };
}
/**
 * Validates the operator-managed account, rate limits, sends the setup guide via Resend,
 * and records an entitlement audit event without sensitive credentials.
 */
async function sendBinanceIpGuideEmail(input) {
    const accountRef = input.accountRef.trim();
    if (!accountRef || !/^[A-Za-z0-9._:-]{1,255}$/.test(accountRef)) {
        throw (0, errorHandler_1.createError)('Invalid account reference', 400);
    }
    // Rate-limiting check per account
    const lastSend = lastSendByAccount.get(accountRef) ?? 0;
    const elapsed = Date.now() - lastSend;
    if (elapsed < SEND_COOLDOWN_MS) {
        const waitSeconds = Math.ceil((SEND_COOLDOWN_MS - elapsed) / 1000);
        throw (0, errorHandler_1.createError)(`An IP setup guide for ${accountRef} was sent recently. Please wait ${waitSeconds} seconds before sending another.`, 429);
    }
    // Look up target operator-managed live account and linked owner
    const rows = await (0, database_1.default) `
    SELECT m.account_ref, m.account_kind, m.user_id, u.email, u.display_name
    FROM operator_managed_live_accounts m
    JOIN users u ON u.id = m.user_id
    WHERE m.account_ref = ${accountRef} AND m.active = TRUE
    LIMIT 1
  `;
    if (!rows.length) {
        throw (0, errorHandler_1.createError)(`Operator-managed live account '${accountRef}' was not found.`, 404);
    }
    const targetAccount = rows[0];
    const recipientEmail = targetAccount.email.trim().toLowerCase();
    // Look up latest connection status and exchange error code from copier_portfolio_accounts
    const accountStatsRows = await (0, database_1.default) `
    SELECT stats FROM copier_portfolio_accounts
    WHERE account_name = ${accountRef}
    ORDER BY observed_at DESC LIMIT 1
  `;
    const stats = accountStatsRows[0]?.stats ?? {};
    const currentErrorCode = typeof stats.exchange_error_code === 'string' ? stats.exchange_error_code : null;
    const currentErrorMessage = typeof stats.exchange_error_message === 'string' ? stats.exchange_error_message : null;
    const template = binanceIpGuideEmailTemplate({
        accountRef,
        recipientEmail,
        displayName: targetAccount.display_name,
        egressIp: input.egressIp,
        ipCheckedAt: input.ipCheckedAt,
        currentErrorCode,
        currentErrorMessage,
    });
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim();
    if (!apiKey || !from) {
        throw (0, errorHandler_1.createError)('Email delivery is not configured on this server.', 503);
    }
    let messageId;
    try {
        const response = await fetch(RESEND_API_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from,
                to: [recipientEmail],
                subject: template.subject,
                html: template.html,
                text: template.text,
            }),
        });
        if (!response.ok) {
            const errorBody = await response.text().catch(() => '');
            throw new Error(`Resend provider returned HTTP ${response.status}: ${errorBody.slice(0, 200)}`);
        }
        const payload = await response.json();
        if (!payload?.id || typeof payload.id !== 'string') {
            throw new Error('Resend provider returned an invalid acceptance response without an ID.');
        }
        messageId = payload.id;
        lastSendByAccount.set(accountRef, Date.now());
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        // Record failure in audit log
        await database_1.default.begin(async (tx) => {
            await (0, entitlementService_1.writeEntitlementAudit)(tx, {
                userId: targetAccount.user_id,
                actorType: 'OPERATOR',
                actorRef: String(input.masterUserId),
                eventType: 'BINANCE_IP_SETUP_GUIDE_FAILED',
                subjectType: 'operator_managed_live_account',
                subjectRef: accountRef,
                details: {
                    account_ref: accountRef,
                    recipient_email: recipientEmail,
                    ip: input.egressIp,
                    ip_checked_at: input.ipCheckedAt.toISOString(),
                    delivery_provider: 'resend',
                    delivery_status: 'FAILED',
                    error: errorMsg,
                },
            });
        }).catch(() => { });
        throw (0, errorHandler_1.createError)(`Failed to send setup guide email: ${errorMsg}`, 502);
    }
    // Record success in audit log
    await database_1.default.begin(async (tx) => {
        await (0, entitlementService_1.writeEntitlementAudit)(tx, {
            userId: targetAccount.user_id,
            actorType: 'OPERATOR',
            actorRef: String(input.masterUserId),
            eventType: 'BINANCE_IP_SETUP_GUIDE_SENT',
            subjectType: 'operator_managed_live_account',
            subjectRef: accountRef,
            details: {
                account_ref: accountRef,
                recipient_email: recipientEmail,
                ip: input.egressIp,
                ip_checked_at: input.ipCheckedAt.toISOString(),
                delivery_provider: 'resend',
                delivery_status: 'ACCEPTED',
                message_id: messageId,
            },
        });
    });
    return {
        sent: true,
        messageId,
        recipientEmail,
        accountRef,
        egressIp: input.egressIp,
        ipCheckedAt: input.ipCheckedAt.toISOString(),
    };
}
//# sourceMappingURL=binanceSetupGuideEmailService.js.map