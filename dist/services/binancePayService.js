"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCheckoutSession = createCheckoutSession;
exports.listCheckoutSessions = listCheckoutSessions;
const node_crypto_1 = require("node:crypto");
const database_1 = __importDefault(require("../config/database"));
const paymentPlans_1 = require("../config/paymentPlans");
const errorHandler_1 = require("../middleware/errorHandler");
const binancePayProvider_1 = require("./binancePayProvider");
async function createCheckoutSession(userId, planKey, terminalType) {
    const plan = (0, paymentPlans_1.getPaymentPlan)(planKey);
    if (!plan)
        throw (0, errorHandler_1.createError)('Unsupported subscription plan.', 400);
    if (!(0, binancePayProvider_1.isBinancePayConfigured)()) {
        throw (0, errorHandler_1.createError)('Automated Binance Pay checkout is not configured.', 503);
    }
    const id = (0, node_crypto_1.randomUUID)();
    const merchantTradeNo = (0, node_crypto_1.randomUUID)().replaceAll('-', '');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await database_1.default.begin(async (tx) => {
        const users = await tx `
      SELECT id, is_active, identity_verified_at
      FROM users WHERE id = ${userId} FOR UPDATE
    `;
        if (!users[0]?.is_active || !users[0].identity_verified_at) {
            throw (0, errorHandler_1.createError)('An active account with verified identity is required to start checkout.', 403);
        }
        await tx `
      UPDATE billing_checkout_sessions SET status = 'EXPIRED', updated_at = NOW()
      WHERE user_id = ${userId} AND status IN ('CREATING', 'PENDING') AND expires_at <= NOW()
    `;
        const pending = await tx `
      SELECT id FROM billing_checkout_sessions
      WHERE user_id = ${userId} AND status IN ('CREATING', 'PENDING') AND expires_at > NOW()
      LIMIT 1
    `;
        if (pending.length)
            throw (0, errorHandler_1.createError)('A Binance Pay checkout is already awaiting payment.', 409);
        const pendingManualRequest = await tx `
      SELECT id FROM manual_payment_proofs
      WHERE user_id = ${userId} AND status = 'PENDING'
      LIMIT 1
    `;
        if (pendingManualRequest.length) {
            throw (0, errorHandler_1.createError)('A subscription request is already awaiting review.', 409);
        }
        await tx `
      INSERT INTO billing_checkout_sessions
        (id, user_id, provider, merchant_trade_no, plan_key, amount, currency, status, expires_at)
      VALUES (${id}, ${userId}, 'binance-pay', ${merchantTradeNo}, ${plan.key},
        ${plan.price.toFixed(2)}, ${plan.currency}, 'CREATING', ${expiresAt})
    `;
    });
    try {
        const checkout = await (0, binancePayProvider_1.createBinancePayCheckout)({
            merchantTradeNo,
            amount: plan.price.toFixed(2),
            planLabel: plan.label,
            terminalType,
            expiresAtMs: expiresAt.getTime(),
        });
        const rows = await (0, database_1.default) `
      UPDATE billing_checkout_sessions
      SET status = 'PENDING', checkout_url = ${checkout.checkoutUrl},
        provider_prepay_id = ${checkout.prepayId}, updated_at = NOW()
      WHERE id = ${id} AND status = 'CREATING'
      RETURNING id, plan_key, amount::text, currency, status, checkout_url, expires_at, created_at
    `;
        if (!rows.length)
            throw (0, errorHandler_1.createError)('The checkout session could not be finalized.', 503);
        return rows[0];
    }
    catch (error) {
        await (0, database_1.default) `
      UPDATE billing_checkout_sessions
      SET status = 'REVIEW_REQUIRED', updated_at = NOW()
      WHERE id = ${id} AND status = 'CREATING'
    `;
        if (error instanceof Error && error.message === 'BINANCE_PAY_NOT_CONFIGURED') {
            throw (0, errorHandler_1.createError)('Automated Binance Pay checkout is not configured.', 503);
        }
        if (error instanceof Error && 'statusCode' in error)
            throw error;
        console.error('[BILLING] Binance Pay order creation failed; the session requires reconciliation.');
        throw (0, errorHandler_1.createError)('Binance Pay could not create checkout. No subscription access was granted.', 502);
    }
}
async function listCheckoutSessions(userId) {
    await (0, database_1.default) `
    UPDATE billing_checkout_sessions SET status = 'EXPIRED', updated_at = NOW()
    WHERE user_id = ${userId} AND status IN ('CREATING', 'PENDING') AND expires_at <= NOW()
  `;
    return (0, database_1.default) `
    SELECT id, plan_key, amount::text, currency, status, checkout_url, expires_at, created_at
    FROM billing_checkout_sessions
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 20
  `;
}
//# sourceMappingURL=binancePayService.js.map