"use strict";
/**
 * Outbox Service (P5-01)
 * Reliable event publishing using outbox pattern.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutboxService = void 0;
const events_1 = require("events");
const crypto_1 = require("crypto");
class OutboxService extends events_1.EventEmitter {
    outboxEvents = new Map();
    constructor(options = {}) {
        super();
    }
    /**
     * Create an outbox event
     */
    createEvent(eventType, aggregateId, aggregateType, payload) {
        const event = {
            id: (0, crypto_1.randomUUID)(),
            eventType,
            aggregateId,
            aggregateType,
            payload,
            published: false,
            publishedAt: null,
            createdAt: Date.now(),
        };
        this.outboxEvents.set(event.id, event);
        this.emit('eventCreated', event);
        return event;
    }
    /**
     * Get event by ID
     */
    getEvent(eventId) {
        return this.outboxEvents.get(eventId) || null;
    }
    /**
     * Get events by aggregate ID
     */
    getEventsByAggregate(aggregateId) {
        return Array.from(this.outboxEvents.values()).filter((e) => e.aggregateId === aggregateId);
    }
    /**
     * Get unpublished events
     */
    getUnpublishedEvents() {
        return Array.from(this.outboxEvents.values()).filter((e) => !e.published);
    }
    /**
     * Mark event as published
     */
    markEventPublished(eventId) {
        const event = this.outboxEvents.get(eventId);
        if (!event) {
            throw new Error(`Outbox event not found: ${eventId}`);
        }
        const updatedEvent = {
            ...event,
            published: true,
            publishedAt: Date.now(),
        };
        this.outboxEvents.set(eventId, updatedEvent);
        this.emit('eventPublished', updatedEvent);
        return updatedEvent;
    }
    /**
     * Reset all in-memory state (useful for test isolation)
     */
    reset() {
        this.outboxEvents.clear();
    }
}
exports.OutboxService = OutboxService;
//# sourceMappingURL=outboxService.js.map