export interface SmartObjectOccurrence {
    layerId: number;
    layerName: string;
    fileReference: string;
    linkedPath: string | null;
    missing: boolean;
}

export interface SmartObjectSummary {
    fileReference: string;
    totalCount: number;
    missingCount: number;
    linkedPaths: string[];
    occurrences: SmartObjectOccurrence[];
}

export interface ScanResult {
    items: SmartObjectSummary[];
    occurrenceCount: number;
    documentCount: number;
    activeDocumentId: number | null;
}

export interface RelinkResult {
    matchedFileCount: number;
    relinkedLayerCount: number;
}
