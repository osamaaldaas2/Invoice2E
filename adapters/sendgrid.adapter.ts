import { API_TIMEOUTS } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { ISendGridAdapter, SendGridEmailParams, SendGridResponse, SendGridTemplateParams } from './interfaces';

export class SendGridAdapter implements ISendGridAdapter {
    private readonly apiKey: string;
    private readonly fromEmail: string;
    private readonly fromName: string = 'Invoice2E';
    private readonly apiUrl = 'https://api.sendgrid.com/v3/mail/send';

    constructor() {
        this.apiKey = process.env.SENDGRID_API_KEY || '';
        this.fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@invoice2e.de';
    }

    private isConfigured(): boolean {
        return !!this.apiKey && !!this.fromEmail;
    }

    async sendEmail(params: SendGridEmailParams): Promise<SendGridResponse> {
        if (!this.isConfigured()) {
            logger.warn('SendGrid not configured');
            return { success: false, error: 'Not configured' };
        }

        const body = {
            personalizations: [{
                to: [{ email: params.to }],
            }],
            from: {
                email: this.fromEmail,
                name: this.fromName,
            },
            subject: params.subject,
            content: [
                { type: 'text/html', value: params.html },
                ...(params.text ? [{ type: 'text/plain', value: params.text }] : []),
            ],
            ...(params.attachments && params.attachments.length > 0 && {
                attachments: params.attachments.map(a => ({
                    content: a.content,
                    filename: a.filename,
                    type: a.type,
                    disposition: a.disposition || 'attachment',
                })),
            }),
        };

        return this.sendToApi(body);
    }

    async sendTemplateEmail(params: SendGridTemplateParams): Promise<SendGridResponse> {
        if (!this.isConfigured()) {
            return { success: false, error: 'Not configured' };
        }

        const body = {
            personalizations: [{
                to: [{ email: params.to }],
                dynamic_template_data: params.dynamicData,
            }],
            from: {
                email: this.fromEmail,
                name: this.fromName,
            },
            template_id: params.templateId,
            ...(params.attachments && params.attachments.length > 0 && {
                attachments: params.attachments.map(a => ({
                    content: a.content,
                    filename: a.filename,
                    type: a.type,
                    disposition: a.disposition || 'attachment',
                })),
            }),
        };

        return this.sendToApi(body);
    }

    private async sendToApi(body: any): Promise<SendGridResponse> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUTS.SENDGRID_API);

        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                const text = await response.text();
                logger.error('SendGrid API error', { status: response.status, body: text });
                return { success: false, error: text };
            }

            const messageId = response.headers.get('x-message-id') || undefined;
            return { success: true, messageId };

        } catch (error) {
            clearTimeout(timeoutId);
            if (error instanceof Error && error.name === 'AbortError') {
                logger.error('SendGrid API timeout');
                return { success: false, error: 'Timeout' };
            }
            logger.error('SendGrid send failed', { error });
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }
}

export const sendgridAdapter = new SendGridAdapter();
