"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNeonFetchHandler = createNeonFetchHandler;
const node_crypto_1 = require("node:crypto");
const serverless_http_1 = __importDefault(require("serverless-http"));
function sourceIpFrom(request) {
    const forwarded = request.headers.get('x-forwarded-for');
    const firstForwarded = forwarded?.split(',')[0]?.trim();
    return request.headers.get('cf-connecting-ip')
        ?? request.headers.get('x-real-ip')
        ?? firstForwarded
        ?? '127.0.0.1';
}
function toGatewayEvent(request, body) {
    const url = new URL(request.url);
    const requestId = (0, node_crypto_1.randomUUID)();
    const now = new Date();
    const headers = Object.fromEntries(request.headers.entries());
    return {
        version: '2.0',
        routeKey: '$default',
        rawPath: url.pathname,
        rawQueryString: url.search.slice(1),
        headers,
        body,
        isBase64Encoded: true,
        requestContext: {
            requestId,
            routeKey: '$default',
            stage: '$default',
            time: now.toISOString(),
            timeEpoch: now.getTime(),
            http: {
                method: request.method,
                path: url.pathname,
                protocol: 'HTTP/1.1',
                sourceIp: sourceIpFrom(request),
                userAgent: request.headers.get('user-agent') ?? '',
            },
        },
    };
}
function toFetchResponse(result, method) {
    const status = result.statusCode ?? 502;
    if (!Number.isInteger(status) || status < 200 || status > 599) {
        throw new Error('Express adapter returned an invalid HTTP status.');
    }
    const headers = new Headers();
    for (const [name, value] of Object.entries(result.headers ?? {})) {
        if (typeof value === 'string')
            headers.set(name, value);
    }
    for (const cookie of result.cookies ?? [])
        headers.append('set-cookie', cookie);
    for (const [name, values] of Object.entries(result.multiValueHeaders ?? {})) {
        if (name.toLowerCase() === 'set-cookie') {
            for (const value of values)
                headers.append(name, value);
        }
        else if (!headers.has(name) && values.length) {
            headers.set(name, values.join(', '));
        }
    }
    const noBody = method === 'HEAD' || status === 204 || status === 304;
    const body = noBody
        ? null
        : result.isBase64Encoded
            ? Buffer.from(result.body ?? '', 'base64')
            : result.body ?? '';
    return new Response(body, { status, headers });
}
function createNeonFetchHandler(app, startupValidation = Promise.resolve()) {
    const handleExpress = (0, serverless_http_1.default)(app, { provider: 'aws', binary: true });
    return async (request) => {
        if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
            return new Response('WebSocket upgrades are not handled by the Express API adapter.', {
                status: 426,
                headers: { 'content-type': 'text/plain; charset=utf-8' },
            });
        }
        await startupValidation;
        const body = request.method !== 'GET' && request.method !== 'HEAD'
            ? Buffer.from(await request.arrayBuffer()).toString('base64')
            : '';
        const event = toGatewayEvent(request, body);
        const result = await handleExpress(event, {
            awsRequestId: event.requestContext.requestId,
            functionName: 'genetrader-api',
        });
        return toFetchResponse(result, request.method);
    };
}
//# sourceMappingURL=neonFetchAdapter.js.map