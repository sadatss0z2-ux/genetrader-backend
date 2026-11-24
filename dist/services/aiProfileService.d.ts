export type AiExperienceLevel = 'beginner' | 'intermediate' | 'advanced' | 'unspecified';
export type AiTimeHorizon = 'short' | 'medium' | 'long' | 'unspecified';
export type AiRiskComfort = 'low' | 'moderate' | 'high' | 'unspecified';
export type AiResponseStyle = 'concise' | 'detailed';
export interface AiUserPreferences {
    goal: string;
    experienceLevel: AiExperienceLevel;
    timeHorizon: AiTimeHorizon;
    riskComfort: AiRiskComfort;
    watchlist: string[];
    responseStyle: AiResponseStyle;
}
export interface AiStoredMessage {
    role: 'user' | 'assistant';
    text: string;
    createdAt: string;
}
export interface AiUserProfile {
    memoryEnabled: boolean;
    preferences: AiUserPreferences;
    recentMessages: AiStoredMessage[];
    updatedAt: string | null;
}
export declare const DEFAULT_AI_PREFERENCES: AiUserPreferences;
export declare function getAiUserProfile(userId: number): Promise<AiUserProfile>;
export declare function saveAiUserProfile(userId: number, memoryEnabled: boolean, preferences: AiUserPreferences, recentMessages?: AiStoredMessage[]): Promise<AiUserProfile>;
export declare function appendAiConversation(userId: number, userText: string, assistantText: string): Promise<void>;
export declare function clearAiUserProfile(userId: number): Promise<void>;
//# sourceMappingURL=aiProfileService.d.ts.map