import type { AuthenticatedUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { createServerClient } from '@/lib/supabase.server';

type ResolvedUserIds = {
    primaryUserId: string | null;
    batchOwnerIds: string[];
};

const addUniqueId = (list: string[], value: string | null | undefined): void => {
    if (!value) {
        return;
    }
    if (!list.includes(value)) {
        list.push(value);
    }
};

/**
 * Resolves user IDs across public.users and auth.users.
 * - primaryUserId: canonical app user (public.users) used by credits and invoice data
 * - batchOwnerIds: candidates for batch_jobs ownership (supports legacy FK targets)
 */
export async function resolveUserIds(user: AuthenticatedUser): Promise<ResolvedUserIds> {
    const supabase = createServerClient();
    const normalizedEmail = user.email?.trim().toLowerCase() || '';

    let publicById: string | null = null;
    let publicByEmail: string | null = null;
    let authById: string | null = null;
    let authByEmail: string | null = null;

    const { data: publicIdData, error: publicIdError } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

    if (publicIdError) {
        logger.warn('Failed to resolve public user by id', {
            userId: user.id,
            error: publicIdError.message,
        });
    } else {
        publicById = (publicIdData?.id as string | undefined) || null;
    }

    if (normalizedEmail) {
        const { data: publicEmailData, error: publicEmailError } = await supabase
            .from('users')
            .select('id')
            .eq('email', normalizedEmail)
            .maybeSingle();

        if (publicEmailError) {
            logger.warn('Failed to resolve public user by email', {
                userId: user.id,
                error: publicEmailError.message,
            });
        } else {
            publicByEmail = (publicEmailData?.id as string | undefined) || null;
        }
    }

    // auth.users lookup is best-effort for compatibility with legacy batch_jobs FK targets.
    try {
        const { data: authIdData } = await supabase
            .schema('auth')
            .from('users')
            .select('id')
            .eq('id', user.id)
            .maybeSingle();
        authById = (authIdData?.id as string | undefined) || null;
    } catch (error) {
        logger.debug('auth.users id lookup unavailable', {
            userId: user.id,
            error: error instanceof Error ? error.message : String(error),
        });
    }

    if (normalizedEmail) {
        try {
            const { data: authEmailData } = await supabase
                .schema('auth')
                .from('users')
                .select('id')
                .eq('email', normalizedEmail)
                .maybeSingle();
            authByEmail = (authEmailData?.id as string | undefined) || null;
        } catch (error) {
            logger.debug('auth.users email lookup unavailable', {
                userId: user.id,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    const primaryUserId = publicById || publicByEmail || null;
    const batchOwnerIds: string[] = [];

    addUniqueId(batchOwnerIds, primaryUserId);
    addUniqueId(batchOwnerIds, user.id);
    addUniqueId(batchOwnerIds, publicById);
    addUniqueId(batchOwnerIds, publicByEmail);
    addUniqueId(batchOwnerIds, authById);
    addUniqueId(batchOwnerIds, authByEmail);

    return {
        primaryUserId,
        batchOwnerIds,
    };
}
