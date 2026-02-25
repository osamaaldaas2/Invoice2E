'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useInvoiceReviewForm } from './useInvoiceReviewForm';
import { InvoiceDetailsSection } from './InvoiceDetailsSection';
import { SellerInfoSection } from './SellerInfoSection';
import { BuyerInfoSection } from './BuyerInfoSection';
import { LineItemsSection } from './LineItemsSection';
import { PaymentSection } from './PaymentSection';
import { TotalsSection } from './TotalsSection';
import { AllowancesChargesSection } from './AllowancesChargesSection';
import { ReadinessPanel } from './ReadinessPanel';
import { FormatSelector, FormatPreselected, useFormatPreference } from './FormatSelector';
import { FORMAT_FIELD_CONFIG } from '@/lib/format-field-config';

interface InvoiceReviewFormProps {
  extractionId: string;
  userId: string;

  initialData: any;
  confidence: number;
  onSubmitSuccess?: () => void;
  compact?: boolean;
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
  onSubmitSuccess,
  compact,
}: InvoiceReviewFormProps) {
  const t = useTranslations('invoiceReview');
  const tCommon = useTranslations('common');
  const [outputFormat, setOutputFormat, hasPreselection] = useFormatPreference();
  const [showFormatSelector, setShowFormatSelector] = useState(false);
  const { form, onSubmit, isSubmitting, submitError, submitSuccess } = useInvoiceReviewForm({
    extractionId,
    userId,
    initialData,
    onSubmitSuccess,
    outputFormat,
  });

  const {
    register,
    control,
    formState: { errors },
    watch,
    setValue,
  } = form;

  // D4: Extracted totals for comparison in TotalsSection
  const initialTotals = initialData
    ? {
        subtotal: Number(initialData.subtotal) || 0,
        taxAmount: Number(initialData.taxAmount) || 0,
        totalAmount: Number(initialData.totalAmount) || 0,
      }
    : undefined;

  return (
    <form onSubmit={onSubmit} className={compact ? 'space-y-4' : 'space-y-6 max-w-4xl'}>
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
        if (!initialData?.buyerElectronicAddress && !initialData?.buyerEmail)
          missingFields.push(t('buyerEmail'));
        if (!initialData?.buyerAddress) missingFields.push(t('street'));
        if (!initialData?.buyerTaxId) missingFields.push(t('taxId'));
        const pct = (confidence * 100).toFixed(0);
        const isHigh = confidence >= 0.8;
        return (
          <div
            className={`p-4 rounded-2xl border ${isHigh ? 'bg-emerald-500/15 border-emerald-400/30' : 'bg-amber-500/15 border-amber-400/30'}`}
          >
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

      {/* F-05: Extraction validation warnings banner */}
      {Array.isArray(initialData?.validationWarnings) &&
        initialData.validationWarnings.length > 0 && (
          <div className="p-4 rounded-2xl border bg-amber-500/15 border-amber-400/30">
            <p className="text-amber-200 font-medium">{t('extractionWarningsTitle')}</p>
            <ul className="text-sm text-slate-400 mt-2 space-y-1">
              {initialData.validationWarnings.map((warning: string, idx: number) => (
                <li key={idx}>&bull; {warning}</li>
              ))}
            </ul>
          </div>
        )}

      {/* D1: Live XRechnung Readiness Panel */}
      <ReadinessPanel control={control} outputFormat={outputFormat} />

      <InvoiceDetailsSection register={register} errors={errors} />

      <div className="border-t border-white/10 pt-4">
        <SellerInfoSection
          register={register}
          errors={errors}
          countryCodes={COUNTRY_CODES}
          formatConfig={FORMAT_FIELD_CONFIG[outputFormat]}
        />
      </div>

      <div className="border-t border-white/10 pt-4">
        <BuyerInfoSection
          register={register}
          errors={errors}
          countryCodes={COUNTRY_CODES}
          formatConfig={FORMAT_FIELD_CONFIG[outputFormat]}
        />
      </div>

      <div className="border-t border-white/10 pt-4">
        <LineItemsSection register={register} control={control} errors={errors} />
      </div>

      <div className="border-t border-white/10 pt-4">
        <AllowancesChargesSection register={register} control={control} errors={errors} />
      </div>

      <div className="border-t border-white/10 pt-4">
        <PaymentSection
          register={register}
          errors={errors}
          formatConfig={FORMAT_FIELD_CONFIG[outputFormat]}
        />
      </div>

      <TotalsSection
        register={register}
        watch={watch}
        setValue={setValue}
        initialTotals={initialTotals}
      />

      {/* Output Format Selector — collapsed if pre-selected in dashboard */}
      {hasPreselection && !showFormatSelector ? (
        <FormatPreselected value={outputFormat} onChangeClick={() => setShowFormatSelector(true)} />
      ) : (
        <FormatSelector value={outputFormat} onChange={setOutputFormat} />
      )}

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
        <div className="p-3 glass-panel border border-rose-400/30 rounded-xl flex items-center justify-between gap-3">
          <span className="text-rose-200">❌ {submitError}</span>
          <button
            type="button"
            onClick={onSubmit}
            className="px-3 py-1.5 bg-sky-500/20 text-sky-200 border border-sky-400/30 rounded-full text-sm font-semibold hover:bg-sky-500/30 transition-colors flex-shrink-0"
          >
            🔄 {tCommon('retry')}
          </button>
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
        {isSubmitting
          ? t('savingReview')
          : onSubmitSuccess
            ? t('saveReview')
            : t('saveAndContinue')}
      </button>
    </form>
  );
}
