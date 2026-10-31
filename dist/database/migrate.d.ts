interface MigrationFile {
    id: string;
    name: string;
    upPath: string;
    downPath: string;
}
interface AppliedMigration {
    version: string;
    applied_at: Date;
    checksum: string;
}
/**
 * Dynamically discover migration files from the migrations directory.
 * Migrations are named as {id}_{name}_up.sql and {id}_{name}_down.sql.
 * Returns sorted array by migration ID (numeric string comparison).
 */
declare function discoverMigrations(): Promise<MigrationFile[]>;
/**
 * Compute SHA256 checksum of migration SQL for integrity verification.
 */
export declare function computeChecksum(sql: string): string;
export { discoverMigrations, MigrationFile, AppliedMigration };
//# sourceMappingURL=migrate.d.ts.map