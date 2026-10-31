/**
 * Outbox Service (P5-01)
 * Reliable event publishing using outbox pattern.
 */
import { EventEmitter } from 'events';
import { OutboxEvent } from '../models/order';
export interface OutboxServiceOptions {
}
export declare class OutboxService extends EventEmitter {
    private outboxEvents;
    constructor(options?: OutboxServiceOptions);
    /**
     * Create an outbox event
     */
    createEvent(eventType: OutboxEvent['eventType'], aggregateId: string, aggregateType: 'ORDER' | 'USER' | 'ACCOUNT', payload: Record<string, unknown>): OutboxEvent;
    /**
     * Get event by ID
     */
    getEvent(eventId: string): OutboxEvent | null;
    /**
     * Get events by aggregate ID
     */
    getEventsByAggregate(aggregateId: string): OutboxEvent[];
    /**
     * Get unpublished events
     */
    getUnpublishedEvents(): OutboxEvent[];
    /**
     * Mark event as published
     */
    markEventPublished(eventId: string): OutboxEvent;
    /**
     * Reset all in-memory state (useful for test isolation)
     */
    reset(): void;
}
//# sourceMappingURL=outboxService.d.ts.map