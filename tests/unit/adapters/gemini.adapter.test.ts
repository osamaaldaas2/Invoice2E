import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiAdapter } from '@/adapters/gemini.adapter';
import { AppError } from '@/lib/errors';
const mockGenerateContent = vi.hoisted(() => vi.fn());
const mockGetGenerativeModel = vi.hoisted(() =>
    vi.fn(() => ({
        generateContent: mockGenerateContent
    }))
);
const GoogleGenerativeAIMock = vi.hoisted(() =>
    class GoogleGenerativeAIMock {
        getGenerativeModel = mockGetGenerativeModel;
    }
);

vi.mock('@google/generative-ai', () => ({
    GoogleGenerativeAI: GoogleGenerativeAIMock
}));

describe('GeminiAdapter', () => {
    let adapter: GeminiAdapter;
    beforeEach(() => {
        vi.stubEnv('GEMINI_API_KEY', 'test-api-key');

        mockGenerateContent.mockReset();
        mockGetGenerativeModel.mockReset();
        mockGetGenerativeModel.mockReturnValue({
            generateContent: mockGenerateContent
        });

        adapter = new GeminiAdapter();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should validate configuration correctly', () => {
        expect(adapter.validateConfiguration()).toBe(true);
    });

    it('should return false when API key is missing', () => {
        vi.stubEnv('GEMINI_API_KEY', '');
        const adapterWithoutKey = new GeminiAdapter();
        expect(adapterWithoutKey.validateConfiguration()).toBe(false);
    });
    it('should extract invoice data successfully', async () => {
        const mockData = {
            invoiceNumber: 'INV-001',
            totalAmount: 150.00,
            currency: 'EUR'
        };

        mockGenerateContent.mockResolvedValue({
            response: {
                text: () => JSON.stringify(mockData)
            }
        });

        const result = await adapter.extractInvoiceData(Buffer.from('test'), 'application/pdf');


        expect(result.data.invoiceNumber).toBe('INV-001');
        expect(mockGenerateContent).toHaveBeenCalled();
    });

    it('should handle invalid JSON response', async () => {
        mockGenerateContent.mockResolvedValue({
            response: {
                text: () => 'Invalid JSON'
            }
        });

        await expect(adapter.extractInvoiceData(Buffer.from('test'), 'application/pdf'))
            .rejects
            .toThrow(AppError);
    });

    it('should handle API errors', async () => {
        mockGenerateContent.mockRejectedValue(new Error('API Error'));

        await expect(adapter.extractInvoiceData(Buffer.from('test'), 'application/pdf'))
            .rejects
            .toThrow('Gemini extraction failed'); // Or checking specific AppError wrapping
    });
});
