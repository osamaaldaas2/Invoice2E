import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrevoAdapter } from '@/adapters/brevo.adapter';
import { BrevoEmailParams } from '@/adapters/interfaces/IBrevoAdapter';

describe('BrevoAdapter', () => {
  let adapter: BrevoAdapter;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv('BREVO_API_KEY', 'test-api-key');
    vi.stubEnv('BREVO_FROM_EMAIL', 'test@example.com');
    vi.stubEnv('BREVO_FROM_NAME', 'TestApp');

    mockFetch = vi.fn();
    global.fetch = mockFetch;

    adapter = new BrevoAdapter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should send email successfully with api-key header and 201 status', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ messageId: '<msg_brevo_123>' }),
    });

    const params: BrevoEmailParams = {
      to: 'recipient@example.com',
      subject: 'Test Subject',
      html: '<p>Test</p>',
      text: 'Test',
      attachments: [
        {
          content: 'base64Data',
          name: 'test.pdf',
        },
      ],
    };

    const result = await adapter.sendEmail(params);

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('<msg_brevo_123>');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.brevo.com/v3/smtp/email',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'api-key': 'test-api-key',
          'Content-Type': 'application/json',
        }),
        body: expect.stringContaining('"email":"recipient@example.com"'),
      })
    );
  });

  it('should use api-key header, not Bearer token', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ messageId: 'msg_1' }),
    });

    await adapter.sendEmail({
      to: 'test@test.com',
      subject: 'Test',
      html: '<p>Test</p>',
    });

    const callArgs = mockFetch.mock.calls[0]![1] as RequestInit;
    const headers = callArgs.headers as Record<string, string>;
    expect(headers['api-key']).toBe('test-api-key');
    expect(headers['Authorization']).toBeUndefined();
  });

  it('should handle API errors', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Bad Request',
    });

    const params: BrevoEmailParams = {
      to: 'recipient@example.com',
      subject: 'Test Subject',
      html: '<p>Test</p>',
    };

    const result = await adapter.sendEmail(params);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Bad Request');
  });

  it('should send template email successfully', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ messageId: 'msg_template_123' }),
    });

    const params = {
      to: 'recipient@example.com',
      templateId: 42,
      params: { name: 'User' },
    };

    const result = await adapter.sendTemplateEmail(params);

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.brevo.com/v3/smtp/email',
      expect.objectContaining({
        body: expect.stringContaining('"templateId":42'),
      })
    );
  });

  it('should handle configuration error', async () => {
    vi.stubEnv('BREVO_API_KEY', '');

    const unconfiguredAdapter = new BrevoAdapter();
    const result = await unconfiguredAdapter.sendEmail({
      to: 'test',
      subject: 'test',
      html: 'test',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Not configured');
  });

  it('should return messageId from response body', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ messageId: '<202402221234.abc@smtp-relay.brevo.com>' }),
    });

    const result = await adapter.sendEmail({
      to: 'test@example.com',
      subject: 'Test',
      html: '<p>Hi</p>',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('<202402221234.abc@smtp-relay.brevo.com>');
  });
});
