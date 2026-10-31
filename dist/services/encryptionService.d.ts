export declare const ENVELOPE_FORMAT_VERSION: "gt-env-v1";
export interface SecretContext {
    userId?: number;
    secretType?: 'binance_api_key' | 'binance_api_secret' | 'generic';
    service?: string;
    ipAddress?: string;
    reason?: string;
}
export interface EnvelopePayload {
    version: typeof ENVELOPE_FORMAT_VERSION;
    keyVersion: string;
    wrappedDek: string;
    dekIv: string;
    dekAuthTag: string;
    ciphertext: string;
    iv: string;
    authTag: string;
}
export interface EncryptedResult {
    encrypted: string;
    iv: string;
    authTag: string;
    wrappedDek?: string;
    dekIv?: string;
    dekAuthTag?: string;
    keyVersion?: string;
}
/**
 * Serializes an EnvelopePayload into a compact, self-contained string.
 */
export declare function serializeEnvelope(payload: EnvelopePayload): string;
/**
 * Deserializes an envelope string into an EnvelopePayload.
 * Returns null if the string is not a valid gt-env-v1 envelope.
 */
export declare function deserializeEnvelope(serialized: string): EnvelopePayload | null;
/**
 * Records a decrypt/encrypt audit event into secret_audit_log.
 * CRITICAL: Plaintext secrets, DEKs, and KEKs are NEVER logged.
 */
export declare function logSecretAudit(action: 'ENCRYPT' | 'DECRYPT' | 'ROTATE' | 'REVOKE', keyVersion: string, context?: SecretContext, status?: 'SUCCESS' | 'FAILED', errorMessage?: string): Promise<void>;
/**
 * Core envelope encryption implementation:
 * 1. Generates a unique 32-byte DEK (Data Encryption Key).
 * 2. Encrypts plaintext data using AES-256-GCM with the DEK.
 * 3. Wraps (encrypts) the DEK using the active KMS Key Encryption Key (KEK).
 * 4. Zeroes out the plaintext DEK buffer immediately.
 */
export declare function encryptEnvelope(text: string, context?: SecretContext, targetKeyVersion?: string): Promise<EnvelopePayload>;
/**
 * Core envelope decryption implementation:
 * 1. Unwraps the DEK using the KMS KEK corresponding to payload.keyVersion.
 * 2. Decrypts the ciphertext using the unwrapped DEK.
 * 3. Zeroes out the plaintext DEK buffer immediately.
 * 4. Logs a decrypt audit event (with caller context).
 */
export declare function decryptEnvelope(payloadOrSerialized: EnvelopePayload | string, context?: SecretContext): Promise<string>;
/**
 * Rotates an envelope payload to a new KEK version.
 * Unwraps the DEK with old KEK and re-wraps with new target KEK.
 * Notice: This rotates the master key protection WITHOUT needing to re-encrypt
 * the underlying data ciphertext.
 */
export declare function rotateSecretEnvelope(payload: EnvelopePayload, targetKeyVersion?: string, context?: SecretContext): Promise<EnvelopePayload>;
/**
 * Synchronous / compatible encrypt function:
 * Produces envelope-encrypted serialized payload stored in .encrypted,
 * while maintaining backward compatibility with .iv and .authTag fields.
 */
export declare function encrypt(text: string, context?: SecretContext): EncryptedResult;
/**
 * Backward-compatible decrypt function:
 * Seamlessly handles BOTH envelope-encrypted strings (gt-env-v1:...)
 * AND legacy direct AES-256-GCM ciphertexts.
 */
export declare function decrypt(encrypted: string, iv: string, authTag: string, context?: SecretContext): string;
/**
 * Validates encryption configuration at server startup.
 * Fails closed if the KMS provider or encryption keys are missing or defective.
 */
export declare function validateEncryptionConfiguration(): Promise<void>;
//# sourceMappingURL=encryptionService.d.ts.map