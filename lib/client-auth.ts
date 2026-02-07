'use client';

export type SessionUser = {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role?: string;
};

type AuthMeResponse = {
    success?: boolean;
    data?: SessionUser;
    error?: string;
};

export async function fetchSessionUser(): Promise<SessionUser | null> {
    const response = await fetch('/api/auth/me', {
        credentials: 'include',
        cache: 'no-store',
    });

    if (response.status === 401) {
        return null;
    }

    if (!response.ok) {
        throw new Error('Failed to validate session');
    }

    const payload = (await response.json()) as AuthMeResponse;
    return payload.data ?? null;
}

export function emitAuthChanged(): void {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('auth-changed'));
    }
}
