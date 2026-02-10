'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export type Toast = {
    id: string;
    title: string;
    description?: string;
    variant: ToastVariant;
};

type ToastOptions = {
    title: string;
    description?: string;
    variant?: ToastVariant;
    duration?: number;
};

type ToastContextType = {
    toasts: Toast[];
    toast: (options: ToastOptions) => void;
    dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextType | null>(null);

let toastCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const dismiss = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const toast = useCallback((options: ToastOptions) => {
        const id = `toast-${++toastCounter}`;
        const newToast: Toast = {
            id,
            title: options.title,
            description: options.description,
            variant: options.variant || 'info',
        };

        setToasts((prev) => [...prev, newToast]);

        const duration = options.duration ?? 5000;
        if (duration > 0) {
            setTimeout(() => dismiss(id), duration);
        }
    }, [dismiss]);

    return (
        <ToastContext.Provider value={{ toasts, toast, dismiss }}>
            {children}
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}
