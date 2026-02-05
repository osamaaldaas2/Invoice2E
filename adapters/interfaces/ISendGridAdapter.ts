export interface ISendGridAdapter {
    sendEmail(params: SendGridEmailParams): Promise<SendGridResponse>;
    sendTemplateEmail(params: SendGridTemplateParams): Promise<SendGridResponse>;
}

export interface SendGridEmailParams {
    to: string;
    subject: string;
    html: string;
    text?: string;
    attachments?: SendGridAttachment[];
}

export interface SendGridTemplateParams {
    to: string;
    templateId: string;
    dynamicData: Record<string, unknown>;
    attachments?: SendGridAttachment[];
}

export interface SendGridAttachment {
    content: string; // Base64 encoded
    filename: string;
    type: string;
    disposition: 'attachment' | 'inline';
}

export interface SendGridResponse {
    success: boolean;
    messageId?: string;
    error?: string;
}
