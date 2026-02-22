import { logger } from '@/lib/logger';
import { brevoAdapter } from '@/adapters';
import { IBrevoAdapter } from '@/adapters/interfaces';
import { EmailOptions, ConversionEmailData, PaymentEmailData } from './types';
import { getConversionEmailHtml, getConversionEmailText } from './templates/conversion.template';
import { getPaymentEmailHtml, getPaymentEmailText } from './templates/payment.template';
import { getWelcomeEmailHtml, getWelcomeEmailText } from './templates/welcome.template';
import { getErrorEmailHtml } from './templates/error.template';
import {
  getPasswordResetEmailHtml,
  getPasswordResetEmailText,
  PasswordResetEmailData,
} from './templates/password-reset.template';

export class EmailService {
  constructor(private adapter: IBrevoAdapter = brevoAdapter) {}

  /**
   * Check if email service is configured
   */
  isConfigured(): boolean {
    return !!process.env.BREVO_API_KEY && !!process.env.BREVO_FROM_EMAIL;
  }

  async sendConversionEmail(
    recipientEmail: string,
    data: ConversionEmailData,
    xmlContent?: string
  ): Promise<boolean> {
    logger.info('Sending conversion email', {
      to: recipientEmail,
      invoiceNumber: data.invoiceNumber,
    });
    const attachments = xmlContent
      ? [
          {
            content: Buffer.from(xmlContent).toString('base64'),
            filename: `${data.invoiceNumber}_xrechnung.xml`,
            type: 'application/xml',
            disposition: 'attachment',
          },
        ]
      : undefined;

    return this.sendEmail({
      to: recipientEmail,
      subject: `✅ Invoice ${data.invoiceNumber} converted successfully`,
      html: getConversionEmailHtml(data),
      text: getConversionEmailText(data),
      attachments,
    });
  }

  async sendPaymentConfirmationEmail(
    recipientEmail: string,
    data: PaymentEmailData
  ): Promise<boolean> {
    return this.sendEmail({
      to: recipientEmail,
      subject: `✅ Payment confirmed - ${data.creditsPurchased} credits added`,
      html: getPaymentEmailHtml(data),
      text: getPaymentEmailText(data),
    });
  }

  async sendWelcomeEmail(recipientEmail: string, userName: string): Promise<boolean> {
    return this.sendEmail({
      to: recipientEmail,
      subject: '👋 Welcome to Invoice2E!',
      html: getWelcomeEmailHtml(userName),
      text: getWelcomeEmailText(userName),
    });
  }

  async sendErrorNotificationEmail(
    recipientEmail: string,
    errorMessage: string,
    invoiceNumber?: string
  ): Promise<boolean> {
    return this.sendEmail({
      to: recipientEmail,
      subject: `❌ Error processing${invoiceNumber ? ` invoice ${invoiceNumber}` : ' your request'}`,
      html: getErrorEmailHtml(errorMessage, invoiceNumber),
      text: `Error processing${invoiceNumber ? ` invoice ${invoiceNumber}` : ''}: ${errorMessage}`,
    });
  }

  async sendPasswordResetEmail(
    recipientEmail: string,
    data: PasswordResetEmailData
  ): Promise<boolean> {
    return this.sendEmail({
      to: recipientEmail,
      subject: 'Reset your Invoice2E password',
      html: getPasswordResetEmailHtml(data),
      text: getPasswordResetEmailText(data),
    });
  }

  /**
   * Core send email function
   */
  private async sendEmail(options: EmailOptions): Promise<boolean> {
    const result = await this.adapter.sendEmail({
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      attachments: options.attachments?.map((a) => ({
        content: a.content,
        name: a.filename,
      })),
    });

    if (result.success) {
      logger.info('Email sent successfully', { to: options.to, subject: options.subject });
      return true;
    } else {
      logger.error('Failed to send email', { error: result.error, to: options.to });
      return false;
    }
  }
}

export const emailService = new EmailService();
