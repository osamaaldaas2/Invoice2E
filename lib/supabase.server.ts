import { createClient } from '@supabase/supabase-js';

let serverClient: any = null;
let userClient: any = null;

const getSupabaseUrl = () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) {
        throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
    }
    return url;
};

const buildClient = (key: string): any =>
    createClient(getSupabaseUrl(), key, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false,
        },
    }) as any;

/**
 * Server-side admin client.
 * This app uses custom JWT sessions, not Supabase Auth cookies.
 */
export const createServerClient = (): any => {
    if (serverClient) {
        return serverClient;
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
        throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
    }

    serverClient = buildClient(serviceRoleKey);
    return serverClient;
};

/**
 * User-scoped helper for existing call sites.
 * Falls back to service role for server routes that rely on custom auth.
 */
export const createUserClient = (): any => {
    if (userClient) {
        return userClient;
    }

    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) {
        throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY');
    }

    userClient = buildClient(key);
    return userClient;
};
