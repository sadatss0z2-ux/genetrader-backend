"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.firebaseMessaging = exports.firebaseAuth = void 0;
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)();
function getFirebaseApp() {
    const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
    if (!projectId || !clientEmail || !privateKey) {
        const error = new Error('Google sign-in is not configured on this server.');
        error.statusCode = 503;
        throw error;
    }
    if (!firebase_admin_1.default.apps.length) {
        firebase_admin_1.default.initializeApp({
            credential: firebase_admin_1.default.credential.cert({ projectId, clientEmail, privateKey }),
        });
    }
    return firebase_admin_1.default.app();
}
function getFirebaseAuth() {
    return firebase_admin_1.default.auth(getFirebaseApp());
}
exports.firebaseAuth = {
    async verifyIdToken(idToken) {
        return getFirebaseAuth().verifyIdToken(idToken);
    },
};
exports.firebaseMessaging = {
    async sendEachForMulticast(message) {
        return firebase_admin_1.default.messaging(getFirebaseApp()).sendEachForMulticast(message);
    },
};
exports.default = firebase_admin_1.default;
//# sourceMappingURL=firebase.js.map