"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
exports.notFound = notFound;
exports.createError = createError;
function errorHandler(err, req, res, _next) {
    const status = err.statusCode ?? 500;
    const message = status === 500 ? 'Internal server error' : err.message;
    if (status === 500) {
        console.error('[ERROR]', err);
    }
    const errorResponse = {
        error: message,
        ...(err.code ? { code: err.code } : {}),
        status,
        request_id: req.request_id || 'unknown',
        timestamp: new Date().toISOString(),
        ...(err.details ? { details: err.details } : {}),
    };
    // Add path and method in non-production
    if (process.env.NODE_ENV !== 'production') {
        errorResponse.path = req.path;
        errorResponse.method = req.method;
        // Add stack trace for 500 errors in non-production
        if (status === 500 && err.stack) {
            errorResponse.stack = err.stack;
        }
    }
    res.status(status).json(errorResponse);
}
function notFound(req, res) {
    res.status(404).json({
        error: `Route not found: ${req.method} ${req.path}`,
        code: 'NOT_FOUND',
        status: 404,
        request_id: req.request_id || 'unknown',
        timestamp: new Date().toISOString(),
        ...(process.env.NODE_ENV !== 'production' ? { path: req.path, method: req.method } : {}),
    });
}
/** Convenience: create an AppError with a status code. */
function createError(message, statusCode, code) {
    const err = new Error(message);
    err.statusCode = statusCode;
    if (code)
        err.code = code;
    return err;
}
//# sourceMappingURL=errorHandler.js.map