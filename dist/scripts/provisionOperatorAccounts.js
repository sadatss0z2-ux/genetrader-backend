"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = require("crypto");
const database_1 = __importDefault(require("../config/database"));
const COPIER_INSTANCE_ID = 'genetrader-pc-01';
function normalizeEmail(value) {
    return value.trim().toLowerCase();
}
function newReferralCode() {
    return `GT${(0, crypto_1.randomBytes)(4).toString('hex').toUpperCase()}`;
}
async function createReferralCode() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        const referralCode = newReferralCode();
        const existing = await (0, database_1.default) `
      SELECT id FROM users WHERE referral_code = ${referralCode} LIMIT 1
    `;
        if (!existing.length)
            return referralCode;
    }
    throw new Error('Could not allocate a unique referral code for a provisioned account.');
}
async function provisionUser(input) {
    const email = normalizeEmail(input.email);
    const existing = await (0, database_1.default) `
    SELECT id, email, plan, auth_provider
    FROM users
    WHERE email = ${email}
    LIMIT 1
  `;
    if (existing.length) {
        const updated = await (0, database_1.default) `
      UPDATE users
      SET display_name = COALESCE(display_name, ${input.displayName}),
          is_active = TRUE,
          email_verified_at = COALESCE(email_verified_at, NOW()),
          identity_verified_at = COALESCE(identity_verified_at, NOW()),
          plan = ${input.plan},
          observer_mode = FALSE,
          updated_at = NOW()
      WHERE id = ${existing[0].id}
      RETURNING id, email, plan, auth_provider
    `;
        return updated[0];
    }
    // This credential is deliberately never displayed or persisted outside its hash.
    // The owner claims the account through the normal password-reset flow, or (for
    // the configured master) through a Firebase-verified Google sign-in.
    const passwordHash = await bcryptjs_1.default.hash((0, crypto_1.randomBytes)(48).toString('base64url'), 12);
    const referralCode = await createReferralCode();
    const inserted = await (0, database_1.default) `
    INSERT INTO users (
      email, display_name, referral_code, password_hash, auth_provider,
      email_verified_at, identity_verified_at, plan, observer_mode, is_active
    ) VALUES (
      ${email}, ${input.displayName}, ${referralCode}, ${passwordHash}, 'local',
      NOW(), NOW(), ${input.plan}, FALSE, TRUE
    )
    RETURNING id, email, plan, auth_provider
  `;
    await (0, database_1.default) `
    INSERT INTO user_settings (user_id)
    VALUES (${inserted[0].id})
    ON CONFLICT (user_id) DO NOTHING
  `;
    return inserted[0];
}
async function ensureOperatorAccount(user, account) {
    await (0, database_1.default) `
    INSERT INTO operator_managed_live_accounts (
      id, user_id, instance_id, account_ref, account_kind,
      fee_exempt, active, requested_live
    ) VALUES (
      ${(0, crypto_1.randomUUID)()}, ${user.id}, ${COPIER_INSTANCE_ID}, ${account.accountRef}, ${account.accountKind},
      TRUE, TRUE, TRUE
    )
    ON CONFLICT (instance_id, account_ref) DO UPDATE
      SET user_id = EXCLUDED.user_id,
          account_kind = EXCLUDED.account_kind,
          fee_exempt = TRUE,
          active = TRUE,
          requested_live = TRUE,
          updated_at = NOW()
  `;
}
async function main() {
    const masterEmailRaw = process.env.MASTER_ACCOUNT_EMAIL;
    if (!masterEmailRaw)
        throw new Error('MASTER_ACCOUNT_EMAIL is required to provision the master account.');
    const masterEmail = normalizeEmail(masterEmailRaw);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(masterEmail)) {
        throw new Error('MASTER_ACCOUNT_EMAIL is invalid.');
    }
    const instances = await (0, database_1.default) `
    SELECT instance_id, enabled
    FROM copier_instances
    WHERE instance_id = ${COPIER_INSTANCE_ID}
    LIMIT 1
  `;
    if (!instances[0]?.enabled) {
        throw new Error(`Enabled copier instance ${COPIER_INSTANCE_ID} was not found.`);
    }
    const master = await provisionUser({
        email: masterEmail,
        displayName: 'GeneTrader Master',
        plan: 'master',
    });
    const accounts = [
        {
            email: 'ssentongosadat16@gmail.com',
            displayName: 'Main Live Bot',
            accountRef: 'Main_Live_Bot',
            accountKind: 'SOURCE',
        },
        {
            email: 'akhramrama@gmail.com',
            displayName: 'Account 2 Live Bot',
            accountRef: 'Account2_Live',
            accountKind: 'COPIER',
        },
    ];
    const linked = [];
    for (const account of accounts) {
        const user = await provisionUser({
            email: account.email,
            displayName: account.displayName,
            plan: 'monthly',
        });
        await ensureOperatorAccount(user, account);
        linked.push({ email: user.email, accountRef: account.accountRef, accountKind: account.accountKind });
    }
    console.log(JSON.stringify({
        master: { email: master.email, plan: master.plan, observerMode: false },
        linked,
        copierInstance: COPIER_INSTANCE_ID,
        feeExempt: true,
    }));
}
main()
    .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
})
    .finally(async () => {
    await database_1.default.end({ timeout: 5 });
});
//# sourceMappingURL=provisionOperatorAccounts.js.map