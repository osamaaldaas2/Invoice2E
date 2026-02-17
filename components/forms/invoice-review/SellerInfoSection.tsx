import React from 'react';
import { UseFormRegister, FieldErrors } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import type { FormatFieldConfig } from '@/lib/format-field-config';

interface SellerInfoSectionProps {
  register: UseFormRegister<any>;
  errors: FieldErrors<any>;
  countryCodes: { code: string; name: string }[];
  /** Format-specific field visibility config from FORMAT_FIELD_CONFIG */
  formatConfig: FormatFieldConfig;
}

export const SellerInfoSection: React.FC<SellerInfoSectionProps> = ({
  register,
  errors,
  countryCodes,
  formatConfig,
}) => {
  const t = useTranslations('invoiceReview');

  const emailRequired = formatConfig.sellerEmail === 'required';
  const emailVisible = formatConfig.sellerEmail !== 'hidden';
  const phoneRequired = formatConfig.sellerPhone === 'required';
  const phoneVisible = formatConfig.sellerPhone !== 'hidden';
  const vatRequired = formatConfig.sellerVatId === 'required';
  const electronicAddrVisible = formatConfig.sellerElectronicAddress !== 'hidden';
  const electronicAddrRequired = formatConfig.sellerElectronicAddress === 'required';

  return (
    <div className="glass-card p-6">
      <h3 className="text-lg font-medium text-white mb-4 font-display">{t('sellerInfo')}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Seller name — always required */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-300 mb-1">{t('sellerName')}</label>
          <input
            type="text"
            {...register('sellerName')}
            className={`w-full p-2 rounded-xl bg-slate-950/60 border ${
              errors.sellerName ? 'border-rose-400/60' : 'border-white/10'
            } text-white`}
          />
          {errors.sellerName && (
            <p className="mt-1 text-sm text-red-500">{errors.sellerName.message as string}</p>
          )}
        </div>

        {/* Email — required for XRechnung, optional/hidden for others */}
        <div className={!emailVisible ? 'hidden' : ''}>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            {t('sellerEmail')}
            {emailRequired && <span className="text-red-500 ml-0.5">*</span>}
            {emailRequired && (
              <span className="text-xs text-faded ml-1">{t('sellerEmailHint')}</span>
            )}
          </label>
          <input
            type="text"
            {...register('sellerEmail', {
              required: emailRequired ? t('sellerEmailRequired') : false,
            })}
            className={`w-full p-2 rounded-xl bg-slate-950/60 border ${errors.sellerEmail ? 'border-rose-400/60' : 'border-white/10'} text-white`}
            placeholder="email@example.de"
          />
          {errors.sellerEmail && (
            <p className="mt-1 text-sm text-red-500">{errors.sellerEmail.message as string}</p>
          )}
          {formatConfig.hints?.sellerElectronicAddress && (
            <p className="mt-1 text-xs text-slate-400">
              {formatConfig.hints.sellerElectronicAddress}
            </p>
          )}
        </div>

        {/* Phone — required for XRechnung, optional/hidden for others */}
        <div className={!phoneVisible ? 'hidden' : ''}>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            {t('sellerPhone')}
            {phoneRequired && <span className="text-red-500 ml-0.5">*</span>}
            {phoneRequired && (
              <span className="text-xs text-faded ml-1">{t('sellerPhoneHint')}</span>
            )}
          </label>
          <input
            type="tel"
            {...register('sellerPhone', {
              required: phoneRequired ? t('sellerPhoneRequired') : false,
              pattern: phoneRequired
                ? {
                    value: /^[\d\s+\-()]{3,}$/,
                    message: t('sellerPhoneMinDigits'),
                  }
                : undefined,
            })}
            className={`w-full p-2 rounded-xl bg-slate-950/60 border ${errors.sellerPhone ? 'border-rose-400/60' : 'border-white/10'} text-white`}
            placeholder="+49 123 456789"
          />
          {errors.sellerPhone && (
            <p className="mt-1 text-sm text-red-500">{errors.sellerPhone.message as string}</p>
          )}
          {formatConfig.hints?.sellerPhone && (
            <p className="mt-1 text-xs text-slate-400">{formatConfig.hints.sellerPhone}</p>
          )}
        </div>

        {/* Peppol / NLCIUS / CIUS-RO: seller electronic address (BT-34) */}
        <div className={!electronicAddrVisible ? 'hidden' : 'md:col-span-2'}>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            Seller Electronic Address (BT-34)
            {electronicAddrRequired && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          <input
            type="text"
            {...register('sellerElectronicAddress', {
              required: electronicAddrRequired
                ? 'Seller electronic address is required for this format (BT-34)'
                : false,
            })}
            className={`w-full p-2 rounded-xl bg-slate-950/60 border ${errors.sellerElectronicAddress ? 'border-rose-400/60' : 'border-white/10'} text-white`}
            placeholder="0088:1234567890123"
          />
          {errors.sellerElectronicAddress && (
            <p className="mt-1 text-sm text-red-500">
              {errors.sellerElectronicAddress.message as string}
            </p>
          )}
          {formatConfig.hints?.sellerElectronicAddress && (
            <p className="mt-1 text-xs text-slate-400">
              {formatConfig.hints.sellerElectronicAddress}
            </p>
          )}
        </div>

        {/* Address fields */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">{t('street')}</label>
          <input
            type="text"
            {...register('sellerParsedAddress.street')}
            className="w-full p-2 rounded-xl bg-slate-950/60 border border-white/10 text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">{t('postalCode')}</label>
          <input
            type="text"
            {...register('sellerParsedAddress.postalCode')}
            className="w-full p-2 rounded-xl bg-slate-950/60 border border-white/10 text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">{t('city')}</label>
          <input
            type="text"
            {...register('sellerParsedAddress.city')}
            className="w-full p-2 rounded-xl bg-slate-950/60 border border-white/10 text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">{t('country')}</label>
          <select
            {...register('sellerParsedAddress.country')}
            className="w-full p-2 rounded-xl bg-slate-950/60 border border-white/10 text-white"
          >
            {countryCodes.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* VAT ID */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            {t('vatId')}
            {vatRequired && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          <input
            type="text"
            {...register('sellerTaxId')}
            className={`w-full p-2 rounded-xl bg-slate-950/60 border ${
              errors.sellerTaxId ? 'border-rose-400/60' : 'border-white/10'
            } text-white`}
            placeholder="DE123456789 / 12/345/67890"
          />
          {errors.sellerTaxId && (
            <p className="mt-1 text-sm text-red-500">{errors.sellerTaxId.message as string}</p>
          )}
          <p className="mt-1 text-xs text-slate-400">
            {formatConfig.hints?.sellerVatId ?? t('vatIdHint')}
          </p>
        </div>
      </div>
    </div>
  );
};
