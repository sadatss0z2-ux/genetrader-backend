export declare function verificationEmailTemplate(code: string, displayName?: string, purpose?: 'verification' | 'password_reset'): {
    subject: string;
    html: string;
    text: string;
};
export declare function sendVerificationEmail(email: string, code: string, displayName?: string, purpose?: 'verification' | 'password_reset'): Promise<void>;
//# sourceMappingURL=verificationEmailService.d.ts.map