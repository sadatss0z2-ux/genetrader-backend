"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JWT_REFRESH_EXPIRES_IN = exports.JWT_EXPIRES_IN = exports.JWT_SECRET = void 0;
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)();
exports.JWT_SECRET = process.env.JWT_SECRET;
exports.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '15m';
exports.JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN ?? '30d';
if (!exports.JWT_SECRET)
    throw new Error('JWT_SECRET is not set');
//# sourceMappingURL=jwt.js.map