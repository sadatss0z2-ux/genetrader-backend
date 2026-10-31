"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = require("fs/promises");
const path_1 = require("path");
const database_1 = __importDefault(require("../config/database"));
const binanceService_1 = require("../services/binanceService");
const COPIER_INSTANCE_ID = 'genetrader-pc-01';
function requireSecret(value, label) {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`${label} is missing from the local operator configuration.`);
    }
    return value.trim();
}
async function readJson(path) {
    return JSON.parse(await (0, promises_1.readFile)(path, 'utf8'));
}
async function findUser(email) {
    const rows = await (0, database_1.default) `
    SELECT id, email FROM users WHERE email = ${email} LIMIT 1
  `;
    if (!rows.length)
        throw new Error(`Provisioned account ${email} was not found.`);
    return rows[0];
}
async function linkProfile(input) {
    const user = await findUser(input.email);
    const result = await (0, binanceService_1.rotateExchangeCredentials)(user.id, input.apiKey, input.apiSecret, 'live');
    const profiles = await (0, database_1.default) `
    SELECT id
    FROM api_keys
    WHERE user_id = ${user.id}
      AND exchange = 'binance'
      AND environment = 'live'
      AND active = TRUE
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `;
    if (!profiles.length)
        throw new Error(`Live profile for ${input.email} was not persisted.`);
    await (0, database_1.default) `
    UPDATE operator_managed_live_accounts
    SET api_key_id = ${profiles[0].id}, updated_at = NOW()
    WHERE user_id = ${user.id}
      AND instance_id = ${COPIER_INSTANCE_ID}
      AND account_ref = ${input.accountRef}
      AND active = TRUE
  `;
    const snapshot = await (0, binanceService_1.getAccountInfo)(user.id, 'live');
    const nonZeroBalances = Object.values(snapshot.balances).filter((balance) => Number(balance.free) + Number(balance.locked) > 0).length;
    return {
        email: user.email,
        accountRef: input.accountRef,
        permissions: result.permissions,
        nonZeroBalances,
    };
}
async function main() {
    const repoRoot = (0, path_1.resolve)(process.cwd(), '..');
    const sourceConfig = await readJson((0, path_1.resolve)(repoRoot, 'vps_trade_copier', 'config.gen12_v009_local.json'));
    const copierConfig = await readJson((0, path_1.resolve)(repoRoot, 'vps_trade_copier', 'copier_config.json'));
    const account2 = copierConfig.slave_accounts?.find((account) => account.name === 'Account2_Live');
    if (!account2)
        throw new Error('Account2_Live was not found in the local copier configuration.');
    const linked = await Promise.all([
        linkProfile({
            email: 'ssentongosadat16@gmail.com',
            accountRef: 'Main_Live_Bot',
            apiKey: requireSecret(sourceConfig.exchange?.key, 'Main live bot API key'),
            apiSecret: requireSecret(sourceConfig.exchange?.secret, 'Main live bot API secret'),
        }),
        linkProfile({
            email: 'akhramrama@gmail.com',
            accountRef: 'Account2_Live',
            apiKey: requireSecret(account2.api_key, 'Account2 live API key'),
            apiSecret: requireSecret(account2.api_secret, 'Account2 live API secret'),
        }),
    ]);
    console.log(JSON.stringify({ environment: 'live', linked }));
}
main()
    .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
})
    .finally(async () => {
    await database_1.default.end({ timeout: 5 });
});
//# sourceMappingURL=linkOperatorLiveCredentials.js.map