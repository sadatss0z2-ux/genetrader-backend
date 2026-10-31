"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const copierControlService_1 = require("./src/services/copierControlService");
const database_1 = __importDefault(require("./src/config/database"));
async function main() {
    const res = await (0, copierControlService_1.pollCopierCommands)('genetrader-aws-vps-01', 0);
    console.log('POLL RESULT:', JSON.stringify(res, null, 2));
    await database_1.default.end();
    process.exit(0);
}
main();
//# sourceMappingURL=testPoll.js.map