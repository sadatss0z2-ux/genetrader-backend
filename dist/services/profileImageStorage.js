"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveProfileImageUrl = resolveProfileImageUrl;
exports.storeProfileImage = storeProfileImage;
exports.deleteStoredProfileImage = deleteStoredProfileImage;
const node_crypto_1 = require("node:crypto");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const errorHandler_1 = require("../middleware/errorHandler");
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 20_000_000;
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const IMAGE_FORMAT_BY_MIME = {
    'image/jpeg': 'jpeg',
    'image/png': 'png',
    'image/webp': 'webp',
};
let s3Client = null;
function getStorageConfig() {
    const endpoint = process.env.AWS_ENDPOINT_URL_S3;
    const region = process.env.AWS_REGION;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const bucket = process.env.PROFILE_IMAGES_BUCKET ?? 'uploads';
    if (!endpoint || !region || !accessKeyId || !secretAccessKey || !bucket) {
        throw (0, errorHandler_1.createError)('Profile image storage is not configured.', 503, 'PROFILE_IMAGE_STORAGE_UNAVAILABLE');
    }
    if (!s3Client) {
        s3Client = new client_s3_1.S3Client({
            endpoint,
            region,
            forcePathStyle: true,
            credentials: { accessKeyId, secretAccessKey },
        });
    }
    return { client: s3Client, bucket };
}
function parseObjectReference(reference) {
    if (!reference?.startsWith('object://'))
        return null;
    const path = reference.slice('object://'.length);
    const separator = path.indexOf('/');
    if (separator < 1 || separator === path.length - 1)
        return null;
    return { bucket: path.slice(0, separator), key: path.slice(separator + 1) };
}
async function resolveProfileImageUrl(reference) {
    const object = parseObjectReference(reference);
    if (!object)
        return reference;
    const { client, bucket } = getStorageConfig();
    if (object.bucket !== bucket) {
        throw (0, errorHandler_1.createError)('Profile image storage reference is invalid.', 500, 'PROFILE_IMAGE_REFERENCE_INVALID');
    }
    return (0, s3_request_presigner_1.getSignedUrl)(client, new client_s3_1.GetObjectCommand({
        Bucket: object.bucket,
        Key: object.key,
    }), { expiresIn: SIGNED_URL_TTL_SECONDS });
}
async function storeProfileImage(userId, image, contentType) {
    if (!Object.hasOwn(IMAGE_FORMAT_BY_MIME, contentType)) {
        throw (0, errorHandler_1.createError)('Choose a JPEG, PNG or WebP image.', 415, 'PROFILE_IMAGE_TYPE_UNSUPPORTED');
    }
    if (image.length === 0 || image.length > MAX_IMAGE_BYTES) {
        throw (0, errorHandler_1.createError)('Profile images must be smaller than 5 MB.', 413, 'PROFILE_IMAGE_SIZE_INVALID');
    }
    const expectedFormat = IMAGE_FORMAT_BY_MIME[contentType];
    const { default: sharp } = await Promise.resolve().then(() => __importStar(require('sharp')));
    let output;
    try {
        const pipeline = sharp(image, { limitInputPixels: MAX_IMAGE_PIXELS, animated: false });
        const metadata = await pipeline.metadata();
        if (metadata.format !== expectedFormat || (metadata.pages ?? 1) > 1) {
            throw (0, errorHandler_1.createError)('The image content does not match its file type or is animated.', 415, 'PROFILE_IMAGE_CONTENT_INVALID');
        }
        output = await pipeline
            .rotate()
            .resize(512, 512, { fit: 'cover', withoutEnlargement: true })
            .webp({ quality: 82 })
            .toBuffer();
    }
    catch (error) {
        if (typeof error === 'object' && error !== null && 'statusCode' in error)
            throw error;
        throw (0, errorHandler_1.createError)('The selected file is not a valid image.', 400, 'PROFILE_IMAGE_DECODE_FAILED');
    }
    const { client, bucket } = getStorageConfig();
    const key = `avatars/${userId}/${(0, node_crypto_1.randomUUID)()}.webp`;
    await client.send(new client_s3_1.PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: output,
        ContentType: 'image/webp',
        CacheControl: 'private, max-age=300',
    }));
    return `object://${bucket}/${key}`;
}
async function deleteStoredProfileImage(reference) {
    const object = parseObjectReference(reference);
    if (!object)
        return;
    const { client, bucket } = getStorageConfig();
    if (object.bucket !== bucket) {
        throw (0, errorHandler_1.createError)('Profile image storage reference is invalid.', 500, 'PROFILE_IMAGE_REFERENCE_INVALID');
    }
    await client.send(new client_s3_1.DeleteObjectCommand({ Bucket: object.bucket, Key: object.key }));
}
//# sourceMappingURL=profileImageStorage.js.map