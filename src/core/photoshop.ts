import { extractNativePath, getBasename, getDirectoryPath, isPathInsideRoot, normalizePath } from "./project-path";
import type { RelinkResult, ScanOptions, ScanResult, SmartObjectOccurrence, SmartObjectSummary } from "../types";

const { action, app, core } = require("photoshop");
const { storage } = require("uxp");

type NotificationCallback = (eventName: string, descriptor: unknown) => void;
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

let notificationListener: NotificationCallback | null = null;

export async function registerHostNotifications(callback: () => void): Promise<void> {
    await unregisterHostNotifications();

    const listener: NotificationCallback = function (_eventName: string, _descriptor: unknown): void {
        callback();
    };

    await action.addNotificationListener(["select", "open", "close"], listener);
    notificationListener = listener;
}

export async function unregisterHostNotifications(): Promise<void> {
    if (!notificationListener) {
        return;
    }

    try {
        await action.removeNotificationListener(["select", "open", "close"], notificationListener);
    } catch (_error) {
    } finally {
        notificationListener = null;
    }
}

export async function scanSmartObjects(options: ScanOptions): Promise<ScanResult> {
    const documents = getOpenDocuments();
    const activeDocumentFolder = getActiveDocumentFolder();
    const projectRootPath = normalizePath(options.projectRootPath || activeDocumentFolder);

    if (documents.length === 0) {
        return {
            items: [],
            occurrenceCount: 0,
            documentCount: 0,
            projectRootPath,
            activeDocumentFolder
        };
    }

    const occurrences: SmartObjectOccurrence[] = [];
    const originalDocument = getActiveDocument();

    await core.executeAsModal(async () => {
        for (let index = 0; index < documents.length; index += 1) {
            const documentRef = documents[index] as any;
            app.activeDocument = documentRef;

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

                const linkedPath = extractNativePath(descriptor.smartObject && descriptor.smartObject.link);
                const fileReference = extractFileReference(descriptor);
                if (!fileReference) {
                    continue;
                }

                const occurrence: SmartObjectOccurrence = {
                    documentId: Number(documentRef.id || 0),
                    documentName: safeDocumentName(documentRef, index),
                    documentPath: getDocumentPath(documentRef),
                    layerId,
                    layerName: String(descriptor.name || layer.name || fileReference),
                    fileReference,
                    linkedPath,
                    missing: Boolean(descriptor.smartObject && descriptor.smartObject.linkMissing),
                    outsideProjectRoot: linkedPath ? !isPathInsideRoot(linkedPath, projectRootPath) : false
                };

                occurrences.push(occurrence);
            }
        }
    }, { commandName: "Scan Smart Objects" });

    if (originalDocument) {
        app.activeDocument = originalDocument;
    }

    return {
        items: summarizeOccurrences(occurrences),
        occurrenceCount: occurrences.length,
        documentCount: documents.length,
        projectRootPath,
        activeDocumentFolder
    };
}

export async function relinkSmartObjects(fileEntries: unknown[]): Promise<RelinkResult> {
    const documents = getOpenDocuments();
    if (documents.length === 0) {
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

    await core.executeAsModal(async () => {
        for (let index = 0; index < documents.length; index += 1) {
            const documentRef = documents[index] as any;
            app.activeDocument = documentRef;

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

                const selectedFile = byName.get(fileReference);
                if (!selectedFile) {
                    continue;
                }

                await action.batchPlay([selectLayer(layerId)], { modalBehavior: "execute" });
                await action.batchPlay([relinkPlacedLayer(selectedFile.token)], { modalBehavior: "execute" });
                relinkedLayerCount += 1;
            }
        }
    }, { commandName: "Relink Smart Objects" });

    if (originalDocument) {
        app.activeDocument = originalDocument;
    }

    return {
        matchedFileCount: byName.size,
        relinkedLayerCount
    };
}

function getOpenDocuments(): unknown[] {
    return toArray(app.documents);
}

function getActiveDocument(): unknown | null {
    try {
        return app.activeDocument || null;
    } catch (_error) {
        return null;
    }
}

function getActiveDocumentFolder(): string | null {
    const activeDocument = getActiveDocument();
    return getDirectoryPath(getDocumentPath(activeDocument));
}

function getDocumentPath(documentRef: unknown): string | null {
    if (!documentRef || typeof documentRef !== "object") {
        return null;
    }

    try {
        const candidate = documentRef as { path?: unknown };
        return extractNativePath(candidate.path);
    } catch (_error) {
        return null;
    }
}

function safeDocumentName(documentRef: unknown, fallbackIndex: number): string {
    if (documentRef && typeof documentRef === "object" && "name" in documentRef) {
        const named = documentRef as { name?: unknown };
        if (typeof named.name === "string" && named.name.trim()) {
            return named.name;
        }
    }

    return "Document " + String(fallbackIndex + 1);
}

function toArray<T>(value: { length?: number; [index: number]: T } | T[] | null | undefined): T[] {
    if (!value) {
        return [];
    }

    return Array.prototype.slice.call(value);
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

function selectLayer(layerId: number): Record<string, unknown> {
    return {
        _obj: "select",
        _target: [{ _ref: "layer", _id: layerId }],
        layerID: [layerId]
    };
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
