"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENVELOPE_FORMAT_VERSION = void 0;
exports.serializeEnvelope = serializeEnvelope;
exports.deserializeEnvelope = deserializeEnvelope;
exports.logSecretAudit = logSecretAudit;
exports.encryptEnvelope = encryptEnvelope;
exports.decryptEnvelope = decryptEnvelope;
exports.rotateSecretEnvelope = rotateSecretEnvelope;
exports.encrypt = encrypt;
exports.decrypt = decrypt;
exports.validateEncryptionConfiguration = validateEncryptionConfiguration;
const crypto_1 = __importDefault(require("crypto"));
const database_1 = __importDefault(require("../config/database"));
const kmsProvider_1 = require("./kmsProvider");
const DATA_ALGORITHM = 'aes-256-gcm';
exports.ENVELOPE_FORMAT_VERSION = 'gt-env-v1';
/**
 * Serializes an EnvelopePayload into a compact, self-contained string.
 */
function serializeEnvelope(payload) {
    return [
        payload.version,
        payload.keyVersion,
        payload.wrappedDek,
        payload.dekIv,
        payload.dekAuthTag,
        payload.iv,
        payload.authTag,
        payload.ciphertext,
    ].join(':');
}
/**
 * Deserializes an envelope string into an EnvelopePayload.
 * Returns null if the string is not a valid gt-env-v1 envelope.
 */
function deserializeEnvelope(serialized) {
    if (!serialized || typeof serialized !== 'string')
        return null;
    const parts = serialized.split(':');
    if (parts.length !== 8 || parts[0] !== exports.ENVELOPE_FORMAT_VERSION) {
        return null;
    }
    const [version, keyVersion, wrappedDek, dekIv, dekAuthTag, iv, authTag, ciphertext] = parts;
    return {
        version: version,
        keyVersion,
        wrappedDek,
        dekIv,
        dekAuthTag,
        iv,
        authTag,
        ciphertext,
    };
}
/**
 * Records a decrypt/encrypt audit event into secret_audit_log.
 * CRITICAL: Plaintext secrets, DEKs, and KEKs are NEVER logged.
 */
async function logSecretAudit(action, keyVersion, context, status = 'SUCCESS', errorMessage) {
    const userId = context?.userId ?? null;
    const secretType = context?.secretType ?? 'generic';
    const service = context?.service ?? 'unknown';
    const ipAddress = context?.ipAddress ?? null;
    // In test environment, skip DB write if test runner is detached or no db available
    if (process.env.NODE_ENV === 'test' && !process.env.ENABLE_TEST_AUDIT_DB) {
        return;
    }
    try {
        await (0, database_1.default) `
      INSERT INTO secret_audit_log (
        user_id, secret_type, action, key_version, service, status, ip_address, error_message
      ) VALUES (
        ${userId}, ${secretType}, ${action}, ${keyVersion}, ${service}, ${status}, ${ipAddress}, ${errorMessage || null}
      )
    `.catch((err) => {
            // Silently fail if table does not exist yet or connection is offline
            if (!err.message?.includes('secret_audit_log') && !err.message?.includes('ENOTFOUND')) {
                console.error('[SECRET_AUDIT] Failed to persist secret audit event:', err.message);
            }
        });
    }
    catch {
        // Audit write failures must not crash caller if non-fatal
    }
}
/**
 * Core envelope encryption implementation:
 * 1. Generates a unique 32-byte DEK (Data Encryption Key).
 * 2. Encrypts plaintext data using AES-256-GCM with the DEK.
 * 3. Wraps (encrypts) the DEK using the active KMS Key Encryption Key (KEK).
 * 4. Zeroes out the plaintext DEK buffer immediately.
 */
