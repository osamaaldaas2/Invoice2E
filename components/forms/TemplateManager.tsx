'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useConfirm } from '@/lib/confirm-context';
import { useToast } from '@/lib/toast-context';

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
    const tConfirm = useTranslations('confirm');
    const confirm = useConfirm();
    const { toast } = useToast();
    const [templates, setTemplates] = useState<Template[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
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
            toast({ title: 'Failed to load templates', variant: 'error' });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTemplates();
    }, [fetchTemplates]);

    const handleSave = async () => {
        try {
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
            toast({ title: editingTemplate ? 'Template updated' : 'Template saved', variant: 'success' });
        } catch (err) {
            toast({ title: err instanceof Error ? err.message : 'Failed to save', variant: 'error' });
        }
    };

    const handleDelete = async (id: string) => {
        const confirmed = await confirm({
            title: tConfirm('deleteTitle'),
            description: t('confirmDelete'),
            variant: 'destructive',
            confirmLabel: t('delete'),
        });
        if (!confirmed) return;

        try {
            await fetch(`/api/invoices/templates/${id}`, { method: 'DELETE' });
            await fetchTemplates();
            toast({ title: 'Template deleted', variant: 'success' });
        } catch {
            toast({ title: 'Failed to delete template', variant: 'error' });
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
            <div className="glass-card p-6">
                <div className="animate-pulse space-y-4">
                    <div className="h-8 bg-white/10 rounded w-1/4"></div>
                    <div className="h-24 bg-white/10 rounded"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="glass-card">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white font-display">
                    {t('title')}
                </h3>
                <button
                    type="button"
                    onClick={() => {
                        setShowForm(true);
                        setEditingTemplate(null);
                    }}
                    className="nav-pill nav-pill-active"
                >
                    {t('newTemplate')}
                </button>
            </div>

            {showForm && (
                <div className="p-4 border-b border-white/10 bg-white/5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">
                                {t('templateName')} *
                            </label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-3 py-2 rounded-xl bg-slate-950/60 border border-white/10 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400/60"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">
                                {t('description')}
                            </label>
                            <input
                                type="text"
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                className="w-full px-3 py-2 rounded-xl bg-slate-950/60 border border-white/10 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400/60"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">
                                {t('sellerName')}
                            </label>
                            <input
                                type="text"
                                value={formData.sellerName}
                                onChange={(e) => setFormData({ ...formData, sellerName: e.target.value })}
                                className="w-full px-3 py-2 rounded-xl bg-slate-950/60 border border-white/10 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400/60"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">
                                {t('sellerEmail')}
                            </label>
                            <input
                                type="email"
                                value={formData.sellerEmail}
                                onChange={(e) => setFormData({ ...formData, sellerEmail: e.target.value })}
                                className="w-full px-3 py-2 rounded-xl bg-slate-950/60 border border-white/10 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400/60"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">
                                {t('taxId')}
                            </label>
                            <input
                                type="text"
                                value={formData.sellerTaxId}
                                onChange={(e) => setFormData({ ...formData, sellerTaxId: e.target.value })}
                                className="w-full px-3 py-2 rounded-xl bg-slate-950/60 border border-white/10 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400/60"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">
                                IBAN
                            </label>
                            <input
                                type="text"
                                value={formData.sellerIban}
                                onChange={(e) => setFormData({ ...formData, sellerIban: e.target.value })}
                                className="w-full px-3 py-2 rounded-xl bg-slate-950/60 border border-white/10 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400/60"
                            />
                        </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                        <button
                            type="button"
                            onClick={handleSave}
                            className="nav-pill nav-pill-active"
                        >
                            {editingTemplate ? t('update') : t('save')}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setShowForm(false);
                                setEditingTemplate(null);
                            }}
                            className="nav-pill"
                        >
                            {t('cancel')}
                        </button>
                    </div>
                </div>
            )}

            <div className="p-4">
                {templates.length === 0 ? (
                    <div className="text-center py-8 text-faded">
                        {t('noTemplates')}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {templates.map((template) => (
                            <div
                                key={template.id}
                                className="flex items-center justify-between p-4 border border-white/10 rounded-xl hover:bg-white/5 transition-colors"
                            >
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-medium text-white">
                                            {template.name}
                                        </h4>
                                        {template.is_default && (
                                            <span className="chip">
                                                {t('default')}
                                            </span>
                                        )}
                                    </div>
                                    {template.description && (
                                        <p className="text-sm text-faded">
                                            {template.description}
                                        </p>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    {onApplyTemplate && (
                                        <button
                                            type="button"
                                            onClick={() => handleApply(template)}
                                            className="px-3 py-1.5 text-sm rounded-full border border-emerald-400/30 text-emerald-200 bg-emerald-500/15 hover:bg-emerald-500/25 transition-colors"
                                        >
                                            {t('apply')}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => handleEdit(template)}
                                        className="px-3 py-1.5 text-sm rounded-full border border-white/10 text-slate-200 bg-white/5 hover:bg-white/10 transition-colors"
                                    >
                                        {t('edit')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(template.id)}
                                        className="px-3 py-1.5 text-sm rounded-full border border-rose-400/30 text-rose-200 bg-rose-500/15 hover:bg-rose-500/25 transition-colors"
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
