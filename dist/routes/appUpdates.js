"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const express_1 = require("express");
const router = (0, express_1.Router)();
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const SHA256_PATTERN = /^[a-fA-F0-9]{64}$/;
/** Private/loopback hostnames that are safe to serve without TLS in LAN/dev mode. */
const PRIVATE_HOST_RE = /^(localhost|127\.0\.0\.1|10\.0\.2\.2|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;
function parseVersion(value) {
    if (!VERSION_PATTERN.test(value))
        return null;
    const parts = value.split('.').map(Number);
    return parts.every(Number.isSafeInteger) ? parts : null;
}
function compareVersions(left, right) {
    for (let index = 0; index < 3; index += 1) {
        if (left[index] !== right[index])
            return left[index] > right[index] ? 1 : -1;
    }
    return 0;
}
/** Returns true when the URL is safe to use as an APK download source. */
function isAllowedApkUrl(u) {
    if (u.username || u.password)
        return false;
    if (u.protocol === 'https:')
        return true;
    // Allow plain HTTP for private/LAN hosts so self-hosted APKs work without TLS.
    if (u.protocol === 'http:')
        return PRIVATE_HOST_RE.test(u.hostname);
    return false;
}
// ── GET /api/app-updates/android — version manifest ─────────────────────────
router.get('/android', (req, res) => {
    dotenv_1.default.config({ override: true });
    res.set('Cache-Control', 'no-store');
    const currentVersion = typeof req.query.currentVersion === 'string'
        ? req.query.currentVersion
        : '';
    const currentParts = parseVersion(currentVersion);
    if (!currentParts) {
        res.status(400).json({ error: 'A valid currentVersion in major.minor.patch format is required.' });
        return;
    }
    const version = process.env.ANDROID_UPDATE_VERSION?.trim();
    const sha256 = process.env.ANDROID_UPDATE_SHA256?.trim();
    const releaseNotes = process.env.ANDROID_UPDATE_RELEASE_NOTES?.trim() ?? '';
    const forceBelowVersion = process.env.ANDROID_UPDATE_FORCE_BELOW_VERSION?.trim();
    // Resolve APK URL: explicit env var takes priority, otherwise auto-generate
    // a self-hosted URL from the backend's public base URL.
    const apkUrlRaw = (() => {
        const explicit = process.env.ANDROID_UPDATE_APK_URL?.trim();
        if (explicit)
            return explicit;
        const base = process.env.BACKEND_PUBLIC_URL?.trim().replace(/\/+$/, '');
        if (base)
            return `${base}/api/app-updates/android/download`;
        return undefined;
    })();
    if (!version && !apkUrlRaw && !sha256 && !forceBelowVersion) {
        res.json({ available: false });
        return;
    }
    if (!version || !apkUrlRaw || !sha256 || !parseVersion(version) || !SHA256_PATTERN.test(sha256)
        || releaseNotes.length > 2000 || (forceBelowVersion && !parseVersion(forceBelowVersion))) {
        console.error('[AppUpdates] Android update metadata is incomplete or invalid.');
        res.status(503).json({ error: 'Android update service is not correctly configured.' });
        return;
    }
    let downloadUrl;
    try {
        downloadUrl = new URL(apkUrlRaw);
    }
    catch {
        console.error('[AppUpdates] Android update APK URL is invalid.');
        res.status(503).json({ error: 'Android update service is not correctly configured.' });
        return;
    }
    if (!isAllowedApkUrl(downloadUrl)) {
        console.error('[AppUpdates] Android update APK URL must use HTTPS (or HTTP for private LAN hosts) without embedded credentials.');
        res.status(503).json({ error: 'Android update service is not correctly configured.' });
        return;
    }
    const latestParts = parseVersion(version);
    const minimumParts = forceBelowVersion ? parseVersion(forceBelowVersion) : null;
    if (minimumParts && compareVersions(minimumParts, latestParts) > 0) {
        console.error('[AppUpdates] Android force-update version exceeds the latest release.');
        res.status(503).json({ error: 'Android update service is not correctly configured.' });
        return;
    }
    if (compareVersions(latestParts, currentParts) <= 0) {
        res.json({ available: false });
        return;
    }
    res.json({
        available: true,
        version,
        apkUrl: downloadUrl.toString(),
        sha256: sha256.toLowerCase(),
        releaseNotes,
        forceUpdate: minimumParts ? compareVersions(currentParts, minimumParts) < 0 : false,
    });
});
// ── GET /api/app-updates/android/download — serves the APK file ─────────────
// Enabled only when ANDROID_UPDATE_APK_PATH is set to an absolute file path.
router.get('/android/download', (req, res) => {
    dotenv_1.default.config({ override: true });
    const apkPath = process.env.ANDROID_UPDATE_APK_PATH?.trim();
    if (!apkPath) {
        res.status(404).json({ error: 'Self-hosted APK download is not configured on this server.' });
        return;
    }
    // Resolve to an absolute path and guard against directory traversal.
    const resolved = path_1.default.resolve(apkPath);
    if (resolved !== apkPath && !resolved.startsWith(path_1.default.resolve(path_1.default.dirname(apkPath)))) {
        console.error('[AppUpdates] APK path resolution mismatch — possible traversal attempt.');
        res.status(403).json({ error: 'Forbidden.' });
        return;
    }
    if (!fs_1.default.existsSync(resolved)) {
        console.error(`[AppUpdates] APK file not found at configured path: ${resolved}`);
        res.status(404).json({ error: 'APK file not found on this server.' });
        return;
    }
    const stat = fs_1.default.statSync(resolved);
    const versionSlug = (process.env.ANDROID_UPDATE_VERSION?.trim() ?? 'latest').replace(/[^a-z0-9._-]/gi, '_');
    const fileName = `GeneTrader-${versionSlug}.apk`;
    res.set({
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String(stat.size),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
    });
    fs_1.default.createReadStream(resolved).pipe(res);
});
exports.default = router;
//# sourceMappingURL=appUpdates.js.map