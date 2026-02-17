import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MistralAdapter } from '@/adapters/mistral.adapter';
import axios from 'axios';

vi.mock('axios');

vi.mock('@/lib/api-throttle', () => ({
  openaiThrottle: { acquire: vi.fn().mockResolvedValue(undefined), destroy: vi.fn() },
  geminiThrottle: { acquire: vi.fn().mockResolvedValue(undefined), destroy: vi.fn() },
  mistralThrottle: { acquire: vi.fn().mockResolvedValue(undefined), destroy: vi.fn() },
}));

vi.mock('@/lib/text-extraction', () => ({
  extractText: vi
    .fn()
    .mockResolvedValue({
      hasText: true,
      text: 'Extracted text from PDF',
      pageCount: 1,
      source: 'unpdf',
    }),
}));

vi.mock('@/lib/ocr-extractor', () => ({
  extractTextWithMistralOcr: vi.fn().mockResolvedValue('OCR extracted text'),
}));

describe('MistralAdapter', () => {
  let adapter: MistralAdapter;

  beforeEach(() => {
    vi.stubEnv('MISTRAL_API_KEY', 'test-mistral-key');
    adapter = new MistralAdapter();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('validateConfiguration', () => {
    it('should return true when API key is set', () => {
      expect(adapter.validateConfiguration()).toBe(true);
    });

    it('should return false when API key is empty', () => {
      vi.stubEnv('MISTRAL_API_KEY', '');
      const a = new MistralAdapter();
      expect(a.validateConfiguration()).toBe(false);
    });
  });

  describe('getProviderName', () => {
    it('should return mistral', () => {
      expect(adapter.getProviderName()).toBe('mistral');
    });
  });

  describe('extractInvoiceData', () => {
    it('should perform two-step extraction (OCR + Chat)', async () => {
      const chatResponse = {
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  invoiceNumber: 'INV-001',
                  totalAmount: 100.0,
                  currency: 'EUR',
                }),
              },
            },
          ],
        },
      };

      (axios.post as any).mockResolvedValueOnce(chatResponse);

      const result = await adapter.extractInvoiceData(Buffer.from('test'), 'application/pdf');

      expect(result.data.invoiceNumber).toBe('INV-001');
      expect(result.data.totalAmount).toBe(100.0);
      // Only 1 axios call (chat) — OCR is via shared utility (mocked)
      expect(axios.post).toHaveBeenCalledTimes(1);
    });

    it('should throw when API key is missing', async () => {
      vi.stubEnv('MISTRAL_API_KEY', '');
      const a = new MistralAdapter();
      await expect(a.extractInvoiceData(Buffer.from('test'), 'application/pdf')).rejects.toThrow(
        'Mistral API not configured'
      );
    });

    it('should throw on empty buffer', async () => {
      await expect(adapter.extractInvoiceData(Buffer.alloc(0), 'application/pdf')).rejects.toThrow(
        'Empty file buffer'
      );
    });
  });

  describe('extractWithText', () => {
    it('should skip OCR when text is provided', async () => {
      const chatResponse = {
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  invoiceNumber: 'INV-002',
                  totalAmount: 200.0,
                  currency: 'EUR',
                }),
              },
            },
          ],
        },
      };

      (axios.post as any).mockResolvedValue(chatResponse);

      const result = await adapter.extractWithText(Buffer.from('test'), 'application/pdf', {
        extractedText: 'Invoice Number: INV-002',
      });

      expect(result.data.invoiceNumber).toBe('INV-002');
      // Only 1 call (chat), no OCR
      expect(axios.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('extractWithRetry', () => {
    it('should send retry prompt to chat', async () => {
      const chatResponse = {
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  invoiceNumber: 'INV-003',
                  totalAmount: 300.0,
                  currency: 'EUR',
                }),
              },
            },
          ],
        },
      };

      (axios.post as any).mockResolvedValue(chatResponse);

      const result = await adapter.extractWithRetry(
        Buffer.from('test'),
        'application/pdf',
        'Please fix the invoice number'
      );

      expect(result.data.invoiceNumber).toBe('INV-003');
    });
  });

  describe('sendPrompt', () => {
    it('should use local text extraction then send prompt to chat', async () => {
      const chatResponse = {
        data: {
          choices: [
            {
              message: { content: '{"boundaries": [1]}' },
            },
          ],
        },
      };

      (axios.post as any).mockResolvedValue(chatResponse);

      const result = await adapter.sendPrompt(
        Buffer.from('test'),
        'application/pdf',
        'Detect boundaries'
      );

      expect(result).toBe('{"boundaries": [1]}');
      // Only 1 axios call (chat) — text extraction is local (mocked)
      expect(axios.post).toHaveBeenCalledTimes(1);
    });
  });
});
