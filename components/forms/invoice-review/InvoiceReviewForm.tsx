'use client';

import React from 'react';
import { useInvoiceReviewForm } from './useInvoiceReviewForm';
import { InvoiceDetailsSection } from './InvoiceDetailsSection';
import { SellerInfoSection } from './SellerInfoSection';
import { BuyerInfoSection } from './BuyerInfoSection';
import { LineItemsSection } from './LineItemsSection';
import { PaymentSection } from './PaymentSection';
import { TotalsSection } from './TotalsSection';

interface InvoiceReviewFormProps {
    extractionId: string;
    userId: string;
    initialData: any;
    confidence: number;
}

const COUNTRY_CODES = [
    { code: 'DE', name: 'Germany (Deutschland)' },
    { code: 'AT', name: 'Austria (Österreich)' },
    { code: 'CH', name: 'Switzerland (Schweiz)' },
    { code: 'FR', name: 'France (Frankreich)' },
    { code: 'IT', name: 'Italy (Italien)' },
    { code: 'ES', name: 'Spain (Spanien)' },
    { code: 'NL', name: 'Netherlands (Niederlande)' },
    { code: 'BE', name: 'Belgium (Belgien)' },
];

export default function InvoiceReviewForm({
    extractionId,
    userId,
    initialData,
    confidence,
}: InvoiceReviewFormProps) {
    const { form, onSubmit, isSubmitting, submitError, submitSuccess } = useInvoiceReviewForm({
        extractionId,
        userId,
        initialData
    });

    const { register, control, formState: { errors }, watch, setValue } = form;

    return (
        <form onSubmit={onSubmit} className="space-y-6 max-w-4xl">
            {/* Confidence Alert */}
            <div className={`p-4 rounded-lg ${confidence >= 0.8 ? 'bg-green-50' : 'bg-yellow-50'}`}>
                <p className={confidence >= 0.8 ? 'text-green-800' : 'text-yellow-800'}>
                    Extraction Confidence: <strong>{(confidence * 100).toFixed(0)}%</strong>
                    {confidence < 0.8 && ' - Please review carefully'}
                </p>
            </div>

            <InvoiceDetailsSection register={register} errors={errors} />

            <div className="border-t pt-4">
                <SellerInfoSection register={register} errors={errors} countryCodes={COUNTRY_CODES} />
            </div>

            <div className="border-t pt-4">
                <BuyerInfoSection register={register} errors={errors} countryCodes={COUNTRY_CODES} />
            </div>

            <div className="border-t pt-4">
                <LineItemsSection register={register} control={control} errors={errors} />
            </div>

            <div className="border-t pt-4">
                <PaymentSection register={register} errors={errors} />
            </div>

            <TotalsSection register={register} watch={watch} setValue={setValue} />

            {/* Notes */}
            <div className="border-t pt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                    {...register('notes')}
                    rows={3}
                    className="w-full px-4 py-2 border rounded-lg border-gray-300"
                />
            </div>

            {submitError && (
                <div className="p-3 bg-red-100 border border-red-400 rounded text-red-700">
                    {submitError}
                </div>
            )}

            {submitSuccess && (
                <div className="p-3 bg-green-100 border border-green-400 rounded text-green-700">
                    {submitSuccess}
                </div>
            )}

            <button
                type="submit"
                disabled={isSubmitting}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
                {isSubmitting ? 'Saving Review...' : 'Save & Continue to Conversion'}
            </button>
        </form>
    );
}
