'use client';

import { useEffect, useState } from 'react';
import { logger } from '@/lib/logger';

interface CreditPackage {
    id: string;
    name: string;
    description: string | null;
    credits: number;
    price: number;
    currency: string;
    isActive: boolean;
    isFeatured: boolean;
    sortOrder: number;
    createdAt: string;
    updatedAt: string;
}

type PackageFormData = {
    name: string;
    description: string;
    credits: number;
    price: number;
    currency: string;
    isActive: boolean;
    isFeatured: boolean;
    sortOrder: number;
};

const defaultFormData: PackageFormData = {
    name: '',
    description: '',
    credits: 10,
    price: 9.99,
    currency: 'EUR',
    isActive: true,
    isFeatured: false,
    sortOrder: 0,
};

export default function AdminPackagesPage() {
    const [packages, setPackages] = useState<CreditPackage[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [editingPackage, setEditingPackage] = useState<CreditPackage | null>(null);
    const [formData, setFormData] = useState<PackageFormData>(defaultFormData);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);

    useEffect(() => {
        fetchPackages();
    }, []);

    const fetchPackages = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/admin/packages', {
                credentials: 'include',
            });

            if (!response.ok) {
                throw new Error('Failed to fetch packages');
            }

            const data = await response.json();
            setPackages(data.data.packages);
        } catch (err) {
            logger.error('Failed to fetch packages', err);
            setError('Failed to load packages');
        } finally {
            setLoading(false);
        }
    };

    const openCreateModal = () => {
        setEditingPackage(null);
        setFormData(defaultFormData);
        setShowModal(true);
    };

    const openEditModal = (pkg: CreditPackage) => {
        setEditingPackage(pkg);
        setFormData({
            name: pkg.name,
            description: pkg.description || '',
            credits: pkg.credits,
            price: pkg.price,
            currency: pkg.currency,
            isActive: pkg.isActive,
            isFeatured: pkg.isFeatured,
            sortOrder: pkg.sortOrder,
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            setError(null);

            const url = editingPackage
                ? `/api/admin/packages/${editingPackage.id}`
                : '/api/admin/packages';

            const response = await fetch(url, {
                method: editingPackage ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(formData),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to save package');
            }

            setShowModal(false);
            fetchPackages();
        } catch (err) {
            logger.error('Package save failed', err);
            setError(err instanceof Error ? err.message : 'Failed to save package');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (pkg: CreditPackage) => {
        if (!confirm(`Are you sure you want to delete "${pkg.name}"? This action requires super admin privileges.`)) {
            return;
        }

        try {
            setDeleting(pkg.id);
            const response = await fetch(`/api/admin/packages/${pkg.id}`, {
                method: 'DELETE',
                credentials: 'include',
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to delete package');
            }

            fetchPackages();
        } catch (err) {
            logger.error('Package delete failed', err);
            setError(err instanceof Error ? err.message : 'Failed to delete package');
        } finally {
            setDeleting(null);
        }
    };

    const formatCurrency = (amount: number, currency: string) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency.toUpperCase(),
        }).format(amount);
    };

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-white font-display">
                        Credit Packages
                    </h1>
                    <p className="mt-1 text-sm text-faded">
                        Manage credit packages available for purchase
                    </p>
                </div>

                <button
                    onClick={openCreateModal}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Package
                </button>
            </div>

            {/* Error state */}
            {error && (
                <div className="glass-panel border border-rose-400/30 rounded-lg p-4 text-rose-200">
                    <p className="text-rose-200">{error}</p>
                    <button
                        onClick={() => setError(null)}
                        className="mt-2 text-sm text-rose-200 hover:text-rose-100"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* Loading state */}
            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600" />
                </div>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {packages.map((pkg) => (
                        <div
                            key={pkg.id}
                            className={`glass-card border ${
                                pkg.isFeatured
                                    ? 'border-red-500 ring-2 ring-red-500/20'
                                    : 'border-white/10'
                            } overflow-hidden`}
                        >
                            {/* Featured badge */}
                            {pkg.isFeatured && (
                                <div className="bg-red-600 text-white text-xs font-medium px-3 py-1 text-center">
                                    Featured
                                </div>
                            )}

                            <div className="p-6">
                                {/* Package header */}
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h3 className="text-lg font-semibold text-white font-display">
                                            {pkg.name}
                                        </h3>
                                        {pkg.description && (
                                            <p className="text-sm text-faded mt-1">
                                                {pkg.description}
                                            </p>
                                        )}
                                    </div>
                                    <span
                                        className={`px-2 py-1 text-xs font-medium rounded-full border ${
                                            pkg.isActive
                                                ? 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30'
                                                : 'bg-white/5 text-slate-300 border-white/10'
                                        }`}
                                    >
                                        {pkg.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                </div>

                                {/* Package details */}
                                <div className="space-y-3 mb-6">
                                    <div className="flex justify-between">
                                        <span className="text-faded">Credits</span>
                                        <span className="font-semibold text-white font-display">
                                            {pkg.credits}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-faded">Price</span>
                                        <span className="font-semibold text-white font-display">
                                            {formatCurrency(pkg.price, pkg.currency)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-faded">Per Credit</span>
                                        <span className="text-white font-display">
                                            {formatCurrency(pkg.price / pkg.credits, pkg.currency)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-faded">Sort Order</span>
                                        <span className="text-white font-display">{pkg.sortOrder}</span>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => openEditModal(pkg)}
                                        className="flex-1 px-4 py-2 text-slate-200 bg-white/5 rounded-lg hover:bg-white/10"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => handleDelete(pkg)}
                                        disabled={deleting === pkg.id}
                                        className="px-4 py-2 text-rose-200 glass-panel border border-rose-400/30 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50"
                                    >
                                        {deleting === pkg.id ? '...' : 'Delete'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}

                    {packages.length === 0 && (
                        <div className="col-span-full text-center py-12 text-faded">
                            No packages found. Create your first package to get started.
                        </div>
                    )}
                </div>
            )}

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="glass-card p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
                        <h3 className="text-lg font-semibold text-white font-display mb-4">
                            {editingPackage ? 'Edit Package' : 'Create Package'}
                        </h3>

                        <div className="space-y-4">
                            {/* Name */}
                            <div>
                                <label className="block text-sm font-medium text-slate-200 mb-1">
                                    Name *
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-3 py-2 border border-white/10 rounded-xl bg-slate-950/60 text-white"
                                    placeholder="e.g., Starter Pack"
                                />
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-sm font-medium text-slate-200 mb-1">
                                    Description
                                </label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full px-3 py-2 border border-white/10 rounded-xl bg-slate-950/60 text-white"
                                    rows={2}
                                    placeholder="Optional description..."
                                />
                            </div>

                            {/* Credits and Price */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-200 mb-1">
                                        Credits *
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.credits}
                                        onChange={(e) => setFormData({ ...formData, credits: parseInt(e.target.value) || 0 })}
                                        className="w-full px-3 py-2 border border-white/10 rounded-xl bg-slate-950/60 text-white"
                                        min="1"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-200 mb-1">
                                        Price *
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.price}
                                        onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                                        className="w-full px-3 py-2 border border-white/10 rounded-xl bg-slate-950/60 text-white"
                                        min="0"
                                        step="0.01"
                                    />
                                </div>
                            </div>

                            {/* Currency and Sort Order */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-200 mb-1">
                                        Currency
                                    </label>
                                    <select
                                        value={formData.currency}
                                        onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                                        className="w-full px-3 py-2 border border-white/10 rounded-xl bg-slate-950/60 text-white"
                                    >
                                        <option value="EUR">EUR</option>
                                        <option value="USD">USD</option>
                                        <option value="GBP">GBP</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-200 mb-1">
                                        Sort Order
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.sortOrder}
                                        onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                                        className="w-full px-3 py-2 border border-white/10 rounded-xl bg-slate-950/60 text-white"
                                    />
                                </div>
                            </div>

                            {/* Toggles */}
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
                                        checked={formData.isFeatured}
                                        onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
                                        className="w-4 h-4 text-rose-300 rounded focus:ring-rose-400/60"
                                    />
                                    <span className="text-sm text-slate-200">Featured</span>
                                </label>
                            </div>
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
                                disabled={!formData.name || formData.credits < 1 || formData.price < 0 || saving}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                            >
                                {saving ? 'Saving...' : editingPackage ? 'Save Changes' : 'Create Package'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
