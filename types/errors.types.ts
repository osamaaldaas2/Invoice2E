export type ErrorCode =
    | 'VALIDATION_ERROR'
    | 'NOT_FOUND'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'INTERNAL_ERROR'
    | 'EXTRACTION_ERROR'
    | 'VALIDATION_FAILED'
    | 'CONVERSION_ERROR'
    | 'PAYMENT_ERROR'
    | 'INSUFFICIENT_CREDITS';

export type ErrorDetails = {
    code: ErrorCode;
    message: string;
    statusCode: number;
    details?: Record<string, unknown>;
};

export type FieldError = {
    field: string;
    message: string;
};

export type ValidationErrorDetails = {
    code: 'VALIDATION_ERROR';
    message: string;
    statusCode: 400;
    fields: FieldError[];
};
