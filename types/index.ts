// Canonical invoice model (multi-format support)
export type {
  OutputFormat,
  CanonicalInvoice,
  PartyInfo,
  PaymentInfo,
  CanonicalLineItem,
  DocumentTotals,
  CanonicalAllowanceCharge,
} from './canonical-invoice';

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
  outputFormat?: string;
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

/** UNCL5305 VAT category codes supported by EN 16931 */
export type TaxCategoryCode = 'S' | 'Z' | 'E' | 'AE' | 'K' | 'G' | 'O' | 'L';

/** EN 16931 document type codes (BT-3) */
export type DocumentTypeCode = 380 | 381 | 384 | 389;

/** Document-level allowance (BG-20) or charge (BG-21) per EN 16931 */
export interface AllowanceCharge {
  /** false = allowance/discount, true = charge/surcharge */
  chargeIndicator: boolean;
  /** Allowance/charge amount (BT-92 / BT-99) — always positive */
  amount: number;
  /** Base amount for percentage calculation (BT-93 / BT-100) */
  baseAmount?: number | null;
  /** Percentage if applicable (BT-94 / BT-101) — e.g. 10 for 10% */
  percentage?: number | null;
  /** Reason text (BT-97 / BT-104) — e.g. "Rabatt", "Frachtkosten" */
  reason?: string | null;
  /** UNCL5189 reason code (BT-98 / BT-105) — e.g. 95=discount, 100=special agreement */
  reasonCode?: string | null;
  /** Tax rate for this allowance/charge */
  taxRate?: number | null;
  /** Tax category code (BT-95 / BT-102) */
  taxCategoryCode?: TaxCategoryCode | null;
}

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
  /** Buyer VAT ID (BT-48) — mapped to XML SpecifiedTaxRegistration schemeID=VA */
  buyerVatId?: string | null;
  /** Buyer electronic address (BT-49) — e.g. email for schemeID=EM */
  buyerElectronicAddress?: string | null;
  /** Buyer electronic address scheme (BT-49-1) — e.g. 'EM' for email */
  buyerElectronicAddressScheme?: string | null;
  sellerName: string | null;
  sellerEmail: string | null;
  sellerAddress: string | null;
  sellerCity?: string | null;
  sellerPostalCode?: string | null;
  sellerCountryCode?: string | null;
  sellerTaxId: string | null;
  /** Seller VAT ID (BT-31) — e.g. DE123456789, schemeID=VA */
  sellerVatId?: string | null;
  /** Seller tax registration number (BT-32) — local fiscal number, schemeID=FC */
  sellerTaxNumber?: string | null;
  /** Seller electronic address (BT-34) — e.g. email for schemeID=EM */
  sellerElectronicAddress?: string | null;
  /** Seller electronic address scheme (BT-34-1) — e.g. 'EM' for email */
  sellerElectronicAddressScheme?: string | null;
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
    /** UNCL5305 tax category code per line item */
    taxCategoryCode?: TaxCategoryCode;
  }>;
  subtotal: number;
  taxRate?: number | null;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  paymentTerms: string | null;
  notes: string | null;
  confidence?: number;
  processingTimeMs?: number;
  /** EN 16931 document type code (BT-3): 380=invoice, 381=credit note */
  documentTypeCode?: DocumentTypeCode;
  /** Buyer reference / Leitweg-ID (BT-10) */
  buyerReference?: string | null;
  /** Seller contact person name (BR-DE-2) */
  sellerContactName?: string | null;
  /** Payment due date (BT-9) in YYYY-MM-DD format */
  dueDate?: string | null;
  /** Document-level allowances and charges (BG-20 / BG-21) */
  allowanceCharges?: AllowanceCharge[];
  /** Preceding invoice reference (BT-25) — required for credit notes (TypeCode 381) */
  precedingInvoiceReference?: string | null;
  /** Prepaid amount (BT-113) — deducted from grand total to compute amount due */
  prepaidAmount?: number | null;
  /** Billing period start date (BT-73) — YYYY-MM-DD format */
  billingPeriodStart?: string | null;
  /** Billing period end date (BT-74) — YYYY-MM-DD format */
  billingPeriodEnd?: string | null;
  /** Validation warnings from extraction (math errors that survived retries) */
  validationWarnings?: string[];
}
