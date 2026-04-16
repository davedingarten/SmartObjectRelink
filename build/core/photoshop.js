"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerHostNotifications = registerHostNotifications;
exports.unregisterHostNotifications = unregisterHostNotifications;
exports.scanSmartObjects = scanSmartObjects;
exports.relinkSmartObjects = relinkSmartObjects;
const project_path_1 = require("./project-path");
const { action, app, core } = require("photoshop");
const { storage } = require("uxp");
let notificationListener = null;
let hostNotificationSuppressionDepth = 0;
let hostNotificationSuppressionUntil = 0;
async function registerHostNotifications(callback) {
    await unregisterHostNotifications();
    const listener = function (_eventName, _descriptor) {
        if (shouldIgnoreHostNotification()) {
            return;
        }
        callback();
    };
    await action.addNotificationListener(["select", "open", "close"], listener);
    notificationListener = listener;
}
async function unregisterHostNotifications() {
    if (!notificationListener) {
        return;
    }
    try {
        await action.removeNotificationListener(["select", "open", "close"], notificationListener);
    }
    catch (_error) {
    }
    finally {
        notificationListener = null;
    }
}
async function scanSmartObjects(options) {
    const documents = getOpenDocuments();
    const activeDocumentFolder = getActiveDocumentFolder();
    const projectRootPath = (0, project_path_1.normalizePath)(options.projectRootPath || activeDocumentFolder);
    if (documents.length === 0) {
        return {
            items: [],
            occurrenceCount: 0,
            documentCount: 0,
            projectRootPath,
            activeDocumentFolder
        };
    }
    const occurrences = [];
    const originalDocument = getActiveDocument();
    await runWithSuppressedHostNotifications(async () => {
        await core.executeAsModal(async () => {
            try {
                for (let index = 0; index < documents.length; index += 1) {
                    const documentRef = documents[index];
                    if (!documentRef) {
                        continue;
                    }
                    app.activeDocument = documentRef;
                    const smartObjectLayers = collectLayersByKind(toArray(documentRef.layers), "smartObject");
                    for (let layerIndex = 0; layerIndex < smartObjectLayers.length; layerIndex += 1) {
                        const layer = smartObjectLayers[layerIndex];
                        const layerId = getLayerId(layer);
                        if (!layerId) {
                            continue;
                        }
                        const descriptor = await getLayerDescriptor(layerId);
                        const linked = Boolean(descriptor.smartObject && descriptor.smartObject.linked);
                        if (!linked) {
                            continue;
                        }
                        const linkedPath = (0, project_path_1.extractNativePath)(descriptor.smartObject && descriptor.smartObject.link);
                        const fileReference = extractFileReference(descriptor);
                        if (!fileReference) {
                            continue;
                        }
                        const occurrence = {
                            documentId: Number(documentRef.id || 0),
                            documentName: safeDocumentName(documentRef, index),
                            documentPath: getDocumentPath(documentRef),
                            layerId,
                            layerName: String(descriptor.name || layer.name || fileReference),
                            fileReference,
                            linkedPath,
                            missing: Boolean(descriptor.smartObject && descriptor.smartObject.linkMissing),
                            outsideProjectRoot: linkedPath ? !(0, project_path_1.isPathInsideRoot)(linkedPath, projectRootPath) : false
                        };
                        occurrences.push(occurrence);
                    }
                }
            }
            finally {
                restoreActiveDocument(originalDocument);
            }
        }, { commandName: "Scan Smart Objects" });
    });
    return {
        items: summarizeOccurrences(occurrences),
        occurrenceCount: occurrences.length,
        documentCount: documents.length,
        projectRootPath,
        activeDocumentFolder
    };
}
async function relinkSmartObjects(fileEntries) {
    const documents = getOpenDocuments();
    if (documents.length === 0) {
        return {
            matchedFileCount: 0,
            relinkedLayerCount: 0
        };
    }
    const byName = new Map();
    for (let index = 0; index < fileEntries.length; index += 1) {
        const entry = fileEntries[index];
        if (!entry || typeof entry.name !== "string" || !entry.name) {
            continue;
        }
        const token = storage.localFileSystem.createSessionToken(fileEntries[index]);
        byName.set(entry.name, { token });
    }
    if (byName.size === 0) {
        return {
            matchedFileCount: 0,
            relinkedLayerCount: 0
        };
    }
    const originalDocument = getActiveDocument();
    let relinkedLayerCount = 0;
    const matchedFileNames = new Set();
    await runWithSuppressedHostNotifications(async () => {
        await core.executeAsModal(async () => {
            try {
                for (let index = 0; index < documents.length; index += 1) {
                    const documentRef = documents[index];
                    if (!documentRef) {
                        continue;
                    }
                    app.activeDocument = documentRef;
                    const smartObjectLayers = collectLayersByKind(toArray(documentRef.layers), "smartObject");
                    for (let layerIndex = 0; layerIndex < smartObjectLayers.length; layerIndex += 1) {
                        const layer = smartObjectLayers[layerIndex];
                        const layerId = getLayerId(layer);
                        if (!layerId) {
                            continue;
                        }
                        const descriptor = await getLayerDescriptor(layerId);
                        const linked = Boolean(descriptor.smartObject && descriptor.smartObject.linked);
                        if (!linked) {
                            continue;
                        }
                        const fileReference = extractFileReference(descriptor);
                        if (!fileReference) {
                            continue;
                        }
                        const selectedFile = byName.get(fileReference);
                        if (!selectedFile) {
                            continue;
                        }
                        matchedFileNames.add(fileReference);
                        await action.batchPlay([selectLayer(layerId)], { modalBehavior: "execute" });
                        await action.batchPlay([relinkPlacedLayer(selectedFile.token)], { modalBehavior: "execute" });
                        relinkedLayerCount += 1;
                    }
                }
            }
            finally {
                restoreActiveDocument(originalDocument);
            }
        }, { commandName: "Relink Smart Objects" });
    });
    return {
        matchedFileCount: matchedFileNames.size,
        relinkedLayerCount
    };
}
function getOpenDocuments() {
    return toArray(app.documents);
}
function getActiveDocument() {
    try {
        return app.activeDocument || null;
    }
    catch (_error) {
        return null;
    }
}
function getActiveDocumentFolder() {
    const activeDocument = getActiveDocument();
    return (0, project_path_1.getDirectoryPath)(getDocumentPath(activeDocument));
}
function getDocumentPath(documentRef) {
    if (!documentRef || typeof documentRef !== "object") {
        return null;
    }
    try {
        const candidate = documentRef;
        return (0, project_path_1.extractNativePath)(candidate.path);
    }
    catch (_error) {
        return null;
    }
}
function safeDocumentName(documentRef, fallbackIndex) {
    if (documentRef && typeof documentRef === "object" && "name" in documentRef) {
        const named = documentRef;
        if (typeof named.name === "string" && named.name.trim()) {
            return named.name;
        }
    }
    return "Document " + String(fallbackIndex + 1);
}
function shouldIgnoreHostNotification() {
    return hostNotificationSuppressionDepth > 0 || Date.now() < hostNotificationSuppressionUntil;
}
async function runWithSuppressedHostNotifications(callback) {
    const release = suppressHostNotifications();
    try {
        return await callback();
    }
    finally {
        release();
    }
}
function suppressHostNotifications(graceMs = 750) {
    hostNotificationSuppressionDepth += 1;
    hostNotificationSuppressionUntil = Math.max(hostNotificationSuppressionUntil, Date.now() + graceMs);
    return function releaseHostNotificationSuppression() {
        hostNotificationSuppressionDepth = Math.max(0, hostNotificationSuppressionDepth - 1);
        hostNotificationSuppressionUntil = Math.max(hostNotificationSuppressionUntil, Date.now() + graceMs);
    };
}
function restoreActiveDocument(documentRef) {
    if (!documentRef) {
        return;
    }
    try {
        app.activeDocument = documentRef;
    }
    catch (_error) {
    }
}
function toArray(value) {
    if (!value) {
        return [];
    }
    if (Array.isArray(value)) {
        return value.slice();
    }
    const results = [];
    const collection = value;
    if (typeof collection.forEach === "function") {
        try {
            collection.forEach((item) => {
                if (item !== null && item !== undefined) {
                    results.push(item);
                }
            });
            return results;
        }
        catch (_error) {
        }
    }
    const length = typeof collection.length === "number" ? collection.length : 0;
    for (let index = 0; index < length; index += 1) {
        const item = collection[index];
        if (item !== null && item !== undefined) {
            results.push(item);
        }
    }
    return results;
}
function collectLayersByKind(layers, kind) {
    let results = [];
    for (let index = 0; index < layers.length; index += 1) {
        const layer = layers[index];
        if (!layer) {
            continue;
        }
        if (layer.kind === "group") {
            results = results.concat(collectLayersByKind(toArray(layer.layers), kind));
        }
        if (layer.kind === kind) {
            results.push(layer);
        }
    }
    return results;
}
function getLayerId(layer) {
    if (!layer || typeof layer !== "object") {
        return null;
    }
    const candidate = layer;
    if (typeof candidate.id === "number") {
        return candidate.id;
    }
    if (typeof candidate._id === "number") {
        return candidate._id;
    }
    return null;
}
async function getLayerDescriptor(layerId) {
    const response = await action.batchPlay([{
            _obj: "get",
            _target: [{ _ref: "layer", _id: layerId }],
            layerID: [layerId],
            _options: {
                dialogOptions: "dontDisplay"
            }
        }], { modalBehavior: "execute" });
    return (response && response[0]) || {};
}
function extractFileReference(descriptor) {
    const fromDescriptor = descriptor.smartObject && descriptor.smartObject.fileReference;
    if (typeof fromDescriptor === "string" && fromDescriptor.trim()) {
        return fromDescriptor;
    }
    const linkedPath = (0, project_path_1.extractNativePath)(descriptor.smartObject && descriptor.smartObject.link);
    return (0, project_path_1.getBasename)(linkedPath);
}
function summarizeOccurrences(occurrences) {
    const map = new Map();
    for (let index = 0; index < occurrences.length; index += 1) {
        const occurrence = occurrences[index];
        const key = occurrence.fileReference;
        const existing = map.get(key);
        if (!existing) {
            map.set(key, {
                fileReference: occurrence.fileReference,
                totalCount: 1,
                missingCount: occurrence.missing ? 1 : 0,
                outsideProjectRootCount: occurrence.outsideProjectRoot ? 1 : 0,
                linkedPaths: occurrence.linkedPath ? [occurrence.linkedPath] : [],
                documentNames: [occurrence.documentName],
                occurrences: [occurrence]
            });
            continue;
        }
        existing.totalCount += 1;
        existing.missingCount += occurrence.missing ? 1 : 0;
        existing.outsideProjectRootCount += occurrence.outsideProjectRoot ? 1 : 0;
        existing.occurrences.push(occurrence);
        if (occurrence.linkedPath && existing.linkedPaths.indexOf(occurrence.linkedPath) === -1) {
            existing.linkedPaths.push(occurrence.linkedPath);
        }
        if (existing.documentNames.indexOf(occurrence.documentName) === -1) {
            existing.documentNames.push(occurrence.documentName);
        }
    }
    const items = Array.from(map.values());
    items.sort((left, right) => {
        if (left.missingCount !== right.missingCount) {
            return right.missingCount - left.missingCount;
        }
        if (left.outsideProjectRootCount !== right.outsideProjectRootCount) {
            return right.outsideProjectRootCount - left.outsideProjectRootCount;
        }
        return left.fileReference.localeCompare(right.fileReference);
    });
    return items;
}
function selectLayer(layerId) {
    return {
        _obj: "select",
        _target: [{ _ref: "layer", _id: layerId }],
        layerID: [layerId]
    };
}
function relinkPlacedLayer(sessionToken) {
    return {
        _obj: "placedLayerRelinkToFile",
        null: {
            _path: sessionToken,
            _kind: "local"
        },
        pageNumber: 1,
        crop: 1
    };
}
