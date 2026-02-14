// Auth service
export { authService } from './auth.service';

// File service
export { fileService, type FileUploadResult } from './file.service';

// Gemini AI service
// AI Extractors
export { ExtractorFactory, type AIProvider } from './ai/extractor.factory';
export { GeminiExtractor } from './ai/gemini.extractor';
export { DeepSeekExtractor } from './ai/deepseek.extractor';
export { OpenAIExtractor } from './ai/openai.extractor';
export type { IAIExtractor, ExtractedInvoiceData } from './ai/IAIExtractor';

// DEPRECATED - use ExtractorFactory instead
export { geminiService } from './gemini.service';

// Review service
export { reviewService, type ReviewedInvoiceData, type LineItem } from './review.service';

// Database services (split for <300 lines compliance)
export { userDbService, type CreateUserData, type UpdateUserData } from './user.db.service';
export { creditsDbService } from './credits.db.service';
export {
    invoiceDbService,
    type CreateExtractionData,
    type CreateConversionData,
    type UpdateConversionData,
} from './invoice.db.service';
export { paymentDbService, type CreatePaymentData } from './payment.db.service';
export { auditDbService, type CreateAuditLogData } from './audit.db.service';

// Legacy export for backward compatibility (deprecated)
export { databaseService } from './database.service';
