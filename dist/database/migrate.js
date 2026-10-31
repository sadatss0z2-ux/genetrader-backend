"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeChecksum = computeChecksum;
exports.discoverMigrations = discoverMigrations;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const node_crypto_1 = require("node:crypto");
const postgres_1 = __importDefault(require("postgres"));
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)({ path: (0, node_path_1.join)(process.cwd(), '.env') });
const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!databaseUrl)
    throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL is required to run migrations.');
const databaseHost = new URL(databaseUrl).hostname;
const sql = (0, postgres_1.default)(databaseUrl, {
    ssl: ['localhost', '127.0.0.1', '::1'].includes(databaseHost) ? false : 'require',
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => { },
    prepare: false,
});
/**
 * Dynamically discover migration files from the migrations directory.
 * Migrations are named as {id}_{name}_up.sql and {id}_{name}_down.sql.
 * Returns sorted array by migration ID (numeric string comparison).
 */
async function discoverMigrations() {
    const migrationsDir = (0, node_path_1.join)(process.cwd(), 'src', 'database', 'migrations');
    const files = await (0, promises_1.readdir)(migrationsDir);
    const upFiles = files.filter(f => f.endsWith('_up.sql'));
    const migrations = [];
    for (const upFile of upFiles) {
        const match = upFile.match(/^(\d+)_(.+)_up\.sql$/);
        if (!match)
            continue;
        const [, id, name] = match;
        const downFile = `${id}_${name}_down.sql`;
        if (!files.includes(downFile)) {
            console.warn(`Warning: Migration ${id}_${name} has up file but missing down file: ${downFile}`);
            continue;
        }
        migrations.push({
            id,
            name,
            upPath: (0, node_path_1.join)(migrationsDir, upFile),
            downPath: (0, node_path_1.join)(migrationsDir, downFile),
        });
    }
    // Sort by ID (numeric string comparison)
    migrations.sort((a, b) => {
        const numA = parseInt(a.id, 10);
        const numB = parseInt(b.id, 10);
        return numA - numB || a.name.localeCompare(b.name);
    });
    return migrations;
}
async function readMigrationSql(filePath) {
    return (0, promises_1.readFile)(filePath, 'utf8');
}
/**
 * Compute SHA256 checksum of migration SQL for integrity verification.
 */
function computeChecksum(sql) {
    return (0, node_crypto_1.createHash)('sha256').update(sql).digest('hex');
}
async function applyUp(tx, migration) {
    const version = `${migration.id}_${migration.name}`;
    const found = await tx `
    SELECT version, checksum FROM schema_migrations WHERE version = ${version}
  `;
    if (found.length) {
        const currentChecksum = computeChecksum(await readMigrationSql(migration.upPath));
        if (found[0].checksum !== currentChecksum) {
            throw new Error(`Migration ${version} checksum mismatch. Expected ${found[0].checksum}, got ${currentChecksum}`);
        }
        return;
    }
    // Special case: legacy baseline for migration 002
    if (migration.id === '002' && migration.name === 'entitlements') {
        const baseline = await tx `
      SELECT to_regclass('public.users')::text AS present
    `;
        if (!baseline[0]?.present) {
            const legacySchema = await (0, promises_1.readFile)((0, node_path_1.join)(process.cwd(), 'database', 'schema.sql'), 'utf8');
            await tx.unsafe(legacySchema);
        }
        // Record legacy baseline as applied (with checksum if schema exists)
        const legacyPath = (0, node_path_1.join)(process.cwd(), 'database', 'schema.sql');
        const legacyChecksum = computeChecksum(await (0, promises_1.readFile)(legacyPath, 'utf8'));
        await tx `INSERT INTO schema_migrations(version, checksum) VALUES ('001_legacy_baseline', ${legacyChecksum}) ON CONFLICT DO NOTHING`;
    }
    const migrationSql = await readMigrationSql(migration.upPath);
    const checksum = computeChecksum(migrationSql);
    await tx.unsafe(migrationSql);
    await tx `INSERT INTO schema_migrations(version, checksum) VALUES (${version}, ${checksum})`;
}
async function applyDown(tx, migration) {
    const version = `${migration.id}_${migration.name}`;
    const found = await tx `
    SELECT version FROM schema_migrations WHERE version = ${version}
  `;
    if (!found.length)
        return;
    const migrationSql = await readMigrationSql(migration.downPath);
    await tx.unsafe(migrationSql);
    await tx `DELETE FROM schema_migrations WHERE version = ${version}`;
}
async function run() {
    const direction = process.argv.includes('--down') ? 'down' : 'up';
    try {
        const migrations = await discoverMigrations();
        await sql.begin(async (tx) => {
            await tx `SELECT pg_advisory_xact_lock(20260930, 2048)`;
            // Create or upgrade migration journal table
            await tx `
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version VARCHAR(128) PRIMARY KEY,
          checksum VARCHAR(64) NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
            // Add checksum column if it doesn't exist (for existing databases)
            const checksumColumn = await tx `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'schema_migrations' AND column_name = 'checksum'
      `;
            if (checksumColumn.length === 0) {
                await tx `ALTER TABLE schema_migrations ADD COLUMN checksum VARCHAR(64)`;
            }
            if (direction === 'up') {
                for (const migration of migrations) {
                    await applyUp(tx, migration);
                }
            }
            else {
                // Rollback in reverse order
                for (let index = migrations.length - 1; index >= 0; index -= 1) {
                    const migration = migrations[index];
                    const version = `${migration.id}_${migration.name}`;
                    const found = await tx `
            SELECT version FROM schema_migrations WHERE version = ${version}
          `;
                    if (found.length) {
                        await applyDown(tx, migration);
                        break; // Only rollback one migration at a time
                    }
                }
            }
        });
        console.log(`Migrations ${direction} completed.`);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown migration error';
        console.error(`Migration ${direction} failed: ${message}`);
        process.exitCode = 1;
    }
    finally {
        await sql.end();
    }
}
if (process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID) {
    run();
}
function directionFromArgv() {
    return process.argv.includes('--down') ? 'down' : 'up';
}
//# sourceMappingURL=migrate.js.map