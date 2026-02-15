import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetText = vi.fn();
const mockDestroy = vi.fn().mockResolvedValue(undefined);

vi.mock('pdf-parse', () => {
  return {
    PDFParse: class {
      getText = mockGetText;
      destroy = mockDestroy;
      constructor(_opts: unknown) {}
    },
  };
});

import { extractTextFromPdf } from '@/lib/pdf-text-extractor';

beforeEach(() => {
  mockGetText.mockReset();
  mockDestroy.mockReset().mockResolvedValue(undefined);
});

describe('extractTextFromPdf', () => {
  it('returns hasText: true for digital PDFs with sufficient text', async () => {
    mockGetText.mockResolvedValue({ text: 'A'.repeat(200), total: 1, pages: [] });

    const result = await extractTextFromPdf(Buffer.from('fake pdf'));
    expect(result.hasText).toBe(true);
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.pageCount).toBe(1);
  });

  it('returns hasText: false for scanned PDFs with little text', async () => {
    mockGetText.mockResolvedValue({ text: 'Hi', total: 1, pages: [] });

    const result = await extractTextFromPdf(Buffer.from('fake pdf'));
    expect(result.hasText).toBe(false);
    expect(result.text).toBe('');
  });

  it('returns hasText: false on parse error', async () => {
    mockGetText.mockRejectedValue(new Error('corrupt PDF'));

    const result = await extractTextFromPdf(Buffer.from('bad'));
    expect(result.hasText).toBe(false);
    expect(result.pageCount).toBe(0);
  });
});
