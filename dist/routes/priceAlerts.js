"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPriceAlertsRouter = createPriceAlertsRouter;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const VALID_DIRECTIONS = new Set(['ABOVE', 'BELOW']);
const VALID_FREQUENCIES = new Set(['ONCE', 'RECURRING']);
function jsonError(res, message, status = 400) {
    res.status(status).json({ error: message });
}
function readObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value
        : null;
}
function readSymbol(value) {
    if (typeof value !== 'string')
        return null;
    const symbol = value.trim().toUpperCase();
    return /^[A-Z0-9]{5,20}$/.test(symbol) ? symbol : null;
}
function readPrice(value) {
    if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '')
        return null;
    const valueAsNumber = Number(value);
    if (!Number.isFinite(valueAsNumber) || valueAsNumber <= 0)
        return null;
    return String(value).trim();
}
function readNote(value) {
    if (value === undefined)
        return undefined;
    if (value === null)
        return null;
    if (typeof value !== 'string')
        return undefined;
    const note = value.trim();
    return note ? note : null;
}
function validId(value) {
    return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);
}
function createPriceAlertsRouter(service) {
    const router = (0, express_1.Router)();
    router.get('/', auth_1.requireAuth, async (req, res, next) => {
        try {
            const symbol = req.query.symbol === undefined ? undefined : readSymbol(req.query.symbol);
            if (req.query.symbol !== undefined && !symbol) {
                jsonError(res, 'symbol must be a valid Binance Spot symbol.');
                return;
            }
            const alerts = await service.listForUser(req.user.userId, symbol ?? undefined);
            res.json({ alerts });
        }
        catch (error) {
            next(error);
        }
    });
    router.post('/', auth_1.requireAuth, async (req, res, next) => {
        try {
            const body = readObject(req.body);
            if (!body || Object.keys(body).some((key) => !['symbol', 'direction', 'targetPrice', 'frequency', 'note'].includes(key))) {
                jsonError(res, 'Invalid price alert request.');
                return;
            }
            const symbol = readSymbol(body.symbol);
            const targetPrice = readPrice(body.targetPrice);
            const direction = body.direction;
            const frequency = body.frequency;
            const note = body.note === undefined ? null : readNote(body.note);
            if (!symbol || !targetPrice || !VALID_DIRECTIONS.has(direction)
                || !VALID_FREQUENCIES.has(frequency) || note === undefined || (note?.length ?? 0) > 280) {
                jsonError(res, 'Provide a valid symbol, direction, target price, frequency, and optional note.');
                return;
            }
            const alert = await service.create(req.user.userId, {
                symbol,
                targetPrice,
                direction: direction,
                frequency: frequency,
                note,
            });
            res.status(201).json({ alert });
        }
        catch (error) {
            if (error.code === '23505') {
                jsonError(res, 'An identical active alert already exists.', 409);
                return;
            }
            next(error);
        }
    });
    router.patch('/:id', auth_1.requireAuth, async (req, res, next) => {
        try {
            if (!validId(req.params.id)) {
                jsonError(res, 'Invalid price alert id.');
                return;
            }
            const body = readObject(req.body);
            if (!body || Object.keys(body).some((key) => !['direction', 'targetPrice', 'frequency', 'note'].includes(key))) {
                jsonError(res, 'Invalid price alert request.');
                return;
            }
            const targetPrice = readPrice(body.targetPrice);
            const direction = body.direction;
            const frequency = body.frequency;
            const note = body.note === undefined ? null : readNote(body.note);
            if (!targetPrice || !VALID_DIRECTIONS.has(direction)
                || !VALID_FREQUENCIES.has(frequency) || note === undefined || (note?.length ?? 0) > 280) {
                jsonError(res, 'Provide a valid direction, target price, frequency, and optional note.');
                return;
            }
            const alert = await service.update(req.user.userId, req.params.id, {
                targetPrice,
                direction: direction,
                frequency: frequency,
                note,
            });
            if (!alert) {
                jsonError(res, 'Active price alert not found.', 404);
                return;
            }
            res.json({ alert });
        }
        catch (error) {
            if (error.code === '23505') {
                jsonError(res, 'An identical active alert already exists.', 409);
                return;
            }
            next(error);
        }
    });
    router.delete('/:id', auth_1.requireAuth, async (req, res, next) => {
        try {
            if (!validId(req.params.id)) {
                jsonError(res, 'Invalid price alert id.');
                return;
            }
            const alert = await service.cancel(req.user.userId, req.params.id);
            if (!alert) {
                jsonError(res, 'Active price alert not found.', 404);
                return;
            }
            res.json({ alert });
        }
        catch (error) {
            next(error);
        }
    });
    router.get('/:id/events', auth_1.requireAuth, async (req, res, next) => {
        try {
            if (!validId(req.params.id)) {
                jsonError(res, 'Invalid price alert id.');
                return;
            }
            const events = await service.listEventsForUser(req.user.userId, req.params.id);
            res.json({ events });
        }
        catch (error) {
            next(error);
        }
    });
    return router;
}
//# sourceMappingURL=priceAlerts.js.map