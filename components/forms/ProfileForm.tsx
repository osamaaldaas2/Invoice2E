'use client';

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { emitAuthChanged } from '@/lib/client-auth';

type ProfileFormData = {
    firstName: string;
    lastName: string;
    email: string;
    addressStreet: string;
    addressPostalCode: string;
    addressCity: string;
    addressCountry: string;
    phone: string;
    taxId: string;
    language: 'en' | 'de';
};

const emptyForm: ProfileFormData = {
    firstName: '',
    lastName: '',
    email: '',
    addressStreet: '',
    addressPostalCode: '',
    addressCity: '',
    addressCountry: 'DE',
    phone: '',
    taxId: '',
    language: 'en',
};

export default function ProfileForm() {
    const t = useTranslations('profile');
    const [form, setForm] = useState<ProfileFormData>(emptyForm);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        const loadProfile = async () => {
            try {
                const response = await fetch('/api/users/profile');
                if (!response.ok) {
                    throw new Error('Failed to load profile');
                }
                const data = await response.json();
                const profile = data?.data || {};

                setForm({
                    firstName: profile.firstName ?? '',
                    lastName: profile.lastName ?? '',
                    email: profile.email ?? '',
                    addressStreet: profile.addressStreet ?? '',
                    addressPostalCode: profile.addressPostalCode ?? '',
                    addressCity: profile.addressCity ?? '',
                    addressCountry: (profile.addressCountry ?? 'DE').toUpperCase(),
                    phone: profile.phone ?? '',
                    taxId: profile.taxId ?? '',
                    language: profile.language === 'de' ? 'de' : 'en',
                });
            } catch {
                setError(t('loadError'));
            } finally {
                setLoading(false);
            }
        };

        loadProfile();
    }, [t]);

    const updateField = (field: keyof ProfileFormData) => (
        event: ChangeEvent<HTMLInputElement | HTMLSelectElement>
    ) => {
        setForm((prev) => ({
            ...prev,
            [field]: field === 'addressCountry'
                ? event.target.value.toUpperCase()
                : event.target.value,
        }));
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setError('');
        setSuccess('');

        try {
            const normalizedCountry = form.addressCountry.trim().toUpperCase();
            const response = await fetch('/api/users/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    firstName: form.firstName,
                    lastName: form.lastName,
                    addressStreet: form.addressStreet,
                    addressPostalCode: form.addressPostalCode,
                    addressCity: form.addressCity,
                    addressCountry: normalizedCountry || undefined,
                    phone: form.phone,
                    taxId: form.taxId,
                    language: form.language,
                }),
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data?.error || t('saveError'));
            }

            setSuccess(t('saveSuccess'));

            emitAuthChanged();
            window.dispatchEvent(new Event('profile-updated'));
        } catch (err) {
            setError(err instanceof Error ? err.message : t('saveError'));
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="glass-card p-6">
                <div className="animate-pulse space-y-4">
                    <div className="h-5 bg-white/10 rounded w-1/3" />
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="h-10 bg-white/10 rounded" />
                        <div className="h-10 bg-white/10 rounded" />
                        <div className="md:col-span-2 h-10 bg-white/10 rounded" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="glass-card p-6 space-y-6">
            <div>
                <h2 className="text-lg font-semibold text-white font-display">
                    {t('sectionAccount')}
                </h2>
                <p className="text-sm text-faded mt-1">{t('sectionAccountHint')}</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <div>
                    <label className="block text-sm text-slate-300 mb-1">{t('firstName')}</label>
                    <Input value={form.firstName} onChange={updateField('firstName')} required />
                </div>
                <div>
                    <label className="block text-sm text-slate-300 mb-1">{t('lastName')}</label>
                    <Input value={form.lastName} onChange={updateField('lastName')} required />
                </div>
                <div className="md:col-span-2">
                    <label className="block text-sm text-slate-300 mb-1">{t('email')}</label>
                    <Input value={form.email} disabled />
                </div>
                <div>
                    <label className="block text-sm text-slate-300 mb-1">{t('phone')}</label>
                    <Input value={form.phone} onChange={updateField('phone')} />
                </div>
                <div>
                    <label className="block text-sm text-slate-300 mb-1">{t('language')}</label>
                    <select
                        className="w-full h-10 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950/60"
                        value={form.language}
                        onChange={updateField('language')}
                    >
                        <option value="en">{t('languageEn')}</option>
                        <option value="de">{t('languageDe')}</option>
                    </select>
                </div>
            </div>

            <div className="border-t border-white/10 pt-6">
                <h2 className="text-lg font-semibold text-white font-display">
                    {t('sectionAddress')}
                </h2>
                <p className="text-sm text-faded mt-1">{t('sectionAddressHint')}</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                    <label className="block text-sm text-slate-300 mb-1">{t('addressStreet')}</label>
                    <Input value={form.addressStreet} onChange={updateField('addressStreet')} />
                </div>
                <div>
                    <label className="block text-sm text-slate-300 mb-1">{t('addressPostalCode')}</label>
                    <Input value={form.addressPostalCode} onChange={updateField('addressPostalCode')} />
                </div>
                <div>
                    <label className="block text-sm text-slate-300 mb-1">{t('addressCity')}</label>
                    <Input value={form.addressCity} onChange={updateField('addressCity')} />
                </div>
                <div>
                    <label className="block text-sm text-slate-300 mb-1">{t('addressCountry')}</label>
                    <Input value={form.addressCountry} onChange={updateField('addressCountry')} />
                </div>
                <div>
                    <label className="block text-sm text-slate-300 mb-1">{t('taxId')}</label>
                    <Input value={form.taxId} onChange={updateField('taxId')} />
                </div>
            </div>

            {error && (
                <div className="p-3 glass-panel border border-rose-400/30 rounded-xl text-rose-200 text-sm">
                    {error}
                </div>
            )}

            {success && (
                <div className="p-3 glass-panel border border-emerald-400/30 rounded-xl text-emerald-200 text-sm">
                    {success}
                </div>
            )}

            <div className="flex items-center justify-end">
                <Button type="submit" disabled={saving}>
                    {saving ? t('saving') : t('save')}
                </Button>
            </div>
        </form>
    );
}
