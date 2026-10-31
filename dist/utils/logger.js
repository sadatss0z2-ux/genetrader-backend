"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pino_1 = __importDefault(require("pino"));
const isDevelopment = process.env.NODE_ENV !== 'production';
const logger = (0, pino_1.default)({
    level: process.env.LOG_LEVEL ?? (isDevelopment ? 'debug' : 'info'),
    formatters: {
        level: (label) => {
            return { level: label };
        }
    },
    timestamp: pino_1.default.stdTimeFunctions.isoTime,
    serializers: {
        err: pino_1.default.stdSerializers.err,
        req: pino_1.default.stdSerializers.req,
        res: pino_1.default.stdSerializers.res
    },
    ...(isDevelopment
        ? {
            transport: {
                target: 'pino-pretty',
                options: {
                    colorize: true,
                    translateTime: 'HH:MM:ss Z',
                    ignore: 'pid,hostname'
                }
            }
        }
        : {
            redact: ['req.headers.authorization', 'req.headers.cookie'],
            base: {
                pid: process.pid,
                hostname: process.env.HOSTNAME || 'unknown'
            }
        })
});
exports.default = logger;
//# sourceMappingURL=logger.js.map