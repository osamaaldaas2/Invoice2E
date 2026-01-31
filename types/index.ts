export type User = {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    createdAt: Date;
    updatedAt: Date;
};

export type ApiResponse<T = unknown> = {
    success: boolean;
    data?: T;
    error?: string;
    timestamp: string;
};

export type PaginatedResponse<T> = ApiResponse<{
    items: T[];
    total: number;
    page: number;
    limit: number;
}>;
