import React from 'react';
import { UseFormRegister, FieldErrors } from 'react-hook-form';

interface SellerInfoSectionProps {
    register: UseFormRegister<any>;
    errors: FieldErrors<any>;
    countryCodes: { code: string; name: string }[];
}

export const SellerInfoSection: React.FC<SellerInfoSectionProps> = ({ register, errors, countryCodes }) => {
    return (
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Seller Information (From)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Seller Name
                    </label>
                    <input
                        type="text"
                        {...register('sellerName')}
                        className={`w-full p-2 border rounded-md ${errors.sellerName ? 'border-red-500' : 'border-gray-300'
                            }`}
                    />
                    {errors.sellerName && (
                        <p className="mt-1 text-sm text-red-500">{errors.sellerName.message as string}</p>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Seller Email <span className="text-red-500">*</span>
                        <span className="text-xs text-gray-500 ml-1">(XRechnung required)</span>
                    </label>
                    <input
                        type="email"
                        {...register('sellerEmail', { required: 'Seller email is required for XRechnung' })}
                        className={`w-full p-2 border rounded-md ${errors.sellerEmail ? 'border-red-500' : 'border-gray-300'}`}
                        placeholder="email@example.de"
                    />
                    {errors.sellerEmail && (
                        <p className="mt-1 text-sm text-red-500">{errors.sellerEmail.message as string}</p>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Seller Phone <span className="text-red-500">*</span>
                        <span className="text-xs text-gray-500 ml-1">(BR-DE-6)</span>
                    </label>
                    <input
                        type="tel"
                        {...register('sellerPhone', {
                            required: 'Seller phone is required for German XRechnung (BR-DE-6)',
                            pattern: {
                                value: /^[\d\s\+\-()]{3,}$/,
                                message: 'Phone must contain at least 3 digits (BR-DE-27)'
                            }
                        })}
                        className={`w-full p-2 border rounded-md ${errors.sellerPhone ? 'border-red-500' : 'border-gray-300'}`}
                        placeholder="+49 123 456789"
                    />
                    {errors.sellerPhone && (
                        <p className="mt-1 text-sm text-red-500">{errors.sellerPhone.message as string}</p>
                    )}
                </div>

                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Address
                    </label>
                    <input
                        type="text"
                        {...register('sellerAddress')}
                        className="w-full p-2 border border-gray-300 rounded-md mb-2"
                        placeholder="Full Address String"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Street
                    </label>
                    <input
                        type="text"
                        {...register('sellerParsedAddress.street')}
                        className="w-full p-2 border border-gray-300 rounded-md"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Postal Code
                    </label>
                    <input
                        type="text"
                        {...register('sellerParsedAddress.postalCode')}
                        className="w-full p-2 border border-gray-300 rounded-md"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        City
                    </label>
                    <input
                        type="text"
                        {...register('sellerParsedAddress.city')}
                        className="w-full p-2 border border-gray-300 rounded-md"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Country
                    </label>
                    <select
                        {...register('sellerParsedAddress.country')}
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
                        {...register('sellerTaxId')}
                        className="w-full p-2 border border-gray-300 rounded-md"
                    />
                </div>
            </div>
        </div>
    );
};
