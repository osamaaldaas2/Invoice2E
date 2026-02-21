import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SignJWT } from 'jose';

// Fail fast in production if critical secrets are missing
if (process.env.NODE_ENV === 'production' && !process.env.SUPABASE_JWT_SECRET) {
  throw new Error(
    'CRITICAL: SUPABASE_JWT_SECRET is not set. ' +
      'User-scoped routes will fail. Get from: Supabase Dashboard → Settings → API → JWT Secret'
  );
}

let adminClient: SupabaseClient | null = null;

const getSupabaseUrl = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  }
  return url;
};

/**
 * F1: Admin client using service-role key.
 * BYPASSES RLS - Use ONLY for admin operations, background jobs, or system-level tasks.
 * NEVER use for user-facing data access.
 *
 * Connection pooling: Supabase cloud uses Supavisor (connection pooler) by default.
 * The SUPABASE_URL automatically routes through the pooler. For serverless (Vercel),
 * each function invocation creates a new client, which is appropriate as Supavisor
 * handles pooling server-side. See docs/SECURITY_DECISIONS.md AR-19.
 */
export const createAdminClient = (): SupabaseClient => {
  if (adminClient) {
    return adminClient;
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  }

  adminClient = createClient(getSupabaseUrl(), serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  return adminClient;
};

/**
 * F1: User-scoped client with Supabase-compatible JWT.
 * Respects RLS policies - auth.uid() returns the provided userId.
 * Use for all user-facing data access to ensure proper isolation.
 *
 * @param userId - The user's UUID to scope the session to
 * @returns Supabase client with user-scoped JWT
 */
export const createUserScopedClient = async (userId: string): Promise<SupabaseClient> => {
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('Missing SUPABASE_JWT_SECRET - Required for RLS-based data isolation');
  }

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  // Sign a Supabase-compatible JWT with the user's ID
  // JWT structure must match Supabase's expected claims
  const secret = new TextEncoder().encode(jwtSecret);
  const jwt = await new SignJWT({
    sub: userId,
    role: 'authenticated',
    aud: 'authenticated',
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('15m') // Short-lived: 15 minutes
    .sign(secret);

  // Create client with the signed JWT as the access token
  const client = createClient(getSupabaseUrl(), anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    },
  });

  return client;
};

// FIX: Re-audit #10 — deleted deprecated createUserClient() export.
// It created a client WITHOUT user scoping, bypassing RLS tenant isolation.
// Use createUserScopedClient(userId) for all user-facing data access.
