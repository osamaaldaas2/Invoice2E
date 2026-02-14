import type { TaxCategoryCode, DocumentTypeCode, AllowanceCharge } from '@/types';
import type { ValidationError as VPError } from '@/validation/validation-result';
import type { ExternalValidationResult } from './validator';

export interface XRechnungGenerationResult {
  xmlContent: string;
  fileName: string;
  fileSize: number;
  validationStatus: 'valid' | 'invalid' | 'warnings';
  validationErrors: string[];
  validationWarnings: string[];
  /** Structured validation errors (EN 16931 compliance) */
  structuredErrors?: VPError[];
  /** External KoSIT validation (only present when ENABLE_EXTERNAL_VALIDATION=true) */
  externalValidation?: ExternalValidationResult;
}

// FIX-019: Typed interface replacing `any` in XRechnung builder
export interface XRechnungLineItem {
  description?: string;
  name?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  lineTotal?: number;
  taxRate?: number;
  vatRate?: number;
  unitCode?: string;
  taxCategoryCode?: TaxCategoryCode;
}

export interface XRechnungInvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  buyerName?: string | null;
  buyerEmail?: string | null;
  buyerAddress?: string | null;
  buyerCity?: string | null;
  buyerPostalCode?: string | null;
  buyerCountryCode?: string | null;
  buyerReference?: string | null;
  /** Buyer VAT ID (BT-48) */
  buyerVatId?: string | null;
  buyerTaxId?: string | null;
  /** Buyer electronic address (BT-49) */
  buyerElectronicAddress?: string | null;
  /** Buyer electronic address scheme (BT-49-1) — e.g. 'EM' for email */
  buyerElectronicAddressScheme?: string | null;
  sellerName: string;
  sellerEmail?: string | null;
  sellerAddress?: string | null;
  sellerCity?: string | null;
  sellerPostalCode?: string | null;
  sellerCountryCode?: string | null;
  sellerTaxId?: string | null;
  /** Seller VAT ID (BT-31) — EU format with country prefix */
  sellerVatId?: string | null;
  /** Seller tax number (BT-32) — local fiscal code */
  sellerTaxNumber?: string | null;
  /** Seller electronic address (BT-34) */
  sellerElectronicAddress?: string | null;
  /** Seller electronic address scheme (BT-34-1) — e.g. 'EM' for email */
  sellerElectronicAddressScheme?: string | null;
  sellerIban?: string | null;
  sellerBic?: string | null;
  sellerContactName?: string | null;
  sellerContact?: string | null;
  sellerPhoneNumber?: string | null;
  sellerPhone?: string | null;
  lineItems?: XRechnungLineItem[];
  subtotal?: number | null;
  taxRate?: number | null;
  vatRate?: number | null;
  taxAmount?: number | null;
  totalAmount: number;
  currency?: string | null;
  paymentTerms?: string | null;
  paymentDueDate?: string | null;
  notes?: string | null;
  dueDate?: string | null;
  /** EN 16931 document type code (BT-3) */
  documentTypeCode?: DocumentTypeCode;
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
}
