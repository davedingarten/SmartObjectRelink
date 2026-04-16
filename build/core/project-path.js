"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePath = normalizePath;
exports.extractNativePath = extractNativePath;
exports.getDirectoryPath = getDirectoryPath;
exports.getBasename = getBasename;
exports.isPathInsideRoot = isPathInsideRoot;
exports.shortenPath = shortenPath;
function normalizePath(value) {
    if (!value) {
        return null;
    }
    const trimmed = String(value).trim();
    if (!trimmed) {
        return null;
    }
    const normalized = trimmed.replace(/\\/g, "/");
    if (normalized === "/") {
        return normalized;
    }
    return normalized.replace(/\/+$/, "");
}
function extractNativePath(value) {
    if (typeof value === "string") {
        return normalizePath(value);
    }
    if (!value || typeof value !== "object") {
        return null;
    }
    const candidate = value;
    if (typeof candidate.nativePath === "string") {
        return normalizePath(candidate.nativePath);
    }
    if (typeof candidate.path === "string") {
        return normalizePath(candidate.path);
    }
    if (typeof candidate._path === "string") {
        return normalizePath(candidate._path);
    }
    return null;
}
function getDirectoryPath(value) {
    const normalized = normalizePath(value);
    if (!normalized) {
        return null;
    }
    const index = normalized.lastIndexOf("/");
    if (index < 0) {
        return null;
    }
    if (index === 0) {
        return "/";
    }
    return normalized.slice(0, index);
}
function getBasename(value) {
    const normalized = normalizePath(value);
    if (!normalized) {
        return "";
    }
    const index = normalized.lastIndexOf("/");
    if (index < 0) {
        return normalized;
    }
    return normalized.slice(index + 1);
}
function isPathInsideRoot(candidatePath, rootPath) {
    const candidate = normalizePath(candidatePath);
    const root = normalizePath(rootPath);
    if (!candidate || !root) {
        return false;
    }
    if (candidate === root) {
        return true;
    }
    return candidate.indexOf(root + "/") === 0;
}
function shortenPath(value, keepSegments = 4) {
    const normalized = normalizePath(value);
    if (!normalized) {
        return "Unknown path";
    }
    const segments = normalized.split("/").filter(Boolean);
    if (segments.length <= keepSegments) {
        return normalized;
    }
    return ".../" + segments.slice(segments.length - keepSegments).join("/");
}
