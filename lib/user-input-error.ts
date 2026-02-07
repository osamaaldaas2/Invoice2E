import { AppError } from './errors';

/**
 * UserInputError - For user-facing validation errors
 * Use this for errors that should be shown to users (400 Bad Request)
 * 
 * Examples:
 * - Invalid email format
 * - Required field missing
 * - Value out of range
 */
export class UserInputError extends AppError {
    constructor(message: string, details?: unknown) {
        super('USER_INPUT_ERROR', message, 400, details as Record<string, unknown>);
        this.name = 'UserInputError';
    }
}
