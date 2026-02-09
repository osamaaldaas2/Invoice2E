import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AppError, ValidationError, UnauthorizedError, ForbiddenError, NotFoundError } from './errors';
import { logger } from './logger';

type ApiErrorOptions = {
    status?: number;
    message?: string;
    includeSuccess?: boolean;
    extra?: Record<string, unknown>;
};

const buildErrorPayload = (message: string, includeSuccess: boolean, extra?: Record<string, unknown>) => {
    if (includeSuccess) {
        return { success: false, error: message, ...(extra || {}) };
    }
    return { error: message, ...(extra || {}) };
};

/**
 * Standard success response helper (API-2: consistent envelope)
 */
export function apiSuccess<T>(data: T, status: number = 200): NextResponse {
    return NextResponse.json({ success: true, data }, { status });
}

export function apiError(
    message: string,
    status: number = 500,
    includeSuccess: boolean = false,
    extra?: Record<string, unknown>
): NextResponse {
    return NextResponse.json(buildErrorPayload(message, includeSuccess, extra), { status });
}

export function handleApiError(
    error: unknown,
    context: string,
    options?: ApiErrorOptions
): NextResponse {
    logger.error(context, error instanceof Error ? error : undefined);

    const includeSuccess = options?.includeSuccess ?? true;
    const extra = options?.extra;

    if (error instanceof ZodError) {
        const message = error.errors[0]?.message || 'Validation failed';
        return apiError(message, 400, includeSuccess, extra);
    }

    if (error instanceof UnauthorizedError) {
        return apiError(error.message, 401, includeSuccess, extra);
    }

    if (error instanceof ForbiddenError) {
        return apiError(error.message, 403, includeSuccess, extra);
    }

    if (error instanceof NotFoundError) {
        return apiError(error.message, 404, includeSuccess, extra);
    }

    if (error instanceof ValidationError || error instanceof AppError) {
        return apiError(error.message, error.statusCode, includeSuccess, extra);
    }

    const message = options?.message || 'Internal server error';
    const status = options?.status || 500;
    return apiError(message, status, includeSuccess, extra);
}
