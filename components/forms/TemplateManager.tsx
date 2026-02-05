'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';

interface Template {
    id: string;
    name: string;
    description: string;
    is_default: boolean;
    created_at: string;
    template_data: Record<string, unknown>;
}

interface Props {
    onApplyTemplate?: (templateData: Record<string, unknown>) => void;
}

export default function TemplateManager({ onApplyTemplate }: Props) {
    const t = useTranslations('templates');
    const [templates, setTemplates] = useState<Template[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        sellerName: '',
        sellerEmail: '',
        sellerTaxId: '',
        sellerIban: '',
        sellerBic: '',
        sellerAddress: '',
        sellerCity: '',
        sellerPostalCode: '',
        sellerCountry: 'DE',
    });

    const fetchTemplates = useCallback(async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/invoices/templates');
            const data = await response.json();
            setTemplates(data.templates || []);
        } catch {
            setError('Failed to load templates');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTemplates();
    }, [fetchTemplates]);

    const handleSave = async () => {
        try {
            setError(null);
            const method = editingTemplate ? 'PUT' : 'POST';
            const url = editingTemplate
                ? `/api/invoices/templates/${editingTemplate.id}`
                : '/api/invoices/templates';

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to save template');
            }

            await fetchTemplates();
            setShowForm(false);
            setEditingTemplate(null);
            setFormData({
                name: '',
                description: '',
                sellerName: '',
                sellerEmail: '',
                sellerTaxId: '',
                sellerIban: '',
                sellerBic: '',
                sellerAddress: '',
                sellerCity: '',
                sellerPostalCode: '',
                sellerCountry: 'DE',
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm(t('confirmDelete'))) return;

        try {
            await fetch(`/api/invoices/templates/${id}`, { method: 'DELETE' });
            await fetchTemplates();
        } catch {
            setError('Failed to delete template');
        }
    };

    const handleEdit = (template: Template) => {
        setEditingTemplate(template);
        const data = template.template_data as Record<string, string>;
        setFormData({
            name: template.name,
            description: template.description || '',
            sellerName: data.sellerName || '',
            sellerEmail: data.sellerEmail || '',
            sellerTaxId: data.sellerTaxId || '',
            sellerIban: data.sellerIban || '',
            sellerBic: data.sellerBic || '',
            sellerAddress: data.sellerAddress || '',
            sellerCity: data.sellerCity || '',
            sellerPostalCode: data.sellerPostalCode || '',
            sellerCountry: data.sellerCountry || 'DE',
        });
        setShowForm(true);
    };

    const handleApply = (template: Template) => {
        if (onApplyTemplate) {
            onApplyTemplate(template.template_data);
        }
    };

    if (loading) {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
                <div className="animate-pulse space-y-4">
                    <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
                    <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {t('title')}
                </h3>
                <button
                    onClick={() => {
                        setShowForm(true);
                        setEditingTemplate(null);
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                    {t('newTemplate')}
                </button>
            </div>

            {error && (
                <div className="m-4 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
                    {error}
                </div>
            )}

            {showForm && (
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {t('templateName')} *
                            </label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {t('description')}
                            </label>
                            <input
                                type="text"
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {t('sellerName')}
                            </label>
                            <input
                                type="text"
                                value={formData.sellerName}
                                onChange={(e) => setFormData({ ...formData, sellerName: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {t('sellerEmail')}
                            </label>
                            <input
                                type="email"
                                value={formData.sellerEmail}
                                onChange={(e) => setFormData({ ...formData, sellerEmail: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {t('taxId')}
                            </label>
                            <input
                                type="text"
                                value={formData.sellerTaxId}
                                onChange={(e) => setFormData({ ...formData, sellerTaxId: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                IBAN
                            </label>
                            <input
                                type="text"
                                value={formData.sellerIban}
                                onChange={(e) => setFormData({ ...formData, sellerIban: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            />
                        </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                        <button
                            onClick={handleSave}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            {editingTemplate ? t('update') : t('save')}
                        </button>
                        <button
                            onClick={() => {
                                setShowForm(false);
                                setEditingTemplate(null);
                            }}
                            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                        >
                            {t('cancel')}
                        </button>
                    </div>
                </div>
            )}

            <div className="p-4">
                {templates.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        {t('noTemplates')}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {templates.map((template) => (
                            <div
                                key={template.id}
                                className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                            >
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-medium text-gray-900 dark:text-white">
                                            {template.name}
                                        </h4>
                                        {template.is_default && (
                                            <span className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full">
                                                {t('default')}
                                            </span>
                                        )}
                                    </div>
                                    {template.description && (
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            {template.description}
                                        </p>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    {onApplyTemplate && (
                                        <button
                                            onClick={() => handleApply(template)}
                                            className="px-3 py-1.5 text-sm bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                                        >
                                            {t('apply')}
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleEdit(template)}
                                        className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                    >
                                        {t('edit')}
                                    </button>
                                    <button
                                        onClick={() => handleDelete(template.id)}
                                        className="px-3 py-1.5 text-sm bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                                    >
                                        {t('delete')}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
