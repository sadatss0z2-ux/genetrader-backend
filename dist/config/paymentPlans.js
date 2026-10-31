"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PAYMENT_PLANS = void 0;
exports.getPaymentPlan = getPaymentPlan;
exports.addPaymentPlanDuration = addPaymentPlanDuration;
exports.PAYMENT_PLANS = Object.freeze([
    {
        key: 'monthly',
        label: 'Monthly',
        price: 9.9,
        currency: 'USDT',
        duration: 'month',
        paymentUrl: 'https://app.binance.com/uni-qr/request-to-pay?billOrderId=456406845401726976&billType=request_a_payment',
    },
    {
        key: 'yearly',
        label: 'Yearly',
        price: 49.9,
        currency: 'USDT',
        duration: 'year',
        paymentUrl: 'https://app.binance.com/uni-qr/request-to-pay?billOrderId=456406999973543936&billType=request_a_payment',
    },
]);
function getPaymentPlan(key) {
    return exports.PAYMENT_PLANS.find((plan) => plan.key === key);
}
function addPaymentPlanDuration(from, plan) {
    const result = new Date(from);
    if (plan.duration === 'month') {
        const day = result.getUTCDate();
        result.setUTCDate(1);
        result.setUTCMonth(result.getUTCMonth() + 1);
        const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
        result.setUTCDate(Math.min(day, lastDay));
        return result;
    }
    const month = result.getUTCMonth();
    const day = result.getUTCDate();
    result.setUTCDate(1);
    result.setUTCFullYear(result.getUTCFullYear() + 1);
    result.setUTCMonth(month);
    const lastDay = new Date(Date.UTC(result.getUTCFullYear(), month + 1, 0)).getUTCDate();
    result.setUTCDate(Math.min(day, lastDay));
    return result;
}
//# sourceMappingURL=paymentPlans.js.map