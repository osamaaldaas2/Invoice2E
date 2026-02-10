import React from 'react';
import { UseFormRegister, FieldErrors } from 'react-hook-form';
import { useTranslations } from 'next-intl';

interface InvoiceDetailsSectionProps {
    register: UseFormRegister<any>;
    errors: FieldErrors<any>;
    invoiceId?: string; // Add if needed logic for handling IDs
}

export const InvoiceDetailsSection: React.FC<InvoiceDetailsSectionProps> = ({ register, errors }) => {
    const t = useTranslations('invoiceReview');
    return (
        <div className="glass-card p-6">
            <h3 className="text-lg font-medium text-white mb-4 font-display">{t('invoiceDetails')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                        {t('invoiceNumber')}
                    </label>
                    <input
                        type="text"
                        {...register('invoiceNumber')}
                        className={`w-full p-2 rounded-xl bg-slate-950/60 border ${errors.invoiceNumber ? 'border-rose-400/60' : 'border-white/10'} text-white`}
                    />
                    {errors.invoiceNumber && (
                        <p className="mt-1 text-sm text-red-500">{errors.invoiceNumber.message as string}</p>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                        {t('invoiceDate')}
                    </label>
                    <input
                        type="date"
                        {...register('invoiceDate')}
                        className={`w-full p-2 rounded-xl bg-slate-950/60 border ${errors.invoiceDate ? 'border-rose-400/60' : 'border-white/10'} text-white`}
                    />
                    {errors.invoiceDate && (
                        <p className="mt-1 text-sm text-red-500">{errors.invoiceDate.message as string}</p>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                        {t('currency')}
                    </label>
                    <input
                        type="text"
                        readOnly
                        {...register('currency')}
                        className="w-full p-2 rounded-xl bg-slate-950/80 border border-white/10 text-white"
                    />
                </div>
            </div>
        </div>
    );
};
