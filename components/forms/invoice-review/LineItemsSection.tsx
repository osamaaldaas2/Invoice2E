import React from 'react';
import { UseFormRegister, Control, useFieldArray, FieldErrors } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';

interface LineItemsSectionProps {
    register: UseFormRegister<any>;
    control: Control<any>;
    errors: FieldErrors<any>;
}

export const LineItemsSection: React.FC<LineItemsSectionProps> = ({ register, control, errors }) => {
    const { fields, append, remove } = useFieldArray({
        control,
        name: 'items'
    });

    return (
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">Line Items</h3>
                <button
                    type="button"
                    onClick={() => append({ description: '', quantity: 1, unitPrice: 0, taxRate: 19, totalPrice: 0 })}
                    className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                    <Plus className="w-4 h-4" />
                    Add Item
                </button>
            </div>

            <div className="space-y-4">
                {fields.map((item, index) => (
                    <div key={item.id} className="grid grid-cols-12 gap-4 items-start p-4 bg-gray-50 rounded-lg relative group">
                        <div className="col-span-12 md:col-span-5">
                            <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                            <input
                                {...register(`items.${index}.description` as const, { required: 'Required' })}
                                className="w-full p-2 text-sm border border-gray-300 rounded-md"
                                placeholder="Item description"
                            />
                            {(errors.items as any)?.[index]?.description && (
                                <p className="text-xs text-red-500 mt-1">{(errors.items as any)[index]?.description?.message as string}</p>
                            )}
                        </div>

                        <div className="col-span-6 md:col-span-2">
                            <label className="block text-xs font-medium text-gray-500 mb-1">Qty</label>
                            <input
                                type="number"
                                step="any"
                                {...register(`items.${index}.quantity` as const, { valueAsNumber: true })}
                                className="w-full p-2 text-sm border border-gray-300 rounded-md"
                            />
                        </div>

                        <div className="col-span-6 md:col-span-2">
                            <label className="block text-xs font-medium text-gray-500 mb-1">Unit Price</label>
                            <input
                                type="number"
                                step="0.01"
                                {...register(`items.${index}.unitPrice` as const, { valueAsNumber: true })}
                                className="w-full p-2 text-sm border border-gray-300 rounded-md"
                            />
                        </div>

                        <div className="col-span-6 md:col-span-2">
                            <label className="block text-xs font-medium text-gray-500 mb-1">Tax %</label>
                            <input
                                type="number"
                                step="0.1"
                                {...register(`items.${index}.taxRate` as const, { valueAsNumber: true })}
                                className="w-full p-2 text-sm border border-gray-300 rounded-md"
                            />
                        </div>

                        <div className="col-span-11 md:col-span-1">
                            {/* Total Price usually calculated, avoiding input might be better but for flexibility keeping it */}
                            <label className="block text-xs font-medium text-gray-500 mb-1">Total</label>
                            <input
                                type="number"
                                step="0.01"
                                {...register(`items.${index}.totalPrice` as const, { valueAsNumber: true })}
                                className="w-full p-2 text-sm border border-gray-300 rounded-md bg-gray-100"
                            />
                        </div>

                        <button
                            type="button"
                            onClick={() => remove(index)}
                            className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                ))}

                {fields.length === 0 && (
                    <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
                        No items added yet. Click "Add Item" to start.
                    </div>
                )}
            </div>
        </div>
    );
};