async function encryptEnvelope(text, context, targetKeyVersion) {
    const kms = (0, kmsProvider_1.getKmsProvider)();
    const plaintextDek = crypto_1.default.randomBytes(32);
    const dataIv = crypto_1.default.randomBytes(16);
    try {
        // Encrypt plaintext with DEK
        const cipher = crypto_1.default.createCipheriv(DATA_ALGORITHM, plaintextDek, dataIv);
        let ciphertext = cipher.update(text, 'utf8', 'hex');
        ciphertext += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');
        // Wrap DEK with KMS KEK
        const wrapped = await kms.wrapKey(plaintextDek, targetKeyVersion);
        const payload = {
            version: exports.ENVELOPE_FORMAT_VERSION,
            keyVersion: wrapped.keyVersion,
            wrappedDek: wrapped.wrappedDek,
            dekIv: wrapped.dekIv,
            dekAuthTag: wrapped.dekAuthTag,
            ciphertext,
            iv: dataIv.toString('hex'),
            authTag,
        };
        // Log encryption audit event
        await logSecretAudit('ENCRYPT', payload.keyVersion, context, 'SUCCESS');
        return payload;
    }
    finally {
        // Securely wipe plaintext DEK from memory
        plaintextDek.fill(0);
    }
}
/**
 * Core envelope decryption implementation:
 * 1. Unwraps the DEK using the KMS KEK corresponding to payload.keyVersion.
 * 2. Decrypts the ciphertext using the unwrapped DEK.
 * 3. Zeroes out the plaintext DEK buffer immediately.
 * 4. Logs a decrypt audit event (with caller context).
 */
