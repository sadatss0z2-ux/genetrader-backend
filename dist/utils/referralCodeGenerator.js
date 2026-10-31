"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateUniqueReferralCode = generateUniqueReferralCode;
const crypto_1 = __importDefault(require("crypto"));
const database_1 = __importDefault(require("../config/database"));
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I — easier to read
const CODE_LENGTH = 8;
/** Generate a cryptographically random referral code. */
function generateRaw() {
    const bytes = crypto_1.default.randomBytes(CODE_LENGTH);
    return Array.from(bytes)
        .map(b => CHARSET[b % CHARSET.length])
        .join('');
}
/**
 * Generate a unique referral code guaranteed not to collide with existing codes.
 * Tries up to 10 times before throwing (astronomically unlikely to need more).
 */
async function generateUniqueReferralCode(isTaken = async (code) => {
    const exists = await (0, database_1.default) `
      SELECT 1 FROM users WHERE referral_code = ${code} LIMIT 1
    `;
    return exists.length > 0;
}) {
    for (let attempt = 0; attempt < 10; attempt++) {
        const code = generateRaw();
        if (!await isTaken(code))
            return code;
    }
    throw new Error('Failed to generate unique referral code after 10 attempts');
}
//# sourceMappingURL=referralCodeGenerator.js.map