import React from 'react';
import { UseFormRegister, FieldErrors } from 'react-hook-form';
import { useTranslations } from 'next-intl';

interface PaymentSectionProps {
    register: UseFormRegister<any>;
    errors?: FieldErrors<any>;
}

export const PaymentSection: React.FC<PaymentSectionProps> = ({ register, errors }) => {
    const t = useTranslations('invoiceReview');
    return (
        <div className="glass-card p-6">
            <h3 className="text-lg font-medium text-white mb-4 font-display">{t('paymentInfo')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                        {t('iban')} <span className="text-red-500">*</span>
                        <span className="text-xs text-faded ml-1">{t('ibanHint')}</span>
                    </label>
                    <input
                        type="text"
                        {...register('sellerIban', {
                            required: t('ibanRequired'),
                            pattern: {
                                value: /^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,30}$/,
                                message: t('ibanInvalid')
                            },
                            setValueAs: (value) =>
                                typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() : value
                        })}
                        className={`w-full p-2 rounded-xl bg-slate-950/60 border ${errors?.sellerIban ? 'border-rose-400/60' : 'border-white/10'} text-white`}
                        placeholder="DE89370400440532013000"
                    />
                    {errors?.sellerIban && (
                        <p className="mt-1 text-sm text-red-500">{errors.sellerIban.message as string}</p>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                        {t('bic')}
                    </label>
                    <input
                        type="text"
                        {...register('sellerBic')}
                        className="w-full p-2 rounded-xl bg-slate-950/60 border border-white/10 text-white"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                        {t('bankName')}
                    </label>
                    <input
                        type="text"
                        {...register('bankName')}
                        className="w-full p-2 rounded-xl bg-slate-950/60 border border-white/10 text-white"
                    />
                </div>

                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                        {t('paymentTerms')}
                    </label>
                    <textarea
                        {...register('paymentTerms')}
                        rows={3}
                        className="w-full p-2 rounded-xl bg-slate-950/60 border border-white/10 text-white"
                    />
                </div>
            </div>
        </div>
    );
};
