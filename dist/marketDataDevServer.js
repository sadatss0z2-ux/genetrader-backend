"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const http_1 = __importDefault(require("http"));
const express_1 = __importDefault(require("express"));
const market_1 = require("./routes/market");
const binancePublicMarketFeed_1 = require("./services/binancePublicMarketFeed");
const app = (0, express_1.default)();
const port = Number(process.env.MARKET_DATA_PORT ?? 3000);
const host = process.env.MARKET_DATA_HOST ?? '127.0.0.1';
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'public-market-data', timestamp: new Date().toISOString() });
});
app.use('/api/market', market_1.marketRouter);
const server = http_1.default.createServer(app);
const marketWss = (0, market_1.attachMarketWss)(server);
const publicMarketFeed = new binancePublicMarketFeed_1.BinancePublicMarketFeed(market_1.marketDataService, {
    symbols: process.env.MARKET_FEED_SYMBOLS?.split(',').map((symbol) => symbol.trim()).filter(Boolean),
});
(0, market_1.setPublicMarketFeedStatusProvider)(() => publicMarketFeed.getStatus());
server.listen(port, host, () => {
    console.log(`Public market data server listening on http://${host}:${port}`);
    publicMarketFeed.start();
});
server.on('close', () => {
    publicMarketFeed.stop();
    (0, market_1.setPublicMarketFeedStatusProvider)(null);
    marketWss.close();
});
//# sourceMappingURL=marketDataDevServer.js.map