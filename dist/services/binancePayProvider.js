"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinancePayPaymentProvider = void 0;
exports.isBinancePayConfigured = isBinancePayConfigured;
exports.createBinancePayCheckout = createBinancePayCheckout;
const node_crypto_1 = require("node:crypto");
const BINANCE_PAY_API_URL = 'https://bpay.binanceapi.com/binancepay/openapi/v3/order';
function readConfig() {
    if (process.env.BINANCE_PAY_ENABLED !== 'true')
        throw new Error('BINANCE_PAY_DISABLED');
    const required = [
        'BINANCE_PAY_CERT_SERIAL',
        'BINANCE_PAY_PRIVATE_KEY',
        'BINANCE_PAY_WEBHOOK_CERT_SERIAL',
        'BINANCE_PAY_WEBHOOK_PUBLIC_KEY',
        'BINANCE_PAY_WEBHOOK_URL',
        'BINANCE_PAY_RETURN_URL',
        'BINANCE_PAY_CANCEL_URL',
    ];
    const missing = required.filter((name) => !process.env[name]?.trim());
    if (missing.length)
        throw new Error('BINANCE_PAY_NOT_CONFIGURED');
    const readHttpsUrl = (name) => {
        const value = process.env[name].trim();
        let parsed;
        try {
            parsed = new URL(value);
        }
        catch {
            throw new Error('BINANCE_PAY_CONFIGURATION_INVALID');
        }
        if (parsed.protocol !== 'https:')
            throw new Error('BINANCE_PAY_CONFIGURATION_INVALID');
        return parsed.toString();
    };
    const privateKey = process.env.BINANCE_PAY_PRIVATE_KEY.replace(/\\n/g, '\n');
    const webhookPublicKey = process.env.BINANCE_PAY_WEBHOOK_PUBLIC_KEY.replace(/\\n/g, '\n');
    if (!privateKey.includes('PRIVATE KEY-----') || !webhookPublicKey.includes('PUBLIC KEY-----')) {
        throw new Error('BINANCE_PAY_CONFIGURATION_INVALID');
    }
    return {
        certificateSerial: process.env.BINANCE_PAY_CERT_SERIAL.trim(),
        privateKey,
        webhookCertificateSerial: process.env.BINANCE_PAY_WEBHOOK_CERT_SERIAL.trim(),
        webhookPublicKey,
        webhookUrl: readHttpsUrl('BINANCE_PAY_WEBHOOK_URL'),
        returnUrl: readHttpsUrl('BINANCE_PAY_RETURN_URL'),
        cancelUrl: readHttpsUrl('BINANCE_PAY_CANCEL_URL'),
    };
}
function isBinancePayConfigured() {
    try {
        readConfig();
        return true;
    }
    catch {
        return false;
    }
}
function signaturePayload(timestamp, nonce, body) {
    return `${timestamp}\n${nonce}\n${body}\n`;
}
async function createBinancePayCheckout(input) {
    const config = readConfig();
    const timestamp = Date.now().toString();
    const nonce = (0, node_crypto_1.randomBytes)(16).toString('hex');
    const payload = JSON.stringify({
        env: { terminalType: input.terminalType },
        merchantTradeNo: input.merchantTradeNo,
        orderAmount: Number(input.amount),
        currency: 'USDT',
        goodsDetails: [{
                goodsType: '02',
                goodsCategory: 'Z000',
                referenceGoodsId: `genetrader-${input.planLabel.toLowerCase()}`,
                goodsName: `GeneTrader ${input.planLabel} subscription`,
            }],
        description: `GeneTrader ${input.planLabel} subscription`,
        returnUrl: config.returnUrl,
        cancelUrl: config.cancelUrl,
        webhookUrl: config.webhookUrl,
        orderExpireTime: input.expiresAtMs,
    });
    const signer = (0, node_crypto_1.createSign)('RSA-SHA256');
    signer.update(signaturePayload(timestamp, nonce, payload));
    signer.end();
    const signature = signer.sign(config.privateKey, 'base64');
    const response = await fetch(BINANCE_PAY_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'BinancePay-Timestamp': timestamp,
            'BinancePay-Nonce': nonce,
            'BinancePay-Certificate-SN': config.certificateSerial,
            'BinancePay-Signature': signature,
        },
        body: payload,
        signal: AbortSignal.timeout(15_000),
    });
    let result;
    try {
        result = await response.json();
    }
    catch {
        throw new Error('BINANCE_PAY_RESPONSE_INVALID');
    }
    if (!response.ok || !result || typeof result !== 'object' || Array.isArray(result)) {
        throw new Error('BINANCE_PAY_REQUEST_FAILED');
    }
    const envelope = result;
    const data = envelope.data;
    if (envelope.status !== 'SUCCESS' || !data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('BINANCE_PAY_REQUEST_FAILED');
    }
    const responseData = data;
    if (typeof responseData.checkoutUrl !== 'string')
        throw new Error('BINANCE_PAY_RESPONSE_INVALID');
    let checkoutUrl;
    try {
        checkoutUrl = new URL(responseData.checkoutUrl);
    }
    catch {
        throw new Error('BINANCE_PAY_RESPONSE_INVALID');
    }
    if (checkoutUrl.protocol !== 'https:'
        || !(checkoutUrl.hostname === 'binance.com' || checkoutUrl.hostname.endsWith('.binance.com'))) {
        throw new Error('BINANCE_PAY_RESPONSE_INVALID');
    }
    return {
        checkoutUrl: checkoutUrl.toString(),
        prepayId: typeof responseData.prepayId === 'string' ? responseData.prepayId : null,
    };
}
function parseOccurredAt(value) {
    if (typeof value !== 'string' && typeof value !== 'number')
        throw new Error('EVENT_INVALID');
    const text = String(value);
    const date = typeof value === 'number'
        ? new Date(value)
        : /^\d{13}$/.test(text)
            ? new Date(Number(text))
            : /^\d{10}$/.test(text)
                ? new Date(Number(text) * 1000)
                : new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)
                    ? `${text.replace(' ', 'T')}Z`
                    : text);
    if (!Number.isFinite(date.getTime()))
        throw new Error('EVENT_INVALID');
    return date;
}
class BinancePayPaymentProvider {
    provider = 'binance-pay';
    verifyAndNormalize(rawBody, signature, headers) {
        const config = readConfig();
        const timestamp = headers?.timestamp;
        const nonce = headers?.nonce;
        const certificateSerial = headers?.certificateSerial;
        if (!signature || !timestamp || !nonce || certificateSerial !== config.webhookCertificateSerial
            || !/^\d{10,13}$/.test(timestamp) || !/^[A-Za-z0-9_-]{1,128}$/.test(nonce)) {
            throw new Error('SIGNATURE_INVALID');
        }
        const verifier = (0, node_crypto_1.createVerify)('RSA-SHA256');
        verifier.update(signaturePayload(timestamp, nonce, rawBody.toString('utf8')));
        verifier.end();
        let verified = false;
        try {
            verified = verifier.verify(config.webhookPublicKey, signature, 'base64');
        }
        catch {
            throw new Error('SIGNATURE_INVALID');
        }
        if (!verified)
            throw new Error('SIGNATURE_INVALID');
        let parsed;
        try {
            parsed = JSON.parse(rawBody.toString('utf8'));
        }
        catch {
            throw new Error('EVENT_INVALID');
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
            throw new Error('EVENT_INVALID');
        const notification = parsed;
        if (notification.bizType !== 'PAY' || typeof notification.bizId !== 'string'
            || typeof notification.bizStatus !== 'string')
            throw new Error('EVENT_INVALID');
        if (!['PAY_SUCCESS', 'PAY_FAILED', 'PAY_CLOSED'].includes(notification.bizStatus)) {
            throw new Error('EVENT_INVALID');
        }
        let data = notification.data;
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            }
            catch {
                throw new Error('EVENT_INVALID');
            }
        }
        if (!data || typeof data !== 'object' || Array.isArray(data))
            throw new Error('EVENT_INVALID');
        const payment = data;
        const merchantTradeNo = payment.merchantTradeNo;
        const transactionId = payment.transactionId;
        const rawAmount = payment.totalFee ?? payment.orderAmount;
        const amount = typeof rawAmount === 'string'
            ? rawAmount
            : typeof rawAmount === 'number' && Number.isFinite(rawAmount)
                ? String(rawAmount)
                : null;
        const currency = payment.currency;
        if (typeof merchantTradeNo !== 'string' || !/^[A-Za-z0-9]{1,32}$/.test(merchantTradeNo)
            || (notification.bizStatus === 'PAY_SUCCESS' && (typeof transactionId !== 'string' || typeof amount !== 'string'
                || typeof currency !== 'string' || payment.successTime === undefined)))
            throw new Error('EVENT_INVALID');
        return {
            provider: this.provider,
            eventId: notification.bizId,
            transactionRef: typeof transactionId === 'string' ? transactionId : null,
            providerOrderRef: merchantTradeNo,
            amount,
            currency: typeof currency === 'string' ? currency : null,
            subscriptionRef: null,
            customerRef: merchantTradeNo,
            eventType: notification.bizStatus === 'PAY_SUCCESS' ? 'payment_succeeded' : 'payment_failed',
            occurredAt: parseOccurredAt(notification.bizStatus === 'PAY_SUCCESS' ? payment.successTime : timestamp),
            sequence: null,
            plan: null,
            paidThroughAt: null,
            payloadSha256: (0, node_crypto_1.createHash)('sha256').update(rawBody).digest('hex'),
        };
    }
}
exports.BinancePayPaymentProvider = BinancePayPaymentProvider;
//# sourceMappingURL=binancePayProvider.js.map