export interface UserSettings {
    id: number;
    user_id: number;
    notifications_enabled: boolean;
    biometric_enabled: boolean;
    theme: string;
    created_at: Date;
    updated_at: Date;
}
export interface CreateUserSettings {
    user_id: number;
    notifications_enabled?: boolean;
    biometric_enabled?: boolean;
    theme?: string;
}
//# sourceMappingURL=settings.d.ts.map