export declare class KmsConfigurationError extends Error {
    readonly statusCode = 500;
    constructor(message: string);
}
export declare class KmsVersionNotFoundError extends Error {
    readonly statusCode = 500;
    constructor(version: string);
}
export interface WrappedKeyResult {
    wrappedDek: string;
    keyVersion: string;
    dekIv: string;
    dekAuthTag: string;
}
export interface KmsProvider {
    readonly providerName: string;
    getPrimaryVersion(): string;
    getSupportedVersions(): string[];
    wrapKey(plaintextDek: Buffer, keyVersion?: string): Promise<WrappedKeyResult>;
    unwrapKey(wrappedDek: string, keyVersion: string, dekIv: string, dekAuthTag: string): Promise<Buffer>;
    validateHealth(): Promise<boolean>;
}
/**
 * LocalKmsProvider implements envelope encryption KEK management locally
 * using versioned 256-bit AES-GCM keys. It supports multiple key versions
 * for zero-downtime rotation.
 */
export declare class LocalKmsProvider implements KmsProvider {
    readonly providerName = "local-aes-gcm";
    private keys;
    private primaryVersion;
    constructor();
    /**
     * Reloads keys from environment variables.
     * Fails closed if primary key is missing or not 32 bytes hex.
     */
    loadKeysFromEnvironment(): void;
    getPrimaryVersion(): string;
    getSupportedVersions(): string[];
    private getKey;
    wrapKey(plaintextDek: Buffer, targetKeyVersion?: string): Promise<WrappedKeyResult>;
    unwrapKey(wrappedDek: string, keyVersion: string, dekIv: string, dekAuthTag: string): Promise<Buffer>;
    validateHealth(): Promise<boolean>;
}
export declare function getKmsProvider(): KmsProvider;
export declare function setKmsProvider(provider: KmsProvider | null): void;
//# sourceMappingURL=kmsProvider.d.ts.map