export interface User {
    id: number;
    email: string;
    google_id: string;
    display_name: string | null;
    photo_url: string | null;
    referral_code: string;
    referred_by_id: number | null;
    plan: string;
    created_at: Date;
    updated_at: Date;
    last_login_at: Date | null;
    is_active: boolean;
    tenant_id: string | null;
    deleted_at: Date | null;
    email_verified_at: Date | null;
    phone_number: string | null;
    phone_verified_at: Date | null;
}
export interface CreateUser {
    email: string;
    google_id: string;
    display_name?: string;
    photo_url?: string;
    referral_code: string;
    referred_by_id?: number;
    plan?: string;
    tenant_id?: string;
}
//# sourceMappingURL=user.d.ts.map