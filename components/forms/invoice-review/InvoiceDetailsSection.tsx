import React from 'react';
import { UseFormRegister, FieldErrors } from 'react-hook-form';

interface InvoiceDetailsSectionProps {
    register: UseFormRegister<any>;
    errors: FieldErrors<any>;
    invoiceId?: string; // Add if needed logic for handling IDs
}

export const InvoiceDetailsSection: React.FC<InvoiceDetailsSectionProps> = ({ register, errors }) => {
    return (
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Invoice Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Invoice Number
                    </label>
                    <input
                        type="text"
                        {...register('invoiceNumber')}
                        className={`w-full p-2 border rounded-md ${errors.invoiceNumber ? 'border-red-500' : 'border-gray-300'
                            }`}
                    />
                    {errors.invoiceNumber && (
                        <p className="mt-1 text-sm text-red-500">{errors.invoiceNumber.message as string}</p>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Invoice Date
                    </label>
                    <input
                        type="date"
                        {...register('invoiceDate')}
                        className={`w-full p-2 border rounded-md ${errors.invoiceDate ? 'border-red-500' : 'border-gray-300'
                            }`}
                    />
                    {errors.invoiceDate && (
                        <p className="mt-1 text-sm text-red-500">{errors.invoiceDate.message as string}</p>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Currency (e.g. EUR)
                    </label>
                    <input
                        type="text"
                        readOnly
                        {...register('currency')}
                        className={`w-full p-2 border rounded-md bg-gray-50 border-gray-300`}
                    />
                </div>
            </div>
        </div>
    );
};
