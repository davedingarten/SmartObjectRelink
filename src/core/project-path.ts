export function normalizePath(value: string | null | undefined): string | null {
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

export function extractNativePath(value: unknown): string | null {
    if (typeof value === "string") {
        return normalizePath(value);
    }

    if (!value || typeof value !== "object") {
        return null;
    }

    const candidate = value as { nativePath?: unknown; path?: unknown; _path?: unknown };

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

export function getDirectoryPath(value: string | null | undefined): string | null {
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

export function getBasename(value: string | null | undefined): string {
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

export function isPathInsideRoot(candidatePath: string | null | undefined, rootPath: string | null | undefined): boolean {
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

export function shortenPath(value: string | null | undefined, keepSegments: number = 4): string {
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
