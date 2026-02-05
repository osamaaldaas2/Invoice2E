export interface BatchJob {
    id: string;
    userId: string;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
    totalFiles: number;
    completedFiles: number;
    failedFiles: number;
    results: BatchResult[];
    createdAt: string;
    completedAt?: string;
}

export interface BatchResult {
    filename: string;
    status: 'success' | 'failed' | 'pending';
    invoiceNumber?: string;
    error?: string;
    xmlContent?: string;
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
