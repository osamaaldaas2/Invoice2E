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
  // FIX-030: Always compute totals deterministically from line items + allowances/charges.
  // Previous approach (FIX-029) trusted AI-extracted totals when allowances existed,
  // but AI frequently returned wrong subtotals (e.g. gross sum instead of net-after-allowances).
  // Deterministic calculation guarantees subtotal + tax = total, always.
  useEffect(() => {
    // 1. Sum of net line item totals (LineTotalAmount equivalent)
    const lineTotalCents = items.reduce((sum: number, item: { totalPrice?: number }) => {
      return sum + Math.round((Number(item.totalPrice) || 0) * 100);
    }, 0);

    // 2. Sum of allowances (discounts, chargeIndicator=false) and charges (surcharges, chargeIndicator=true)
    let allowanceTotalCents = 0;
    let chargeTotalCents = 0;
    for (const ac of allowanceCharges) {
      const amountCents = Math.round((Number(ac.amount) || 0) * 100);
      if (amountCents <= 0) continue;
      const isCharge = ac.chargeIndicator === true || ac.chargeIndicator === 'true';
      if (isCharge) {
        chargeTotalCents += amountCents;
      } else {
        allowanceTotalCents += amountCents;
      }
    }

    // 3. Tax basis = line totals − allowances + charges (EN 16931 BT-109)
    const taxBasisCents = lineTotalCents - allowanceTotalCents + chargeTotalCents;

    // 4. Tax: per-component rounding (line item tax − allowance tax + charge tax)
    const lineTaxCents = items.reduce(
      (sum: number, item: { totalPrice?: number; taxRate?: number | string }) => {
        const amountCents = Math.round((Number(item.totalPrice) || 0) * 100);
        const rate = Number(item.taxRate) || 0;
        return sum + Math.round(amountCents * (rate / 100));
      },
      0
    );

    let allowanceTaxCents = 0;
    let chargeTaxCents = 0;
    for (const ac of allowanceCharges) {
      const amountCents = Math.round((Number(ac.amount) || 0) * 100);
      if (amountCents <= 0) continue;
      const rate = Number(ac.taxRate) || 0;
      const taxCents = Math.round(amountCents * (rate / 100));
      const isCharge = ac.chargeIndicator === true || ac.chargeIndicator === 'true';
      if (isCharge) {
        chargeTaxCents += taxCents;
      } else {
        allowanceTaxCents += taxCents;
      }
    }

    const calculatedTaxCents = lineTaxCents - allowanceTaxCents + chargeTaxCents;

    setValue('subtotal', taxBasisCents / 100);
    setValue('taxAmount', calculatedTaxCents / 100);
    setValue('totalAmount', (taxBasisCents + calculatedTaxCents) / 100);
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
