import React from 'react';
import { UseFormRegister, FieldErrors } from 'react-hook-form';

interface BuyerInfoSectionProps {
    register: UseFormRegister<any>;
    errors: FieldErrors<any>;
    countryCodes: { code: string; name: string }[];
}

export const BuyerInfoSection: React.FC<BuyerInfoSectionProps> = ({ register, errors, countryCodes }) => {
    return (
        <div className="glass-card p-6">
            <h3 className="text-lg font-medium text-white mb-4 font-display">Buyer Information (To)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                        Buyer Name
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
                        Buyer Email <span className="text-red-500">*</span>
                        <span className="text-xs text-faded ml-1">(PEPPOL-EN16931-R010)</span>
                    </label>
                    <input
                        type="email"
                        {...register('buyerEmail', { required: 'Buyer email is required for XRechnung (PEPPOL-EN16931-R010)' })}
                        className={`w-full p-2 rounded-xl bg-slate-950/60 border ${errors.buyerEmail ? 'border-rose-400/60' : 'border-white/10'} text-white`}
                        placeholder="buyer@example.de"
                    />
                    {errors.buyerEmail && (
                        <p className="mt-1 text-sm text-red-500">{errors.buyerEmail.message as string}</p>
                    )}
                </div>

                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                        Address
                    </label>
                    <input
                        type="text"
                        {...register('buyerAddress')}
                        className="w-full p-2 rounded-xl bg-slate-950/60 border border-white/10 text-white mb-2"
                        placeholder="Full Address String"
                    />
                </div>
                {/*  Add structured address fields if logic separated, simplified for now based on typical form usage in parent */}
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                        Street
                    </label>
                    <input
                        type="text"
                        {...register('buyerParsedAddress.street')}
                        className="w-full p-2 rounded-xl bg-slate-950/60 border border-white/10 text-white"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                        Postal Code
                    </label>
                    <input
                        type="text"
                        {...register('buyerParsedAddress.postalCode')}
                        className="w-full p-2 rounded-xl bg-slate-950/60 border border-white/10 text-white"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                        City
                    </label>
                    <input
                        type="text"
                        {...register('buyerParsedAddress.city')}
                        className="w-full p-2 rounded-xl bg-slate-950/60 border border-white/10 text-white"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                        Country
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
                        Tax ID (Steuernummer/VAT ID)
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
