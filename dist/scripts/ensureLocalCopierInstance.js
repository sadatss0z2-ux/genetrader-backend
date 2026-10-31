"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_crypto_1 = require("node:crypto");
const database_1 = __importDefault(require("../config/database"));
const instanceId = process.env.LOCAL_COPIER_INSTANCE_ID?.trim() ?? '';
const token = process.env.LOCAL_COPIER_API_TOKEN?.trim() ?? '';
async function main() {
    if (!/^[A-Za-z0-9._:-]{1,48}$/.test(instanceId)) {
        throw new Error('LOCAL_COPIER_INSTANCE_ID is missing or invalid.');
    }
    if (!/^[A-Za-z0-9._~-]{32,512}$/.test(token)) {
        throw new Error('LOCAL_COPIER_API_TOKEN is missing or invalid.');
    }
    const tokenHash = (0, node_crypto_1.createHash)('sha256').update(token).digest('hex');
    await (0, database_1.default) `
    INSERT INTO copier_instances (instance_id, auth_token_sha256, enabled, next_revision)
    VALUES (${instanceId}, ${tokenHash}, TRUE, 0)
    ON CONFLICT (instance_id) DO UPDATE
      SET auth_token_sha256 = EXCLUDED.auth_token_sha256,
          enabled = TRUE
  `;
    console.log(`Local copier instance ${instanceId} is registered.`);
}
main()
    .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Unable to register local copier instance.');
    process.exitCode = 1;
})
    .finally(async () => {
    await database_1.default.end();
});
//# sourceMappingURL=ensureLocalCopierInstance.js.map