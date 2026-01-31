export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type ApiRequestConfig = {
    method: HttpMethod;
    headers?: Record<string, string>;
    body?: unknown;
    timeout?: number;
};

export type PaginationParams = {
    page: number;
    limit: number;
    sort?: string;
    order?: 'asc' | 'desc';
};

export type ApiErrorResponse = {
    success: false;
    error: string;
    code: string;
    timestamp: string;
    details?: Record<string, unknown>;
};

export type HealthCheckResponse = {
    status: 'ok' | 'error';
    timestamp: string;
    version: string;
};