async function decryptEnvelope(payloadOrSerialized, context) {
    const payload = typeof payloadOrSerialized === 'string'
        ? deserializeEnvelope(payloadOrSerialized)
        : payloadOrSerialized;
    if (!payload) {
        throw new Error('Invalid envelope ciphertext payload.');
    }
    const kms = (0, kmsProvider_1.getKmsProvider)();
    let unwrappedDek = null;
    try {
        unwrappedDek = await kms.unwrapKey(payload.wrappedDek, payload.keyVersion, payload.dekIv, payload.dekAuthTag);
        const decipher = crypto_1.default.createDecipheriv(DATA_ALGORITHM, unwrappedDek, Buffer.from(payload.iv, 'hex'));
        decipher.setAuthTag(Buffer.from(payload.authTag, 'hex'));
        let decrypted = decipher.update(payload.ciphertext, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        await logSecretAudit('DECRYPT', payload.keyVersion, context, 'SUCCESS');
        return decrypted;
    }
    catch (err) {
        await logSecretAudit('DECRYPT', payload.keyVersion, context, 'FAILED', err.message);
        throw err;
    }
    finally {
        if (unwrappedDek) {
            unwrappedDek.fill(0);
        }
    }
}
/**
 * Rotates an envelope payload to a new KEK version.
 * Unwraps the DEK with old KEK and re-wraps with new target KEK.
 * Notice: This rotates the master key protection WITHOUT needing to re-encrypt
 * the underlying data ciphertext.
 */
async function rotateSecretEnvelope(payload, targetKeyVersion, context) {
    const kms = (0, kmsProvider_1.getKmsProvider)();
    const targetVer = targetKeyVersion || kms.getPrimaryVersion();
    if (payload.keyVersion === targetVer) {
        return payload; // Already on target version
    }
    let unwrappedDek = null;
    try {
        unwrappedDek = await kms.unwrapKey(payload.wrappedDek, payload.keyVersion, payload.dekIv, payload.dekAuthTag);
        const rewrapped = await kms.wrapKey(unwrappedDek, targetVer);
        const newPayload = {
            ...payload,
            keyVersion: rewrapped.keyVersion,
            wrappedDek: rewrapped.wrappedDek,
            dekIv: rewrapped.dekIv,
            dekAuthTag: rewrapped.dekAuthTag,
        };
        await logSecretAudit('ROTATE', targetVer, context, 'SUCCESS');
        return newPayload;
    }
    finally {
        if (unwrappedDek) {
            unwrappedDek.fill(0);
        }
    }
}
/**
 * Legacy AES direct decryption fallback helper.
 */
function getLegacyEncryptionKey() {
    const value = process.env.ENCRYPTION_KEY;
    if (!value || !/^[0-9a-f]{64}$/i.test(value)) {
        throw new kmsProvider_1.KmsConfigurationError('ENCRYPTION_KEY must be configured as exactly 32 bytes of hex.');
    }
    return Buffer.from(value, 'hex');
}
/**
 * Synchronous / compatible encrypt function:
 * Produces envelope-encrypted serialized payload stored in .encrypted,
 * while maintaining backward compatibility with .iv and .authTag fields.
 */
function encrypt(text, context) {
    const kms = (0, kmsProvider_1.getKmsProvider)();
    const plaintextDek = crypto_1.default.randomBytes(32);
    const dataIv = crypto_1.default.randomBytes(16);
    try {
        // Encrypt plaintext with DEK
        const cipher = crypto_1.default.createCipheriv(DATA_ALGORITHM, plaintextDek, dataIv);
        let ciphertext = cipher.update(text, 'utf8', 'hex');
        ciphertext += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');
        // Wrap DEK synchronously using active local KEK
        const primaryVersion = kms.getPrimaryVersion();
        const kek = getLegacyEncryptionKey();
        const dekIv = crypto_1.default.randomBytes(16);
        const wrapCipher = crypto_1.default.createCipheriv(DATA_ALGORITHM, kek, dekIv);
        let wrappedDek = wrapCipher.update(plaintextDek).toString('hex');
        wrappedDek += wrapCipher.final().toString('hex');
        const dekAuthTag = wrapCipher.getAuthTag().toString('hex');
        const envelope = {
            version: exports.ENVELOPE_FORMAT_VERSION,
            keyVersion: primaryVersion,
            wrappedDek,
            dekIv: dekIv.toString('hex'),
            dekAuthTag,
            ciphertext,
            iv: dataIv.toString('hex'),
            authTag,
        };
        const serialized = serializeEnvelope(envelope);
        // Audit log asynchronously
        logSecretAudit('ENCRYPT', primaryVersion, context, 'SUCCESS').catch(() => { });
        return {
            encrypted: serialized,
            iv: dataIv.toString('hex'),
            authTag,
            wrappedDek,
            dekIv: dekIv.toString('hex'),
            dekAuthTag,
            keyVersion: primaryVersion,
        };
    }
    finally {
        plaintextDek.fill(0);
    }
}
/**
 * Backward-compatible decrypt function:
 * Seamlessly handles BOTH envelope-encrypted strings (gt-env-v1:...)
 * AND legacy direct AES-256-GCM ciphertexts.
 */
function decrypt(encrypted, iv, authTag, context) {
    // Check if this is an envelope-formatted string
    const envelope = deserializeEnvelope(encrypted);
    if (envelope) {
        const kms = (0, kmsProvider_1.getKmsProvider)();
        // Unwrap DEK
        const kek = getLegacyEncryptionKey();
        const decipherWrap = crypto_1.default.createDecipheriv(DATA_ALGORITHM, kek, Buffer.from(envelope.dekIv, 'hex'));
        decipherWrap.setAuthTag(Buffer.from(envelope.dekAuthTag, 'hex'));
        const dek = Buffer.concat([
            decipherWrap.update(Buffer.from(envelope.wrappedDek, 'hex')),
            decipherWrap.final(),
        ]);
        try {
            const decipher = crypto_1.default.createDecipheriv(DATA_ALGORITHM, dek, Buffer.from(envelope.iv, 'hex'));
            decipher.setAuthTag(Buffer.from(envelope.authTag, 'hex'));
            let decrypted = decipher.update(envelope.ciphertext, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            logSecretAudit('DECRYPT', envelope.keyVersion, context, 'SUCCESS').catch(() => { });
            return decrypted;
        }
        finally {
            dek.fill(0);
        }
    }
    // Legacy direct AES-256-GCM fallback
    const decipher = crypto_1.default.createDecipheriv(DATA_ALGORITHM, getLegacyEncryptionKey(), Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    logSecretAudit('DECRYPT', 'legacy-v0', context, 'SUCCESS').catch(() => { });
    return decrypted;
}
/**
 * Validates encryption configuration at server startup.
 * Fails closed if the KMS provider or encryption keys are missing or defective.
 */
async function validateEncryptionConfiguration() {
    const kms = (0, kmsProvider_1.getKmsProvider)();
    await kms.validateHealth();
    // Test full envelope encrypt and decrypt roundtrip
    const testPlaintext = 'genetrader-startup-kms-test-' + Date.now();
    const encrypted = await encryptEnvelope(testPlaintext, { service: 'startup-check' });
    const decrypted = await decryptEnvelope(encrypted, { service: 'startup-check' });
    if (decrypted !== testPlaintext) {
        throw new kmsProvider_1.KmsConfigurationError('Encryption startup validation failed: roundtrip test did not match.');
    }
}
//# sourceMappingURL=encryptionService.js.map