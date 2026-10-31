"use strict";
/**
 * Market Read Models (P3-02)
 *
 * Typed query-side snapshots derived from normalized ingested market events.
 * Each model carries source time, received time, a server-computed freshness flag,
 * and latency metadata so consumers can always know the age and reliability of data.
 *
 * These models are intentionally decoupled from storage — they are pure in-memory
 * projections maintained by MarketReadModelStore, updated on every ingested event.
 */
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=marketReadModel.js.map