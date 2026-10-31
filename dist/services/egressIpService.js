"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_EGRESS_IP_STALE_TOLERANCE_MS = exports.DEFAULT_EGRESS_IP_MAX_AGE_MS = void 0;
exports.setCustomEgressIpFetcherForTesting = setCustomEgressIpFetcherForTesting;
exports.resetEgressIpCacheForTesting = resetEgressIpCacheForTesting;
exports.isValidIpv4 = isValidIpv4;
exports.getVerifiedEgressIp = getVerifiedEgressIp;
const IPV4_REGEX = /^(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
exports.DEFAULT_EGRESS_IP_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes fresh
exports.DEFAULT_EGRESS_IP_STALE_TOLERANCE_MS = 10 * 60 * 1000; // 10 minutes max staleness
let cachedEgressIp = null;
let customFetchEgressIp = null;
function setCustomEgressIpFetcherForTesting(fetcher) {
    customFetchEgressIp = fetcher;
}
function resetEgressIpCacheForTesting() {
    cachedEgressIp = null;
    customFetchEgressIp = null;
}
function isValidIpv4(value) {
    return typeof value === 'string' && IPV4_REGEX.test(value.trim());
}
async function fetchFromHttpEndpoints() {
    const endpoints = [
        {
            url: 'https://api.ipify.org?format=json',
            parser: async (res) => {
                const data = await res.json();
                return typeof data?.ip === 'string' ? data.ip.trim() : '';
            },
        },
        {
            url: 'https://checkip.amazonaws.com/',
            parser: async (res) => (await res.text()).trim(),
        },
        {
            url: 'https://icanhazip.com/',
            parser: async (res) => (await res.text()).trim(),
        },
    ];
    let lastError = null;
    for (const endpoint of endpoints) {
        try {
            const response = await fetch(endpoint.url, {
                headers: { Accept: 'application/json, text/plain' },
                signal: AbortSignal.timeout(5000),
            });
            if (!response.ok)
                continue;
            const parsed = await endpoint.parser(response);
            if (isValidIpv4(parsed)) {
                return parsed;
            }
        }
        catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
        }
    }
    throw lastError ?? new Error('Failed to resolve public egress IP from all trusted providers.');
}
/**
 * Resolves the public egress IP of the PC running the service.
 * Verifies the result format and manages in-memory caching and staleness.
 */
async function getVerifiedEgressIp(options) {
    const maxAgeMs = options?.maxAgeMs ?? exports.DEFAULT_EGRESS_IP_MAX_AGE_MS;
    const staleToleranceMs = options?.staleToleranceMs ?? exports.DEFAULT_EGRESS_IP_STALE_TOLERANCE_MS;
    const now = Date.now();
    if (!options?.forceFresh && cachedEgressIp) {
        const age = now - cachedEgressIp.checkedAt.getTime();
        if (age <= maxAgeMs) {
            return {
                ip: cachedEgressIp.ip,
                checkedAt: cachedEgressIp.checkedAt,
                status: 'VERIFIED',
                stale: false,
                ageSeconds: Math.floor(age / 1000),
            };
        }
    }
    try {
        const resolvedIp = customFetchEgressIp
            ? await customFetchEgressIp()
            : await fetchFromHttpEndpoints();
        if (!isValidIpv4(resolvedIp)) {
            throw new Error(`Resolved IP is invalid: ${resolvedIp}`);
        }
        const checkedAt = new Date(now);
        cachedEgressIp = { ip: resolvedIp, checkedAt };
        return {
            ip: resolvedIp,
            checkedAt,
            status: 'VERIFIED',
            stale: false,
            ageSeconds: 0,
        };
    }
    catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (cachedEgressIp) {
            const age = now - cachedEgressIp.checkedAt.getTime();
            if (age <= staleToleranceMs) {
                return {
                    ip: cachedEgressIp.ip,
                    checkedAt: cachedEgressIp.checkedAt,
                    status: 'STALE',
                    stale: true,
                    ageSeconds: Math.floor(age / 1000),
                    error: `Failed to refresh egress IP (${errorMessage}); using cached IP within tolerance.`,
                };
            }
        }
        return {
            ip: null,
            checkedAt: null,
            status: 'UNAVAILABLE',
            stale: true,
            ageSeconds: null,
            error: `Egress IP cannot be resolved: ${errorMessage}`,
        };
    }
}
//# sourceMappingURL=egressIpService.js.map