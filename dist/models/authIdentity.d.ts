export interface AuthIdentity {
    id: string;
    user_id: number;
    provider: 'google' | 'firebase' | 'apple' | 'github';
    provider_user_id: string;
    provider_email: string | null;
    email_verified: boolean;
    provider_metadata: Record<string, unknown>;
    last_used_at: Date;
    created_at: Date;
}
export interface CreateAuthIdentity {
    user_id: number;
    provider: 'google' | 'firebase' | 'apple' | 'github';
    provider_user_id: string;
    provider_email?: string;
    email_verified?: boolean;
    provider_metadata?: Record<string, unknown>;
}
//# sourceMappingURL=authIdentity.d.ts.map