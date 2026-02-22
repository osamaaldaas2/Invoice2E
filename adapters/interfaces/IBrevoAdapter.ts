export interface IBrevoAdapter {
  sendEmail(params: BrevoEmailParams): Promise<BrevoResponse>;
  sendTemplateEmail(params: BrevoTemplateParams): Promise<BrevoResponse>;
}

export interface BrevoEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: BrevoAttachment[];
}

export interface BrevoTemplateParams {
  to: string;
  templateId: number;
  params: Record<string, unknown>;
  attachments?: BrevoAttachment[];
}

export interface BrevoAttachment {
  content: string; // Base64 encoded
  name: string;
}

export interface BrevoResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}
