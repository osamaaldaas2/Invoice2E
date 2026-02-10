import React from 'react';
import { UseFormRegister, FieldErrors } from 'react-hook-form';
import { useTranslations } from 'next-intl';

interface BuyerInfoSectionProps {
    register: UseFormRegister<any>;
    errors: FieldErrors<any>;
    countryCodes: { code: string; name: string }[];
}

export const BuyerInfoSection: React.FC<BuyerInfoSectionProps> = ({ register, errors, countryCodes }) => {
    const t = useTranslations('invoiceReview');
    return (
        <div className="glass-card p-6">
            <h3 className="text-lg font-medium text-white mb-4 font-display">{t('buyerInfo')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                        {t('buyerName')}
                    </label>
                    <input
                        type="text"
                        {...register('buyerName')}
                        className={`w-full p-2 rounded-xl bg-slate-950/60 border ${errors.buyerName ? 'border-rose-400/60' : 'border-white/10'} text-white`}
                    />
                    {errors.buyerName && (
                        <p className="mt-1 text-sm text-red-500">{errors.buyerName.message as string}</p>
                    )}
                </div>

                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                        {t('buyerEmail')}
                    </label>
                    <input
                        type="email"
                        {...register('buyerEmail')}
                        className={`w-full p-2 rounded-xl bg-slate-950/60 border ${errors.buyerEmail ? 'border-rose-400/60' : 'border-white/10'} text-white`}
                        placeholder={t('buyerEmailPlaceholder')}
                    />
                    <p className="mt-1 text-xs text-slate-500">{t('buyerEmailHint')}</p>
                    {errors.buyerEmail && (
                        <p className="mt-1 text-sm text-red-500">{errors.buyerEmail.message as string}</p>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                        {t('street')}
                    </label>
                    <input
                        type="text"
                        {...register('buyerParsedAddress.street')}
                        className="w-full p-2 rounded-xl bg-slate-950/60 border border-white/10 text-white"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                        {t('postalCode')}
                    </label>
                    <input
                        type="text"
                        {...register('buyerParsedAddress.postalCode')}
                        className="w-full p-2 rounded-xl bg-slate-950/60 border border-white/10 text-white"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                        {t('city')}
                    </label>
                    <input
                        type="text"
                        {...register('buyerParsedAddress.city')}
                        className="w-full p-2 rounded-xl bg-slate-950/60 border border-white/10 text-white"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                        {t('country')}
                    </label>
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

                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                        {t('taxId')}
                    </label>
                    <input
                        type="text"
                        {...register('buyerTaxId')}
                        className="w-full p-2 rounded-xl bg-slate-950/60 border border-white/10 text-white"
                    />
                </div>
            </div>
        </div>
    );
};
