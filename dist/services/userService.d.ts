export interface UserProfile {
    id: number;
    email: string;
    displayName: string | null;
    photoUrl: string | null;
    referralCode: string;
    referredById: number | null;
    plan: string;
    createdAt: Date;
    lastLoginAt: Date | null;
}
export interface UserSettings {
    notificationsEnabled: boolean;
    biometricEnabled: boolean;
    theme: string;
}
export declare function getUserProfile(userId: number): Promise<UserProfile>;
export declare function updateUserProfile(userId: number, updates: {
    displayName?: string;
    photoUrl?: string | null;
}): Promise<UserProfile>;
export declare function replaceUserProfileImage(userId: number, imageReference: string): Promise<UserProfile>;
export declare function getUserSettings(userId: number): Promise<UserSettings>;
export declare function updateUserSettings(userId: number, updates: Partial<UserSettings>): Promise<UserSettings>;
//# sourceMappingURL=userService.d.ts.map