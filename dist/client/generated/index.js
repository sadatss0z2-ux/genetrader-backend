"use strict";
/**
 * Generated TypeScript client from OpenAPI 3.1 spec (P1-01)
 * Strongly-typed client for the GeneTrader API
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeneTraderApiClient = void 0;
class GeneTraderApiClient {
    config;
    constructor(config) {
        this.config = {
            timeout: 30000,
            ...config,
        };
    }
    async request(endpoint, options = {}) {
        const url = `${this.config.baseUrl}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        };
        if (this.config.apiKey) {
            headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
        try {
            const response = await fetch(url, {
                ...options,
                headers,
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                let errorData;
                try {
                    errorData = (await response.json());
                }
                catch {
                    errorData = { error: `HTTP ${response.status}`, status: response.status };
                }
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }
            return (await response.json());
        }
        catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }
    /**
     * GET /api/users/profile
     */
    async getUserProfile() {
        return this.request('/api/users/profile');
    }
    /**
     * PUT /api/users/profile
     */
    async updateUserProfile(data) {
        return this.request('/api/users/profile', {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }
    /**
     * GET /api/users/settings
     */
    async getUserSettings() {
        return this.request('/api/users/settings');
    }
    /**
     * PUT /api/users/settings
     */
    async updateUserSettings(data) {
        return this.request('/api/users/settings', {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }
    /**
     * GET /api/binance/connection-status
     */
    async getExchangeConnectionStatus() {
        return this.request('/api/binance/connection-status');
    }
    /**
     * POST /api/binance/validate-keys
     */
    async validateExchangeKeys(keys) {
        return this.request('/api/binance/validate-keys', {
            method: 'POST',
            body: JSON.stringify(keys),
        });
    }
    /**
     * GET /api/policy/halt
     */
    async getGlobalHalt() {
        return this.request('/api/policy/halt');
    }
    /**
     * POST /api/policy/halt
     */
    async setGlobalHalt(data) {
        return this.request('/api/policy/halt', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }
    /**
     * GET /v1/me/entitlements
     */
    async getEntitlements() {
        return this.request('/v1/me/entitlements');
    }
    /**
     * POST /v1/observer-access-requests
     */
    async requestObserverAccess(data) {
        return this.request('/v1/observer-access-requests', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }
}
exports.GeneTraderApiClient = GeneTraderApiClient;
//# sourceMappingURL=index.js.map