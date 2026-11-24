"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GENETRADER_PRODUCT_KNOWLEDGE = void 0;
/**
 * Curated product reference for GeneTrader AI.
 * Keep claims tied to shipped app/backend behavior and review this file when
 * product flows change. This is deliberately compact enough to send each turn.
 */
exports.GENETRADER_PRODUCT_KNOWLEDGE = `
GeneTrader product reference (reviewed 2026-11):
- GeneTrader is a crypto trading and portfolio app. It displays account balances, holdings, orders, market prices, strategy and risk information according to the signed-in account and enabled features.
- Demo values are simulated. Binance Testnet values and orders are simulated exchange activity. Do not describe either as real funds or live execution.
- The chat assistant is decision support. It cannot place or cancel an order, change account settings, or guarantee returns. Users must use the app's trading controls and review risk themselves.
- Binance account information is available only when the signed-in user has connected a supported exchange profile and the backend can read it. Never infer a balance, trade, strategy setting, or managed-account result when it is absent.
- Portfolio balance and exchange order history are different data. An exchange order record is not proof that an order is still open, nor does it alone establish realized profit or loss.
- The app has account, market, trading, trade-plan, and risk-control flows. Feature availability can depend on account type, connection state, and the user's access.
- When explaining a GeneTrader screen or workflow, use these verified facts and the current account snapshot. If the user asks about a detail not represented here, say what is unknown and direct them to the relevant in-app account, market, trade-plan, or risk screen.
`.trim();
//# sourceMappingURL=geneTraderKnowledge.js.map