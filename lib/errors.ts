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
