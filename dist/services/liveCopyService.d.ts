import type postgres from 'postgres';
type Tx = postgres.TransactionSql;
export declare function assertLiveCopyReady(tx: Tx, userId: number, requireOptIn?: boolean): Promise<void>;
export declare function setLiveCopyOptIn(userId: number, enabled: boolean, consentVersion: string): Promise<{
    enabled: boolean;
    consentedAt: string | null;
}>;
export declare function activatePendingLivePayments(tx: Tx, instanceId: string, snapshotId: string, flat: boolean): Promise<number>;
export declare function recordCopierSourceState(input: {
    instanceId: string;
    snapshotId: string;
    observedAt: Date;
    openTradeCount: number;
    inflightEntryCommands: boolean;
}): Promise<{
    accepted: true;
    activations: number;
}>;
export declare function getCopierMemberCredentials(instanceId: string, membershipId: string): Promise<{
    membership_id: string;
    account_ref: string;
    testnet: boolean;
    api_key: string;
    api_secret: string;
}>;
export declare function listCopierLiveMemberships(instanceId: string): Promise<Array<{
    membership_id: string;
    account_ref: string;
    state: 'PAID_ACTIVE' | 'CLOSEOUT_ONLY';
    position_scopes: Array<{
        position_ref: string;
        allowed_actions: string[];
    }>;
}>>;
export {};
//# sourceMappingURL=liveCopyService.d.ts.map