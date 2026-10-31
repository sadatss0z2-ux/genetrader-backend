"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const rateLimiter_1 = require("../middleware/rateLimiter");
const referralService_1 = require("../services/referralService");
const deviceFingerprint_1 = require("../utils/deviceFingerprint");
const router = (0, express_1.Router)();
function normalizeReferralCode(value) {
    const code = value?.trim().toUpperCase() ?? '';
    return /^[A-Z0-9]{1,10}$/.test(code) ? code : null;
}
function unavailablePage(res) {
    res.status(404).type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>GeneTrader referral unavailable</title></head>
<body><main><h1>Referral link unavailable</h1><p>This referral link is invalid or is no longer active.</p></main></body></html>`);
}
function landingPage(code) {
    const appUrl = `genetrader://ref?code=${encodeURIComponent(code)}`;
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="0;url=${appUrl}"><title>Open GeneTrader</title>
<style>body{margin:0;background:#0b111c;color:#fff;font-family:system-ui,sans-serif}main{max-width:420px;margin:20vh auto;padding:24px;text-align:center}a{display:inline-block;margin-top:18px;padding:13px 20px;border-radius:10px;background:#f7931a;color:#0b111c;font-weight:700;text-decoration:none}</style>
</head><body><main><h1>Opening GeneTrader</h1><p>Your invite code has been saved for registration.</p><a href="${appUrl}">Open GeneTrader</a><p>If the app does not open, install or update GeneTrader and then open this link again.</p></main></body></html>`;
}
/**
 * Public referral landing page used by shared URLs. It validates before tracking,
 * records a privacy-minimal click, then hands the browser off to the app scheme.
 */
router.get('/:code', rateLimiter_1.clickLimiter, async (req, res, next) => {
    const code = normalizeReferralCode(typeof req.params.code === 'string' ? req.params.code : undefined);
    if (!code) {
        unavailablePage(res);
        return;
    }
    try {
        const referral = await (0, referralService_1.validateReferralCode)(code);
        if (!referral.valid) {
            unavailablePage(res);
            return;
        }
        await (0, referralService_1.trackClick)({
            code,
            ip: (0, deviceFingerprint_1.getRealIp)(req),
            deviceId: (0, deviceFingerprint_1.getDeviceId)(req),
            userAgent: req.headers['user-agent'] ?? '',
        });
        res.set('Cache-Control', 'no-store').type('html').send(landingPage(code));
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=referralLanding.js.map