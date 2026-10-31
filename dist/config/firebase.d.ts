import admin from 'firebase-admin';
export declare const firebaseAuth: {
    verifyIdToken(idToken: string): Promise<import("firebase-admin/lib/auth/token-verifier").DecodedIdToken>;
};
export declare const firebaseMessaging: {
    sendEachForMulticast(message: {
        tokens: string[];
        notification: {
            title: string;
            body: string;
        };
        data: Record<string, string>;
    }): Promise<import("firebase-admin/lib/messaging/messaging-api").BatchResponse>;
};
export default admin;
//# sourceMappingURL=firebase.d.ts.map