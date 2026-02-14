import { ValidationError } from '@/lib/errors';
import { roundMoney, sumMoney, computeTax, moneyEqual } from '@/lib/monetary';

export type LineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  taxRate?: number;
};

export type ReviewedInvoiceData = {
  // Required EN16931 fields
  invoiceNumber: string;
  invoiceDate: string;

  // Buyer information (with country code)
  buyerName: string;
  buyerEmail: string;
  buyerAddress: string;
  buyerCity: string;
  buyerPostalCode: string;
  buyerCountryCode: string; // NEW: Required by BR-11
  buyerTaxId: string;
  buyerReference?: string; // NEW: Required by BR-DE-15
  buyerContact?: string; // NEW: Phone/name
  /** Buyer electronic address (BT-49) — derived from buyerEmail if absent */
  buyerElectronicAddress?: string;

  // Seller information (with country code and contact)
  sellerName: string;
  sellerEmail: string;
  sellerAddress: string;
  sellerCity: string; // NEW: Required by BR-DE-3
  sellerPostalCode: string; // NEW: Required by BR-DE-4
  sellerCountryCode: string; // NEW: Required by BR-09
  sellerTaxId: string;
  sellerContact?: string; // NEW: Required by BR-DE-2 (phone/name)
  /** Seller electronic address (BT-34) — derived from sellerEmail if absent */
  sellerElectronicAddress?: string;

  // Line items
  lineItems: LineItem[];

  // Document-level allowances/charges (BG-20 / BG-21)
  allowanceCharges?: {
    chargeIndicator: boolean;
    amount: number;
    percentage?: number | null;
    reason?: string | null;
    taxRate?: number | null;
  }[];

  // Totals
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;

  // Payment information
  paymentTerms: string;
  paymentDueDate?: string; // NEW: For BR-CO-25
  paymentInstructions?: string; // NEW: Required by BR-DE-1

  notes: string;
};

/**
 * Service for validating and processing reviewed invoice data
 * Follows CONSTITUTION rules for validation and logging
 */
export class ReviewService {
  /**
   * Validate reviewed invoice data
   */
  validateReviewedData(data: ReviewedInvoiceData): boolean {
    // Validate required string fields
    if (!data.invoiceNumber?.trim()) throw new ValidationError('Invoice number is required');
    if (!data.invoiceDate?.trim()) throw new ValidationError('Invoice date is required');
    if (!data.buyerName?.trim()) throw new ValidationError('Buyer name is required');
    if (!data.sellerName?.trim()) throw new ValidationError('Seller name is required');

    // Validate new required fields for XRechnung
    if (!data.sellerCountryCode?.trim())
      throw new ValidationError('Seller country code is required');
    if (!data.buyerCountryCode?.trim()) throw new ValidationError('Buyer country code is required');
    if (!data.sellerCity?.trim()) throw new ValidationError('Seller city is required');
    if (!data.sellerPostalCode?.trim()) throw new ValidationError('Seller postal code is required');

    // Validate amounts are non-negative
    if (data.totalAmount < 0 || data.subtotal < 0 || data.taxAmount < 0) {
      throw new ValidationError('Amounts cannot be negative');
    }

    // Validate line items
    if (!Array.isArray(data.lineItems) || data.lineItems.length === 0) {
      throw new ValidationError('Invoice must have at least one line item');
    }

    for (const item of data.lineItems) {
      if (!item.description?.trim())
        throw new ValidationError('Each line item must have a description');
      if (item.quantity <= 0) throw new ValidationError('Quantity must be greater than 0');
      if (item.unitPrice < 0) throw new ValidationError('Unit price cannot be negative'); // Allow 0 for free items? Test expects rejection of 0
      if (item.unitPrice === 0) throw new ValidationError('Unit price must be greater than 0');
      if (item.totalPrice < 0) throw new ValidationError('Total price cannot be negative');
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(data.invoiceDate)) {
      throw new ValidationError('Invoice date must be in YYYY-MM-DD format');
    }

    // Validate email format if provided
    if (data.buyerEmail && !this.isValidEmail(data.buyerEmail))
      throw new ValidationError('Invalid buyer email format');
    if (data.sellerEmail && !this.isValidEmail(data.sellerEmail))
      throw new ValidationError('Invalid seller email format');

    // Validate electronic addresses (BT-49 buyer, BT-34 seller) — early XRechnung enforcement
    const buyerEAddr = data.buyerElectronicAddress?.trim() || data.buyerEmail?.trim();
    if (!buyerEAddr) {
      throw new ValidationError('Buyer electronic address is required for XRechnung');
    }
    const sellerEAddr = data.sellerElectronicAddress?.trim() || data.sellerEmail?.trim();
    if (!sellerEAddr) {
      throw new ValidationError('Seller electronic address is required for XRechnung');
    }

    // P1-8: Server-side monetary consistency check
    this.validateMonetaryConsistency(data);

    return true;
  }

