'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchSessionUser, type SessionUser } from '@/lib/client-auth';

type UserContextType = {
    user: SessionUser | null;
    loading: boolean;
    refreshUser: () => Promise<void>;
};

const UserContext = createContext<UserContextType | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<SessionUser | null>(null);
    const [loading, setLoading] = useState(true);

    const refreshUser = useCallback(async () => {
        try {
            const sessionUser = await fetchSessionUser();
            setUser(sessionUser);
        } catch {
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch user on mount
    useEffect(() => {
        void refreshUser();
    }, [refreshUser]);

    // Listen for auth/profile change events
    useEffect(() => {
        const handle = () => void refreshUser();
        window.addEventListener('auth-changed', handle);
        window.addEventListener('profile-updated', handle);
        return () => {
            window.removeEventListener('auth-changed', handle);
            window.removeEventListener('profile-updated', handle);
        };
    }, [refreshUser]);

    return (
        <UserContext.Provider value={{ user, loading, refreshUser }}>
            {children}
        </UserContext.Provider>
    );
}

export function useUser() {
    const context = useContext(UserContext);
    if (!context) {
        throw new Error('useUser must be used within a UserProvider');
    }
    return context;
}
