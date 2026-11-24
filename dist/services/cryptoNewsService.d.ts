export interface CryptoNewsItem {
    title: string;
    url: string;
    source: string;
    publishedAt: string;
    summary?: string;
}
/**
 * Fetch only public crypto headlines and return their source URLs and times.
 * News is optional context: one blocked publisher must not fail the AI turn.
 */
export declare function getRecentCryptoNews(): Promise<CryptoNewsItem[]>;
//# sourceMappingURL=cryptoNewsService.d.ts.map