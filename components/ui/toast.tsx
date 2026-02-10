'use client';

import { useEffect, useState } from 'react';
import { useToast, type Toast, type ToastVariant } from '@/lib/toast-context';

const variantStyles: Record<ToastVariant, string> = {
    success: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100',
    error: 'border-rose-400/30 bg-rose-500/10 text-rose-100',
    info: 'border-sky-400/30 bg-sky-500/10 text-sky-100',
    warning: 'border-amber-400/30 bg-amber-500/10 text-amber-100',
};

const variantIcons: Record<ToastVariant, string> = {
    success: '✓',
    error: '✕',
    info: 'i',
    warning: '!',
};

const variantIconBg: Record<ToastVariant, string> = {
    success: 'bg-emerald-500/20 text-emerald-300',
    error: 'bg-rose-500/20 text-rose-300',
    info: 'bg-sky-500/20 text-sky-300',
    warning: 'bg-amber-500/20 text-amber-300',
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        // Trigger enter animation
        const frame = requestAnimationFrame(() => setVisible(true));
        return () => cancelAnimationFrame(frame);
    }, []);

    return (
        <div
            role="alert"
            aria-live="polite"
            className={`
                flex items-start gap-3 px-4 py-3 rounded-xl border backdrop-blur-xl
                shadow-lg transition-all duration-300 min-w-[min(300px,calc(100vw-2rem))] max-w-[min(420px,calc(100vw-2rem))]
                ${variantStyles[toast.variant]}
                ${visible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
            `}
        >
            <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${variantIconBg[toast.variant]}`}>
                {variantIcons[toast.variant]}
            </span>
            <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{toast.title}</p>
                {toast.description && (
                    <p className="text-xs mt-0.5 opacity-80">{toast.description}</p>
                )}
            </div>
            <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity text-sm"
                aria-label="Dismiss"
            >
                ✕
            </button>
        </div>
    );
}

export function ToastContainer() {
    const { toasts, dismiss } = useToast();

    if (toasts.length === 0) return null;

    return (
        <div
            className="fixed top-4 right-2 sm:right-4 z-[100] flex flex-col gap-2 max-w-[calc(100vw-1rem)] sm:max-w-none"
            aria-label="Notifications"
        >
            {toasts.map((t) => (
                <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
            ))}
        </div>
    );
}
