import React, { useEffect } from 'react';
import { UseFormRegister, UseFormWatch, UseFormSetValue } from 'react-hook-form';

interface TotalsSectionProps {
    register: UseFormRegister<any>;
    watch: UseFormWatch<any>;
    setValue: UseFormSetValue<any>;
}

export const TotalsSection: React.FC<TotalsSectionProps> = ({ register, watch, setValue }) => {
    const items = watch('items') || [];

    // Calculate totals automatically based on items
    useEffect(() => {
        const calculatedSubtotal = items.reduce((sum: number, item: any) => sum + (Number(item.totalPrice) || 0), 0);
        const calculatedTax = items.reduce((sum: number, item: any) => {
            const amount = Number(item.totalPrice) || 0;
            const rate = Number(item.taxRate) || 0;
            return sum + (amount * (rate / 100));
        }, 0);

        setValue('subtotal', parseFloat(calculatedSubtotal.toFixed(2)));
        setValue('taxAmount', parseFloat(calculatedTax.toFixed(2)));
        setValue('totalAmount', parseFloat((calculatedSubtotal + calculatedTax).toFixed(2)));
    }, [items, setValue]);

    return (
        <div className="glass-panel p-6 rounded-2xl border border-white/10 mt-6">
            <div className="flex justify-end">
                <div className="w-full md:w-1/3 space-y-3">
                    <div className="flex justify-between items-center">
                        <label className="text-sm font-medium text-slate-300">Subtotal (Net)</label>
                        <input
                            type="number"
                            step="0.01"
                            {...register('subtotal')}
                            className="w-32 p-2 rounded-xl bg-slate-950/60 border border-white/10 text-white text-right"
                        />
                    </div>
                    <div className="flex justify-between items-center">
                        <label className="text-sm font-medium text-slate-300">Tax Amount</label>
                        <input
                            type="number"
                            step="0.01"
                            {...register('taxAmount')}
                            className="w-32 p-2 rounded-xl bg-slate-950/60 border border-white/10 text-white text-right"
                        />
                    </div>
                    <div className="flex justify-between items-center pt-3 border-t border-white/10">
                        <label className="text-base font-bold text-white">Total Amount (Gross)</label>
                        <input
                            type="number"
                            step="0.01"
                            {...register('totalAmount')}
                            className="w-32 p-2 rounded-xl bg-slate-950/80 border border-white/10 text-white text-right font-bold"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
