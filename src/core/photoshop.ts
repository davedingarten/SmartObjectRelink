import { extractNativePath, getBasename } from "./project-path";
import type { RelinkResult, ScanResult, SmartObjectOccurrence, SmartObjectSummary } from "../types";

const { action, app, core } = require("photoshop");
const { storage } = require("uxp");

type BatchPlayResult = {
    name?: string;
    smartObject?: {
        linked?: boolean;
        fileReference?: string;
        linkMissing?: boolean;
        link?: {
            _path?: string;
        };
    };
};

export async function scanSmartObjects(): Promise<ScanResult> {
    const documentRef = getActiveDocument() as any;
    if (!documentRef) {
        return {
            items: [],
            occurrenceCount: 0,
            documentCount: 0
        };
    }

    const occurrences: SmartObjectOccurrence[] = [];

    await core.executeAsModal(async () => {
        const smartObjectLayers = collectLayersByKind(toArray(documentRef.layers), "smartObject");
        for (let layerIndex = 0; layerIndex < smartObjectLayers.length; layerIndex += 1) {
            const layer = smartObjectLayers[layerIndex] as any;
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

                const linkedPath = extractNativePath(descriptor.smartObject && descriptor.smartObject.link);
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
            } catch (_error) {
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

export async function relinkSmartObjects(fileEntries: unknown[]): Promise<RelinkResult> {
    const documentRef = getActiveDocument() as any;
    if (!documentRef) {
        return {
            matchedFileCount: 0,
            relinkedLayerCount: 0
        };
    }

    const byName = new Map<string, { token: string }>();
    for (let index = 0; index < fileEntries.length; index += 1) {
        const entry = fileEntries[index] as { name?: unknown };
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
    const matchedFileNames = new Set<string>();
    const originalSelectionIds = getSelectedLayerIds(documentRef);

    await core.executeAsModal(async () => {
        try {
            const smartObjectLayers = collectLayersByKind(toArray(documentRef.layers), "smartObject");
            for (let layerIndex = 0; layerIndex < smartObjectLayers.length; layerIndex += 1) {
                const layer = smartObjectLayers[layerIndex] as any;
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
        } finally {
            await restoreLayerSelection(originalSelectionIds);
        }
    }, { commandName: "Relink Smart Objects" });

    return {
        matchedFileCount: matchedFileNames.size,
        relinkedLayerCount
    };
}

function getActiveDocument(): unknown | null {
    try {
        return app.activeDocument || null;
    } catch (_error) {
        return null;
    }
}

function toArray<T>(value: { length?: number; forEach?: (callback: (item: T, index: number) => void) => void; [index: number]: T } | T[] | null | undefined): T[] {
    if (!value) {
        return [];
    }

    if (Array.isArray(value)) {
        return value.slice();
    }

    const results: T[] = [];
    const collection = value as { length?: unknown; forEach?: unknown; [index: number]: T };

    if (typeof collection.forEach === "function") {
        try {
            collection.forEach((item: T) => {
                if (item !== null && item !== undefined) {
                    results.push(item);
                }
            });

            return results;
        } catch (_error) {
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

function collectLayersByKind(layers: unknown[], kind: string): unknown[] {
    let results: unknown[] = [];

    for (let index = 0; index < layers.length; index += 1) {
        const layer = layers[index] as { kind?: unknown; layers?: unknown[] };
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

function getLayerId(layer: unknown): number | null {
    if (!layer || typeof layer !== "object") {
        return null;
    }

    const candidate = layer as { id?: unknown; _id?: unknown };
    if (typeof candidate.id === "number") {
        return candidate.id;
    }

    if (typeof candidate._id === "number") {
        return candidate._id;
    }

    return null;
}

function getSelectedLayerIds(documentRef: unknown): number[] {
    if (!documentRef || typeof documentRef !== "object" || !("activeLayers" in documentRef)) {
        return [];
    }

    const candidate = documentRef as { activeLayers?: { length?: number; [index: number]: unknown } | unknown[] | null };
    const activeLayers = toArray(candidate.activeLayers);
    const ids: number[] = [];

    for (let index = 0; index < activeLayers.length; index += 1) {
        const layerId = getLayerId(activeLayers[index]);
        if (layerId !== null) {
            ids.push(layerId);
        }
    }

    return ids;
}

async function getLayerDescriptor(layerId: number): Promise<BatchPlayResult> {
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

function extractFileReference(descriptor: BatchPlayResult): string {
    const fromDescriptor = descriptor.smartObject && descriptor.smartObject.fileReference;
    if (typeof fromDescriptor === "string" && fromDescriptor.trim()) {
        return fromDescriptor;
    }

    const linkedPath = extractNativePath(descriptor.smartObject && descriptor.smartObject.link);
    return getBasename(linkedPath);
}

function getFilenameKey(value: string): string {
    return value.trim().toLocaleLowerCase();
}

function summarizeOccurrences(occurrences: SmartObjectOccurrence[]): SmartObjectSummary[] {
    const map = new Map<string, SmartObjectSummary>();

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

function selectLayer(layerId: number): Record<string, unknown> {
    return {
        _obj: "select",
        _target: [{ _ref: "layer", _id: layerId }],
        layerID: [layerId]
    };
}

function selectLayerWithModifier(layerId: number, addToSelection: boolean): Record<string, unknown> {
    const descriptor = selectLayer(layerId) as Record<string, unknown>;
    if (addToSelection) {
        descriptor.selectionModifier = {
            _enum: "selectionModifierType",
            _value: "addToSelectionContinuous"
        };
    }

    return descriptor;
}

async function restoreLayerSelection(layerIds: number[]): Promise<void> {
    if (layerIds.length === 0) {
        return;
    }

    const descriptors: Record<string, unknown>[] = [];
    for (let index = 0; index < layerIds.length; index += 1) {
        descriptors.push(selectLayerWithModifier(layerIds[index], index > 0));
    }

    await action.batchPlay(descriptors, { modalBehavior: "execute" });
}

function relinkPlacedLayer(sessionToken: string): Record<string, unknown> {
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
