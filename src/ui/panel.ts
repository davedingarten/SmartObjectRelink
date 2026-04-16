import { shortenPath } from "../core/project-path";
import { registerHostNotifications, relinkSmartObjects, scanSmartObjects, unregisterHostNotifications } from "../core/photoshop";
import type { ScanResult, SmartObjectSummary } from "../types";

const { storage } = require("uxp");

type StatusKind = "info" | "success" | "warning" | "error";

type PanelElements = {
    btnLoad: HTMLButtonElement;
    btnReload: HTMLButtonElement;
    btnUpdate: HTMLButtonElement;
    loadCard: HTMLDivElement;
    listCard: HTMLDivElement;
    statusMessage: HTMLDivElement;
    smartObjectList: HTMLDivElement;
    emptyState: HTMLDivElement;
    footerMeta: HTMLSpanElement;
};

type PanelState = {
    busy: boolean;
    scanned: boolean;
    pendingRefresh: boolean;
    hostRefreshTimer: number | null;
    items: SmartObjectSummary[];
    occurrenceCount: number;
    documentCount: number;
};

const elements = {} as PanelElements;

const state: PanelState = {
    busy: false,
    scanned: false,
    pendingRefresh: false,
    hostRefreshTimer: null,
    items: [],
    occurrenceCount: 0,
    documentCount: 0
};

window.addEventListener("beforeunload", () => {
    void unregisterHostNotifications();
});

document.addEventListener("DOMContentLoaded", () => {
    void boot();
});

async function boot(): Promise<void> {
    cacheElements();
    bindEvents();
    render();

    try {
        await registerHostNotifications(() => {
            onHostChange();
        });
    } catch (error) {
        setStatus("Host notifications unavailable: " + simplifyError(error), "warning");
        return;
    }

    setStatus("Panel ready. Load smart objects to inspect the current document.", "info");
}

function cacheElements(): void {
    elements.btnLoad = requireElement<HTMLButtonElement>("btnLoad");
    elements.btnReload = requireElement<HTMLButtonElement>("btnReload");
    elements.btnUpdate = requireElement<HTMLButtonElement>("btnUpdate");
    elements.loadCard = requireElement<HTMLDivElement>("loadCard");
    elements.listCard = requireElement<HTMLDivElement>("listCard");
    elements.statusMessage = requireElement<HTMLDivElement>("statusMessage");
    elements.smartObjectList = requireElement<HTMLDivElement>("smartObjectList");
    elements.emptyState = requireElement<HTMLDivElement>("emptyState");
    elements.footerMeta = requireElement<HTMLSpanElement>("footerMeta");
}

function bindEvents(): void {
    elements.btnLoad.addEventListener("click", () => {
        void loadSmartObjects(false);
    });

    elements.btnReload.addEventListener("click", () => {
        void loadSmartObjects(true);
    });

    elements.btnUpdate.addEventListener("click", () => {
        void updateSmartObjects();
    });
}

async function loadSmartObjects(isReload: boolean): Promise<void> {
    if (state.busy) {
        state.pendingRefresh = true;
        return;
    }

    setBusy(true);
    setStatus(isReload ? "Reloading linked Smart Objects..." : "Loading linked Smart Objects...", "info");

    try {
        const result = await scanSmartObjects();
        applyScanResult(result);
        state.scanned = true;
        render();
        setStatus(buildScanMessage(result), buildScanStatus(result));
    } catch (error) {
        setStatus("Failed to scan Smart Objects: " + simplifyError(error), "error");
    } finally {
        setBusy(false);
    }
}

async function updateSmartObjects(): Promise<void> {
    if (state.busy) {
        return;
    }

    let pickedFiles: unknown;
    try {
        pickedFiles = await storage.localFileSystem.getFileForOpening({
            allowMultiple: true
        });
    } catch (error) {
        if (isUserCancelError(error)) {
            return;
        }

        setStatus("File picker failed: " + simplifyError(error), "error");
        return;
    }

    const fileEntries = Array.isArray(pickedFiles) ? pickedFiles : [];
    if (fileEntries.length === 0) {
        return;
    }

    setBusy(true);
    setStatus("Updating Smart Objects...", "info");

    try {
        const relinkResult = await relinkSmartObjects(fileEntries);
        const scanResult = await scanSmartObjects();

        applyScanResult(scanResult);
        state.scanned = true;
        render();

        if (relinkResult.matchedFileCount === 0) {
            setStatus("No selected files matched any linked Smart Object filenames.", "warning");
        } else {
            setStatus(
                "Updated " + String(relinkResult.relinkedLayerCount) + " Smart Object layer" + (relinkResult.relinkedLayerCount === 1 ? "" : "s") +
                " using " + String(relinkResult.matchedFileCount) + " matched file" + (relinkResult.matchedFileCount === 1 ? "" : "s") + ".",
                relinkResult.relinkedLayerCount > 0 ? "success" : "warning"
            );
        }
    } catch (error) {
        setStatus("Failed to update Smart Objects: " + simplifyError(error), "error");
    } finally {
        setBusy(false);
    }
}

