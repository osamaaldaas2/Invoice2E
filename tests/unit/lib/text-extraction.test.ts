import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@/lib/pdf-text-extractor', () => ({
  extractTextFromPdf: vi.fn(),
}));

vi.mock('@/lib/ocr-extractor', () => ({
  extractTextWithMistralOcr: vi.fn(),
}));

// Must mock constants before importing the module
vi.mock('@/lib/constants', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    ENABLE_TEXT_EXTRACTION: true,
  };
});

import { extractText } from '@/lib/text-extraction';
import { extractTextFromPdf } from '@/lib/pdf-text-extractor';
import { extractTextWithMistralOcr } from '@/lib/ocr-extractor';

const mockPdfExtract = extractTextFromPdf as ReturnType<typeof vi.fn>;
const mockOcr = extractTextWithMistralOcr as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('extractText routing', () => {
  it('uses unpdf for digital PDFs', async () => {
    mockPdfExtract.mockResolvedValue({
      hasText: true,
      text: 'Invoice 123',
      pageCount: 1,
    });

    const result = await extractText(Buffer.from('pdf'), 'application/pdf');
    expect(result.source).toBe('unpdf');
    expect(result.hasText).toBe(true);
    expect(mockOcr).not.toHaveBeenCalled();
  });

  it('falls back to Mistral OCR for scanned PDFs', async () => {
    mockPdfExtract.mockResolvedValue({
      hasText: false,
      text: '',
      pageCount: 1,
    });
    mockOcr.mockResolvedValue('OCR text from Mistral');

    const result = await extractText(Buffer.from('pdf'), 'application/pdf');
    expect(result.source).toBe('mistral-ocr');
    expect(result.hasText).toBe(true);
  });

  it('uses Mistral OCR for JPEG images', async () => {
    mockOcr.mockResolvedValue('Image text');

    const result = await extractText(Buffer.from('img'), 'image/jpeg');
    expect(result.source).toBe('mistral-ocr');
    expect(result.hasText).toBe(true);
    expect(mockPdfExtract).not.toHaveBeenCalled();
  });

  it('uses Mistral OCR for PNG images', async () => {
    mockOcr.mockResolvedValue('PNG text');

    const result = await extractText(Buffer.from('img'), 'image/png');
    expect(result.source).toBe('mistral-ocr');
    expect(result.hasText).toBe(true);
  });

  it('returns none when Mistral OCR returns empty text', async () => {
    mockOcr.mockResolvedValue('');

    const result = await extractText(Buffer.from('img'), 'image/jpeg');
    expect(result.source).toBe('none');
    expect(result.hasText).toBe(false);
  });

  it('returns none for unsupported mime types', async () => {
    const result = await extractText(Buffer.from('x'), 'application/xml');
    expect(result.source).toBe('none');
    expect(result.hasText).toBe(false);
  });
});
