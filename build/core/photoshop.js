"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanSmartObjects = scanSmartObjects;
exports.relinkSmartObjects = relinkSmartObjects;
const project_path_1 = require("./project-path");
const { action, app, core } = require("photoshop");
const { storage } = require("uxp");
async function scanSmartObjects() {
    const documentRef = getActiveDocument();
    if (!documentRef) {
        return {
            items: [],
            occurrenceCount: 0,
            documentCount: 0
        };
    }
    const occurrences = [];
    await core.executeAsModal(async () => {
        const smartObjectLayers = collectLayersByKind(toArray(documentRef.layers), "smartObject");
        for (let layerIndex = 0; layerIndex < smartObjectLayers.length; layerIndex += 1) {
            const layer = smartObjectLayers[layerIndex];
            const layerId = getLayerId(layer);
            if (!layerId) {
                continue;
            }
            try {
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
                occurrences.push({
                    layerId,
                    layerName: String(descriptor.name || layer.name || fileReference),
                    fileReference,
                    linkedPath,
                    missing: Boolean(descriptor.smartObject && descriptor.smartObject.linkMissing)
                });
            }
            catch (_error) {
                continue;
            }
        }
    }, { commandName: "Scan Smart Objects" });
    return {
        items: summarizeOccurrences(occurrences),
        occurrenceCount: occurrences.length,
        documentCount: 1
    };
}
async function relinkSmartObjects(fileEntries) {
    const documentRef = getActiveDocument();
    if (!documentRef) {
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
        byName.set(getFilenameKey(entry.name), {
            token: storage.localFileSystem.createSessionToken(fileEntries[index])
        });
    }
    if (byName.size === 0) {
        return {
            matchedFileCount: 0,
            relinkedLayerCount: 0
        };
    }
    let relinkedLayerCount = 0;
    const matchedFileNames = new Set();
    const originalSelectionIds = getSelectedLayerIds(documentRef);
    await core.executeAsModal(async () => {
        try {
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
                const selectedFile = byName.get(getFilenameKey(fileReference));
                if (!selectedFile) {
                    continue;
                }
                matchedFileNames.add(getFilenameKey(fileReference));
                await action.batchPlay([selectLayer(layerId)], { modalBehavior: "execute" });
                await action.batchPlay([relinkPlacedLayer(selectedFile.token)], { modalBehavior: "execute" });
                relinkedLayerCount += 1;
            }
        }
        finally {
            await restoreLayerSelection(originalSelectionIds);
        }
    }, { commandName: "Relink Smart Objects" });
    return {
        matchedFileCount: matchedFileNames.size,
        relinkedLayerCount
    };
}
function getActiveDocument() {
    try {
        return app.activeDocument || null;
    }
    catch (_error) {
        return null;
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
function getSelectedLayerIds(documentRef) {
    if (!documentRef || typeof documentRef !== "object" || !("activeLayers" in documentRef)) {
        return [];
    }
    const candidate = documentRef;
    const activeLayers = toArray(candidate.activeLayers);
    const ids = [];
    for (let index = 0; index < activeLayers.length; index += 1) {
        const layerId = getLayerId(activeLayers[index]);
        if (layerId !== null) {
            ids.push(layerId);
        }
    }
    return ids;
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
function getFilenameKey(value) {
    return value.trim().toLocaleLowerCase();
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
                linkedPaths: occurrence.linkedPath ? [occurrence.linkedPath] : [],
                occurrences: [occurrence]
            });
            continue;
        }
        existing.totalCount += 1;
        existing.missingCount += occurrence.missing ? 1 : 0;
        existing.occurrences.push(occurrence);
        if (occurrence.linkedPath && existing.linkedPaths.indexOf(occurrence.linkedPath) === -1) {
            existing.linkedPaths.push(occurrence.linkedPath);
        }
    }
    const items = Array.from(map.values());
    items.sort((left, right) => {
        if (left.missingCount !== right.missingCount) {
            return right.missingCount - left.missingCount;
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
function selectLayerWithModifier(layerId, addToSelection) {
    const descriptor = selectLayer(layerId);
    if (addToSelection) {
        descriptor.selectionModifier = {
            _enum: "selectionModifierType",
            _value: "addToSelectionContinuous"
        };
    }
    return descriptor;
}
async function restoreLayerSelection(layerIds) {
    if (layerIds.length === 0) {
        return;
    }
    const descriptors = [];
    for (let index = 0; index < layerIds.length; index += 1) {
        descriptors.push(selectLayerWithModifier(layerIds[index], index > 0));
    }
    await action.batchPlay(descriptors, { modalBehavior: "execute" });
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
