export class AppError extends Error {
    constructor(
        public code: string,
        message: string,
        public statusCode: number = 500,
        public details?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'AppError';
    }
}

export class ValidationError extends AppError {
    constructor(message: string, details?: Record<string, unknown>) {
        super('VALIDATION_ERROR', message, 400, details);
        this.name = 'ValidationError';
    }
}

export class NotFoundError extends AppError {
    constructor(message: string) {
        super('NOT_FOUND', message, 404);
        this.name = 'NotFoundError';
    }
}

export class UnauthorizedError extends AppError {
    constructor(message: string) {
        super('UNAUTHORIZED', message, 401);
        this.name = 'UnauthorizedError';
    }
}

export class ForbiddenError extends AppError {
    constructor(message: string) {
        super('FORBIDDEN', message, 403);
        this.name = 'ForbiddenError';
    }
}

export class ExtractionError extends AppError {
    constructor(message: string, details?: Record<string, unknown>) {
        super('EXTRACTION_ERROR', message, 500, details);
        this.name = 'ExtractionError';
    }
}

export class ConversionError extends AppError {
    constructor(message: string, details?: Record<string, unknown>) {
        super('CONVERSION_ERROR', message, 500, details);
        this.name = 'ConversionError';
    }
}

export class InsufficientCreditsError extends AppError {
    constructor(message: string = 'Insufficient credits for this operation') {
        super('INSUFFICIENT_CREDITS', message, 402);
        this.name = 'InsufficientCreditsError';
    }
}

/**
 * Get a safe error message for API responses.
 * In production, returns generic messages to prevent information disclosure.
 * In development, returns the full error message for debugging.
 * 
 * Known errors (AppError subclasses) always show their message as they are
 * intentionally user-facing.
 */
export function getSafeErrorMessage(error: unknown, fallbackMessage: string = 'An error occurred'): string {
    // AppError and its subclasses are intentionally user-facing
    if (error instanceof AppError) {
        return error.message;
    }

    // In production, hide internal error details
    if (process.env.NODE_ENV === 'production') {
        return fallbackMessage;
    }

    // In development, show full error for debugging
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

/**
 * Standard error response helper
 */
export function getErrorResponse(error: unknown, fallbackMessage: string = 'An error occurred'): {
    message: string;
    statusCode: number;
} {
    if (error instanceof AppError) {
        return {
            message: error.message,
            statusCode: error.statusCode,
        };
    }

    return {
        message: getSafeErrorMessage(error, fallbackMessage),
        statusCode: 500,
    };
}
