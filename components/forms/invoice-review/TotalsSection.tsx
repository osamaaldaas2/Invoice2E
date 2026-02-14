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
  const allowanceCharges = useMemo(() => watch('allowanceCharges') || [], [watch]);
  const subtotal = watch('subtotal');
  const taxAmount = watch('taxAmount');
  const totalAmount = watch('totalAmount');

  // FIX-028: Use integer cents to avoid floating point errors
  // FIX-029: When allowances/charges exist, we cannot reliably auto-calculate
  // totals because we don't know if line item prices are net (VAT-exclusive)
  // or gross (VAT-inclusive). Use AI-extracted values for invoices with
  // allowances; only auto-calculate for simple invoices without them.
  useEffect(() => {
    const hasAllowances = allowanceCharges.some(
      (ac: { amount?: number }) => Math.round((Number(ac.amount) || 0) * 100) > 0
    );

    if (hasAllowances) {
      // When allowances/charges exist, the AI-extracted totals are more reliable
      // because the AI can read the actual Netto/MwSt/Brutto from the invoice.
      // Don't override — let the user edit manually if needed.
      return;
    }

    // Simple case: no allowances/charges — auto-calculate from line items (net pricing)
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
  }, [items, allowanceCharges, setValue]);

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