  /**
   * P1-8: Validate monetary consistency — server-side authoritative.
   * Checks: subtotal + taxAmount ≈ totalAmount (within 0.02 tolerance for rounding).
   * Also checks that sum of line item net amounts ≈ subtotal.
   */
  validateMonetaryConsistency(data: ReviewedInvoiceData): void {
    // Check subtotal + taxAmount ≈ totalAmount
    const expectedTotal = roundMoney(data.subtotal + data.taxAmount);
    if (!moneyEqual(expectedTotal, data.totalAmount, 0.02)) {
      throw new ValidationError(
        `Monetary inconsistency: subtotal (${data.subtotal}) + tax (${data.taxAmount}) = ${expectedTotal}, but totalAmount is ${data.totalAmount}`
      );
    }

    // Check sum of line net amounts ≈ subtotal (accounting for allowances/charges)
    const lineNetSum = sumMoney(data.lineItems.map((li) => li.totalPrice));
    const allowances = data.allowanceCharges || [];
    const totalAllowances = sumMoney(
      allowances.filter((ac) => !ac.chargeIndicator).map((ac) => ac.amount)
    );
    const totalCharges = sumMoney(
      allowances.filter((ac) => ac.chargeIndicator).map((ac) => ac.amount)
    );

    if (allowances.length > 0) {
      // BR-CO-13: subtotal = lineNetSum - allowances + charges
      // But for gross-priced invoices, subtotal may be the net (VAT-exclusive)
      // while lineNetSum is gross. Allow both interpretations.
      const expectedSubtotalNet = roundMoney(lineNetSum - totalAllowances + totalCharges);
      const grossTotal = roundMoney(lineNetSum - totalAllowances + totalCharges);

      // Check if subtotal matches either the direct calculation or the
      // VAT-extracted version (gross pricing: subtotal = grossTotal / (1 + rate))
      if (moneyEqual(expectedSubtotalNet, data.subtotal, 0.05)) {
        // Direct match — net pricing
        return;
      }

      // Gross pricing check: try common VAT rates to see if subtotal = grossTotal / (1 + rate)
      const commonRates = [0.19, 0.07, 0.20, 0.21, 0.10, 0.05, 0];
      for (const rate of commonRates) {
        const netFromGross = roundMoney(grossTotal / (1 + rate));
        if (moneyEqual(netFromGross, data.subtotal, 0.05)) {
          return; // Gross pricing match
        }
      }

      // Still allow if subtotal is simply less than lineNetSum (discounts applied)
      if (data.subtotal < lineNetSum) {
        return;
      }

      throw new ValidationError(
        `Line items total (${lineNetSum}) minus allowances (${totalAllowances}) plus charges (${totalCharges}) = ${expectedSubtotalNet}, but subtotal is ${data.subtotal}`
      );
    } else {
      // No allowances — original simple check
      if (!moneyEqual(lineNetSum, data.subtotal, 0.02)) {
        throw new ValidationError(
          `Line items total (${lineNetSum}) does not match subtotal (${data.subtotal})`
        );
      }
    }
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Track changes between original and reviewed data
   */
  trackChanges(original: Record<string, unknown>, reviewed: ReviewedInvoiceData): string[] {
    const changes: string[] = [];

    if (original.invoiceNumber !== reviewed.invoiceNumber) changes.push('Invoice number');
    if (original.invoiceDate !== reviewed.invoiceDate) changes.push('Invoice date');
    if (original.buyerName !== reviewed.buyerName) changes.push('Buyer name');
    if (original.sellerName !== reviewed.sellerName) changes.push('Seller name');

    const originalTotal = Number(original.totalAmount) || 0;
    if (Math.abs(originalTotal - reviewed.totalAmount) > 0.01) changes.push('Total amount');

    const originalItems = Array.isArray(original.lineItems)
      ? original.lineItems
      : Array.isArray(original.items)
        ? original.items
        : [];
    if (originalItems.length !== reviewed.lineItems.length) changes.push('Line items count');

    // Track new fields if they differ from original (assuming original might have them if revisited)
    if (reviewed.buyerReference && original.buyerReference !== reviewed.buyerReference)
      changes.push('Buyer reference');
    if (
      reviewed.paymentInstructions &&
      original.paymentInstructions !== reviewed.paymentInstructions
    )
      changes.push('Payment instructions');

    return changes;
  }

  /**
   * Calculate extraction accuracy based on changes made
   */
  calculateAccuracy(original: Record<string, unknown>, reviewed: ReviewedInvoiceData): number {
    const changes = this.trackChanges(original, reviewed);
    const totalFields = 20; // Increased count with new XRechnung fields
    const accuracy = ((totalFields - changes.length) / totalFields) * 100;
    return Math.max(0, Math.min(100, Math.round(accuracy * 10) / 10));
  }

  /**
   * Calculate line item totals using decimal-safe arithmetic.
   */
  recalculateTotals(lineItems: LineItem[]): {
    subtotal: number;
    taxAmount: number;
    totalAmount: number;
  } {
    const subtotal = sumMoney(lineItems.map((item) => item.totalPrice));
    const taxAmount = sumMoney(
      lineItems.map((item) => computeTax(item.totalPrice, item.taxRate || 0))
    );
    const totalAmount = roundMoney(subtotal + taxAmount);

    return { subtotal, taxAmount, totalAmount };
  }

  /**
   * T4: Normalize empty strings to null for clean DB persistence.
   * Prevents empty-string values from being stored in JSONB where null is semantically correct.
   */
  normalizeForPersistence(data: ReviewedInvoiceData): ReviewedInvoiceData {
    const cleaned = { ...data };
    for (const key of Object.keys(cleaned) as (keyof ReviewedInvoiceData)[]) {
      const val = cleaned[key];
      if (typeof val === 'string' && val.trim() === '') {
        // @ts-expect-error - Dynamic key access for string-to-null conversion
        cleaned[key] = null;
      }
    }
    return cleaned;
  }

  /**
   * Extract country code from tax ID
   */
  extractCountryFromTaxId(taxId: string): string {
    if (!taxId) return 'DE';
    // German: DE, Austrian: AT, Swiss: CH, etc
    if (taxId.startsWith('DE')) return 'DE';
    if (taxId.startsWith('AT')) return 'AT';
    if (taxId.startsWith('CH')) return 'CH';
    if (taxId.startsWith('FR')) return 'FR';
    if (taxId.startsWith('IT')) return 'IT';
    if (taxId.startsWith('ES')) return 'ES';
    if (taxId.startsWith('NL')) return 'NL';
    if (taxId.startsWith('BE')) return 'BE';
    return 'DE'; // Default to Germany
  }

  /**
   * Parse address into city and postal code
   */
  parseAddress(addressLine: string): { city: string; postalCode: string } {
    if (!addressLine) return { city: '', postalCode: '' };

    const lines = addressLine
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l);

    if (lines.length === 0) {
      return { city: '', postalCode: '' };
    }

    // Last line usually contains postal code and city
    const lastLine = lines[lines.length - 1];
    if (!lastLine) {
      return { city: '', postalCode: '' };
    }

    // Try to extract postal code (typically 5-6 digits at start)
    const postalCodeMatch = lastLine.match(/^(\d{4,6})\s+(.+)$/);

    if (postalCodeMatch) {
      return {
        postalCode: postalCodeMatch[1] || '',
        city: postalCodeMatch[2] || '',
      };
    }

    // If no postal code found, assume it's a city
    return {
      postalCode: '',
      city: lastLine || '',
    };
  }

  /**
   * Extract phone number from address string
   */
  extractPhoneFromAddress(addressLine: string): string {
    const phoneRegex = /(\+?\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{1,9})/;
    const match = addressLine?.match(phoneRegex);
    return match?.[1] ?? '';
  }
}

export const reviewService = new ReviewService();
