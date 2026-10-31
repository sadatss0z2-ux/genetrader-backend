export interface CopierNotificationEvent {
    event_id: string;
    message: string;
    occurred_at: string;
    received_at: string;
}
export declare function isConfiguredCopierSourceMonitor(userId: number): Promise<boolean>;
export declare function storeCopierNotificationEvent(input: {
    eventId: string;
    message: string;
    occurredAt: Date;
}): Promise<boolean>;
export declare function listCopierNotificationEvents(limit: number, offset: number): Promise<CopierNotificationEvent[]>;
//# sourceMappingURL=copierNotificationService.d.ts.map