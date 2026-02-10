'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export type ConfirmOptions = {
    title: string;
    description?: string;
    variant?: 'default' | 'destructive';
    confirmLabel?: string;
    cancelLabel?: string;
};

type ConfirmState = ConfirmOptions & {
    resolve: (value: boolean) => void;
};

type ConfirmContextType = {
    state: ConfirmState | null;
    confirm: (options: ConfirmOptions) => Promise<boolean>;
    handleConfirm: () => void;
    handleCancel: () => void;
};

const ConfirmContext = createContext<ConfirmContextType | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<ConfirmState | null>(null);

    const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
        return new Promise<boolean>((resolve) => {
            setState({ ...options, resolve });
        });
    }, []);

    const handleConfirm = useCallback(() => {
        state?.resolve(true);
        setState(null);
    }, [state]);

    const handleCancel = useCallback(() => {
        state?.resolve(false);
        setState(null);
    }, [state]);

    return (
        <ConfirmContext.Provider value={{ state, confirm, handleConfirm, handleCancel }}>
            {children}
        </ConfirmContext.Provider>
    );
}

export function useConfirm() {
    const context = useContext(ConfirmContext);
    if (!context) {
        throw new Error('useConfirm must be used within a ConfirmProvider');
    }
    return context.confirm;
}

export function useConfirmState() {
    const context = useContext(ConfirmContext);
    if (!context) {
        throw new Error('useConfirmState must be used within a ConfirmProvider');
    }
    return context;
}
