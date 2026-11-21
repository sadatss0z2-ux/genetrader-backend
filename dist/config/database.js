"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const postgres_1 = __importDefault(require("postgres"));
const dotenv_1 = require("dotenv");
const path_1 = require("path");
(0, dotenv_1.config)({ path: (0, path_1.join)(process.cwd(), '.env') });
// Use new Neon project if old one (ep-calm-frog) is at quota
const DATABASE_URL =
    process.env.GT_DATABASE_URL ||
    process.env.GENETRADER_DB_URL ||
    (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('ep-calm-frog')
        ? process.env.DATABASE_URL
        : 'postgresql://neondb_owner:npg_TAY4zESFdu3m@ep-lingering-dew-be3eufeb-pooler.c-9.us-east-2.aws.neon.tech/neondb?sslmode=require');
if (!DATABASE_URL)
    throw new Error('DATABASE_URL is not set');
const databaseHost = new URL(DATABASE_URL).hostname;
const databaseSsl = ['localhost', '127.0.0.1', '::1'].includes(databaseHost) ? false : 'require';
const sql = (0, postgres_1.default)(DATABASE_URL, {
    ssl: databaseSsl,
    max: 5,
    idle_timeout: 10,
    max_lifetime: 300,
    connect_timeout: 10,
    onnotice: () => { },
    prepare: false,
});
exports.default = sql;