function onHostChange(): void {
    if (!state.scanned) {
        return;
    }

    if (state.hostRefreshTimer !== null) {
        window.clearTimeout(state.hostRefreshTimer);
    }

    state.hostRefreshTimer = window.setTimeout(() => {
        state.hostRefreshTimer = null;
        void loadSmartObjects(true);
    }, 250);
}

function applyScanResult(result: ScanResult): void {
    state.items = result.items;
    state.occurrenceCount = result.occurrenceCount;
    state.documentCount = result.documentCount;
}

function render(): void {
    elements.loadCard.style.display = state.scanned ? "none" : "block";
    elements.listCard.style.display = state.scanned ? "block" : "none";
    renderList();
    updateButtons();
    elements.footerMeta.textContent = "v0.1.0";
}

function renderList(): void {
    elements.smartObjectList.innerHTML = "";

    if (!state.scanned) {
        elements.emptyState.style.display = "block";
        elements.emptyState.textContent = "Load smart objects to inspect the current Photoshop document.";
        return;
    }

    if (state.documentCount === 0) {
        elements.emptyState.style.display = "block";
        elements.emptyState.textContent = "No active Photoshop document found.";
        return;
    }

    if (state.items.length === 0) {
        elements.emptyState.style.display = "block";
        elements.emptyState.textContent = "No linked Smart Objects found in the current Photoshop document.";
        return;
    }

    elements.emptyState.style.display = "none";

    for (let index = 0; index < state.items.length; index += 1) {
        elements.smartObjectList.appendChild(renderItem(state.items[index]));
    }
}

function renderItem(item: SmartObjectSummary): HTMLDivElement {
    const itemEl = document.createElement("div");
    itemEl.className = "item";

    const nameEl = document.createElement("div");
    nameEl.className = "item-name";
    nameEl.textContent = item.fileReference;
    itemEl.appendChild(nameEl);

    const badgesEl = document.createElement("div");
    badgesEl.className = "item-badges";
    badgesEl.appendChild(makePill(item.totalCount + " use" + (item.totalCount === 1 ? "" : "s"), "pill-info"));

    if (item.missingCount > 0) {
        badgesEl.appendChild(makePill(item.missingCount + " missing", "pill-danger"));
    } else {
        badgesEl.appendChild(makePill("linked", "pill-success"));
    }

    itemEl.appendChild(badgesEl);

    const metaEl = document.createElement("div");
    metaEl.className = "item-meta";

    const pathEl = document.createElement("div");
    pathEl.textContent = "Path: " + shortenPath(item.linkedPaths[0] || null);
    metaEl.appendChild(pathEl);

    if (item.linkedPaths.length > 1) {
        const altPathEl = document.createElement("div");
        altPathEl.textContent = "Multiple source paths detected in the current document.";
        metaEl.appendChild(altPathEl);
    }

    itemEl.appendChild(metaEl);
    return itemEl;
}

function makePill(text: string, className: string): HTMLSpanElement {
    const pill = document.createElement("span");
    pill.className = "pill " + className;
    pill.textContent = text;
    return pill;
}

function updateButtons(): void {
    const hasItems = state.items.length > 0;

    elements.btnLoad.disabled = state.busy;
    elements.btnReload.disabled = state.busy || !state.scanned;
    elements.btnUpdate.disabled = state.busy || !hasItems;
}

function setBusy(nextBusy: boolean): void {
    state.busy = nextBusy;
    updateButtons();

    if (!nextBusy && state.pendingRefresh) {
        state.pendingRefresh = false;
        void loadSmartObjects(true);
    }
}

function setStatus(message: string, kind: StatusKind): void {
    elements.statusMessage.className = "status status-" + kind;
    elements.statusMessage.textContent = message;
}

function buildScanMessage(result: ScanResult): string {
    if (result.documentCount === 0) {
        return "No active Photoshop document found.";
    }

    if (result.items.length === 0) {
        return "No linked Smart Objects found in the current document.";
    }

    const missingCount = result.items.reduce((total, item) => total + item.missingCount, 0);

    return "Found " +
        String(result.items.length) + " linked file" + (result.items.length === 1 ? "" : "s") +
        " across " + String(result.occurrenceCount) + " Smart Object layer" + (result.occurrenceCount === 1 ? "" : "s") +
        ". Missing: " + String(missingCount) + ".";
}

function buildScanStatus(result: ScanResult): StatusKind {
    if (result.documentCount === 0) {
        return "warning";
    }

    const missingCount = result.items.reduce((total, item) => total + item.missingCount, 0);
    return missingCount > 0 ? "warning" : "success";
}

function simplifyError(error: unknown): string {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    if (typeof error === "string") {
        return error;
    }

    return "Unknown error";
}

function isUserCancelError(error: unknown): boolean {
    if (!error) {
        return false;
    }

    if (typeof error === "object" && error !== null && "number" in error) {
        const candidate = error as { number?: unknown };
        if (candidate.number === 9) {
            return true;
        }
    }

    const message = simplifyError(error).toLowerCase();
    return message.indexOf("cancel") >= 0 || message.indexOf("abort") >= 0;
}

function requireElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error("Missing required element: " + id);
    }

    return element as T;
}
