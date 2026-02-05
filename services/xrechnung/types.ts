export interface XRechnungGenerationResult {
    xmlContent: string;
    fileName: string;
    fileSize: number;
    validationStatus: 'valid' | 'invalid' | 'warnings';
    validationErrors: string[];
    validationWarnings: string[];
}
