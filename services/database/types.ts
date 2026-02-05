// Input types for database operations

export type CreateUserData = {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
};

export type UpdateUserData = {
    firstName?: string;
    lastName?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    postalCode?: string;
    country?: string;
    phone?: string;
    taxId?: string;
    language?: string;
};

export type CreateExtractionData = {
    userId: string;
    extractionData: Record<string, unknown>;
    confidenceScore?: number;
    geminiResponseTimeMs?: number;
};

export type CreateConversionData = {
    userId: string;
    extractionId: string;
    invoiceNumber?: string;
    buyerName?: string;
    conversionFormat: string;
    creditsUsed?: number;
};

export type UpdateConversionData = {
    validationStatus?: string;
    validationErrors?: Record<string, unknown>;
    conversionStatus?: string;
    emailSent?: boolean;
    emailSentAt?: Date;
    emailRecipient?: string;
    fileDownloadTriggered?: boolean;
    downloadTriggeredAt?: Date;
};

export type CreatePaymentData = {
    userId: string;
    stripePaymentId?: string;
    amount: number;
    currency?: string;
    creditsPurchased: number;
    paymentMethod: string;
    paymentStatus: string;
};

export type CreateAuditLogData = {
    userId?: string;
    action: string;
    resourceType?: string;
    resourceId?: string;
    changes?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
};
