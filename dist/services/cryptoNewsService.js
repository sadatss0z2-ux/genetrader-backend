"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRecentCryptoNews = getRecentCryptoNews;
const FEEDS = [
    { source: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
    { source: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
];
const MAX_FEED_BYTES = 500_000;
const MAX_AGE_MS = 36 * 60 * 60 * 1000;
function decodeXml(value) {
    return value
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&#x([\da-f]{1,6});/gi, (_match, hex) => {
        const codePoint = parseInt(hex, 16);
        return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : ' ';
    })
        .replace(/&#(\d{1,7});/g, (_match, decimal) => {
        const codePoint = parseInt(decimal, 10);
        return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : ' ';
    })
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&apos;|&#39;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function readTag(xml, tag) {
    const match = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, 'i'));
    return match?.[1] ? decodeXml(match[1]) : '';
}
function readLink(xml) {
    const direct = readTag(xml, 'link');
    const candidate = direct || xml.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?\s*>/i)?.[1] || '';
    try {
        const url = new URL(candidate);
        return url.protocol === 'https:' ? url.toString() : '';
    }
    catch {
        return '';
    }
}
function parseFeed(xml, source, now) {
    const items = [];
    const nodes = [...xml.matchAll(/<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)\s*>/gi)];
    for (const node of nodes) {
        const item = node[1] ?? '';
        const title = readTag(item, 'title').slice(0, 180);
        const url = readLink(item);
        const dateText = readTag(item, 'pubDate') || readTag(item, 'published') || readTag(item, 'updated');
        const publishedMs = Date.parse(dateText);
        if (!title || !url || !Number.isFinite(publishedMs) || now - publishedMs > MAX_AGE_MS || publishedMs > now + 10 * 60_000) {
            continue;
        }
        const summary = readTag(item, 'description') || readTag(item, 'summary') || readTag(item, 'content');
        items.push({
            title,
            url,
            source,
            publishedAt: new Date(publishedMs).toISOString(),
            ...(summary ? { summary: summary.slice(0, 320) } : {}),
        });
    }
    return items;
}
async function fetchFeed(feed, now) {
    const response = await fetch(feed.url, {
        headers: {
            Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5',
            'User-Agent': 'GeneTraderAI/1.0 (+https://genetrader.site)',
        },
        signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok)
        throw new Error(`News feed HTTP ${response.status}`);
    const xml = (await response.text()).slice(0, MAX_FEED_BYTES);
    return parseFeed(xml, feed.source, now);
}
/**
 * Fetch only public crypto headlines and return their source URLs and times.
 * News is optional context: one blocked publisher must not fail the AI turn.
 */
async function getRecentCryptoNews() {
    const now = Date.now();
    const results = await Promise.allSettled(FEEDS.map((feed) => fetchFeed(feed, now)));
    const items = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
    const unique = new Map();
    for (const item of items.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))) {
        if (!unique.has(item.url))
            unique.set(item.url, item);
    }
    return [...unique.values()].slice(0, 6);
}
//# sourceMappingURL=cryptoNewsService.js.map