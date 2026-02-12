import React from 'react';
import { UseFormRegister, FieldErrors } from 'react-hook-form';
import { useTranslations } from 'next-intl';

interface SellerInfoSectionProps {
  register: UseFormRegister<any>;
  errors: FieldErrors<any>;
  countryCodes: { code: string; name: string }[];
}

export const SellerInfoSection: React.FC<SellerInfoSectionProps> = ({
  register,
  errors,
  countryCodes,
}) => {
  const t = useTranslations('invoiceReview');
  return (
    <div className="glass-card p-6">
      <h3 className="text-lg font-medium text-white mb-4 font-display">{t('sellerInfo')}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            {t('sellerEmail')} <span className="text-red-500">*</span>
            <span className="text-xs text-faded ml-1">{t('sellerEmailHint')}</span>
          </label>
          <input
            type="text"
            {...register('sellerEmail', { required: t('sellerEmailRequired') })}
            className={`w-full p-2 rounded-xl bg-slate-950/60 border ${errors.sellerEmail ? 'border-rose-400/60' : 'border-white/10'} text-white`}
            placeholder="email@example.de"
          />
          {errors.sellerEmail && (
            <p className="mt-1 text-sm text-red-500">{errors.sellerEmail.message as string}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            {t('sellerPhone')} <span className="text-red-500">*</span>
            <span className="text-xs text-faded ml-1">{t('sellerPhoneHint')}</span>
          </label>
          <input
            type="tel"
            {...register('sellerPhone', {
              required: t('sellerPhoneRequired'),
              pattern: {
                value: /^[\d\s\+\-()]{3,}$/,
                message: t('sellerPhoneMinDigits'),
              },
            })}
            className={`w-full p-2 rounded-xl bg-slate-950/60 border ${errors.sellerPhone ? 'border-rose-400/60' : 'border-white/10'} text-white`}
            placeholder="+49 123 456789"
          />
          {errors.sellerPhone && (
            <p className="mt-1 text-sm text-red-500">{errors.sellerPhone.message as string}</p>
          )}
        </div>

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

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">{t('taxId')}</label>
          <input
            type="text"
            {...register('sellerTaxId')}
            className="w-full p-2 rounded-xl bg-slate-950/60 border border-white/10 text-white"
          />
        </div>
      </div>
    </div>
  );
};
