"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verificationEmailTemplate = verificationEmailTemplate;
exports.sendVerificationEmail = sendVerificationEmail;
const errorHandler_1 = require("../middleware/errorHandler");
const RESEND_API_URL = 'https://api.resend.com/emails';
function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    })[character]);
}
function verificationEmailTemplate(code, displayName, purpose = 'verification') {
    const safeName = displayName?.trim() ? escapeHtml(displayName.trim()) : 'there';
    const template = {
        subject: `${code} is your GeneTrader verification code`,
        text: `Hi ${displayName?.trim() || 'there'},\n\nYour GeneTrader verification code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.\n\nGeneTrader Support`,
        html: `<!doctype html><html><body style="margin:0;background:#080d16;color:#f4f7fb;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:36px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#111927;border:1px solid #253146;border-radius:16px"><tr><td style="padding:32px"><div style="font-weight:700;letter-spacing:2px;color:#f7931a">GENETRADER</div><h1 style="font-size:24px;margin:28px 0 8px">Verify your email</h1><p style="color:#b4c0d0">Hi ${safeName}, use this one-time code to continue:</p><div style="margin:28px 0;padding:18px;background:#080d16;border:1px solid #253146;border-radius:12px;text-align:center;font:700 34px monospace;letter-spacing:10px;color:#f7931a">${code}</div><p style="color:#b4c0d0">This code expires in 10 minutes. If you did not request it, you can ignore this email.</p><p style="margin-top:32px;color:#748197;font-size:12px">GeneTrader · Non-custodial Binance Spot tools</p></td></tr></table></td></tr></table></body></html>`,
    };
    if (purpose === 'password_reset') {
        return {
            subject: `${code} is your GeneTrader password reset code`,
            text: template.text.replace('verification code', 'password reset code'),
            html: template.html
                .replace('Verify your email', 'Reset your password')
                .replace('use this one-time code to continue:', 'use this one-time code to reset your GeneTrader password:'),
        };
    }
    return template;
}
async function sendVerificationEmail(email, code, displayName, purpose = 'verification') {
    console.log(`[VERIFICATION_CODE] Target: ${email} | Code: ${code} | Purpose: ${purpose}`);
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim();
    if (!apiKey || !from) {
        if (process.env.NODE_ENV === 'production') {
            throw (0, errorHandler_1.createError)('Email verification delivery is not configured. Please contact support.', 503);
        }
        console.warn('[VERIFICATION_CODE] Resend credentials not configured; using console log code for verification.');
        return;
    }
    const template = verificationEmailTemplate(code, displayName, purpose);
    let response;
    try {
        response = await fetch(RESEND_API_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from,
                to: [email],
                subject: template.subject,
                html: template.html,
                text: template.text,
            }),
        });
    }
    catch (error) {
        console.error(`[VERIFICATION_CODE] Network error sending to ${email}:`, error);
        if (process.env.NODE_ENV === 'production') {
            throw (0, errorHandler_1.createError)('Email verification could not be sent. Please try again later.', 503);
        }
        return;
    }
    if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        console.error(`[VERIFICATION_CODE] Resend error ${response.status} for ${email}: ${errorBody}`);
        if (process.env.NODE_ENV === 'production') {
            throw (0, errorHandler_1.createError)('Email verification could not be sent. Please try again later.', 503);
        }
    }
}
//# sourceMappingURL=verificationEmailService.js.map