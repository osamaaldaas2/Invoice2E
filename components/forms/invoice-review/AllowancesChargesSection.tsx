import React from 'react';
import { UseFormRegister, Control, useFieldArray, FieldErrors } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { InvoiceReviewFormValues } from './useInvoiceReviewForm';

interface AllowancesChargesSectionProps {
  register: UseFormRegister<InvoiceReviewFormValues>;
  control: Control<InvoiceReviewFormValues>;
  errors: FieldErrors<InvoiceReviewFormValues>;
}

export const AllowancesChargesSection: React.FC<AllowancesChargesSectionProps> = ({
  register,
  control,
  errors: _errors,
}) => {
  const t = useTranslations('invoiceReview');
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'allowanceCharges',
  });

  if (fields.length === 0) {
    return (
      <div className="glass-card p-6">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium text-white font-display">
            {t('allowancesCharges', { defaultValue: 'Allowances / Charges' })}
          </h3>
          <button
            type="button"
            onClick={() =>
              append({
                chargeIndicator: false,
                amount: 0,
                percentage: '',
                reason: '',
                taxRate: '',
              })
            }
            className="flex items-center gap-2 text-sm text-sky-200 hover:text-sky-100 font-medium"
          >
            <Plus className="w-4 h-4" />
            {t('addAllowanceCharge', { defaultValue: 'Add Discount/Surcharge' })}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium text-white font-display">
          {t('allowancesCharges', { defaultValue: 'Allowances / Charges' })}
        </h3>
        <button
          type="button"
          onClick={() =>
            append({
              chargeIndicator: false,
              amount: 0,
              percentage: '',
              reason: '',
              taxRate: '',
            })
          }
          className="flex items-center gap-2 text-sm text-sky-200 hover:text-sky-100 font-medium"
        >
          <Plus className="w-4 h-4" />
          {t('addAllowanceCharge', { defaultValue: 'Add' })}
        </button>
      </div>

      <div className="space-y-3">
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="grid grid-cols-12 gap-2 sm:gap-4 items-start p-3 sm:p-4 bg-white/5 border border-white/10 rounded-2xl relative group"
          >
            {/* Type: Allowance or Charge */}
            <div className="col-span-12 sm:col-span-3 md:col-span-2">
              <label className="block text-xs font-medium text-slate-300 mb-1">
                {t('acType', { defaultValue: 'Type' })}
              </label>
              <select
                {...register(`allowanceCharges.${index}.chargeIndicator` as const, {
                  setValueAs: (v) => v === 'true' || v === true,
                })}
                className="w-full p-2 text-sm rounded-xl bg-slate-950/60 border border-white/10 text-white"
              >
                <option value="false">
                  {t('allowance', { defaultValue: 'Discount (-)' })}
                </option>
                <option value="true">
                  {t('charge', { defaultValue: 'Surcharge (+)' })}
                </option>
              </select>
            </div>

            {/* Reason */}
            <div className="col-span-12 sm:col-span-4 md:col-span-3">
              <label className="block text-xs font-medium text-slate-300 mb-1">
                {t('acReason', { defaultValue: 'Reason' })}
              </label>
              <input
                {...register(`allowanceCharges.${index}.reason` as const)}
                className="w-full p-2 text-sm rounded-xl bg-slate-950/60 border border-white/10 text-white"
                placeholder={t('acReasonPlaceholder', { defaultValue: 'e.g. Rabatt, Skonto' })}
              />
            </div>

            {/* Percentage */}
            <div className="col-span-4 sm:col-span-2 md:col-span-2">
              <label className="block text-xs font-medium text-slate-300 mb-1">%</label>
              <input
                type="number"
                step="any"
                {...register(`allowanceCharges.${index}.percentage` as const)}
                className="w-full p-2 text-sm rounded-xl bg-slate-950/60 border border-white/10 text-white"
                placeholder="—"
              />
            </div>

            {/* Amount */}
            <div className="col-span-4 sm:col-span-3 md:col-span-2">
              <label className="block text-xs font-medium text-slate-300 mb-1">
                {t('acAmount', { defaultValue: 'Amount' })}
              </label>
              <input
                type="number"
                step="0.01"
                {...register(`allowanceCharges.${index}.amount` as const, { valueAsNumber: true })}
                className="w-full p-2 text-sm rounded-xl bg-slate-950/60 border border-white/10 text-white"
              />
            </div>

            {/* Tax Rate */}
            <div className="col-span-4 sm:col-span-2 md:col-span-2">
              <label className="block text-xs font-medium text-slate-300 mb-1">
                {t('acTaxRate', { defaultValue: 'VAT %' })}
              </label>
              <input
                type="number"
                step="any"
                {...register(`allowanceCharges.${index}.taxRate` as const)}
                className="w-full p-2 text-sm rounded-xl bg-slate-950/60 border border-white/10 text-white"
                placeholder="—"
              />
            </div>

            {/* Delete button */}
            <button
              type="button"
              onClick={() => {
                if (window.confirm(t('confirmDeleteAllowance'))) {
                  remove(index);
                }
              }}
              className="absolute top-2 right-2 p-1 text-slate-400 hover:text-rose-300 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
