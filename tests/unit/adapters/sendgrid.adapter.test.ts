import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SendGridAdapter } from '@/adapters/sendgrid.adapter';
import { SendGridEmailParams } from '@/adapters/interfaces/ISendGridAdapter';

describe('SendGridAdapter', () => {
    let adapter: SendGridAdapter;
    let mockFetch: any;

    beforeEach(() => {
        vi.stubEnv('SENDGRID_API_KEY', 'test-api-key');
        vi.stubEnv('SENDGRID_FROM_EMAIL', 'test@example.com');

        mockFetch = vi.fn();
        global.fetch = mockFetch;

        adapter = new SendGridAdapter();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should send email successfully', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            status: 202,
            headers: {
                get: (header: string) => header === 'x-message-id' ? 'msg_123' : null
            }
        });

        const params: SendGridEmailParams = {
            to: 'recipient@example.com',
            subject: 'Test Subject',
            html: '<p>Test</p>',
            text: 'Test',
            attachments: [{
                content: 'base64Data',
                filename: 'test.pdf',
                type: 'application/pdf',
                disposition: 'attachment'
            }]
        };

        const result = await adapter.sendEmail(params);

        expect(result.success).toBe(true);
        expect(result.messageId).toBe('msg_123');

        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.sendgrid.com/v3/mail/send',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'Authorization': 'Bearer test-api-key',
                    'Content-Type': 'application/json'
                }),
                body: expect.stringContaining('"email":"recipient@example.com"')
            })
        );
    });

    it('should handle API errors', async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            status: 400,
            text: async () => 'Bad Request'
        });

        const params: SendGridEmailParams = {
            to: 'recipient@example.com',
            subject: 'Test Subject',
            html: '<p>Test</p>'
        };

        const result = await adapter.sendEmail(params);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Bad Request');
    });

    it('should send template email successfully', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            status: 202,
            headers: { get: () => 'msg_template_123' }
        });

        const params = {
            to: 'recipient@example.com',
            templateId: 'd-12345',
            dynamicData: { name: 'User' }
        };

        const result = await adapter.sendTemplateEmail(params);

        expect(result.success).toBe(true);
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.sendgrid.com/v3/mail/send',
            expect.objectContaining({
                body: expect.stringContaining('"template_id":"d-12345"')
            })
        );
    });

    it('should handle configuration error', async () => {
        vi.stubEnv('SENDGRID_API_KEY', '');

        const unconfiguredAdapter = new SendGridAdapter();
        const result = await unconfiguredAdapter.sendEmail({
            to: 'test', subject: 'test', html: 'test'
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Not configured');
    });
});
