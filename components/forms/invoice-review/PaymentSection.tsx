import React from 'react';
import { UseFormRegister, FieldErrors } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { validateIbanChecksum } from '@/lib/extraction-normalizer';
import type { FormatFieldConfig } from '@/lib/format-field-config';

interface PaymentSectionProps {
  register: UseFormRegister<any>;
  errors?: FieldErrors<any>;
  /** Format-specific field visibility config from FORMAT_FIELD_CONFIG */
  formatConfig: FormatFieldConfig;
}

export const PaymentSection: React.FC<PaymentSectionProps> = ({
  register,
  errors,
  formatConfig,
}) => {
  const t = useTranslations('invoiceReview');

  const ibanRequired = formatConfig.sellerIban === 'required';
  const ibanVisible = formatConfig.sellerIban !== 'hidden';
  const bicVisible = formatConfig.sellerBic !== 'hidden';
  const paymentTermsRequired = formatConfig.paymentTerms === 'required';
  const paymentTermsVisible = formatConfig.paymentTerms !== 'hidden';

  return (
    <div className="glass-card p-6">
      <h3 className="text-lg font-medium text-white mb-4 font-display">{t('paymentInfo')}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* IBAN — required for XRechnung, optional for Peppol, hidden for KSeF */}
        <div className={!ibanVisible ? 'hidden' : ''}>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            {t('iban')}
            {ibanRequired && <span className="text-red-500 ml-0.5">*</span>}
            <span className="text-xs text-faded ml-1">{t('ibanHint')}</span>
          </label>
          <input
            type="text"
            {...register('sellerIban', {
              required: ibanRequired ? t('ibanRequired') : false,
              pattern: ibanRequired
                ? {
                    value: /^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,30}$/,
                    message: t('ibanInvalid'),
                  }
                : undefined,
              validate: (value) => {
                if (!value || !ibanRequired) return true;
                const clean = value.replace(/\s+/g, '').toUpperCase();
                if (!validateIbanChecksum(clean)) {
                  return t('ibanChecksumInvalid');
                }
                return true;
              },
              setValueAs: (value) =>
                typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() : value,
            })}
            className={`w-full p-2 rounded-xl bg-slate-950/60 border ${errors?.sellerIban ? 'border-rose-400/60' : 'border-white/10'} text-white`}
            placeholder="DE89370400440532013000"
          />
          {errors?.sellerIban && (
            <p className="mt-1 text-sm text-red-500">{errors.sellerIban.message as string}</p>
          )}
          {formatConfig.hints?.sellerIban && (
            <p className="mt-1 text-xs text-slate-400">{formatConfig.hints.sellerIban}</p>
          )}
        </div>

        {/* BIC — always optional, visible unless explicitly hidden */}
        <div className={!bicVisible ? 'hidden' : ''}>
          <label className="block text-sm font-medium text-slate-300 mb-1">{t('bic')}</label>
          <input
            type="text"
            {...register('sellerBic')}
            className="w-full p-2 rounded-xl bg-slate-950/60 border border-white/10 text-white"
          />
        </div>

        {/* Bank name — always optional */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">{t('bankName')}</label>
          <input
            type="text"
            {...register('bankName')}
            className="w-full p-2 rounded-xl bg-slate-950/60 border border-white/10 text-white"
          />
        </div>

        {/* Payment terms — required when BR-CO-25 applies (XRechnung, Peppol, NLCIUS, CIUS-RO) */}
        <div className={`md:col-span-2 ${!paymentTermsVisible ? 'hidden' : ''}`}>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            {t('paymentTerms')}
            {paymentTermsRequired && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          <textarea
            {...register('paymentTerms', {
              required: paymentTermsRequired
                ? 'Zahlungsbedingungen sind Pflichtfeld (BR-CO-25)'
                : false,
            })}
            rows={3}
            placeholder={
              paymentTermsRequired ? 'z.B. 30 Tage netto, zahlbar ohne Abzug' : undefined
            }
            className={`w-full p-2 rounded-xl bg-slate-950/60 border ${errors?.paymentTerms ? 'border-rose-400/60' : 'border-white/10'} text-white`}
          />
          {errors?.paymentTerms && (
            <p className="mt-1 text-sm text-red-500">{errors.paymentTerms.message as string}</p>
          )}
          {paymentTermsRequired && (
            <p className="mt-1 text-xs text-slate-400">
              Pflicht (BR-CO-25): Zahlungsziel oder Zahlungsbedingungen angeben
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
