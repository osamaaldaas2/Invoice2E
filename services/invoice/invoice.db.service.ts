/**
 * Invoice Database Service
 * Handles all database operations for payment invoices.
 *
 * @module services/invoice/invoice.db.service
 */

import { createAdminClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import { AppError, NotFoundError, ValidationError } from '@/lib/errors';
import { roundMoney, subtractMoney } from '@/lib/monetary';
import { invoicePdfService, InvoicePdfData } from './invoice-pdf.service';
import { CREDIT_PACKAGES } from '@/services/stripe.service';

export interface CreateInvoiceData {
  userId: string;
  paymentTransactionId?: string;
  customerEmail: string;
  customerName?: string;
  amountGross: number;
  currency: string;
  creditsPurchased: number;
  packageId?: string;
  paymentMethod: string;
}

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  userId: string;
  paymentTransactionId?: string;
  customerEmail: string;
  customerName?: string;
  amountNet: number;
  amountVat: number;
  amountGross: number;
  vatRate: number;
  currency: string;
  description: string;
  creditsPurchased: number;
  paymentMethod: string;
  issuedAt: string;
  createdAt: string;
}

const VAT_RATE = 19;

/**
 * Derive package name from credit count or package ID.
 */
function resolvePackageName(packageId?: string, creditsPurchased?: number): string {
  if (packageId) {
    const pkg = CREDIT_PACKAGES.find((p) => p.id === packageId);
    if (pkg) return pkg.name;
  }
  if (creditsPurchased !== undefined) {
    const pkg = CREDIT_PACKAGES.find((p) => p.credits === creditsPurchased);
    if (pkg) return pkg.name;
  }
  logger.warn('Could not resolve package name, using "Custom"', { packageId, creditsPurchased });
  return 'Custom';
}

/**
 * Compute net and VAT from gross amount using German 19% VAT.
 * F-004: Uses monetary library to avoid IEEE 754 floating-point drift.
 */
function computeVatBreakdown(amountGross: number): { amountNet: number; amountVat: number } {
  const amountNet = roundMoney(amountGross / 1.19);
  const amountVat = subtractMoney(amountGross, amountNet);
  return { amountNet, amountVat };
}

export class InvoiceDbService {
  private getSupabase() {
    return createAdminClient();
  }

  /**
   * Create an invoice record: generate invoice number via RPC, compute VAT breakdown,
   * generate the PDF, and store everything.
   */
  async createInvoice(data: CreateInvoiceData): Promise<InvoiceRecord> {
    // F-012: Reject zero/negative amounts
    if (data.amountGross <= 0) {
      throw new ValidationError('Invoice amount must be positive');
    }

    logger.info('Creating invoice', { userId: data.userId, customerEmail: data.customerEmail });

    const supabase = this.getSupabase();

    // 1. Generate invoice number atomically via RPC
    const { data: invoiceNumber, error: rpcError } = await supabase.rpc(
      'generate_invoice_number'
    );
    if (rpcError || !invoiceNumber) {
      logger.error('Failed to generate invoice number', { error: rpcError?.message });
      throw new AppError('INVOICE_ERROR', 'Failed to generate invoice number', 500);
    }

    // 2. Compute VAT breakdown
    const { amountNet, amountVat } = computeVatBreakdown(data.amountGross);
    const packageName = resolvePackageName(data.packageId, data.creditsPurchased);
    const description = `${data.creditsPurchased} Invoice Credits (${packageName})`;
    const issuedAt = new Date();

    // 3. Generate PDF
    const pdfData: InvoicePdfData = {
      invoiceNumber,
      issuedAt,
      customerEmail: data.customerEmail,
      customerName: data.customerName,
      amountNet,
      amountVat,
      amountGross: data.amountGross,
      vatRate: VAT_RATE,
      currency: data.currency,
      description,
      creditsPurchased: data.creditsPurchased,
      packageName,
      paymentMethod: data.paymentMethod,
    };

    let pdfBytes: Uint8Array | null = null;
    try {
      pdfBytes = await invoicePdfService.generatePdf(pdfData);
    } catch (pdfError) {
      // PDF generation failure is non-fatal for record creation — log and continue
      logger.warn('PDF generation failed during invoice creation; record will be stored without PDF', {
        invoiceNumber,
        error: pdfError instanceof Error ? pdfError.message : String(pdfError),
      });
    }

    // 4. Insert invoice record
    const insertPayload: Record<string, unknown> = {
      invoice_number: invoiceNumber,
      user_id: data.userId,
      payment_transaction_id: data.paymentTransactionId ?? null,
      customer_email: data.customerEmail,
      customer_name: data.customerName ?? null,
      amount_net: amountNet,
      amount_vat: amountVat,
      amount_gross: data.amountGross,
      vat_rate: VAT_RATE,
      currency: data.currency,
      description,
      credits_purchased: data.creditsPurchased,
      payment_method: data.paymentMethod,
      issued_at: issuedAt.toISOString(),
    };

    if (pdfBytes) {
      // Store as base64-encoded string in TEXT column (BYTEA via Supabase JS mangles binary data).
      insertPayload.pdf_data = Buffer.from(pdfBytes).toString('base64');
    }

    const { data: record, error: insertError } = await supabase
      .from('invoices')
      .insert(insertPayload)
      .select(
        'id, invoice_number, user_id, payment_transaction_id, customer_email, customer_name, ' +
          'amount_net, amount_vat, amount_gross, vat_rate, currency, description, credits_purchased, ' +
          'payment_method, issued_at, created_at'
      )
      .single();

    if (insertError) {
      // P0-1: Handle duplicate invoice for same payment (unique constraint on payment_transaction_id)
      if (insertError.code === '23505' && data.paymentTransactionId) {
        logger.info('Invoice already exists for this payment, returning existing', {
          paymentTransactionId: data.paymentTransactionId,
        });
        const existing = await this.getInvoiceByPayment(data.paymentTransactionId);
        if (existing) return existing;
      }
      logger.error('Failed to insert invoice record', { invoiceNumber, error: insertError.message });
      throw new AppError('INVOICE_ERROR', 'Failed to save invoice', 500);
    }

    if (!record) {
      throw new AppError('INVOICE_ERROR', 'Failed to save invoice — no record returned', 500);
    }

    const row = record as unknown as Record<string, unknown>;
    logger.info('Invoice created', { invoiceNumber, invoiceId: row.id });
    return this.mapRecord(row);
  }

