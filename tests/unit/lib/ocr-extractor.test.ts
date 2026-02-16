import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';

vi.mock('axios');

vi.mock('@/lib/api-throttle', () => ({
  mistralThrottle: { acquire: vi.fn().mockResolvedValue(undefined), destroy: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { extractTextWithMistralOcr } from '@/lib/ocr-extractor';

describe('extractTextWithMistralOcr', () => {
  beforeEach(() => {
    vi.stubEnv('MISTRAL_API_KEY', 'test-key');
    vi.stubEnv('MISTRAL_API_URL', 'https://api.mistral.ai');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('should return empty string when MISTRAL_API_KEY is not set', async () => {
    vi.stubEnv('MISTRAL_API_KEY', '');
    const result = await extractTextWithMistralOcr(Buffer.from('test'), 'image/png');
    expect(result).toBe('');
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('should extract text from OCR response', async () => {
    (axios.post as any).mockResolvedValue({
      data: {
        pages: [
          { markdown: '# Invoice 001' },
          { markdown: '## Line Items' },
        ],
      },
    });

    const result = await extractTextWithMistralOcr(Buffer.from('test'), 'application/pdf');
    expect(result).toBe('# Invoice 001\n\n## Line Items');
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/v1/ocr'),
      expect.objectContaining({ model: 'mistral-ocr-latest' }),
      expect.any(Object)
    );
  });

  it('should return empty string on empty pages', async () => {
    (axios.post as any).mockResolvedValue({ data: { pages: [] } });
    const result = await extractTextWithMistralOcr(Buffer.from('test'), 'application/pdf');
    expect(result).toBe('');
  });

  it('should return empty string on error', async () => {
    (axios.post as any).mockRejectedValue(new Error('Network error'));
    const result = await extractTextWithMistralOcr(Buffer.from('test'), 'image/png');
    expect(result).toBe('');
  });
});
