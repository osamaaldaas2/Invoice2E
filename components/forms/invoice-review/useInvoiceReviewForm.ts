import { useMemo, useState } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { usePathname, useRouter } from 'next/navigation';
import { logger } from '@/lib/logger';

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
        taxRate: number;
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
}

export const useInvoiceReviewForm = ({ extractionId, userId, initialData }: UseInvoiceReviewFormProps) => {
    const router = useRouter();
    const pathname = usePathname();
    const [submitError, setSubmitError] = useState('');
    const [submitSuccess, setSubmitSuccess] = useState('');

    const locale = useMemo(() => {
        const parts = pathname?.split('/') || [];
        return parts.length > 1 ? parts[1] : 'en';
    }, [pathname]);

    const withLocale = useMemo(() => {
        return (path: string) => {
            if (!path.startsWith('/')) {
                return `/${locale}/${path}`;
            }
            if (path === '/') {
                return `/${locale}`;
            }
            if (path.startsWith(`/${locale}/`) || path === `/${locale}`) {
                return path;
            }
            return `/${locale}${path}`;
        };
    }, [locale]);

    // helper to parse address
    const parseAddress = (address?: string) => {
        if (!address || address.trim() === '') {
            return { street: '', postalCode: '', city: '', country: 'DE' };
        }

        const lines = address.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length === 0) {
            return { street: '', postalCode: '', city: '', country: 'DE' };
        }

        const lastLine = lines[lines.length - 1];
        if (!lastLine || lastLine.trim() === '') {
            return {
                street: lines.slice(0, -1).join(', '),
                postalCode: '',
                city: '',
                country: 'DE',
            };
        }

        const postalCodeMatch = lastLine.match(/^(\d{4,6})\s+(.+)$/);
        if (postalCodeMatch) {
            return {
                street: lines.slice(0, -1).join(', '),
                postalCode: postalCodeMatch[1] || '',
                city: postalCodeMatch[2] || '',
                country: 'DE', // Defaulting, logic could be smarter
            };
        }

        return {
            street: lines.slice(0, -1).join(', '),
            postalCode: '',
            city: lastLine,
            country: 'DE',
        };
    };

    const sellerDerived = parseAddress(initialData?.sellerAddress);
    const buyerDerived = parseAddress(initialData?.buyerAddress);

    const rawSubtotal = Number(initialData?.subtotal) || 0;
    const rawTotalAmount = Number(initialData?.totalAmount) || 0;
    const rawTaxAmountValue = Number(initialData?.taxAmount);
    const hasTaxAmount = initialData?.taxAmount !== null && initialData?.taxAmount !== undefined && initialData?.taxAmount !== '';
    const resolvedTaxAmount = hasTaxAmount && !(rawTaxAmountValue === 0 && rawTotalAmount > rawSubtotal + 0.01)
        ? rawTaxAmountValue
        : (rawTotalAmount > rawSubtotal ? Math.round((rawTotalAmount - rawSubtotal) * 100) / 100 : 0);
    const derivedTaxRate = rawSubtotal > 0 ? Math.round((resolvedTaxAmount / rawSubtotal) * 10000) / 100 : 0;
    const hasProvidedTaxRate = initialData?.taxRate !== null && initialData?.taxRate !== undefined && initialData?.taxRate !== '';
    const providedTaxRate = hasProvidedTaxRate ? Number(initialData?.taxRate) : NaN;
    const fallbackTaxRate = !isNaN(providedTaxRate) ? providedTaxRate : derivedTaxRate;

    const sourceItems = Array.isArray(initialData?.lineItems)
        ? initialData.lineItems
        : (Array.isArray(initialData?.items) ? initialData.items : []);

    const defaultItems = sourceItems.length > 0
        ? sourceItems.map((item: any) => {
            const hasItemTaxRate = item?.taxRate !== null && item?.taxRate !== undefined && item?.taxRate !== '';
            const itemTaxRate = hasItemTaxRate ? Number(item.taxRate) : fallbackTaxRate;
            return {
                description: item?.description || '',
                quantity: Number(item?.quantity) || 1,
                unitPrice: Number(item?.unitPrice) || 0,
                totalPrice: Number(item?.totalPrice) || Number(item?.lineTotal) || 0,
                taxRate: !isNaN(itemTaxRate) ? itemTaxRate : 0,
            };
        })
        : [{ description: '', quantity: 1, unitPrice: 0, totalPrice: 0, taxRate: fallbackTaxRate || 0 }];

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
                street: sellerDerived.street || '',
                postalCode: sellerDerived.postalCode || initialData?.sellerPostalCode || '',
                city: sellerDerived.city || initialData?.sellerCity || '',
                country: initialData?.sellerCountryCode || 'DE'
            },
            // Keep flat fields synced via watch/effects or just use nested -> relying on parsed for now but mapping back for submission
            sellerTaxId: initialData?.sellerTaxId || '',
            sellerIban: normalizeIban(initialData?.sellerIban || initialData?.iban || ''),
            sellerBic: initialData?.sellerBic || initialData?.bic || '',
            bankName: initialData?.bankName || '',

            buyerName: initialData?.buyerName || '',
            buyerEmail: initialData?.buyerEmail || '',
            buyerAddress: initialData?.buyerAddress || '',
            buyerParsedAddress: {
                street: buyerDerived.street || '',
                postalCode: buyerDerived.postalCode || initialData?.buyerPostalCode || '',
                city: buyerDerived.city || initialData?.buyerCity || '',
                country: initialData?.buyerCountryCode || 'DE'
            },
            buyerTaxId: initialData?.buyerTaxId || '',
            buyerReference: initialData?.buyerReference || '',

            paymentTerms: initialData?.paymentTerms || 'Net 30',
            paymentDueDate: initialData?.paymentDueDate || '',
            paymentInstructions: initialData?.paymentInstructions || '',

            items: defaultItems,

            subtotal: rawSubtotal || 0,
            taxAmount: resolvedTaxAmount || 0,
            totalAmount: rawTotalAmount || 0,
            notes: initialData?.notes || '',
        }
    });

    const onSubmit: SubmitHandler<InvoiceReviewFormValues> = async (data) => {
        setSubmitError('');
        setSubmitSuccess('');

        try {
            // Flatten data structure back to what API expects if necessary, 
            // or ensure API handles structured address. 
            // For safety, we map parsed address fields back to flat fields if the API relies on them.
            const payload = {
                ...data,
                sellerCity: data.sellerParsedAddress.city,
                sellerPostalCode: data.sellerParsedAddress.postalCode,
                sellerCountryCode: data.sellerParsedAddress.country,
                buyerCity: data.buyerParsedAddress.city,
                buyerPostalCode: data.buyerParsedAddress.postalCode,
                buyerCountryCode: data.buyerParsedAddress.country,
                // Ensure line items are numbers
                lineItems: data.items.map(item => ({
                    ...item,
                    quantity: Number(item.quantity),
                    unitPrice: Number(item.unitPrice),
                    totalPrice: Number(item.totalPrice),
                    taxRate: Number(item.taxRate)
                }))
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

            setSubmitSuccess(`Invoice reviewed successfully! Accuracy: ${responseData.data.accuracy.toFixed(1)}%`);
            logger.info('Invoice review submitted', { extractionId, accuracy: responseData.data.accuracy });

            sessionStorage.setItem(`review_${extractionId}`, JSON.stringify(payload));

            setTimeout(() => {
                router.push(withLocale(`/convert/${extractionId}`));
            }, 2000);

        } catch (err) {
            const message = err instanceof Error ? err.message : 'Review failed';
            setSubmitError(message);
            logger.error('Review error', err);
        }
    };

    return {
        form,
        submitError,
        submitSuccess,
        onSubmit: form.handleSubmit(onSubmit),
        isSubmitting: form.formState.isSubmitting
    };
};
