import { API_TIMEOUTS } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { IBrevoAdapter, BrevoEmailParams, BrevoResponse, BrevoTemplateParams } from './interfaces';

export class BrevoAdapter implements IBrevoAdapter {
  private readonly apiKey: string;
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly apiUrl = 'https://api.brevo.com/v3/smtp/email';

  constructor() {
    this.apiKey = process.env.BREVO_API_KEY || '';
    this.fromEmail = process.env.BREVO_FROM_EMAIL || 'noreply@invoice2e.eu';
    this.fromName = process.env.BREVO_FROM_NAME || 'Invoice2E';
  }

  private isConfigured(): boolean {
    return !!this.apiKey && !!this.fromEmail;
  }

  async sendEmail(params: BrevoEmailParams): Promise<BrevoResponse> {
    if (!this.isConfigured()) {
      logger.warn('Brevo not configured');
      return { success: false, error: 'Not configured' };
    }

    const body: Record<string, unknown> = {
      sender: {
        email: this.fromEmail,
        name: this.fromName,
      },
      to: [{ email: params.to }],
      subject: params.subject,
      htmlContent: params.html,
    };

    if (params.text) {
      body.textContent = params.text;
    }

    if (params.attachments && params.attachments.length > 0) {
      body.attachment = params.attachments.map((a) => ({
        content: a.content,
        name: a.name,
      }));
    }

    return this.sendToApi(body);
  }

  async sendTemplateEmail(params: BrevoTemplateParams): Promise<BrevoResponse> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Not configured' };
    }

    const body: Record<string, unknown> = {
      sender: {
        email: this.fromEmail,
        name: this.fromName,
      },
      to: [{ email: params.to }],
      templateId: params.templateId,
      params: params.params,
    };

    if (params.attachments && params.attachments.length > 0) {
      body.attachment = params.attachments.map((a) => ({
        content: a.content,
        name: a.name,
      }));
    }

    return this.sendToApi(body);
  }

  private async sendToApi(body: Record<string, unknown>): Promise<BrevoResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUTS.BREVO_API);

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'api-key': this.apiKey,
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const text = await response.text();
        logger.error('Brevo API error', { status: response.status, body: text });
        return { success: false, error: text };
      }

      const data = (await response.json()) as { messageId?: string };
      return { success: true, messageId: data.messageId };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        logger.error('Brevo API timeout');
        return { success: false, error: 'Timeout' };
      }
      logger.error('Brevo send failed', { error });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

export const brevoAdapter = new BrevoAdapter();
