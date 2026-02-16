/**
 * Canonical Invoice Data Model — EN 16931 Business Terms
 * 
 * This is the universal internal representation used by all format generators.
 * Maps to EN 16931 semantic data model and is a SUPERSET of all format-specific types
 * (ExtractedInvoiceData, XRechnungInvoiceData, UBLInvoiceData).
 * 
 * @module types/canonical-invoice
 */

import type { TaxCategoryCode, DocumentTypeCode } from './index';

// ─── Output Formats ─────────────────────────────────────────────────────────

/** Supported e-invoicing output formats */
export type OutputFormat =
  | 'xrechnung-cii'
  | 'xrechnung-ubl'
  | 'peppol-bis'
  | 'facturx-en16931'
  | 'facturx-basic'
  | 'fatturapa'
  | 'ksef'
  | 'nlcius'
  | 'cius-ro';

// ─── Sub-interfaces ─────────────────────────────────────────────────────────

/** Party information (BG-4 Seller / BG-7 Buyer) */
export interface PartyInfo {
  /** Party name (BT-27 / BT-44) */
  name: string;
  /** Email address */
  email?: string | null;
  /** Street address (BT-35 / BT-50) */
  address?: string | null;
  /** City (BT-37 / BT-52) */
  city?: string | null;
  /** Postal code (BT-38 / BT-53) */
  postalCode?: string | null;
  /** Country code ISO 3166-1 alpha-2 (BT-40 / BT-55) */
  countryCode?: string | null;
  /** Phone number */
  phone?: string | null;
  /** VAT identifier (BT-31 / BT-48) — EU format with country prefix */
  vatId?: string | null;
  /** Tax registration number (BT-32) — local fiscal code */
  taxNumber?: string | null;
  /** Legacy combined tax ID field */
  taxId?: string | null;
  /** Electronic address (BT-34 / BT-49) */
  electronicAddress?: string | null;
  /** Electronic address scheme (BT-34-1 / BT-49-1) */
  electronicAddressScheme?: string | null;
  /** Contact person name (BT-41 / BT-56) */
  contactName?: string | null;
  /** Tax regime code (FatturaPA RegimeFiscale, e.g. RF01–RF19) */
  taxRegime?: string | null;
}

/** Payment information (BG-16 / BG-17) */
export interface PaymentInfo {
  /** Seller IBAN (BT-84) */
  iban?: string | null;
  /** Seller BIC (BT-86) */
  bic?: string | null;
  /** Bank name */
  bankName?: string | null;
  /** Payment terms text (BT-20) */
  paymentTerms?: string | null;
  /** Payment due date (BT-9) — YYYY-MM-DD */
  dueDate?: string | null;
  /** Prepaid amount (BT-113) */
  prepaidAmount?: number | null;
}

/** Canonical line item (BG-25) */
export interface CanonicalLineItem {
  /** Item name/description (BT-153 / BT-154) */
  description: string;
  /** Invoiced quantity (BT-129) */
  quantity: number;
  /** Net unit price (BT-146) */
  unitPrice: number;
  /** Line extension amount / net total (BT-131) */
  totalPrice: number;
  /** VAT rate percentage (BT-152) */
  taxRate?: number;
  /** VAT category code (BT-151) */
  taxCategoryCode?: TaxCategoryCode;
  /** Unit of measure code (BT-130) — UNECE Rec 20 */
  unitCode?: string;
}

/** Document totals (BG-22) */
export interface DocumentTotals {
  /** Sum of line net amounts (BT-106) */
  subtotal: number;
  /** Invoice total VAT amount (BT-110) */
  taxAmount: number;
  /** Invoice total with VAT (BT-112) */
  totalAmount: number;
}

/** Document-level allowance (BG-20) or charge (BG-21) */
export interface CanonicalAllowanceCharge {
  /** false = allowance/discount, true = charge/surcharge */
  chargeIndicator: boolean;
  /** Amount (BT-92 / BT-99) — always positive */
  amount: number;
  /** Base amount for percentage calculation (BT-93 / BT-100) */
  baseAmount?: number | null;
  /** Percentage (BT-94 / BT-101) */
  percentage?: number | null;
  /** Reason text (BT-97 / BT-104) */
  reason?: string | null;
  /** Reason code (BT-98 / BT-105) */
  reasonCode?: string | null;
  /** Tax rate for this allowance/charge */
  taxRate?: number | null;
  /** Tax category code (BT-95 / BT-102) */
  taxCategoryCode?: TaxCategoryCode | null;
}

// ─── Canonical Invoice ──────────────────────────────────────────────────────

/**
 * Canonical invoice representation — EN 16931 Business Terms.
 * All format generators consume this interface.
 */
export interface CanonicalInvoice {
  /** Target output format */
  outputFormat: OutputFormat;

  // ── Document-level (BG-1) ──
  /** Invoice number (BT-1) */
  invoiceNumber: string;
  /** Invoice issue date (BT-2) — YYYY-MM-DD */
  invoiceDate: string;
  /** Document type code (BT-3): 380=invoice, 381=credit note, 384=corrected, 389=self-billed */
  documentTypeCode?: DocumentTypeCode;
  /** Document currency code (BT-5) — ISO 4217 */
  currency: string;
  /** Buyer reference / Leitweg-ID (BT-10) */
  buyerReference?: string | null;
  /** Free-text note (BT-22) */
  notes?: string | null;

  // ── Preceding invoice (BG-3) ──
  /** Preceding invoice reference (BT-25) — required for credit notes */
  precedingInvoiceReference?: string | null;

  // ── Invoice period (BG-14) ──
  /** Billing period start (BT-73) — YYYY-MM-DD */
  billingPeriodStart?: string | null;
  /** Billing period end (BT-74) — YYYY-MM-DD */
  billingPeriodEnd?: string | null;

  // ── Parties ──
  seller: PartyInfo;
  buyer: PartyInfo;

  // ── Payment ──
  payment: PaymentInfo;

  // ── Line items (BG-25) ──
  lineItems: CanonicalLineItem[];

  // ── Totals (BG-22) ──
  totals: DocumentTotals;

  // ── Allowances/Charges (BG-20 / BG-21) ──
  allowanceCharges?: CanonicalAllowanceCharge[];

  // ── Tax ──
  /** Overall tax rate (when single-rate invoice) */
  taxRate?: number | null;

  // ── Metadata ──
  /** Extraction confidence score */
  confidence?: number;
  /** Processing time in ms */
  processingTimeMs?: number;
}
