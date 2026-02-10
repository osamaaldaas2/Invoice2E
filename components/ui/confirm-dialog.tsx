'use client';

import { useTranslations } from 'next-intl';
import { useConfirmState } from '@/lib/confirm-context';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';

export function ConfirmDialog() {
    const t = useTranslations('confirm');
    const { state, handleConfirm, handleCancel } = useConfirmState();

    if (!state) return null;

    const isDestructive = state.variant === 'destructive';
    const confirmLabel = state.confirmLabel || t('confirm');
    const cancelLabel = state.cancelLabel || t('cancel');

    return (
        <Dialog open={true} onOpenChange={(open) => { if (!open) handleCancel(); }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{state.title}</DialogTitle>
                    {state.description && (
                        <DialogDescription>{state.description}</DialogDescription>
                    )}
                </DialogHeader>
                <div className="flex justify-end gap-3 mt-4">
                    <button
                        type="button"
                        onClick={handleCancel}
                        className="px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 rounded-lg transition-colors"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                            isDestructive
                                ? 'bg-rose-600 text-white hover:bg-rose-700'
                                : 'bg-sky-600 text-white hover:bg-sky-700'
                        }`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
