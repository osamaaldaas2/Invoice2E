'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminProtectedRoute from '@/components/admin/AdminProtectedRoute';

interface Voucher {
    id: string;
    code: string;
    description: string | null;
    credits: number;
    isActive: boolean;
    appliesToAll: boolean;
    allowedUserIds: string[];
    maxRedemptions: number | null;
    maxRedemptionsPerUser: number | null;
    validFrom: string | null;
    validUntil: string | null;
    redemptionCount: number;
    createdAt: string;
    updatedAt: string;
}

type VoucherFormData = {
    code: string;
    description: string;
    credits: number;
    isActive: boolean;
    appliesToAll: boolean;
    allowedUsers: string;
    maxRedemptions: string;
    maxRedemptionsPerUser: string;
    validFrom: string;
    validUntil: string;
};

const defaultFormData: VoucherFormData = {
    code: '',
    description: '',
    credits: 1,
    isActive: true,
    appliesToAll: true,
    allowedUsers: '',
    maxRedemptions: '',
    maxRedemptionsPerUser: '1',
    validFrom: '',
    validUntil: '',
};

const toInputDateTime = (value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    return date.toISOString().slice(0, 16);
};

export default function AdminVouchersPage() {
    const [vouchers, setVouchers] = useState<Voucher[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [editingVoucher, setEditingVoucher] = useState<Voucher | null>(null);
    const [formData, setFormData] = useState<VoucherFormData>(defaultFormData);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);

    useEffect(() => {
        fetchVouchers();
    }, []);

    const fetchVouchers = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/admin/vouchers', { credentials: 'include' });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to fetch vouchers');
            }

            const data = await response.json();
            setVouchers(data.data.vouchers);
        } catch (err) {
            console.error('Failed to fetch vouchers:', err);
            setError(err instanceof Error ? err.message : 'Failed to load vouchers');
        } finally {
            setLoading(false);
        }
    };

    const openCreateModal = () => {
        setEditingVoucher(null);
        setFormData(defaultFormData);
        setShowModal(true);
    };

    const openEditModal = (voucher: Voucher) => {
        setEditingVoucher(voucher);
        setFormData({
            code: voucher.code,
            description: voucher.description || '',
            credits: voucher.credits,
            isActive: voucher.isActive,
            appliesToAll: voucher.appliesToAll,
            allowedUsers: voucher.allowedUserIds.join(', '),
            maxRedemptions: voucher.maxRedemptions?.toString() || '',
            maxRedemptionsPerUser: voucher.maxRedemptionsPerUser?.toString() || '',
            validFrom: toInputDateTime(voucher.validFrom),
            validUntil: toInputDateTime(voucher.validUntil),
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            setError(null);

            const url = editingVoucher
                ? `/api/admin/vouchers/${editingVoucher.id}`
                : '/api/admin/vouchers';

            const payload = {
                code: formData.code,
                description: formData.description || null,
                credits: Number(formData.credits),
                isActive: formData.isActive,
                appliesToAll: formData.appliesToAll,
                allowedUsers: formData.allowedUsers,
                maxRedemptions: formData.maxRedemptions ? Number(formData.maxRedemptions) : null,
                maxRedemptionsPerUser: formData.maxRedemptionsPerUser
                    ? Number(formData.maxRedemptionsPerUser)
                    : null,
                validFrom: formData.validFrom || null,
                validUntil: formData.validUntil || null,
            };

            const response = await fetch(url, {
                method: editingVoucher ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to save voucher');
            }

            setShowModal(false);
            fetchVouchers();
        } catch (err) {
            console.error('Save failed:', err);
            setError(err instanceof Error ? err.message : 'Failed to save voucher');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (voucher: Voucher) => {
        if (!confirm(`Are you sure you want to delete voucher "${voucher.code}"?`)) {
            return;
        }

        try {
            setDeleting(voucher.id);
            const response = await fetch(`/api/admin/vouchers/${voucher.id}`, {
                method: 'DELETE',
                credentials: 'include',
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to delete voucher');
            }

            fetchVouchers();
        } catch (err) {
            console.error('Delete failed:', err);
            setError(err instanceof Error ? err.message : 'Failed to delete voucher');
        } finally {
            setDeleting(null);
        }
    };

    const formattedDate = useMemo(
        () => (value?: string | null) => (value ? new Date(value).toLocaleString() : '—'),
        []
    );

    return (
        <AdminProtectedRoute requireSuperAdmin>
            <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-white font-display">Vouchers</h1>
                    <p className="mt-1 text-sm text-faded">
                        Create and manage redeem codes for credits
                    </p>
                </div>

                <button
                    onClick={openCreateModal}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Voucher
                </button>
            </div>

            {error && (
                <div className="glass-panel border border-rose-400/30 rounded-lg p-4 text-rose-200">
                    <p>{error}</p>
                    <button onClick={() => setError(null)} className="mt-2 text-sm text-rose-200 hover:text-rose-100">
                        Dismiss
                    </button>
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600" />
                </div>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {vouchers.map((voucher) => (
                        <div
                            key={voucher.id}
                            className={`glass-card border ${
                                voucher.isActive ? 'border-white/10' : 'border-white/5 opacity-70'
                            } overflow-hidden`}
                        >
                            <div className="p-6 space-y-4">
                                <div className="flex justify-between items-start gap-4">
                                    <div>
                                        <h3 className="text-lg font-semibold text-white font-display">
                                            {voucher.code}
                                        </h3>
                                        {voucher.description && (
                                            <p className="text-sm text-faded mt-1">{voucher.description}</p>
                                        )}
                                    </div>
                                    <span
                                        className={`px-2 py-1 text-xs font-medium rounded-full border ${
                                            voucher.isActive
                                                ? 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30'
                                                : 'bg-white/5 text-slate-300 border-white/10'
                                        }`}
                                    >
                                        {voucher.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                </div>

                                <div className="space-y-2 text-sm text-faded">
                                    <div className="flex justify-between">
                                        <span>Credits</span>
                                        <span className="text-white font-medium">{voucher.credits}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Redemptions</span>
                                        <span className="text-white font-medium">
                                            {voucher.redemptionCount}
                                            {voucher.maxRedemptions ? ` / ${voucher.maxRedemptions}` : ''}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Per User Limit</span>
                                        <span className="text-white font-medium">
                                            {voucher.maxRedemptionsPerUser ?? '∞'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Applies To</span>
                                        <span className="text-white font-medium">
                                            {voucher.appliesToAll ? 'All Users' : 'Specific Users'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Valid From</span>
                                        <span className="text-white font-medium">
                                            {formattedDate(voucher.validFrom)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Valid Until</span>
                                        <span className="text-white font-medium">
                                            {formattedDate(voucher.validUntil)}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex gap-3">
                                    <button
                                        onClick={() => openEditModal(voucher)}
                                        className="flex-1 px-4 py-2 text-slate-200 bg-white/5 rounded-lg hover:bg-white/10"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => handleDelete(voucher)}
                                        disabled={deleting === voucher.id}
                                        className="px-4 py-2 text-rose-200 glass-panel border border-rose-400/30 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50"
                                    >
                                        {deleting === voucher.id ? '...' : 'Delete'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}

                    {vouchers.length === 0 && (
                        <div className="col-span-full text-center py-12 text-faded">
                            No vouchers found. Create your first voucher to get started.
                        </div>
                    )}
                </div>
            )}

            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="glass-card p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
                        <h3 className="text-lg font-semibold text-white font-display mb-4">
                            {editingVoucher ? 'Edit Voucher' : 'Create Voucher'}
                        </h3>

                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-200 mb-1">
                                        Code *
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.code}
                                        onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                                        className="w-full px-3 py-2 border border-white/10 rounded-xl bg-slate-950/60 text-white"
                                        placeholder="WELCOME2026"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-200 mb-1">
                                        Credits *
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={formData.credits}
                                        onChange={(e) =>
                                            setFormData({ ...formData, credits: Number(e.target.value) || 1 })
                                        }
                                        className="w-full px-3 py-2 border border-white/10 rounded-xl bg-slate-950/60 text-white"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-200 mb-1">
                                    Description
                                </label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full px-3 py-2 border border-white/10 rounded-xl bg-slate-950/60 text-white"
                                    rows={2}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-200 mb-1">
                                        Max Redemptions
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={formData.maxRedemptions}
                                        onChange={(e) =>
                                            setFormData({ ...formData, maxRedemptions: e.target.value })
                                        }
                                        className="w-full px-3 py-2 border border-white/10 rounded-xl bg-slate-950/60 text-white"
                                        placeholder="Unlimited"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-200 mb-1">
                                        Max Per User
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={formData.maxRedemptionsPerUser}
                                        onChange={(e) =>
                                            setFormData({ ...formData, maxRedemptionsPerUser: e.target.value })
                                        }
                                        className="w-full px-3 py-2 border border-white/10 rounded-xl bg-slate-950/60 text-white"
                                        placeholder="Unlimited"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-200 mb-1">
                                        Valid From
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={formData.validFrom}
                                        onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
                                        className="w-full px-3 py-2 border border-white/10 rounded-xl bg-slate-950/60 text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-200 mb-1">
                                        Valid Until
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={formData.validUntil}
                                        onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                                        className="w-full px-3 py-2 border border-white/10 rounded-xl bg-slate-950/60 text-white"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-6">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.isActive}
                                        onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                                        className="w-4 h-4 text-rose-300 rounded focus:ring-rose-400/60"
                                    />
                                    <span className="text-sm text-slate-200">Active</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.appliesToAll}
                                        onChange={(e) =>
                                            setFormData({ ...formData, appliesToAll: e.target.checked })
                                        }
                                        className="w-4 h-4 text-rose-300 rounded focus:ring-rose-400/60"
                                    />
                                    <span className="text-sm text-slate-200">Applies to all users</span>
                                </label>
                            </div>

                            {!formData.appliesToAll && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-200 mb-1">
                                        Allowed Users (emails or UUIDs)
                                    </label>
                                    <textarea
                                        value={formData.allowedUsers}
                                        onChange={(e) =>
                                            setFormData({ ...formData, allowedUsers: e.target.value })
                                        }
                                        className="w-full px-3 py-2 border border-white/10 rounded-xl bg-slate-950/60 text-white"
                                        rows={2}
                                        placeholder="user@example.com, 9f3d..."
                                    />
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3 justify-end mt-6">
                            <button
                                onClick={() => setShowModal(false)}
                                className="px-4 py-2 text-slate-200 hover:bg-white/10 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={!formData.code || formData.credits < 1 || saving}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                            >
                                {saving ? 'Saving...' : editingVoucher ? 'Save Changes' : 'Create Voucher'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            </div>
        </AdminProtectedRoute>
    );
}
