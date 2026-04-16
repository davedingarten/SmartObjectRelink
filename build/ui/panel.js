"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const project_path_1 = require("../core/project-path");
const photoshop_1 = require("../core/photoshop");
const { storage } = require("uxp");
const elements = {};
const state = {
    busy: false,
    scanned: false,
    pendingRefresh: false,
    hostRefreshTimer: null,
    manualProjectRootPath: null,
    activeDocumentFolder: null,
    projectRootPath: null,
    items: [],
    occurrenceCount: 0,
    documentCount: 0
};
window.addEventListener("beforeunload", () => {
    void (0, photoshop_1.unregisterHostNotifications)();
});
document.addEventListener("DOMContentLoaded", () => {
    void boot();
});
async function boot() {
    cacheElements();
    bindEvents();
    render();
    try {
        await (0, photoshop_1.registerHostNotifications)(() => {
            onHostChange();
        });
    }
    catch (error) {
        setStatus("Host notifications unavailable: " + simplifyError(error), "warning");
        return;
    }
    setStatus("Panel ready. Load smart objects to inspect linked assets.", "info");
}
function cacheElements() {
    elements.btnLoad = requireElement("btnLoad");
    elements.btnReload = requireElement("btnReload");
    elements.btnUpdate = requireElement("btnUpdate");
    elements.btnPickProjectRoot = requireElement("btnPickProjectRoot");
    elements.btnUseAutoRoot = requireElement("btnUseAutoRoot");
    elements.statusMessage = requireElement("statusMessage");
    elements.statsGrid = requireElement("statsGrid");
    elements.smartObjectList = requireElement("smartObjectList");
    elements.emptyState = requireElement("emptyState");
    elements.projectRootMode = requireElement("projectRootMode");
    elements.projectRootPath = requireElement("projectRootPath");
    elements.footerMeta = requireElement("footerMeta");
}
function bindEvents() {
    elements.btnLoad.addEventListener("click", () => {
        void loadSmartObjects(false);
    });
    elements.btnReload.addEventListener("click", () => {
        void loadSmartObjects(true);
    });
    elements.btnUpdate.addEventListener("click", () => {
        void updateSmartObjects();
    });
    elements.btnPickProjectRoot.addEventListener("click", () => {
        void chooseProjectRoot();
    });
    elements.btnUseAutoRoot.addEventListener("click", () => {
        void useAutoProjectRoot();
    });
}
async function loadSmartObjects(isReload) {
    if (state.busy) {
        state.pendingRefresh = true;
        return;
    }
    setBusy(true);
    setStatus(isReload ? "Reloading linked Smart Objects..." : "Scanning linked Smart Objects...", "info");
    try {
        const result = await (0, photoshop_1.scanSmartObjects)({
            projectRootPath: state.manualProjectRootPath
        });
        applyScanResult(result);
        state.scanned = true;
        render();
        setStatus(buildScanMessage(result), buildScanStatus(result));
    }
    catch (error) {
        setStatus("Failed to scan Smart Objects: " + simplifyError(error), "error");
    }
    finally {
        setBusy(false);
    }
}
async function updateSmartObjects() {
    if (state.busy) {
        return;
    }
    let pickedFiles;
    try {
        pickedFiles = await storage.localFileSystem.getFileForOpening({
            allowMultiple: true
        });
    }
    catch (error) {
        setStatus("File picker failed: " + simplifyError(error), "error");
        return;
    }
    const fileEntries = Array.isArray(pickedFiles) ? pickedFiles : [];
    if (fileEntries.length === 0) {
        return;
    }
    setBusy(true);
    setStatus("Relinking Smart Objects...", "info");
    try {
        const relinkResult = await (0, photoshop_1.relinkSmartObjects)(fileEntries);
        const scanResult = await (0, photoshop_1.scanSmartObjects)({
            projectRootPath: state.manualProjectRootPath
        });
        applyScanResult(scanResult);
        state.scanned = true;
        render();
        setStatus("Relinked " + String(relinkResult.relinkedLayerCount) + " Smart Object layer" + (relinkResult.relinkedLayerCount === 1 ? "" : "s") +
            " using " + String(relinkResult.matchedFileCount) + " selected file" + (relinkResult.matchedFileCount === 1 ? "" : "s") + ".", relinkResult.relinkedLayerCount > 0 ? "success" : "warning");
    }
    catch (error) {
        setStatus("Failed to relink Smart Objects: " + simplifyError(error), "error");
    }
    finally {
        setBusy(false);
    }
}
async function chooseProjectRoot() {
    if (state.busy) {
        return;
    }
    try {
        const folderEntry = await storage.localFileSystem.getFolder();
        const folderPath = (0, project_path_1.extractNativePath)(folderEntry);
        if (!folderPath) {
            return;
        }
        state.manualProjectRootPath = folderPath;
        renderProjectRoot();
        setStatus("Project root set to " + folderPath, "info");
        if (state.scanned) {
            await loadSmartObjects(true);
        }
    }
    catch (error) {
        setStatus("Failed to choose project folder: " + simplifyError(error), "error");
    }
}
async function useAutoProjectRoot() {
    state.manualProjectRootPath = null;
    renderProjectRoot();
    setStatus("Project root reset to active document folder.", "info");
    if (state.scanned) {
        await loadSmartObjects(true);
    }
}
function onHostChange() {
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
function applyScanResult(result) {
    state.items = result.items;
    state.occurrenceCount = result.occurrenceCount;
    state.documentCount = result.documentCount;
    state.projectRootPath = result.projectRootPath;
    state.activeDocumentFolder = result.activeDocumentFolder;
}
function render() {
    renderProjectRoot();
    renderStats();
    renderList();
    updateButtons();
    elements.footerMeta.textContent = "v0.1.0";
}
function renderProjectRoot() {
    if (state.manualProjectRootPath) {
        elements.projectRootMode.textContent = "Manual";
        elements.projectRootMode.className = "pill pill-warning";
        elements.projectRootPath.textContent = state.manualProjectRootPath;
        return;
    }
    elements.projectRootMode.textContent = "Auto";
    elements.projectRootMode.className = "pill pill-info";
    elements.projectRootPath.textContent = state.activeDocumentFolder || "Using active document folder";
}
function renderStats() {
    const missingCount = state.items.reduce((total, item) => total + item.missingCount, 0);
    const outsideCount = state.items.reduce((total, item) => total + item.outsideProjectRootCount, 0);
    const stats = [
        { label: "Documents", value: String(state.documentCount) },
        { label: "Unique Files", value: String(state.items.length) },
        { label: "Occurrences", value: String(state.occurrenceCount) },
        { label: "Missing Links", value: String(missingCount) },
        { label: "Outside Root", value: String(outsideCount) }
    ];
    elements.statsGrid.innerHTML = "";
    for (let index = 0; index < stats.length; index += 1) {
        const stat = stats[index];
        const statEl = document.createElement("div");
        statEl.className = "stat";
        const valueEl = document.createElement("span");
        valueEl.className = "stat-value";
        valueEl.textContent = stat.value;
        const labelEl = document.createElement("span");
        labelEl.className = "stat-label";
        labelEl.textContent = stat.label;
        statEl.appendChild(valueEl);
        statEl.appendChild(labelEl);
        elements.statsGrid.appendChild(statEl);
    }
}
function renderList() {
    elements.smartObjectList.innerHTML = "";
    if (!state.scanned) {
        elements.emptyState.style.display = "block";
        elements.emptyState.textContent = "Load smart objects to scan all currently open Photoshop documents.";
        return;
    }
    if (state.documentCount === 0) {
        elements.emptyState.style.display = "block";
        elements.emptyState.textContent = "No open Photoshop documents found.";
        return;
    }
    if (state.items.length === 0) {
        elements.emptyState.style.display = "block";
        elements.emptyState.textContent = "No linked Smart Objects found in the current set of open documents.";
        return;
    }
    elements.emptyState.style.display = "none";
    for (let index = 0; index < state.items.length; index += 1) {
        const item = state.items[index];
        elements.smartObjectList.appendChild(renderItem(item));
    }
}
function renderItem(item) {
    const itemEl = document.createElement("div");
    itemEl.className = "item";
    const topEl = document.createElement("div");
    topEl.className = "item-top";
    const nameEl = document.createElement("div");
    nameEl.className = "item-name";
    nameEl.textContent = item.fileReference;
    topEl.appendChild(nameEl);
    itemEl.appendChild(topEl);
    const badgesEl = document.createElement("div");
    badgesEl.className = "item-badges";
    badgesEl.appendChild(makePill(item.totalCount + " use" + (item.totalCount === 1 ? "" : "s"), "pill-info"));
    if (item.missingCount > 0) {
        badgesEl.appendChild(makePill(item.missingCount + " missing", "pill-danger"));
    }
    else {
        badgesEl.appendChild(makePill("all linked", "pill-success"));
    }
    if (item.outsideProjectRootCount > 0) {
        badgesEl.appendChild(makePill(item.outsideProjectRootCount + " outside root", "pill-warning"));
    }
    itemEl.appendChild(badgesEl);
    const metaEl = document.createElement("div");
    metaEl.className = "item-meta";
    const pathEl = document.createElement("div");
    pathEl.textContent = "Path: " + (0, project_path_1.shortenPath)(item.linkedPaths[0] || null);
    metaEl.appendChild(pathEl);
    if (item.linkedPaths.length > 1) {
        const altPathEl = document.createElement("div");
        altPathEl.textContent = "Multiple source paths detected across open documents.";
        metaEl.appendChild(altPathEl);
    }
    const docsEl = document.createElement("div");
    docsEl.textContent = "Documents: " + item.documentNames.join(", ");
    metaEl.appendChild(docsEl);
    itemEl.appendChild(metaEl);
    return itemEl;
}
function makePill(text, className) {
    const pill = document.createElement("span");
    pill.className = "pill " + className;
    pill.textContent = text;
    return pill;
}
function updateButtons() {
    const hasItems = state.items.length > 0;
    elements.btnLoad.disabled = state.busy;
    elements.btnReload.disabled = state.busy || !state.scanned;
    elements.btnUpdate.disabled = state.busy || !hasItems;
    elements.btnPickProjectRoot.disabled = state.busy;
    elements.btnUseAutoRoot.disabled = state.busy || state.manualProjectRootPath === null;
}
function setBusy(nextBusy) {
    state.busy = nextBusy;
    updateButtons();
    if (!nextBusy && state.pendingRefresh) {
        state.pendingRefresh = false;
        void loadSmartObjects(true);
    }
}
function setStatus(message, kind) {
    elements.statusMessage.className = "status status-" + kind;
    elements.statusMessage.textContent = message;
}
function buildScanMessage(result) {
    if (result.documentCount === 0) {
        return "No open Photoshop documents found.";
    }
    if (result.items.length === 0) {
        return "Scan complete. No linked Smart Objects found.";
    }
    const missingCount = result.items.reduce((total, item) => total + item.missingCount, 0);
    const outsideCount = result.items.reduce((total, item) => total + item.outsideProjectRootCount, 0);
    return "Scan complete. Found " +
        String(result.items.length) + " unique linked file" + (result.items.length === 1 ? "" : "s") +
        " across " + String(result.occurrenceCount) + " Smart Object layer" + (result.occurrenceCount === 1 ? "" : "s") +
        ". Missing: " + String(missingCount) + ". Outside root: " + String(outsideCount) + ".";
}
function buildScanStatus(result) {
    if (result.documentCount === 0) {
        return "warning";
    }
    const missingCount = result.items.reduce((total, item) => total + item.missingCount, 0);
    const outsideCount = result.items.reduce((total, item) => total + item.outsideProjectRootCount, 0);
    if (missingCount > 0 || outsideCount > 0) {
        return "warning";
    }
    return "success";
}
function simplifyError(error) {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    if (typeof error === "string") {
        return error;
    }
    return "Unknown error";
}
function requireElement(id) {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error("Missing required element: " + id);
    }
    return element;
}
