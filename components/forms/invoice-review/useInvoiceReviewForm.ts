import { useEffect, useRef, useState } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { logger } from '@/lib/logger';
import type { OutputFormat } from '@/types/canonical-invoice';

export interface InvoiceReviewFormValues {
  invoiceNumber: string;
  invoiceDate: string;
  currency: string;
  sellerName: string;
  sellerContactName: string;
  sellerPhone: string;
  sellerEmail: string;
  sellerAddress: string;
  sellerParsedAddress: {
    street: string;
    postalCode: string;
    city: string;
    country: string;
  };
  sellerCity: string;
  sellerPostalCode: string;
  sellerCountryCode: string;
  sellerTaxId: string;
  sellerIban: string;
  sellerBic: string;
  bankName: string;
  buyerName: string;
  buyerEmail: string;
  buyerAddress: string;
  buyerParsedAddress: {
    street: string;
    postalCode: string;
    city: string;
    country: string;
  };
  buyerCity: string;
  buyerPostalCode: string;
  buyerCountryCode: string;
  buyerTaxId: string;
  buyerReference: string;
  paymentTerms: string;
  paymentDueDate: string;
  paymentInstructions: string;
  items: {
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    taxRate: number | string;
    taxCategoryCode: string;
  }[];
  allowanceCharges: {
    chargeIndicator: boolean;
    amount: number;
    percentage: number | string;
    reason: string;
    taxRate: number | string;
  }[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  notes: string;
  // Legacy flat fields for compatibility if needed during transition, though structured address preferred
  [key: string]: any;
}

interface UseInvoiceReviewFormProps {
  extractionId: string;
  userId: string;
  initialData: any;
  onSubmitSuccess?: () => void;
  outputFormat?: OutputFormat;
}

export const useInvoiceReviewForm = ({
  extractionId,
  userId,
  initialData,
  onSubmitSuccess,
  outputFormat,
}: UseInvoiceReviewFormProps) => {
  const router = useRouter();
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  // AI now returns separate fields (sellerAddress=street, sellerCity, sellerPostalCode)
  // so we use them directly instead of parsing a combined address string.

  const rawSubtotal = Number(initialData?.subtotal) || 0;
  const rawTotalAmount = Number(initialData?.totalAmount) || 0;
  const rawTaxAmountValue = Number(initialData?.taxAmount);
  const hasTaxAmount =
    initialData?.taxAmount !== null &&
    initialData?.taxAmount !== undefined &&
    initialData?.taxAmount !== '';
  const resolvedTaxAmount =
    hasTaxAmount && !(rawTaxAmountValue === 0 && rawTotalAmount > rawSubtotal + 0.01)
      ? rawTaxAmountValue
      : rawTotalAmount > rawSubtotal
        ? Math.round((rawTotalAmount - rawSubtotal) * 100) / 100
        : 0;

  const sourceItems = Array.isArray(initialData?.lineItems)
    ? initialData.lineItems
    : Array.isArray(initialData?.items)
      ? initialData.items
      : [];

  // T3-aligned: backend normalizer never cascades invoice-level rate to items.
  // But the frontend form uses the invoice-level taxRate as a pre-fill default
  // when per-item rates are missing — this is a UI suggestion the user can edit.
  const hasInvoiceTaxRate =
    initialData?.taxRate !== null &&
    initialData?.taxRate !== undefined &&
    initialData?.taxRate !== '';
  const invoiceTaxRate = hasInvoiceTaxRate ? Number(initialData.taxRate) : NaN;

  const defaultItems =
    sourceItems.length > 0
      ? sourceItems.map((item: any) => {
          const hasItemTaxRate =
            item?.taxRate !== null && item?.taxRate !== undefined && item?.taxRate !== '';
          const resolvedRate = hasItemTaxRate
            ? Number(item.taxRate)
            : !isNaN(invoiceTaxRate)
              ? invoiceTaxRate
              : ('' as number | string);
          return {
            description: item?.description || '',
            quantity: Number(item?.quantity) || 1,
            unitPrice: Number(item?.unitPrice) || 0,
            totalPrice: Number(item?.totalPrice) || Number(item?.lineTotal) || 0,
            taxRate: resolvedRate,
            taxCategoryCode: (item?.taxCategoryCode as string) || '',
          };
        })
      : [
          {
            description: '',
            quantity: 1,
            unitPrice: 0,
            totalPrice: 0,
            taxRate: !isNaN(invoiceTaxRate) ? invoiceTaxRate : ('' as number | string),
            taxCategoryCode: '',
          },
        ];

  // Parse allowances/charges from AI extraction
  const sourceAllowanceCharges = Array.isArray(initialData?.allowanceCharges)
    ? initialData.allowanceCharges
    : [];
  const defaultAllowanceCharges = sourceAllowanceCharges.map((ac: any) => ({
    chargeIndicator: ac?.chargeIndicator === true,
    amount: Number(ac?.amount) || 0,
    percentage: ac?.percentage != null ? Number(ac.percentage) : ('' as number | string),
    reason: ac?.reason || '',
    taxRate: ac?.taxRate != null ? Number(ac.taxRate) : ('' as number | string),
  }));

  const normalizeIban = (value: unknown) => {
    if (value === null || value === undefined) return '';
    return String(value).replace(/\s+/g, '').toUpperCase();
  };

  const form = useForm<InvoiceReviewFormValues>({
    defaultValues: {
      invoiceNumber: initialData?.invoiceNumber || '',
      invoiceDate: initialData?.invoiceDate || '',
      currency: initialData?.currency || 'EUR',

      sellerName: initialData?.sellerName || '',
      sellerContactName: initialData?.sellerContactName || initialData?.sellerContact || '',
      sellerPhone: initialData?.sellerPhone || '',
      sellerEmail: initialData?.sellerEmail || '',
      sellerAddress: initialData?.sellerAddress || '',
      sellerParsedAddress: {
        street: initialData?.sellerAddress || '',
        postalCode: initialData?.sellerPostalCode || '',
        city: initialData?.sellerCity || '',
        country: initialData?.sellerCountryCode || 'DE',
      },
      // Keep flat fields synced via watch/effects or just use nested -> relying on parsed for now but mapping back for submission
      sellerTaxId: initialData?.sellerTaxId || '',
      sellerIban: normalizeIban(initialData?.sellerIban || initialData?.iban || ''),
      sellerBic: initialData?.sellerBic || initialData?.bic || '',
      bankName: initialData?.bankName || '',

      buyerName: initialData?.buyerName || '',
      buyerEmail: initialData?.buyerElectronicAddress || initialData?.buyerEmail || '',
      buyerAddress: initialData?.buyerAddress || '',
      buyerParsedAddress: {
        street: initialData?.buyerAddress || '',
        postalCode: initialData?.buyerPostalCode || '',
        city: initialData?.buyerCity || '',
        country: initialData?.buyerCountryCode || 'DE',
      },
      buyerTaxId: initialData?.buyerTaxId || '',
      buyerReference: initialData?.buyerReference || '',

      paymentTerms: initialData?.paymentTerms || '',
      paymentDueDate: initialData?.paymentDueDate || '',
      paymentInstructions: initialData?.paymentInstructions || '',

      items: defaultItems,
      allowanceCharges: defaultAllowanceCharges,

      subtotal: rawSubtotal || 0,
      taxAmount: resolvedTaxAmount || 0,
      totalAmount: rawTotalAmount || 0,
      notes: initialData?.notes || '',
    },
  });

  // Auto-save to sessionStorage every 30s
  const autoSaveKey = `autosave_review_${extractionId}`;
  const submitted = useRef(false);

  useEffect(() => {
    // Restore auto-saved draft if available
    try {
      const saved = sessionStorage.getItem(autoSaveKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        form.reset(parsed, { keepDefaultValues: true });
      }
    } catch {
      // ignore parse errors
    }
  }, [autoSaveKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const interval = setInterval(() => {
      if (form.formState.isDirty && !submitted.current) {
        sessionStorage.setItem(autoSaveKey, JSON.stringify(form.getValues()));
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [autoSaveKey, form]);

  // Warn before navigating away with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (form.formState.isDirty && !submitted.current) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [form.formState.isDirty]);

  const onSubmit: SubmitHandler<InvoiceReviewFormValues> = async (data) => {
    setSubmitError('');
    setSubmitSuccess('');

    try {
      // Flatten data structure back to what API expects if necessary,
      // or ensure API handles structured address.
      // For safety, we map parsed address fields back to flat fields if the API relies on them.
      const payload = {
        ...data,
        // Convert totals to numbers (form inputs return strings)
        subtotal: Number(data.subtotal),
        taxAmount: Number(data.taxAmount),
        totalAmount: Number(data.totalAmount),
        taxRate:
          data.taxRate !== '' && data.taxRate !== null && data.taxRate !== undefined
            ? Number(data.taxRate)
            : undefined,
        sellerAddress: data.sellerParsedAddress.street,
        sellerCity: data.sellerParsedAddress.city,
        sellerPostalCode: data.sellerParsedAddress.postalCode,
        sellerCountryCode: data.sellerParsedAddress.country,
        buyerAddress: data.buyerParsedAddress.street,
        buyerCity: data.buyerParsedAddress.city,
        buyerPostalCode: data.buyerParsedAddress.postalCode,
        buyerCountryCode: data.buyerParsedAddress.country,
        // Derive electronic addresses (BT-49 / BT-34) with smart scheme detection
        buyerElectronicAddress: data.buyerEmail.trim(),
        buyerElectronicAddressScheme: data.buyerEmail.includes('@') ? 'EM' : undefined,
        buyerEmail: data.buyerEmail.includes('@') ? data.buyerEmail.trim() : '',
        sellerElectronicAddress: data.sellerEmail.trim(),
        sellerElectronicAddressScheme: data.sellerEmail.includes('@') ? 'EM' : undefined,
        // Ensure line items are numbers; omit taxRate if not provided (T3)
        lineItems: data.items.map((item) => ({
          description: item.description,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          totalPrice: Number(item.totalPrice),
          taxRate:
            item.taxRate !== '' && item.taxRate !== null && item.taxRate !== undefined
              ? Number(item.taxRate)
              : undefined,
          taxCategoryCode:
            item.taxCategoryCode && item.taxCategoryCode !== 'Auto'
              ? item.taxCategoryCode
              : undefined,
        })),
        // Document-level allowances/charges (BG-20 / BG-21)
        allowanceCharges: (data.allowanceCharges || [])
          .filter((ac) => Number(ac.amount) > 0)
          .map((ac) => ({
            chargeIndicator: ac.chargeIndicator,
            amount: Number(ac.amount),
            percentage:
              ac.percentage !== '' && ac.percentage != null
                ? Number(ac.percentage)
                : null,
            reason: ac.reason || null,
            taxRate:
              ac.taxRate !== '' && ac.taxRate != null
                ? Number(ac.taxRate)
                : null,
          })),
      };

      const response = await fetch('/api/invoices/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extractionId,
          userId,
          reviewedData: payload,
        }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || 'Review failed');
      }

      submitted.current = true;
      sessionStorage.removeItem(autoSaveKey);
      setSubmitSuccess(
        `Invoice reviewed successfully! Accuracy: ${responseData.data.accuracy.toFixed(1)}%`
      );
      logger.info('Invoice review submitted', {
        extractionId,
        accuracy: responseData.data.accuracy,
      });

      sessionStorage.setItem(`review_${extractionId}`, JSON.stringify({ ...payload, outputFormat: outputFormat || 'xrechnung-cii' }));

      if (onSubmitSuccess) {
        onSubmitSuccess();
      } else {
        setTimeout(() => {
          router.push(`/convert/${extractionId}`);
        }, 2000);
      }
    } catch (err) {
      let message: string;
      if (err instanceof TypeError && err.message === 'Failed to fetch') {
        message = 'Connection failed, please try again';
      } else {
        message = err instanceof Error ? err.message : 'Review failed';
      }
      setSubmitError(message);
      logger.error('Review error', err);
    }
  };

  return {
    form,
    submitError,
    submitSuccess,
    onSubmit: form.handleSubmit(onSubmit),
    isSubmitting: form.formState.isSubmitting,
  };
};
