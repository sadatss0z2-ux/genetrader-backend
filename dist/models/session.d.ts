export interface Session {
    id: number;
    user_id: number;
    token_hash: string;
    expires_at: Date;
    created_at: Date;
    revoked_at: Date | null;
    device_id: string | null;
    ip_address: string | null;
    user_agent: string | null;
    last_used_at: Date;
}
export interface CreateSession {
    user_id: number;
    token_hash: string;
    expires_at: Date;
    device_id?: string;
    ip_address?: string;
    user_agent?: string;
}
//# sourceMappingURL=session.d.ts.map