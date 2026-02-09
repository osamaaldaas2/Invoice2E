import { describe, it, expect, vi } from 'vitest';
import {
    AppError,
    ValidationError,
    NotFoundError,
    UnauthorizedError,
    ForbiddenError,
    ExtractionError,
    ConversionError,
    InsufficientCreditsError,
    getSafeErrorMessage,
    getErrorResponse,
} from '@/lib/errors';

describe('Error classes', () => {
    it('AppError has correct properties', () => {
        const err = new AppError('TEST_CODE', 'something broke', 503);
        expect(err.code).toBe('TEST_CODE');
        expect(err.message).toBe('something broke');
        expect(err.statusCode).toBe(503);
        expect(err.name).toBe('AppError');
        expect(err).toBeInstanceOf(Error);
    });

    it('ValidationError defaults to 400', () => {
        const err = new ValidationError('bad input');
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe('VALIDATION_ERROR');
    });

    it('NotFoundError defaults to 404', () => {
        const err = new NotFoundError('missing');
        expect(err.statusCode).toBe(404);
    });

    it('UnauthorizedError defaults to 401', () => {
        const err = new UnauthorizedError('no auth');
        expect(err.statusCode).toBe(401);
    });

    it('ForbiddenError defaults to 403', () => {
        const err = new ForbiddenError('denied');
        expect(err.statusCode).toBe(403);
    });

    it('ExtractionError defaults to 500', () => {
        const err = new ExtractionError('AI failed');
        expect(err.statusCode).toBe(500);
        expect(err.code).toBe('EXTRACTION_ERROR');
    });

    it('ConversionError defaults to 500', () => {
        const err = new ConversionError('XML failed');
        expect(err.statusCode).toBe(500);
        expect(err.code).toBe('CONVERSION_ERROR');
    });

    it('InsufficientCreditsError defaults to 402 with default message', () => {
        const err = new InsufficientCreditsError();
        expect(err.statusCode).toBe(402);
        expect(err.message).toBe('Insufficient credits for this operation');
    });
});

describe('getSafeErrorMessage', () => {
    it('returns AppError message directly', () => {
        const err = new AppError('X', 'user-facing msg', 500);
        expect(getSafeErrorMessage(err)).toBe('user-facing msg');
    });

    it('returns fallback in production for generic errors', () => {
        vi.stubEnv('NODE_ENV', 'production');
        expect(getSafeErrorMessage(new Error('secret stuff'))).toBe('An error occurred');
        expect(getSafeErrorMessage(new Error('secret'), 'custom fallback')).toBe('custom fallback');
        vi.unstubAllEnvs();
    });

    it('returns full message in development for generic errors', () => {
        vi.stubEnv('NODE_ENV', 'development');
        expect(getSafeErrorMessage(new Error('debug info'))).toBe('debug info');
        vi.unstubAllEnvs();
    });

    it('stringifies non-Error values', () => {
        vi.stubEnv('NODE_ENV', 'development');
        expect(getSafeErrorMessage('raw string')).toBe('raw string');
        vi.unstubAllEnvs();
    });
});

describe('getErrorResponse', () => {
    it('returns statusCode from AppError', () => {
        const err = new ValidationError('bad');
        const resp = getErrorResponse(err);
        expect(resp.statusCode).toBe(400);
        expect(resp.message).toBe('bad');
    });

    it('returns 500 for unknown errors', () => {
        const resp = getErrorResponse(new Error('oops'));
        expect(resp.statusCode).toBe(500);
    });
});
