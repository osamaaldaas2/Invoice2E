import React, { useEffect, useMemo } from 'react';
import { UseFormRegister, UseFormWatch, UseFormSetValue } from 'react-hook-form';
import { useTranslations } from 'next-intl';

interface TotalsSectionProps {
  register: UseFormRegister<any>;
  watch: UseFormWatch<any>;
  setValue: UseFormSetValue<any>;
  initialTotals?: { subtotal: number; taxAmount: number; totalAmount: number };
}

export const TotalsSection: React.FC<TotalsSectionProps> = ({
  register,
  watch,
  setValue,
  initialTotals,
}) => {
  const t = useTranslations('invoiceReview');
  const items = useMemo(() => watch('items') || [], [watch]);
  const subtotal = watch('subtotal');
  const taxAmount = watch('taxAmount');
  const totalAmount = watch('totalAmount');

  // FIX-028: Use integer cents to avoid floating point errors
  useEffect(() => {
    const calculatedSubtotalCents = items.reduce((sum: number, item: { totalPrice?: number }) => {
      return sum + Math.round((Number(item.totalPrice) || 0) * 100);
    }, 0);
    const calculatedTaxCents = items.reduce(
      (sum: number, item: { totalPrice?: number; taxRate?: number | string }) => {
        const amountCents = Math.round((Number(item.totalPrice) || 0) * 100);
        const rate = Number(item.taxRate) || 0;
        return sum + Math.round(amountCents * (rate / 100));
      },
      0
    );

    setValue('subtotal', calculatedSubtotalCents / 100);
    setValue('taxAmount', calculatedTaxCents / 100);
    setValue('totalAmount', (calculatedSubtotalCents + calculatedTaxCents) / 100);
  }, [items, setValue]);

  const showDiff = (current: number, extracted: number | undefined) => {
    if (extracted === undefined || extracted === null) return null;
    if (Math.abs((Number(current) || 0) - extracted) <= 0.01) return null;
    return (
      <span className="text-xs text-amber-300">
        {t('extractedValue', { value: extracted.toFixed(2) })}
      </span>
    );
  };

  return (
    <div className="glass-panel p-6 rounded-2xl border border-white/10 mt-6">
      <div className="flex justify-end">
        <div className="w-full md:w-1/3 space-y-3">
          <div>
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-slate-300">{t('subtotal')}</label>
              <input
                type="number"
                step="0.01"
                {...register('subtotal')}
                className="w-32 p-2 rounded-xl bg-slate-950/60 border border-white/10 text-white text-right"
              />
            </div>
            {initialTotals && (
              <div className="text-right mt-0.5">{showDiff(subtotal, initialTotals.subtotal)}</div>
            )}
          </div>
          <div>
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-slate-300">{t('taxAmount')}</label>
              <input
                type="number"
                step="0.01"
                {...register('taxAmount')}
                className="w-32 p-2 rounded-xl bg-slate-950/60 border border-white/10 text-white text-right"
              />
            </div>
            {initialTotals && (
              <div className="text-right mt-0.5">
                {showDiff(taxAmount, initialTotals.taxAmount)}
              </div>
            )}
          </div>
          <div className="pt-3 border-t border-white/10">
            <div className="flex justify-between items-center">
              <label className="text-base font-bold text-white">{t('totalAmount')}</label>
              <input
                type="number"
                step="0.01"
                {...register('totalAmount')}
                className="w-32 p-2 rounded-xl bg-slate-950/80 border border-white/10 text-white text-right font-bold"
              />
            </div>
            {initialTotals && (
              <div className="text-right mt-0.5">
                {showDiff(totalAmount, initialTotals.totalAmount)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
