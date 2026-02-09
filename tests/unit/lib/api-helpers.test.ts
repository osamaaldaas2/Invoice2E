import { describe, it, expect } from 'vitest';
import { apiSuccess, apiError } from '@/lib/api-helpers';

describe('apiSuccess', () => {
    it('should return success response with data', async () => {
        const response = apiSuccess({ foo: 'bar' });
        const body = await response.json();
        expect(body).toEqual({ success: true, data: { foo: 'bar' } });
        expect(response.status).toBe(200);
    });

    it('should respect custom status code', async () => {
        const response = apiSuccess({ id: '123' }, 201);
        const body = await response.json();
        expect(body).toEqual({ success: true, data: { id: '123' } });
        expect(response.status).toBe(201);
    });
});

describe('apiError', () => {
    it('should return error response without success field by default', async () => {
        const response = apiError('Something went wrong', 500);
        const body = await response.json();
        expect(body).toEqual({ error: 'Something went wrong' });
        expect(response.status).toBe(500);
    });

    it('should include success:false when includeSuccess is true', async () => {
        const response = apiError('Bad request', 400, true);
        const body = await response.json();
        expect(body).toEqual({ success: false, error: 'Bad request' });
        expect(response.status).toBe(400);
    });

    it('should include extra fields', async () => {
        const response = apiError('Rate limited', 429, true, { retryAfter: 60 });
        const body = await response.json();
        expect(body).toEqual({ success: false, error: 'Rate limited', retryAfter: 60 });
    });
});
