import React from 'react';
import { UseFormRegister, FieldErrors } from 'react-hook-form';

interface PaymentSectionProps {
    register: UseFormRegister<any>;
    errors?: FieldErrors<any>;
}

export const PaymentSection: React.FC<PaymentSectionProps> = ({ register, errors }) => {
    return (
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Payment Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        IBAN <span className="text-red-500">*</span>
                        <span className="text-xs text-gray-500 ml-1">(BR-DE-23-a)</span>
                    </label>
                    <input
                        type="text"
                        {...register('sellerIban', {
                            required: 'IBAN is required for bank transfers (BR-DE-23-a)',
                            pattern: {
                                value: /^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,30}$/,
                                message: 'Invalid IBAN format (e.g., DE89370400440532013000)'
                            }
                        })}
                        className={`w-full p-2 border rounded-md ${errors?.sellerIban ? 'border-red-500' : 'border-gray-300'}`}
                        placeholder="DE89370400440532013000"
                    />
                    {errors?.sellerIban && (
                        <p className="mt-1 text-sm text-red-500">{errors.sellerIban.message as string}</p>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        BIC (Swift)
                    </label>
                    <input
                        type="text"
                        {...register('bic')}
                        className="w-full p-2 border border-gray-300 rounded-md"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Bank Name
                    </label>
                    <input
                        type="text"
                        {...register('bankName')}
                        className="w-full p-2 border border-gray-300 rounded-md"
                    />
                </div>

                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Payment Terms / Notes
                    </label>
                    <textarea
                        {...register('paymentTerms')}
                        rows={3}
                        className="w-full p-2 border border-gray-300 rounded-md"
                    />
                </div>
            </div>
        </div>
    );
};
