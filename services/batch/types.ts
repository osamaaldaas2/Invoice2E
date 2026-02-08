export interface BatchJob {
    id: string;
    userId: string;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'partial_success';
    totalFiles: number;
    completedFiles: number;
    failedFiles: number;
    results: BatchResult[];
    sourceType?: string;
    boundaryData?: Record<string, unknown>;
    createdAt: string;
    completedAt?: string;
}

export interface BatchResult {
    filename: string;
    status: 'success' | 'failed' | 'pending';
    invoiceNumber?: string;
    error?: string;
    xmlContent?: string;
    extractionId?: string;
    confidenceScore?: number;
    reviewStatus?: 'pending_review' | 'reviewed' | 'not_available';
    startedAt?: string;
    completedAt?: string;
}

export interface BatchProgress {
    id: string;
    status: string;
    totalFiles: number;
    completedFiles: number;
    failedFiles: number;
    progress: number; // 0-100
    results: BatchResult[];
    estimatedTimeRemaining?: number; // seconds
}
