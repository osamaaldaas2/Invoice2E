import React from 'react';
import { UseFormRegister, FieldErrors } from 'react-hook-form';

interface BuyerInfoSectionProps {
    register: UseFormRegister<any>;
    errors: FieldErrors<any>;
    countryCodes: { code: string; name: string }[];
}

export const BuyerInfoSection: React.FC<BuyerInfoSectionProps> = ({ register, errors, countryCodes }) => {
    return (
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Buyer Information (To)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Buyer Name
                    </label>
                    <input
                        type="text"
                        {...register('buyerName')}
                        className={`w-full p-2 border rounded-md ${errors.buyerName ? 'border-red-500' : 'border-gray-300'
                            }`}
                    />
                    {errors.buyerName && (
                        <p className="mt-1 text-sm text-red-500">{errors.buyerName.message as string}</p>
                    )}
                </div>

                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Buyer Email <span className="text-red-500">*</span>
                        <span className="text-xs text-gray-500 ml-1">(PEPPOL-EN16931-R010)</span>
                    </label>
                    <input
                        type="email"
                        {...register('buyerEmail', { required: 'Buyer email is required for XRechnung (PEPPOL-EN16931-R010)' })}
                        className={`w-full p-2 border rounded-md ${errors.buyerEmail ? 'border-red-500' : 'border-gray-300'}`}
                        placeholder="buyer@example.de"
                    />
                    {errors.buyerEmail && (
                        <p className="mt-1 text-sm text-red-500">{errors.buyerEmail.message as string}</p>
                    )}
                </div>

                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Address
                    </label>
                    <input
                        type="text"
                        {...register('buyerAddress')}
                        className="w-full p-2 border border-gray-300 rounded-md mb-2"
                        placeholder="Full Address String"
                    />
                </div>
                {/*  Add structured address fields if logic separated, simplified for now based on typical form usage in parent */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Street
                    </label>
                    <input
                        type="text"
                        {...register('buyerParsedAddress.street')}
                        className="w-full p-2 border border-gray-300 rounded-md"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Postal Code
                    </label>
                    <input
                        type="text"
                        {...register('buyerParsedAddress.postalCode')}
                        className="w-full p-2 border border-gray-300 rounded-md"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        City
                    </label>
                    <input
                        type="text"
                        {...register('buyerParsedAddress.city')}
                        className="w-full p-2 border border-gray-300 rounded-md"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Country
                    </label>
                    <select
                        {...register('buyerParsedAddress.country')}
                        className="w-full p-2 border border-gray-300 rounded-md"
                    >
                        {countryCodes.map((c) => (
                            <option key={c.code} value={c.code}>
                                {c.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Tax ID (Steuernummer/VAT ID)
                    </label>
                    <input
                        type="text"
                        {...register('buyerTaxId')}
                        className="w-full p-2 border border-gray-300 rounded-md"
                    />
                </div>
            </div>
        </div>
    );
};
