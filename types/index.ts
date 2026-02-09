// Core entity types for Invoice2E database

// User role type for admin system
export type UserRole = 'user' | 'admin' | 'super_admin';

export type User = {
    id: string;
    email: string;
    passwordHash?: string;
    firstName: string;
    lastName: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    postalCode?: string;
    country?: string;
    phone?: string;
    taxId?: string;
    language: string;
    // Admin system fields
    role: UserRole;
    isBanned: boolean;
    bannedAt?: Date;
    bannedReason?: string;
    lastLoginAt?: Date;
    loginCount: number;
    createdAt: Date;
    updatedAt: Date;
};

export type UserCredits = {
    id: string;
    userId: string;
    availableCredits: number;
    usedCredits: number;
    creditsExpiryDate?: Date;
    createdAt: Date;
    updatedAt: Date;
};

export type InvoiceExtraction = {
    id: string;
    userId: string;
    extractionData: Record<string, unknown>;
    confidenceScore?: number;
    geminiResponseTimeMs?: number;
    status: string;
    errorMessage?: string;
    createdAt: Date;
    updatedAt: Date;
};

export type InvoiceConversion = {
    id: string;
    userId: string;
    extractionId: string;
    invoiceNumber?: string;
    buyerName?: string;
    conversionFormat: string;
    validationStatus: string;
    validationErrors?: Record<string, unknown>;
    conversionStatus: string;
    emailSent: boolean;
    emailSentAt?: Date;
    emailRecipient?: string;
    fileDownloadTriggered: boolean;
    downloadTriggeredAt?: Date;
    creditsUsed: number;
    createdAt: Date;
    updatedAt: Date;
};

export type PaymentTransaction = {
    id: string;
    userId: string;
    stripePaymentId?: string;
    amount: number;
    currency: string;
    creditsPurchased: number;
    paymentMethod: string;
    paymentStatus: string;
    createdAt: Date;
    updatedAt: Date;
};

export type AuditLog = {
    id: string;
    userId?: string;
    action: string;
    resourceType?: string;
    resourceId?: string;
    changes?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    createdAt: Date;
};

// API response types
export type ApiResponse<T = unknown> = {
    success: boolean;
    data?: T;
    error?: string;
    timestamp: string;
};

export type PaginatedResponse<T> = ApiResponse<{
    items: T[];
    total: number;
    page: number;
    limit: number;
}>;

// Extraction status enum
export const ExtractionStatus = {
    DRAFT: 'draft',
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
} as const;

export type ExtractionStatusType = (typeof ExtractionStatus)[keyof typeof ExtractionStatus];

// Conversion status enum
export const ConversionStatus = {
    DRAFT: 'draft',
    PENDING: 'pending',
    VALIDATING: 'validating',
    VALIDATED: 'validated',
    VALIDATION_FAILED: 'validation_failed',
    CONVERTING: 'converting',
    COMPLETED: 'completed',
    FAILED: 'failed',
} as const;

export type ConversionStatusType = (typeof ConversionStatus)[keyof typeof ConversionStatus];

// Payment status enum
export const PaymentStatus = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    REFUNDED: 'refunded',
} as const;

export type PaymentStatusType = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export interface ExtractedInvoiceData {
    invoiceNumber: string | null;
    invoiceDate: string | null;
    buyerName: string | null;
    buyerEmail: string | null;
    buyerAddress: string | null;
    buyerCity?: string | null;
    buyerPostalCode?: string | null;
    buyerCountryCode?: string | null;
    buyerTaxId: string | null;
    buyerPhone?: string | null;
    sellerName: string | null;
    sellerEmail: string | null;
    sellerAddress: string | null;
    sellerCity?: string | null;
    sellerPostalCode?: string | null;
    sellerCountryCode?: string | null;
    sellerTaxId: string | null;
    sellerIban?: string | null;
    sellerBic?: string | null;
    sellerPhone?: string | null;
    bankName?: string | null;
    lineItems: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        totalPrice: number;
        taxRate?: number;
    }>;
    subtotal: number;
    taxRate?: number | null;
    taxAmount: number;
    totalAmount: number;
    currency: string;
    paymentTerms: string | null;
    notes: string | null;
    confidence: number;
    processingTimeMs: number;
}
