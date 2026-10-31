"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const app = (0, express_1.default)();
const PORT = 3000;
const JWT_SECRET = 'genetrader-local-dev-jwt-secret';
app.use((0, cors_1.default)({ origin: true, credentials: true }));
app.use(express_1.default.json());
// Log incoming requests
app.use((req, res, next) => {
    console.log(`[MOCK-API] ${req.method} ${req.url}`);
    next();
});
// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});
const defaultUser = {
    id: 1,
    email: 'operator@genetrader.io',
    display_name: 'Operator Alex',
    photo_url: null,
    referral_code: 'GTOPERATOR',
    referred_by_id: null,
    plan: 'OBSERVER',
    created_at: '2026-10-01T00:00:00.000Z',
    last_login_at: '2026-10-04T15:00:00.000Z',
    is_active: true
};
function generateTokens(user) {
    const accessToken = jsonwebtoken_1.default.sign({ userId: user.id, email: user.email, role: 'operator' }, JWT_SECRET, { expiresIn: '30d' });
    const refreshToken = 'dev-refresh-token-' + Math.random().toString(36).substring(2);
    return { accessToken, refreshToken, expiresIn: 2592000 };
}
// ── Auth endpoints ─────────────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
    const email = (req.body.email || 'operator@genetrader.io').trim().toLowerCase();
    const user = { ...defaultUser, email, display_name: email.split('@')[0] };
    const tokens = generateTokens(user);
    console.log(`[MOCK-API] Logged in: ${email}`);
    res.json({ user, ...tokens });
});
app.post('/api/auth/register', (req, res) => {
    const email = (req.body.email || 'operator@genetrader.io').trim().toLowerCase();
    const displayName = req.body.displayName || email.split('@')[0];
    const user = { ...defaultUser, email, display_name: displayName };
    const tokens = generateTokens(user);
    console.log(`[MOCK-API] Registered: ${email}`);
    res.status(201).json({ user, ...tokens });
});
app.post('/api/auth/logout', (req, res) => {
    res.json({ success: true });
});
app.post('/api/auth/refresh', (req, res) => {
    const tokens = generateTokens(defaultUser);
    res.json(tokens);
});
// ── Onboarding status ──────────────────────────────────────────────────────────
app.get('/api/onboarding/status', (req, res) => {
    res.json({ completed: true });
});
app.post('/api/onboarding/complete', (req, res) => {
    res.json({ completed: true });
});
// ── Entitlements ───────────────────────────────────────────────────────────────
const mockEntitlements = {
    observer: {
        status: 'active',
        expires_at: new Date(Date.now() + 14 * 86400000).toISOString(),
        granted_at: new Date().toISOString()
    },
    subscription: {
        status: 'active',
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        plan: 'PRO'
    },
    copier: {
        state: 'active',
        instanceId: 'copier-local-v1'
    }
};
app.get('/api/entitlements', (req, res) => res.json(mockEntitlements));
app.get('/v1/me/entitlements', (req, res) => res.json(mockEntitlements));
app.get('/api/me/entitlements', (req, res) => res.json(mockEntitlements));
// ── Environment status ────────────────────────────────────────────────────────
app.get('/api/environment/status', (req, res) => {
    res.json({
        environment: 'testnet',
        isLive: false,
        canaryApproval: true,
        serverTime: new Date().toISOString()
    });
});
// ── Trading Policy & Halts ────────────────────────────────────────────────────
app.get('/api/policy/halts/global', (req, res) => {
    res.json({ halted: false, reason: null });
});
app.get('/api/policy/symbols', (req, res) => {
    res.json({
        symbols: [
            { symbol: 'BTCUSDT', enabled: true, maxPosition: 1000, maxExposure: 5000 },
            { symbol: 'ETHUSDT', enabled: true, maxPosition: 1000, maxExposure: 5000 },
            { symbol: 'SOLUSDT', enabled: true, maxPosition: 500, maxExposure: 2000 }
        ]
    });
});
// ── Orders & Positions ────────────────────────────────────────────────────────
app.get('/api/orders/positions', (req, res) => {
    res.json([]);
});
app.get('/api/orders', (req, res) => {
    res.json([]);
});
app.get('/api/trading/portfolio', (req, res) => {
    res.json([]);
});
app.get('/api/trading/trades', (req, res) => {
    res.json([]);
});
app.post('/api/trading/sync-balances', (req, res) => {
    res.json({ message: 'Balances synced' });
});
app.post('/api/orders', (req, res) => {
    const body = req.body || {};
    const symbol = String(body.symbol || 'BTCUSDT').toUpperCase();
    const side = String(body.side || 'BUY').toUpperCase();
    const qty = String(body.quantity || '0');
    const rejection = {
        code: 'OBSERVER_TIER_RESTRICTED',
        message: `Observer accounts cannot submit live orders — Connect an exchange or enable Spot Permission to trade ${symbol}.`,
        userPlan: 'OBSERVER',
        canRetry: false,
        hint: 'Go to Account → Exchange Connection & Keys to add a Spot-only API key.',
        triggeredVetoId: 'veto-mock-observer-0001',
        order: {
            id: 'ord-mock-rejected-' + Date.now().toString(36),
            userId: 1,
            symbol,
            side,
            type: String(body.type || 'MARKET'),
            quantity: qty,
            price: null,
            stopPrice: null,
            timeInForce: 'GTC',
            state: 'REJECTED',
            status: 'REJECTED',
            binanceOrderId: null,
            clientOrderId: 'cli-mock-' + Math.random().toString(36).slice(2, 10),
            decisionCandidateId: 'dc-mock-rejected-' + Math.random().toString(36).slice(2, 8),
            authorizationId: 'authz-mock-observer-reject',
            createdAt: Date.now(),
            updatedAt: Date.now(),
        },
    };
    console.log(`[MOCK-API] Order REJECTED (Observer): ${side} ${qty} ${symbol}`);
    res.status(403).json(rejection);
});
// ── Market data & snapshots ───────────────────────────────────────────────────
app.get('/api/market/snapshot/:symbol', (req, res) => {
    const symbol = (String(req.params.symbol || 'BTCUSDT')).toUpperCase();
    res.json({
        symbol,
        ticker: { price: '64500.00', change24h: '+2.45%', high24h: '65200.00', low24h: '63800.00', volume24h: '18500' },
        fresh: true,
        stale: false,
        sourceTimestamp: new Date().toISOString(),
        receivedTimestamp: new Date().toISOString()
    });
});
app.get('/api/market/status', (req, res) => {
    res.json({ status: 'connected', fresh: true });
});
// ── Decisions & Risk ──────────────────────────────────────────────────────────
const MOCK_REGIMES = {
    BTCUSDT: { regime: 'Low_Vol_Choppy', confidence: 0.72, eligible: true, regimeFlags: ['ADX<20', 'RangeBound'] },
    ETHUSDT: { regime: 'Momentum_Breakout', confidence: 0.88, eligible: true, regimeFlags: ['ADX>35', 'HigherHighs'] },
    SOLUSDT: { regime: 'High_Vol_Whipsaw', confidence: 0.81, eligible: false, regimeFlags: ['IV_Rank>80', 'LiquidityTight'] },
};
app.get('/api/decisions/regimes/:symbol', (req, res) => {
    const symbol = String(req.params.symbol || 'BTCUSDT').toUpperCase();
    const base = MOCK_REGIMES[symbol] ?? MOCK_REGIMES.BTCUSDT;
    res.json({
        id: 'reg-' + symbol.toLowerCase() + '-' + Date.now().toString(36),
        userId: 1,
        symbol,
        strategyVersion: 'genetrader-core-v1.4.2',
        computedAt: Date.now(),
        ...base,
    });
});
const MOCK_SIGNAL_RULES = [
    { ruleId: 'rule-mfi-oversold-v1', ruleName: 'MFI Oversold Divergence', ruleVersion: '1.2.0', result: true, weight: 0.18 },
    { ruleId: 'rule-vol-spread-v2', ruleName: 'Bid/Ask Spread Acceptance', ruleVersion: '2.0.1', result: true, weight: 0.10 },
    { ruleId: 'rule-regime-elig-v1', ruleName: 'Regime Eligibility Gate', ruleVersion: '1.0.3', result: false, weight: 0.30 },
    { ruleId: 'rule-exposure-cap-v1', ruleName: 'Portfolio Exposure Cap', ruleVersion: '1.1.0', result: true, weight: 0.15 },
    { ruleId: 'rule-liq-depth-v1', ruleName: 'Order Book Liquidity Depth', ruleVersion: '1.3.1', result: true, weight: 0.12 },
    { ruleId: 'rule-vol-atr-v1', ruleName: 'ATR 24h Volatility Filter', ruleVersion: '1.1.2', result: false, weight: 0.15 },
];
const MOCK_CANDIDATE = {
    id: 'dc-btcusdt-0001-observer-veto',
    userId: 1,
    symbol: 'BTCUSDT',
    strategyVersion: 'genetrader-core-v1.4.2',
    regimeResultId: 'reg-btcusdt-' + Date.now().toString(36),
    featureSnapshotId: 'fs-btcusdt-' + Date.now().toString(36),
    proposedAt: Date.now() - 90_000,
    action: 'BUY',
    quantity: '0.01',
    price: '64500.00',
    orderType: 'MARKET',
    status: 'REJECTED',
    approvedAt: null,
    rejectedAt: Date.now() - 30_000,
    rejectionReason: 'Observer plan + Regime Eligibility Gate FAIL + ATR Vol Filter FAIL',
    signalRules: MOCK_SIGNAL_RULES,
};
app.get('/api/decisions/candidates', (req, res) => {
    const qSym = (String(req.query.symbol || '')).toUpperCase();
    const candidates = qSym && qSym !== MOCK_CANDIDATE.symbol
        ? [{ ...MOCK_CANDIDATE, id: 'dc-' + qSym.toLowerCase() + '-0001', symbol: qSym, proposedAt: Date.now() - 60_000 }]
        : [MOCK_CANDIDATE];
    res.json({ candidates, count: candidates.length });
});
app.get('/api/decisions/candidates/:id', (req, res) => {
    const candidate = { ...MOCK_CANDIDATE, id: req.params.id || MOCK_CANDIDATE.id };
    res.json({
        candidate,
        ruleResults: MOCK_SIGNAL_RULES.map((r, idx) => ({
            id: 'rr-' + r.ruleId + '-' + idx,
            userId: 1,
            decisionCandidateId: candidate.id,
            ruleId: r.ruleId,
            ruleName: r.ruleName,
            ruleVersion: r.ruleVersion,
            evaluatedAt: Date.now() - 120_000 + idx * 500,
            result: (r.result ? 'PASS' : 'FAIL'),
            reason: r.result
                ? `${r.ruleName} within threshold — weight ${r.weight}`
                : `${r.ruleName} exceeded threshold (Regime=Low_Vol_Choppy / ATR_z>1.8) — weight ${r.weight}`,
            ruleType: idx < 2 ? 'execution' : idx < 4 ? 'risk' : 'sizing',
        })),
        featureSnapshot: {
            id: 'fs-btcusdt-' + Date.now().toString(36),
            userId: 1,
            symbol: candidate.symbol,
            strategyVersion: 'genetrader-core-v1.4.2',
            computedAt: Date.now() - 180_000,
            price: '64500.00',
            volatility: '0.0214',
            spread: '0.00012',
            liquidity: '3.2',
            features: { atr_z: 1.84, adx_14: 17.2, mfi_14: 28.6, spread_bps: 1.2, depth_1pct_usd: 1285000 },
        },
        regimeResult: {
            id: 'reg-btcusdt-' + Date.now().toString(36),
            userId: 1,
            symbol: candidate.symbol,
            strategyVersion: 'genetrader-core-v1.4.2',
            computedAt: Date.now() - 240_000,
            regime: 'Low_Vol_Choppy',
            confidence: 0.72,
            eligible: true,
            regimeFlags: ['ADX<20', 'RangeBound'],
        },
    });
});
app.get('/api/decisions/features/:symbol', (req, res) => {
    const symbol = String(req.params.symbol || 'BTCUSDT').toUpperCase();
    res.json({
        id: 'fs-' + symbol.toLowerCase() + '-' + Date.now().toString(36),
        userId: 1,
        symbol,
        strategyVersion: 'genetrader-core-v1.4.2',
        computedAt: Date.now() - 180_000,
        price: '64500.00',
        volatility: '0.0214',
        spread: '0.00012',
        liquidity: '3.2',
        features: { atr_z: 1.84, adx_14: 17.2, mfi_14: 28.6, spread_bps: 1.2, depth_1pct_usd: 1285000 },
    });
});
app.get('/api/risk/assessments', (req, res) => res.json([]));
const MOCK_VETOES = [
    {
        id: 'veto-mock-observer-0001',
        candidateId: MOCK_CANDIDATE.id,
        symbol: 'BTCUSDT',
        signal: 'BUY',
        confidence: 0.94,
        reason: 'Observer tier cannot submit live orders + Regime Eligibility Gate FAIL (Low_Vol_Choppy) + ATR 24h Volatility Filter FAIL (ATR_z=1.84)',
        reasonCategory: 'Regime',
        time: new Date(Date.now() - 30_000).toISOString(),
        timestamp: Date.now() - 30_000,
        ruleResults: [
            { ruleId: 'rule-regime-elig-v1', ruleName: 'Regime Eligibility Gate', result: 'FAIL', reason: 'Regime=Low_Vol_Choppy eligible=true but ADX<20 — operator consent required' },
            { ruleId: 'rule-vol-atr-v1', ruleName: 'ATR 24h Volatility Filter', result: 'FAIL', reason: 'ATR_z=1.84 exceeds 1.50 max for unmonitored entries' },
        ],
    },
    {
        id: 'veto-mock-exposure-0002',
        candidateId: 'dc-btcusdt-0000-prev',
        symbol: 'BTCUSDT',
        signal: 'BUY',
        confidence: 0.71,
        reason: 'Portfolio BTC exposure would reach 41% — exceeds 35% single-asset cap',
        reasonCategory: 'Exposure',
        time: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
        timestamp: Date.now() - 1000 * 60 * 60 * 2,
        ruleResults: [
            { ruleId: 'rule-exposure-cap-v1', ruleName: 'Portfolio Exposure Cap', result: 'FAIL', reason: 'Proposed 0.01 BTC @ 64500 → 41% weight vs 35% cap' },
        ],
    },
    {
        id: 'veto-mock-liq-0003',
        candidateId: 'dc-solusdt-0000-prev',
        symbol: 'SOLUSDT',
        signal: 'BUY',
        confidence: 0.83,
        reason: 'SOL order book 1% depth < $250k — insufficient for $645 notional without slippage > 10bps',
        reasonCategory: 'Liquidity',
        time: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
        timestamp: Date.now() - 1000 * 60 * 60 * 5,
        ruleResults: [
            { ruleId: 'rule-liq-depth-v1', ruleName: 'Order Book Liquidity Depth', result: 'FAIL', reason: '1% depth = $218k < $250k minimum for marketable size' },
        ],
    },
];
app.get('/api/risk/vetoes', (req, res) => {
    res.json({
        totalVetoes: MOCK_VETOES.length,
        byCategory: {
            Volatility: 1,
            Exposure: 1,
            Regime: 1,
            Liquidity: 1,
        },
        vetoes: MOCK_VETOES,
    });
});
// ── User & Account ────────────────────────────────────────────────────────────
app.get('/api/users/me', (req, res) => res.json({ user: defaultUser }));
app.get('/api/account/settings', (req, res) => res.json({ settings: {} }));
// ── Catch-all 200 for any other API route ─────────────────────────────────────
app.all('/api/*', (req, res) => {
    res.json({ ok: true, data: {} });
});
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[MOCK-API] GeneTrader dev mock backend listening on http://localhost:${PORT}`);
});
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
//# sourceMappingURL=mock-server.js.map