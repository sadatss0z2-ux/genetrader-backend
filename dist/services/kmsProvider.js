"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalKmsProvider = exports.KmsVersionNotFoundError = exports.KmsConfigurationError = void 0;
exports.getKmsProvider = getKmsProvider;
exports.setKmsProvider = setKmsProvider;
const crypto_1 = __importDefault(require("crypto"));
class KmsConfigurationError extends Error {
    statusCode = 500;
    constructor(message) {
        super(message);
        this.name = 'KmsConfigurationError';
    }
}
exports.KmsConfigurationError = KmsConfigurationError;
class KmsVersionNotFoundError extends Error {
    statusCode = 500;
    constructor(version) {
        super(`KMS Key Encryption Key (KEK) version '${version}' is not configured or recognized.`);
        this.name = 'KmsVersionNotFoundError';
    }
}
exports.KmsVersionNotFoundError = KmsVersionNotFoundError;
const KEK_ALGORITHM = 'aes-256-gcm';
/**
 * LocalKmsProvider implements envelope encryption KEK management locally
 * using versioned 256-bit AES-GCM keys. It supports multiple key versions
 * for zero-downtime rotation.
 */
class LocalKmsProvider {
    providerName = 'local-aes-gcm';
    keys = new Map();
    primaryVersion = 'v1';
    constructor() {
        this.loadKeysFromEnvironment();
    }
    /**
     * Reloads keys from environment variables.
     * Fails closed if primary key is missing or not 32 bytes hex.
     */
    loadKeysFromEnvironment() {
        this.keys.clear();
        // Check KMS_PRIMARY_KEY_VERSION
        this.primaryVersion = process.env.KMS_PRIMARY_KEY_VERSION || 'v1';
        // 1. Check for JSON-encoded KMS_KEYS map e.g. {"v1":"<hex>", "v2":"<hex>"}
        if (process.env.KMS_KEYS) {
            try {
                const parsed = JSON.parse(process.env.KMS_KEYS);
                for (const [ver, hex] of Object.entries(parsed)) {
                    if (typeof hex === 'string' && /^[0-9a-f]{64}$/i.test(hex)) {
                        this.keys.set(ver, Buffer.from(hex, 'hex'));
                    }
                }
            }
            catch (err) {
                throw new KmsConfigurationError(`KMS_KEYS must be a valid JSON object mapping versions to 32-byte hex keys: ${err.message}`);
            }
        }
        // 2. Check for individual versioned keys e.g. KMS_KEY_V1, KMS_KEY_V2
        for (const [envVar, value] of Object.entries(process.env)) {
            const match = envVar.match(/^KMS_KEY_([A-Z0-9_]+)$/i);
            if (match && value) {
                const version = match[1].toLowerCase();
                if (/^[0-9a-f]{64}$/i.test(value)) {
                    this.keys.set(version, Buffer.from(value, 'hex'));
                }
            }
        }
        // 3. Fallback / Standard: ENCRYPTION_KEY mapped to primaryVersion (default 'v1')
        const defaultKey = process.env.ENCRYPTION_KEY;
        if (defaultKey) {
            if (!/^[0-9a-f]{64}$/i.test(defaultKey)) {
                throw new KmsConfigurationError('ENCRYPTION_KEY must be configured as exactly 32 bytes of hex.');
            }
            if (!this.keys.has(this.primaryVersion)) {
                this.keys.set(this.primaryVersion, Buffer.from(defaultKey, 'hex'));
            }
        }
        // Fail closed: Ensure at least the primary key exists and is valid
        if (this.keys.size === 0 || !this.keys.has(this.primaryVersion)) {
            throw new KmsConfigurationError(`KMS failed to initialize: No valid Key Encryption Key (KEK) found for primary version '${this.primaryVersion}'. ` +
                `Configure ENCRYPTION_KEY or KMS_KEY_${this.primaryVersion.toUpperCase()} as 32 bytes hex.`);
        }
    }
    getPrimaryVersion() {
        return this.primaryVersion;
    }
    getSupportedVersions() {
        return Array.from(this.keys.keys());
    }
    getKey(version) {
        const key = this.keys.get(version);
        if (!key) {
            throw new KmsVersionNotFoundError(version);
        }
        return key;
    }
    async wrapKey(plaintextDek, targetKeyVersion) {
        const version = targetKeyVersion || this.primaryVersion;
        const kek = this.getKey(version);
        if (plaintextDek.length !== 32) {
            throw new Error(`Data Encryption Key (DEK) must be exactly 32 bytes, got ${plaintextDek.length}`);
        }
        const dekIv = crypto_1.default.randomBytes(16);
        const cipher = crypto_1.default.createCipheriv(KEK_ALGORITHM, kek, dekIv);
        let wrappedDek = cipher.update(plaintextDek).toString('hex');
        wrappedDek += cipher.final().toString('hex');
        const dekAuthTag = cipher.getAuthTag().toString('hex');
        return {
            wrappedDek,
            keyVersion: version,
            dekIv: dekIv.toString('hex'),
            dekAuthTag,
        };
    }
    async unwrapKey(wrappedDek, keyVersion, dekIv, dekAuthTag) {
        const kek = this.getKey(keyVersion);
        const decipher = crypto_1.default.createDecipheriv(KEK_ALGORITHM, kek, Buffer.from(dekIv, 'hex'));
        decipher.setAuthTag(Buffer.from(dekAuthTag, 'hex'));
        const unwrapped = Buffer.concat([
            decipher.update(Buffer.from(wrappedDek, 'hex')),
            decipher.final(),
        ]);
        if (unwrapped.length !== 32) {
            throw new Error(`Unwrapped DEK has invalid length: ${unwrapped.length} bytes (expected 32)`);
        }
        return unwrapped;
    }
    async validateHealth() {
        try {
            const testBuffer = crypto_1.default.randomBytes(32);
            const wrapped = await this.wrapKey(testBuffer);
            const unwrapped = await this.unwrapKey(wrapped.wrappedDek, wrapped.keyVersion, wrapped.dekIv, wrapped.dekAuthTag);
            const isMatch = crypto_1.default.timingSafeEqual(testBuffer, unwrapped);
            testBuffer.fill(0);
            unwrapped.fill(0);
            if (!isMatch) {
                throw new Error('KMS health test roundtrip failed: unwrap did not match input.');
            }
            return true;
        }
        catch (err) {
            throw new KmsConfigurationError(`KMS health check failed: ${err.message}`);
        }
    }
}
exports.LocalKmsProvider = LocalKmsProvider;
// Global active KMS provider instance
let activeProvider = null;
function getKmsProvider() {
    if (!activeProvider) {
        activeProvider = new LocalKmsProvider();
    }
    return activeProvider;
}
function setKmsProvider(provider) {
    activeProvider = provider;
}
//# sourceMappingURL=kmsProvider.js.map