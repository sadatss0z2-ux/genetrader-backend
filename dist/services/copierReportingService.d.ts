import type { JSONValue } from 'postgres';
type JsonRecord = Record<string, unknown>;
export interface CopierPortfolioAccountReport {
    name: string;
    enabled: boolean;
    dryRun: boolean;
    balanceUsdt: number;
    initialBalanceUsdt: number;
    stats: Record<string, number | string | null>;
}
export interface CopierPortfolioTradeReport extends Record<string, JSONValue> {
    id: number;
    account_name: string;
    master_trade_id: number | null;
    is_open: boolean;
    open_date: string;
}
export interface CopierSourceOpenTradeReport {
    master_trade_id: number;
    pair: string;
    stake_amount: number;
    profit_ratio: number;
}
export declare function storeCopierPortfolioReport(input: {
    instanceId: string;
    observedAt: Date;
    complete: boolean;
    accounts: CopierPortfolioAccountReport[];
    trades: CopierPortfolioTradeReport[];
    sourceOpenTrades: CopierSourceOpenTradeReport[];
}): Promise<{
    accepted: true;
}>;
interface SourceTrade extends JsonRecord {
    account_name?: unknown;
    master_trade_id?: unknown;
    open_date?: unknown;
    close_date?: unknown;
    is_open?: unknown;
    stake_amount?: unknown;
    close_profit?: unknown;
    close_profit_abs?: unknown;
}
export interface ObserverPaperPortfolio {
    membership_id: string;
    display_name: string;
    starts_at: string;
    expires_at: string;
    initial_balance_usdt: number;
    equity_usdt: number;
    realized_pnl_usdt: number;
    unrealized_pnl_usdt: number;
    total_trades: number;
    winning_trades: number;
    losing_trades: number;
    open_trades: number;
    win_rate_pct: number;
    source_account: string;
    recent_trades: Array<{
        trade_id: string;
        pair: string;
        opened_at: string;
        closed_at: string | null;
        is_open: boolean;
        profit_pct: number | null;
        simulated_pnl_usdt: number | null;
    }>;
}
export declare function simulateObserverPortfolio(input: {
    startsAt: Date;
    expiresAt: Date;
    sourceAccount: string;
    sourceCapital: number;
    trades: SourceTrade[];
    openSourceTrades: JsonRecord[];
}): ObserverPaperPortfolio;
export declare function getObserverPortfolio(userId: number): Promise<ObserverPaperPortfolio>;
export declare function getMasterCopierPortfolio(): Promise<{
    accounts: JsonRecord[];
    observers: ObserverPaperPortfolio[];
    observer_error: string | null;
    totals: JsonRecord;
}>;
export declare function getMasterCopierTrades(input: {
    account?: string;
    limit: number;
    offset: number;
    openOnly?: boolean;
}): Promise<{
    count: number;
    total_count: number;
    limit: number;
    offset: number;
    trades: JsonRecord[];
}>;
export declare function getMasterCopierStats(): Promise<JsonRecord[]>;
export declare function getMasterCopierOrders(tradeId: number): Promise<JsonRecord[]>;
export {};
//# sourceMappingURL=copierReportingService.d.ts.map