'use client';
import { useTranslations } from 'next-intl';
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
    const t = useTranslations('invoiceReview');
    const { form, onSubmit, isSubmitting, submitError, submitSuccess } = useInvoiceReviewForm({
        extractionId,
        userId,
        initialData
    });

    const { register, control, formState: { errors }, watch, setValue } = form;

    return (
        <form onSubmit={onSubmit} className="space-y-6 max-w-4xl">
            {/* Confidence Alert */}
            {(() => {
                const missingFields: string[] = [];
                if (!initialData?.invoiceNumber) missingFields.push(t('invoiceNumber'));
                if (!initialData?.invoiceDate) missingFields.push(t('invoiceDate'));
                if (!initialData?.sellerName) missingFields.push(t('sellerName'));
                if (!initialData?.sellerEmail) missingFields.push(t('sellerEmail'));
                if (!initialData?.sellerAddress) missingFields.push(t('street'));
                if (!initialData?.sellerTaxId) missingFields.push(t('taxId'));
                if (!initialData?.buyerName) missingFields.push(t('buyerName'));
                if (!initialData?.buyerEmail) missingFields.push(t('buyerEmail'));
                if (!initialData?.buyerAddress) missingFields.push(t('street'));
                if (!initialData?.buyerTaxId) missingFields.push(t('taxId'));
                const pct = (confidence * 100).toFixed(0);
                const isHigh = confidence >= 0.8;
                return (
                    <div className={`p-4 rounded-2xl border ${isHigh ? 'bg-emerald-500/15 border-emerald-400/30' : 'bg-amber-500/15 border-amber-400/30'}`}>
                        <p className={isHigh ? 'text-emerald-200' : 'text-amber-200'}>
                            {t('confidence', { score: pct })}
                            {!isHigh && ` — ${t('reviewCarefully')}`}
                        </p>
                        {missingFields.length > 0 && (
                            <p className="text-sm text-slate-400 mt-1">
                                {t('missing', { fields: missingFields.join(', ') })}
                            </p>
                        )}
                    </div>
                );
            })()}

            <InvoiceDetailsSection register={register} errors={errors} />

            <div className="border-t border-white/10 pt-4">
                <SellerInfoSection register={register} errors={errors} countryCodes={COUNTRY_CODES} />
            </div>

            <div className="border-t border-white/10 pt-4">
                <BuyerInfoSection register={register} errors={errors} countryCodes={COUNTRY_CODES} />
            </div>

            <div className="border-t border-white/10 pt-4">
                <LineItemsSection register={register} control={control} errors={errors} />
            </div>

            <div className="border-t border-white/10 pt-4">
                <PaymentSection register={register} errors={errors} />
            </div>

            <TotalsSection register={register} watch={watch} setValue={setValue} />

            {/* Notes */}
            <div className="border-t border-white/10 pt-4">
                <label className="block text-sm font-medium text-slate-300 mb-1">{t('notes')}</label>
                <textarea
                    {...register('notes')}
                    rows={3}
                    className="w-full px-4 py-2 rounded-xl bg-slate-950/60 border border-white/10 text-white"
                />
            </div>

            {submitError && (
                <div className="p-3 glass-panel border border-rose-400/30 rounded-xl text-rose-200">
                    {submitError}
                </div>
            )}

            {submitSuccess && (
                <div className="p-3 glass-panel border border-emerald-400/30 rounded-xl text-emerald-200">
                    {submitSuccess}
                </div>
            )}

            <button
                type="submit"
                disabled={isSubmitting}
                className="w-full px-6 py-3 bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 text-white rounded-full font-semibold hover:brightness-110 disabled:opacity-50"
            >
                {isSubmitting ? t('savingReview') : t('saveAndContinue')}
            </button>
        </form>
    );
}