  /**
   * Look up an invoice by payment_transaction_id (without PDF blob).
   */
  async getInvoiceByPayment(paymentTransactionId: string): Promise<InvoiceRecord | null> {
    const supabase = this.getSupabase();

    const { data, error } = await supabase
      .from('invoices')
      .select(
        'id, invoice_number, user_id, payment_transaction_id, customer_email, customer_name, ' +
          'amount_net, amount_vat, amount_gross, vat_rate, currency, description, credits_purchased, ' +
          'payment_method, issued_at, created_at'
      )
      .eq('payment_transaction_id', paymentTransactionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // no rows found
      logger.error('Failed to get invoice by payment', { paymentTransactionId, error: error.message });
      throw new AppError('INVOICE_ERROR', 'Failed to fetch invoice', 500);
    }

    return data ? this.mapRecord(data as unknown as Record<string, unknown>) : null;
  }

  /**
   * List all invoices for a user (without PDF data to keep response light).
   */
  async getUserInvoices(userId: string): Promise<InvoiceRecord[]> {
    const supabase = this.getSupabase();

    const { data, error } = await supabase
      .from('invoices')
      .select(
        'id, invoice_number, user_id, payment_transaction_id, customer_email, customer_name, ' +
          'amount_net, amount_vat, amount_gross, vat_rate, currency, description, credits_purchased, ' +
          'payment_method, issued_at, created_at'
      )
      .eq('user_id', userId)
      .order('issued_at', { ascending: false });

    if (error) {
      logger.error('Failed to get user invoices', { userId, error: error.message });
      throw new AppError('INVOICE_ERROR', 'Failed to fetch invoices', 500);
    }

    return ((data as unknown as Record<string, unknown>[] | null) ?? []).map((row) =>
      this.mapRecord(row)
    );
  }

  /**
   * Get PDF bytes for an invoice, verifying ownership.
   * Returns null if no PDF is stored.
   */
  async getInvoicePdf(invoiceId: string, userId: string): Promise<Buffer | null> {
    const result = await this.getInvoicePdfWithNumber(invoiceId, userId);
    return result.pdfBuffer;
  }

  /**
   * Get PDF bytes + invoice number for an invoice, verifying ownership.
   */
  async getInvoicePdfWithNumber(
    invoiceId: string,
    userId: string
  ): Promise<{ pdfBuffer: Buffer | null; invoiceNumber: string }> {
    const supabase = this.getSupabase();

    const { data, error } = await supabase
      .from('invoices')
      .select('id, user_id, pdf_data, invoice_number')
      .eq('id', invoiceId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') throw new NotFoundError('Invoice not found');
      throw new AppError('INVOICE_ERROR', 'Failed to fetch invoice', 500);
    }

    if (!data) throw new NotFoundError('Invoice not found');

    // Ownership check — defence in depth even though RLS exists
    if (data.user_id !== userId) {
      throw new NotFoundError('Invoice not found');
    }

    const invoiceNumber = data.invoice_number as string;

    if (!data.pdf_data) return { pdfBuffer: null, invoiceNumber };

    return {
      pdfBuffer: Buffer.from(data.pdf_data as string, 'base64'),
      invoiceNumber,
    };
  }

  /**
   * Map a raw DB row to InvoiceRecord (camelCase).
   */
  private mapRecord(row: Record<string, unknown>): InvoiceRecord {
    return {
      id: row.id as string,
      invoiceNumber: row.invoice_number as string,
      userId: row.user_id as string,
      paymentTransactionId: (row.payment_transaction_id as string) ?? undefined,
      customerEmail: row.customer_email as string,
      customerName: (row.customer_name as string) ?? undefined,
      amountNet: Number(row.amount_net),
      amountVat: Number(row.amount_vat),
      amountGross: Number(row.amount_gross),
      vatRate: Number(row.vat_rate),
      currency: row.currency as string,
      description: row.description as string,
      creditsPurchased: Number(row.credits_purchased),
      paymentMethod: row.payment_method as string,
      issuedAt: row.issued_at as string,
      createdAt: row.created_at as string,
    };
  }
}

export const invoiceDbService = new InvoiceDbService();
