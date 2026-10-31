export declare function pollCopierCommands(instanceId: string, afterRevision: number): Promise<Record<string, unknown>>;
export declare function acknowledgeCopierCommand(input: {
    instanceId: string;
    commandId: string;
    revision: number;
    result: 'applied' | 'rejected' | 'retryable_error';
    observedState: string;
    observedAt: Date;
    errorCode?: string;
    copierAccountRef?: string;
}): Promise<{
    accepted: boolean;
    duplicate?: boolean;
    error_code?: string;
}>;
export declare function acceptCopierReconciliation(input: {
    instanceId: string;
    membershipId: string;
    snapshotId: string;
    observedAt: Date;
    authoritative: boolean;
    inflightEntryCommands: boolean;
    positions: Array<{
        positionRef: string;
        state: 'OPEN' | 'FLAT' | 'UNKNOWN';
        pendingExecutableOrders: boolean;
        inflightEntryCommands: boolean;
    }>;
}): Promise<{
    accepted: boolean;
    revocationQueued: boolean;
}>;
//# sourceMappingURL=copierControlService.d.ts.map