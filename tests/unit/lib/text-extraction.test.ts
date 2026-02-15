import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@/lib/pdf-text-extractor', () => ({
  extractTextFromPdf: vi.fn(),
}));

vi.mock('@/lib/ocr-extractor', () => ({
  extractTextWithOcr: vi.fn(),
}));

// Must mock constants before importing the module
vi.mock('@/lib/constants', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    ENABLE_TEXT_EXTRACTION: true,
    ENABLE_OCR: true,
  };
});

import { extractText } from '@/lib/text-extraction';
import { extractTextFromPdf } from '@/lib/pdf-text-extractor';
import { extractTextWithOcr } from '@/lib/ocr-extractor';

const mockPdfExtract = extractTextFromPdf as ReturnType<typeof vi.fn>;
const mockOcr = extractTextWithOcr as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('extractText routing', () => {
  it('uses pdf-parse for digital PDFs', async () => {
    mockPdfExtract.mockResolvedValue({
      hasText: true,
      text: 'Invoice 123',
      pageCount: 1,
    });

    const result = await extractText(Buffer.from('pdf'), 'application/pdf');
    expect(result.source).toBe('pdf-parse');
    expect(result.hasText).toBe(true);
    expect(mockOcr).not.toHaveBeenCalled();
  });

  it('falls back to OCR for scanned PDFs', async () => {
    mockPdfExtract.mockResolvedValue({
      hasText: false,
      text: '',
      pageCount: 1,
    });
    mockOcr.mockResolvedValue({ text: 'OCR text', confidence: 0.8 });

    const result = await extractText(Buffer.from('pdf'), 'application/pdf');
    expect(result.source).toBe('ocr');
    expect(result.hasText).toBe(true);
  });

  it('uses OCR for JPEG images', async () => {
    mockOcr.mockResolvedValue({ text: 'Image text', confidence: 0.9 });

    const result = await extractText(Buffer.from('img'), 'image/jpeg');
    expect(result.source).toBe('ocr');
    expect(result.hasText).toBe(true);
    expect(mockPdfExtract).not.toHaveBeenCalled();
  });

  it('uses OCR for PNG images', async () => {
    mockOcr.mockResolvedValue({ text: 'PNG text', confidence: 0.7 });

    const result = await extractText(Buffer.from('img'), 'image/png');
    expect(result.source).toBe('ocr');
    expect(result.hasText).toBe(true);
  });

  it('returns none when OCR returns empty text', async () => {
    mockOcr.mockResolvedValue({ text: '', confidence: 0.3 });

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
