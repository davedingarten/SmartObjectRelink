export interface SmartObjectOccurrence {
    documentId: number;
    documentName: string;
    documentPath: string | null;
    layerId: number;
    layerName: string;
    fileReference: string;
    linkedPath: string | null;
    missing: boolean;
    outsideProjectRoot: boolean;
}

export interface SmartObjectSummary {
    fileReference: string;
    totalCount: number;
    missingCount: number;
    outsideProjectRootCount: number;
    linkedPaths: string[];
    documentNames: string[];
    occurrences: SmartObjectOccurrence[];
}

export interface ScanOptions {
    projectRootPath: string | null;
}

export interface ScanResult {
    items: SmartObjectSummary[];
    occurrenceCount: number;
    documentCount: number;
    projectRootPath: string | null;
    activeDocumentFolder: string | null;
}

export interface RelinkResult {
    matchedFileCount: number;
    relinkedLayerCount: number;
}
