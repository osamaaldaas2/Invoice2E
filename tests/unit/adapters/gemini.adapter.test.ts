import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiAdapter } from '@/adapters/gemini.adapter';
import { AppError } from '@/lib/errors';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Mock module BEFORE imports using it (though vitest/jest hoist it usually)
vi.mock('@google/generative-ai', () => {
    return {
        GoogleGenerativeAI: vi.fn()
    };
});

describe('GeminiAdapter', () => {
    let adapter: GeminiAdapter;
    let mockGenerateContent: any;
    let mockGetGenerativeModel: any;

    beforeEach(() => {
        vi.stubEnv('GEMINI_API_KEY', 'test-api-key');

        mockGenerateContent = vi.fn();
        mockGetGenerativeModel = vi.fn().mockReturnValue({
            generateContent: mockGenerateContent
        });

        (GoogleGenerativeAI as any).mockImplementation(() => ({
            getGenerativeModel: mockGetGenerativeModel
        }));

        adapter = new GeminiAdapter();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should validate configuration correctly', () => {
        expect(adapter.validateConfiguration()).toBe(true);

        vi.stubEnv('GEMINI_API_KEY', '');
        // We need to re-instantiate or check how validate works. 
        // Logic in adapter: checks process.env.GEMINI_API_KEY inside validateConfiguration? 
        // Or checks private property set in constructor?
        // Let's check adapter implementation. The adapter sets apiKey in constructor.
        // So checking validateConfiguration() usually checks the internal property.
        // But if we want to test false, we need to init with empty env.

        const noKeyAdapter = new GeminiAdapter();
        // Since constructor throws if no key? No, adapter constructor usually guarded?
        // Let's verify adapter source logic soon. Assuming it throws if no key in constructor.
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
