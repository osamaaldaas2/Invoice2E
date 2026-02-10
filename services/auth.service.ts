import { createServerClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import { AppError, ValidationError, UnauthorizedError, ForbiddenError } from '@/lib/errors';
import { SignupSchema, LoginSchema } from '@/lib/validators';
import { UserRole } from '@/types/index';
import { DEFAULT_CREDITS_ON_SIGNUP } from '@/lib/constants';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

type SignupData = {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    postalCode: string;
    country: string;
    phone: string;
};

type LoginData = {
    email: string;
    password: string;
};

type AuthUser = {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    language: string;
};

type DbUser = {
    id: string;
    email: string;
    password_hash: string;
    first_name: string;
    last_name: string;
    language: string;
    role: UserRole;
    is_banned: boolean;
    banned_at: string | null;
    banned_reason: string | null;
    last_login_at: string | null;
    login_count: number;
    created_at: string;
    updated_at: string;
};

/**
 * Authentication service with bcrypt password hashing
 * Follows CONSTITUTION rules for error handling and logging
 */
export class AuthService {
    private readonly SALT_ROUNDS = 10;

    private getSupabase() {
        return createServerClient();
    }

    async signup(data: SignupData): Promise<AuthUser> {
        // Validate input with Zod
        const validated = SignupSchema.parse(data);
        const normalizedEmail = validated.email.trim().toLowerCase();
        const normalizedCountry = validated.country.trim().toUpperCase();

        // Check if user exists
        const existingUser = await this.getUserByEmail(normalizedEmail);
        if (existingUser) {
            throw new ValidationError('Email already registered');
        }

        // Hash password
        const passwordHash = await bcrypt.hash(validated.password, this.SALT_ROUNDS);

        const supabase = this.getSupabase();

        // Create user in database
        const { data: user, error } = await supabase
            .from('users')
            .insert([
                {
                    email: normalizedEmail,
                    password_hash: passwordHash,
                    first_name: validated.firstName,
                    last_name: validated.lastName,
                    address_line1: validated.addressLine1,
                    address_line2: validated.addressLine2 || null,
                    city: validated.city,
                    postal_code: validated.postalCode,
                    country: normalizedCountry,
                    phone: validated.phone,
                    language: 'en',
                },
            ])
            .select()
            .single();

        if (error) {
            // FIX-008: Catch unique constraint violation from concurrent signups
            if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('unique')) {
                throw new ValidationError('Email already registered');
            }
            logger.error('Signup database error', { error: error.message, code: error.code });
            throw new AppError('DB_ERROR', 'Failed to create user', 500);
        }

        // Create initial credits - FIX (BUG-018): Rollback user creation if this fails
        // FIX (QA-BUG-8): Use DEFAULT_CREDITS_ON_SIGNUP constant instead of hardcoded 0
        const { error: creditsError } = await supabase.from('user_credits').insert([
            {
                user_id: user.id,
                available_credits: DEFAULT_CREDITS_ON_SIGNUP,
                used_credits: 0,
            },
        ]);

        if (creditsError) {
            logger.error('Failed to create user credits, rolling back user creation', {
                userId: user.id,
                error: creditsError.message
            });

            // Rollback: Delete the user since they can't function without a credits record
            const { error: deleteError } = await supabase
                .from('users')
                .delete()
                .eq('id', user.id);

            if (deleteError) {
                logger.error('Failed to rollback user creation', {
                    userId: user.id,
                    error: deleteError.message
                });
            }

            throw new AppError('DB_ERROR', 'Failed to complete signup. Please try again.', 500);
        }

        logger.info('User signed up successfully', { userId: user.id, email: user.email });

        return {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            role: 'user', // New users always start as regular users
            language: 'en',
        };
    }

    async login(data: LoginData): Promise<AuthUser> {
        // Validate input with Zod
        const validated = LoginSchema.parse(data);
        const normalizedEmail = validated.email.trim().toLowerCase();

        // Get user
        const user = await this.getUserByEmail(normalizedEmail);
        if (!user) {
            throw new UnauthorizedError('Invalid email or password');
        }

        // Check if user is banned
        if (user.is_banned) {
            logger.warn('Banned user attempted login', {
                userId: user.id,
                email: user.email,
                bannedReason: user.banned_reason,
            });
            throw new ForbiddenError('Your account has been suspended');
        }

        // Verify password
        const passwordMatch = await bcrypt.compare(validated.password, user.password_hash);
        if (!passwordMatch) {
            throw new UnauthorizedError('Invalid email or password');
        }

        // Update login stats
        await this.updateLoginStats(user.id);

        logger.info('User logged in', {
            userId: user.id,
            email: user.email,
            role: user.role || 'user',
        });

        return {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            role: user.role || 'user',
            language: user.language || 'en',
        };
    }

    /**
     * Update last_login_at and increment login_count
     * FIX (QA-BUG-1): Fixed incorrect conditional that always set login_count to undefined
     */
    private async updateLoginStats(userId: string): Promise<void> {
        try {
            const supabase = this.getSupabase();

            // Try to use the RPC function if available
            const { error: rpcError } = await supabase.rpc('increment_login_count', {
                p_user_id: userId,
            });

            if (rpcError) {
                // FIX-007: Use optimistic lock to prevent lost updates on concurrent logins
                const { data: currentUser } = await supabase
                    .from('users')
                    .select('login_count')
                    .eq('id', userId)
                    .single();

                const currentCount = currentUser?.login_count ?? 0;

                const { error: updateError } = await supabase
                    .from('users')
                    .update({
                        last_login_at: new Date().toISOString(),
                        login_count: currentCount + 1,
                    })
                    .eq('id', userId)
                    .eq('login_count', currentCount);

                if (updateError) {
                    // Concurrent login detected, just update timestamp
                    await supabase
                        .from('users')
                        .update({ last_login_at: new Date().toISOString() })
                        .eq('id', userId);
                }
            }
        } catch (error) {
            // Don't fail login if stats update fails
            logger.warn('Failed to update login stats', { userId, error });
        }
    }

    async getUserByEmail(email: string): Promise<DbUser | null> {
        const supabase = this.getSupabase();
        const normalizedEmail = email.trim().toLowerCase();

        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', normalizedEmail)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return null;
            }
            logger.error('Get user by email error', { email, error: error.message });
            throw new AppError('DB_ERROR', 'Database query failed', 500);
        }

        return data as DbUser;
    }

    async getUserById(userId: string): Promise<DbUser> {
        const supabase = this.getSupabase();

        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) {
            logger.error('Get user by id error', { userId, error: error.message });
            throw new AppError('NOT_FOUND', 'User not found', 404);
        }

        return data as DbUser;
    }

    async verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
        return bcrypt.compare(plainPassword, hashedPassword);
    }

    async hashPassword(password: string): Promise<string> {
        return bcrypt.hash(password, this.SALT_ROUNDS);
    }

    /**
     * Request a password reset. Always returns success to prevent email enumeration.
     */
    async requestPasswordReset(email: string): Promise<void> {
        const normalizedEmail = email.trim().toLowerCase();
        const user = await this.getUserByEmail(normalizedEmail);

        if (!user) {
            // Don't reveal whether email exists — silently succeed
            logger.info('Password reset requested for unknown email', { email: normalizedEmail });
            return;
        }

        // Generate a secure random token
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        const supabase = this.getSupabase();

        // Invalidate any existing tokens for this user
        await supabase
            .from('password_reset_tokens')
            .delete()
            .eq('user_id', user.id);

        // Store the hashed token
        const { error } = await supabase.from('password_reset_tokens').insert({
            user_id: user.id,
            token_hash: tokenHash,
            expires_at: expiresAt.toISOString(),
        });

        if (error) {
            logger.error('Failed to store password reset token', { userId: user.id, error: error.message });
            throw new AppError('DB_ERROR', 'Failed to process password reset request', 500);
        }

        logger.info('Password reset token created', { userId: user.id });

        // Return the plain token so the caller can send it via email
        // The emailService call is handled by the API route, not here
        return;
    }

    /**
     * Generate a password reset token and return it (for the API route to email).
     */
    async createPasswordResetToken(email: string): Promise<{ token: string; userName: string } | null> {
        const normalizedEmail = email.trim().toLowerCase();
        const user = await this.getUserByEmail(normalizedEmail);

        if (!user) {
            return null;
        }

        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        const supabase = this.getSupabase();

        // Invalidate existing tokens
        await supabase
            .from('password_reset_tokens')
            .delete()
            .eq('user_id', user.id);

        const { error } = await supabase.from('password_reset_tokens').insert({
            user_id: user.id,
            token_hash: tokenHash,
            expires_at: expiresAt.toISOString(),
        });

        if (error) {
            logger.error('Failed to store password reset token', { userId: user.id, error: error.message });
            throw new AppError('DB_ERROR', 'Failed to process password reset request', 500);
        }

        logger.info('Password reset token created', { userId: user.id });
        return { token, userName: user.first_name };
    }

    /**
     * Validate a reset token. Returns userId if valid.
     */
    async validateResetToken(token: string): Promise<{ userId: string } | null> {
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const supabase = this.getSupabase();

        const { data, error } = await supabase
            .from('password_reset_tokens')
            .select('id, user_id, expires_at, used_at')
            .eq('token_hash', tokenHash)
            .single();

        if (error || !data) {
            return null;
        }

        // Check if already used
        if (data.used_at) {
            return null;
        }

        // Check if expired
        if (new Date(data.expires_at) < new Date()) {
            return null;
        }

        return { userId: data.user_id };
    }

    /**
     * Reset password using a valid token.
     */
    async resetPassword(token: string, newPassword: string): Promise<void> {
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const supabase = this.getSupabase();

        // Validate token
        const { data: tokenData, error: tokenError } = await supabase
            .from('password_reset_tokens')
            .select('id, user_id, expires_at, used_at')
            .eq('token_hash', tokenHash)
            .single();

        if (tokenError || !tokenData) {
            throw new ValidationError('Invalid or expired reset link');
        }

        if (tokenData.used_at) {
            throw new ValidationError('This reset link has already been used');
        }

        if (new Date(tokenData.expires_at) < new Date()) {
            throw new ValidationError('This reset link has expired');
        }

        // Hash new password
        const passwordHash = await bcrypt.hash(newPassword, this.SALT_ROUNDS);

        // Update user password
        const { error: updateError } = await supabase
            .from('users')
            .update({ password_hash: passwordHash, updated_at: new Date().toISOString() })
            .eq('id', tokenData.user_id);

        if (updateError) {
            logger.error('Failed to update password', { userId: tokenData.user_id, error: updateError.message });
            throw new AppError('DB_ERROR', 'Failed to reset password', 500);
        }

        // Mark token as used
        await supabase
            .from('password_reset_tokens')
            .update({ used_at: new Date().toISOString() })
            .eq('id', tokenData.id);

        // Invalidate all other tokens for this user
        await supabase
            .from('password_reset_tokens')
            .delete()
            .eq('user_id', tokenData.user_id)
            .neq('id', tokenData.id);

        logger.info('Password reset successful', { userId: tokenData.user_id });
    }
}

// Export singleton instance
export const authService = new AuthService();
