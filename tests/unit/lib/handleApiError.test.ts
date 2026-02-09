import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { handleApiError } from '@/lib/api-helpers';
import { ZodError, ZodIssue } from 'zod';
import {
    AppError,
    ValidationError,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError,
} from '@/lib/errors';

describe('handleApiError', () => {
    it('handles ZodError with 400 status', async () => {
        const issue: ZodIssue = { code: 'custom', path: ['email'], message: 'Invalid email' };
        const zodErr = new ZodError([issue]);
        const response = handleApiError(zodErr, 'test context');
        const body = await response.json();
        expect(response.status).toBe(400);
        expect(body.error).toBe('Invalid email');
    });

    it('handles UnauthorizedError with 401 status', async () => {
        const response = handleApiError(new UnauthorizedError('no token'), 'test');
        const body = await response.json();
        expect(response.status).toBe(401);
        expect(body.error).toBe('no token');
    });

    it('handles ForbiddenError with 403 status', async () => {
        const response = handleApiError(new ForbiddenError('banned'), 'test');
        const body = await response.json();
        expect(response.status).toBe(403);
        expect(body.error).toBe('banned');
    });

    it('handles NotFoundError with 404 status', async () => {
        const response = handleApiError(new NotFoundError('gone'), 'test');
        const body = await response.json();
        expect(response.status).toBe(404);
        expect(body.error).toBe('gone');
    });

    it('handles ValidationError with its statusCode', async () => {
        const response = handleApiError(new ValidationError('invalid'), 'test');
        const body = await response.json();
        expect(response.status).toBe(400);
        expect(body.error).toBe('invalid');
    });

    it('handles generic AppError with its statusCode', async () => {
        const response = handleApiError(new AppError('CUSTOM', 'custom error', 422), 'test');
        const body = await response.json();
        expect(response.status).toBe(422);
        expect(body.error).toBe('custom error');
    });

    it('falls back to 500 for unknown errors', async () => {
        const response = handleApiError(new Error('unexpected'), 'test');
        const body = await response.json();
        expect(response.status).toBe(500);
        expect(body.error).toBe('Internal server error');
    });

    it('uses custom message from options for unknown errors', async () => {
        const response = handleApiError(new Error('unexpected'), 'test', {
            message: 'Something broke',
            status: 503,
        });
        const body = await response.json();
        expect(response.status).toBe(503);
        expect(body.error).toBe('Something broke');
    });

    it('includes success:false when includeSuccess option is set', async () => {
        const response = handleApiError(new NotFoundError('nope'), 'test', {
            includeSuccess: true,
        });
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.error).toBe('nope');
    });

    it('includes extra fields when provided', async () => {
        const response = handleApiError(new NotFoundError('nope'), 'test', {
            includeSuccess: true,
            extra: { retryAfter: 30 },
        });
        const body = await response.json();
        expect(body.retryAfter).toBe(30);
    });
});
