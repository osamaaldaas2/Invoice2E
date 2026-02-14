import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIAdapter } from '@/adapters/openai.adapter';
import { AppError } from '@/lib/errors';
import axios from 'axios';

vi.mock('axios');

vi.mock('@/lib/api-throttle', () => ({
    openaiThrottle: { acquire: vi.fn().mockResolvedValue(undefined), destroy: vi.fn() },
    geminiThrottle: { acquire: vi.fn().mockResolvedValue(undefined), destroy: vi.fn() },
}));

describe('OpenAIAdapter', () => {
    let adapter: OpenAIAdapter;

    beforeEach(() => {
        vi.stubEnv('OPENAI_API_KEY', 'test-api-key');
        adapter = new OpenAIAdapter();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should extract invoice data successfully', async () => {
        const mockData = {
            invoiceNumber: 'INV-001',
            totalAmount: 150.00,
            currency: 'EUR'
        };

        const mockResponse = {
            data: {
                choices: [
                    {
                        message: {
                            content: JSON.stringify(mockData)
                        }
                    }
                ]
            },
            status: 200
        };

        (axios.post as any).mockResolvedValue(mockResponse);

        const result = await adapter.extractInvoiceData(Buffer.from('test'), 'application/pdf');

        expect(result.data.invoiceNumber).toBe('INV-001');
        expect(axios.post).toHaveBeenCalled();
    });

    it('should handle API timeouts', async () => {
        const timeoutError = new Error('timeout of 20000ms exceeded');
        (timeoutError as any).code = 'ECONNABORTED';
        (timeoutError as any).response = undefined;

        (axios.isAxiosError as any).mockReturnValue(true);
        (axios.post as any).mockRejectedValue(timeoutError);

        await expect(adapter.extractInvoiceData(Buffer.from('test'), 'application/pdf'))
            .rejects
            .toThrow('OpenAI API request timed out');
    });

    it('should handle invalid JSON response', async () => {
        const mockResponse = {
            data: {
                choices: [
                    {
                        message: {
                            content: 'Invalid JSON'
                        }
                    }
                ]
            },
            status: 200
        };

        (axios.post as any).mockResolvedValue(mockResponse);

        await expect(adapter.extractInvoiceData(Buffer.from('test'), 'application/pdf'))
            .rejects
            .toThrow(AppError);
    });

    it('should return openai as provider name', () => {
        expect(adapter.getProviderName()).toBe('openai');
    });

    it('should validate configuration', () => {
        expect(adapter.validateConfiguration()).toBe(true);
    });

    it('should fail validation without API key', () => {
        vi.stubEnv('OPENAI_API_KEY', '');
        const adapterNoKey = new OpenAIAdapter();
        expect(adapterNoKey.validateConfiguration()).toBe(false);
    });
});
