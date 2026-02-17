import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MistralExtractor } from '@/services/ai/mistral.extractor';
import { IMistralAdapter, MistralExtractionResult } from '@/adapters/interfaces';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/text-extraction', () => ({
  extractText: vi
    .fn()
    .mockResolvedValue({ hasText: false, text: '', pageCount: 0, source: 'none' }),
}));

vi.mock('@/lib/extraction-validator', () => ({
  validateExtraction: vi.fn().mockReturnValue({ valid: true, errors: [] }),
}));

vi.mock('@/lib/extraction-retry', () => ({
  buildRetryPrompt: vi.fn().mockReturnValue('retry prompt'),
  shouldRetry: vi.fn().mockReturnValue(false),
}));

function createMockAdapter(overrides?: Partial<IMistralAdapter>): IMistralAdapter {
  const mockResult: MistralExtractionResult = {
    data: {
      invoiceNumber: 'INV-001',
      totalAmount: 100,
      currency: 'EUR',
      confidence: 0.9,
    } as any,
    confidence: 0.9,
    processingTimeMs: 500,
  };

  return {
    extractInvoiceData: vi.fn().mockResolvedValue(mockResult),
    sendPrompt: vi.fn().mockResolvedValue('response'),
    getProviderName: vi.fn().mockReturnValue('mistral'),
    validateConfiguration: vi.fn().mockReturnValue(true),
    extractWithText: vi.fn().mockResolvedValue(mockResult),
    extractWithRetry: vi.fn().mockResolvedValue(mockResult),
    ...overrides,
  };
}

describe('MistralExtractor', () => {
  let mockAdapter: IMistralAdapter;
  let extractor: MistralExtractor;

  beforeEach(() => {
    mockAdapter = createMockAdapter();
    extractor = new MistralExtractor(mockAdapter);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should validate configuration', () => {
    expect(extractor.validateConfiguration()).toBe(true);
  });

  it('should return provider name', () => {
    expect(extractor.getProviderName()).toBe('Mistral');
  });

  it('should use text extraction then extractWithText', async () => {
    const result = await extractor.extractFromFile(
      Buffer.from('test'),
      'invoice.pdf',
      'application/pdf'
    );

    expect(mockAdapter.extractWithText).toHaveBeenCalledWith(
      expect.any(Buffer),
      'application/pdf',
      { extractedText: undefined }
    );
    expect(result.invoiceNumber).toBe('INV-001');
  });

  it('should still work when local extraction returns no text', async () => {
    const result = await extractor.extractFromFile(
      Buffer.from('test'),
      'invoice.pdf',
      'application/pdf'
    );

    expect(result.invoiceNumber).toBe('INV-001');
    expect(mockAdapter.extractWithText).toHaveBeenCalled();
  });

  it('should fall back to extractInvoiceData when extractWithText not available', async () => {
    const minimalAdapter: IMistralAdapter = {
      extractInvoiceData: vi.fn().mockResolvedValue({
        data: { invoiceNumber: 'INV-FALLBACK', totalAmount: 50, currency: 'EUR', confidence: 0.8 },
        confidence: 0.8,
        processingTimeMs: 300,
      }),
      sendPrompt: vi.fn(),
      getProviderName: vi.fn().mockReturnValue('mistral'),
      validateConfiguration: vi.fn().mockReturnValue(true),
    };
    extractor = new MistralExtractor(minimalAdapter);

    const result = await extractor.extractFromFile(
      Buffer.from('test'),
      'invoice.pdf',
      'application/pdf'
    );

    expect(result.invoiceNumber).toBe('INV-FALLBACK');
    expect(minimalAdapter.extractInvoiceData).toHaveBeenCalled();
  });
});
