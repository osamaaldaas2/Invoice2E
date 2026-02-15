import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExtractText = vi.fn();

vi.mock('unpdf', () => ({
  extractText: (...args: unknown[]) => mockExtractText(...args),
}));

import { extractTextFromPdf } from '@/lib/pdf-text-extractor';

beforeEach(() => {
  mockExtractText.mockReset();
});

describe('extractTextFromPdf', () => {
  it('returns hasText: true for digital PDFs with sufficient text', async () => {
    mockExtractText.mockResolvedValue({ text: ['A'.repeat(200)], totalPages: 1 });

    const result = await extractTextFromPdf(Buffer.from('fake pdf'));
    expect(result.hasText).toBe(true);
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.pageCount).toBe(1);
  });

  it('joins multiple pages with double newline', async () => {
    mockExtractText.mockResolvedValue({ text: ['A'.repeat(100), 'B'.repeat(100)], totalPages: 2 });

    const result = await extractTextFromPdf(Buffer.from('fake pdf'));
    expect(result.hasText).toBe(true);
    expect(result.text).toBe('A'.repeat(100) + '\n\n' + 'B'.repeat(100));
    expect(result.pageCount).toBe(2);
  });

  it('returns hasText: false for scanned PDFs with little text', async () => {
    mockExtractText.mockResolvedValue({ text: ['Hi'], totalPages: 1 });

    const result = await extractTextFromPdf(Buffer.from('fake pdf'));
    expect(result.hasText).toBe(false);
    expect(result.text).toBe('');
  });

  it('returns hasText: false on parse error', async () => {
    mockExtractText.mockRejectedValue(new Error('corrupt PDF'));

    const result = await extractTextFromPdf(Buffer.from('bad'));
    expect(result.hasText).toBe(false);
    expect(result.pageCount).toBe(0);
  });
});
