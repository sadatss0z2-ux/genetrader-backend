export interface Device {
    id: string;
    user_id: number;
    device_id: string;
    device_name: string | null;
    device_type: 'ios' | 'android' | 'web' | 'desktop' | null;
    platform: string | null;
    os_version: string | null;
    app_version: string | null;
    last_seen_at: Date;
    first_seen_at: Date;
    is_active: boolean;
    created_at: Date;
}
export interface CreateDevice {
    user_id: number;
    device_id: string;
    device_name?: string;
    device_type?: 'ios' | 'android' | 'web' | 'desktop';
    platform?: string;
    os_version?: string;
    app_version?: string;
}
//# sourceMappingURL=device.d.ts.map