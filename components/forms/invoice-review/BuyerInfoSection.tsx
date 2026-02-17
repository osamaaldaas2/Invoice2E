import React from 'react';
import { UseFormRegister, FieldErrors } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import type { FormatFieldConfig } from '@/lib/format-field-config';

interface BuyerInfoSectionProps {
  register: UseFormRegister<any>;
  errors: FieldErrors<any>;
  countryCodes: { code: string; name: string }[];
  /** Format-specific field visibility config from FORMAT_FIELD_CONFIG */
  formatConfig: FormatFieldConfig;
}

export const BuyerInfoSection: React.FC<BuyerInfoSectionProps> = ({
  register,
  errors,
  countryCodes,
  formatConfig,
}) => {
  const t = useTranslations('invoiceReview');

  const buyerElectronicAddrRequired = formatConfig.buyerElectronicAddress === 'required';
  const buyerElectronicAddrVisible = formatConfig.buyerElectronicAddress !== 'hidden';
  const buyerStreetVisible = formatConfig.buyerStreet !== 'hidden';
  const buyerCityVisible = formatConfig.buyerCity !== 'hidden';
  const buyerPostalCodeVisible = formatConfig.buyerPostalCode !== 'hidden';
  const buyerCountryVisible = formatConfig.buyerCountryCode !== 'hidden';
  const buyerCodiceVisible = formatConfig.buyerCodiceDestinatario !== 'hidden';
  const buyerCodiceRequired = formatConfig.buyerCodiceDestinatario === 'required';

  return (
    <div className="glass-card p-6">
      <h3 className="text-lg font-medium text-white mb-4 font-display">{t('buyerInfo')}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Buyer name — always required */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-300 mb-1">{t('buyerName')}</label>
          <input
            type="text"
            {...register('buyerName')}
            className={`w-full p-2 rounded-xl bg-slate-950/60 border ${errors.buyerName ? 'border-rose-400/60' : 'border-white/10'} text-white`}
          />
          {errors.buyerName && (
            <p className="mt-1 text-sm text-red-500">{errors.buyerName.message as string}</p>
          )}
        </div>

        {/* Buyer electronic address (BT-49) — required for XRechnung/Peppol/NLCIUS/CIUS-RO */}
        <div className={`md:col-span-2 ${!buyerElectronicAddrVisible ? 'hidden' : ''}`}>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            {t('buyerEmail')}
            {buyerElectronicAddrRequired && <span className="text-red-500 ml-0.5">*</span>}
            <span className="text-xs text-faded ml-1">{t('buyerEmailHint')}</span>
          </label>
          <input
            type="text"
            {...register('buyerEmail', {
              required: buyerElectronicAddrRequired ? t('buyerEmailRequired') : false,
            })}
            className={`w-full p-2 rounded-xl bg-slate-950/60 border ${errors.buyerEmail ? 'border-rose-400/60' : 'border-white/10'} text-white`}
            placeholder={t('buyerEmailPlaceholder')}
          />
          {errors.buyerEmail && (
            <p className="mt-1 text-sm text-red-500">{errors.buyerEmail.message as string}</p>
          )}
          {formatConfig.hints?.buyerElectronicAddress && (
            <p className="mt-1 text-xs text-slate-400">
              {formatConfig.hints.buyerElectronicAddress}
            </p>
          )}
        </div>

        {/* FatturaPA: Codice Destinatario (7-char SDI routing code) */}
        <div className={`md:col-span-2 ${!buyerCodiceVisible ? 'hidden' : ''}`}>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            Codice Destinatario (SDI)
            {buyerCodiceRequired && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          <input
            type="text"
            {...register('buyerCodiceDestinatario', {
              required: buyerCodiceRequired
                ? 'Codice Destinatario è obbligatorio per FatturaPA'
                : false,
              pattern: buyerCodiceRequired
                ? {
                    value: /^[A-Z0-9]{7}$/i,
                    message:
                      'Il Codice Destinatario deve essere esattamente 7 caratteri alfanumerici',
                  }
                : undefined,
              setValueAs: (v: string) => v?.toUpperCase() ?? v,
            })}
            className={`w-full p-2 rounded-xl bg-slate-950/60 border ${errors.buyerCodiceDestinatario ? 'border-rose-400/60' : 'border-white/10'} text-white uppercase`}
            placeholder="ABCDEF1"
            maxLength={7}
          />
          {errors.buyerCodiceDestinatario && (
            <p className="mt-1 text-sm text-red-500">
              {errors.buyerCodiceDestinatario.message as string}
            </p>
          )}
          {formatConfig.hints?.buyerCodiceDestinatario && (
            <p className="mt-1 text-xs text-slate-400">
              {formatConfig.hints.buyerCodiceDestinatario}
            </p>
          )}
        </div>

        {/* Address fields — only shown for formats that require/use them */}
        <div className={!buyerStreetVisible ? 'hidden' : ''}>
          <label className="block text-sm font-medium text-slate-300 mb-1">{t('street')}</label>
          <input
            type="text"
            {...register('buyerParsedAddress.street')}
            className="w-full p-2 rounded-xl bg-slate-950/60 border border-white/10 text-white"
          />
        </div>
        <div className={!buyerPostalCodeVisible ? 'hidden' : ''}>
          <label className="block text-sm font-medium text-slate-300 mb-1">{t('postalCode')}</label>
          <input
            type="text"
            {...register('buyerParsedAddress.postalCode')}
            className="w-full p-2 rounded-xl bg-slate-950/60 border border-white/10 text-white"
          />
        </div>
        <div className={!buyerCityVisible ? 'hidden' : ''}>
          <label className="block text-sm font-medium text-slate-300 mb-1">{t('city')}</label>
          <input
            type="text"
            {...register('buyerParsedAddress.city')}
            className="w-full p-2 rounded-xl bg-slate-950/60 border border-white/10 text-white"
          />
        </div>
        <div className={!buyerCountryVisible ? 'hidden' : ''}>
          <label className="block text-sm font-medium text-slate-300 mb-1">{t('country')}</label>
          <select
            {...register('buyerParsedAddress.country')}
            className="w-full p-2 rounded-xl bg-slate-950/60 border border-white/10 text-white"
          >
            {countryCodes.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Buyer Tax ID — always optional */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">{t('taxId')}</label>
          <input
            type="text"
            {...register('buyerTaxId')}
            className="w-full p-2 rounded-xl bg-slate-950/60 border border-white/10 text-white"
          />
          {formatConfig.hints?.buyerVatId && (
            <p className="mt-1 text-xs text-slate-400">{formatConfig.hints.buyerVatId}</p>
          )}
        </div>
      </div>
    </div>
  );
};
