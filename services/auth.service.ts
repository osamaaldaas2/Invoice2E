import { createServerClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import { AppError, ValidationError, UnauthorizedError, ForbiddenError } from '@/lib/errors';
import { SignupSchema, LoginSchema } from '@/lib/validators';
import { UserRole } from '@/types/index';
import { DEFAULT_CREDITS_ON_SIGNUP } from '@/lib/constants';
import bcrypt from 'bcrypt';

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
            logger.error('Signup database error', { error: error.message });
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
                // Fallback to direct update if RPC not available
                // First get current login_count to increment it
                const { data: currentUser } = await supabase
                    .from('users')
                    .select('login_count')
                    .eq('id', userId)
                    .single();

                const currentCount = currentUser?.login_count ?? 0;

                await supabase
                    .from('users')
                    .update({
                        last_login_at: new Date().toISOString(),
                        login_count: currentCount + 1,
                    })
                    .eq('id', userId);
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
}

// Export singleton instance
export const authService = new AuthService();
