import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DeepSeekAdapter } from '@/adapters/deepseek.adapter';
import { AppError } from '@/lib/errors';
import axios from 'axios';

vi.mock('axios');

describe('DeepSeekAdapter', () => {
    let adapter: DeepSeekAdapter;

    beforeEach(() => {
        vi.stubEnv('DEEPSEEK_API_KEY', 'test-api-key');
        adapter = new DeepSeekAdapter();
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
        // isAxiosError needs to be mocked on the error object or handled by axios.isAxiosError

        // Mocking static isAxiosError
        (axios.isAxiosError as any).mockReturnValue(true);

        (axios.post as any).mockRejectedValue(timeoutError);

        await expect(adapter.extractInvoiceData(Buffer.from('test'), 'application/pdf'))
            .rejects
            .toThrow('DeepSeek API request timed out'); // Specific message check
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
});
