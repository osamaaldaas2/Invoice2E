import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Mock dependencies before imports
const loggerMock = vi.hoisted(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
}));
const getSessionMock = vi.hoisted(() => vi.fn());
const invoiceDbServiceMock = vi.hoisted(() => ({
    getExtractionById: vi.fn(),
    listExtractions: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
    logger: loggerMock,
}));

vi.mock('@/lib/session', () => ({
    getSession: getSessionMock,
}));

vi.mock('@/services/invoice-db.service', () => ({
    invoiceDbService: invoiceDbServiceMock,
}));

vi.mock('@/lib/api-helpers', () => ({
    handleApiError: vi.fn((error, context, options) => {
        const { Response } = require('next/server');
        const status = error?.statusCode || 500;
        return new Response(JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }), { status });
    }),
}));

// Import after mocks
import { GET } from '@/app/api/invoices/extractions/[id]/route';

describe('Extractions API Route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const createRequest = (id: string) => {
        return new NextRequest(`http://localhost:3000/api/invoices/extractions/${id}`, {
            method: 'GET',
        });
    };

    describe('GET /api/invoices/extractions/:id', () => {
        it('should return 401 when not authenticated', async () => {
            getSessionMock.mockResolvedValue(null);

            const request = createRequest('ext-123');
            const response = await GET(request, { params: { id: 'ext-123' } });
            const data = await response.json();

            expect(response.status).toBe(401);
            expect(data.success).toBe(false);
        });

        it('should return extraction when user owns it', async () => {
            const mockExtraction = {
                id: 'ext-123',
                userId: 'user-123',
                invoiceNumber: 'INV-001',
                status: 'completed',
            };
            getSessionMock.mockResolvedValue({ id: 'user-123' });
            invoiceDbServiceMock.getExtractionById.mockResolvedValue(mockExtraction);

            const request = createRequest('ext-123');
            const response = await GET(request, { params: { id: 'ext-123' } });
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.data.invoiceNumber).toBe('INV-001');
        });

        it('should return 403 when user does not own extraction', async () => {
            getSessionMock.mockResolvedValue({ id: 'user-123' });
            invoiceDbServiceMock.getExtractionById.mockResolvedValue({
                id: 'ext-123',
                userId: 'different-user',
            });

            const request = createRequest('ext-123');
            const response = await GET(request, { params: { id: 'ext-123' } });
            const data = await response.json();

            expect(response.status).toBe(403);
            expect(data.success).toBe(false);
        });

        it('should return 404 when extraction not found', async () => {
            getSessionMock.mockResolvedValue({ id: 'user-123' });
            invoiceDbServiceMock.getExtractionById.mockRejectedValue({
                statusCode: 404,
                message: 'Not found',
            });

            const request = createRequest('ext-999');
            const response = await GET(request, { params: { id: 'ext-999' } });

            expect(response.status).toBe(404);
        });

        it('should return 400 for invalid id format', async () => {
            getSessionMock.mockResolvedValue({ id: 'user-123' });

            const request = createRequest('');
            const response = await GET(request, { params: { id: '' } });
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.success).toBe(false);
        });
    });
});
