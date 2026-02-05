import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@/lib/supabase.server', () => ({
    createServerClient: vi.fn(() => ({
        from: vi.fn(() => ({
            insert: vi.fn(() => ({
                select: vi.fn(() => ({
                    single: vi.fn(() => Promise.resolve({ data: null, error: null })),
                })),
            })),
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    single: vi.fn(() => Promise.resolve({ data: null, error: { code: 'PGRST116' } })),
                })),
            })),
        })),
    })),
}));

vi.mock('bcrypt', () => ({
    default: {
        hash: vi.fn(() => Promise.resolve('hashed_password')),
        compare: vi.fn(() => Promise.resolve(true)),
    },
}));

import { AuthService } from '@/services/auth.service';

describe('AuthService', () => {
    let service: AuthService;

    beforeEach(() => {
        service = new AuthService();
        vi.clearAllMocks();
    });

    describe('signup', () => {
        it('should have signup method', () => {
            expect(typeof service.signup).toBe('function');
        });

        it('should reject invalid email format', async () => {
            const data = {
                email: 'invalid-email',
                password: 'ValidPassword123!',
                firstName: 'Test',
                lastName: 'User',
            };

            await expect(service.signup(data)).rejects.toThrow();
        });

        it('should reject weak password', async () => {
            const data = {
                email: 'test@example.com',
                password: 'weak',
                firstName: 'Test',
                lastName: 'User',
            };

            await expect(service.signup(data)).rejects.toThrow();
        });

        it('should reject missing first name', async () => {
            const data = {
                email: 'test@example.com',
                password: 'ValidPassword123!',
                firstName: '',
                lastName: 'User',
            };

            await expect(service.signup(data)).rejects.toThrow();
        });
    });

    describe('login', () => {
        it('should have login method', () => {
            expect(typeof service.login).toBe('function');
        });

        it('should reject invalid email format', async () => {
            const data = {
                email: 'invalid',
                password: 'password123',
            };

            await expect(service.login(data)).rejects.toThrow();
        });

        it('should reject empty password', async () => {
            const data = {
                email: 'test@example.com',
                password: '',
            };

            await expect(service.login(data)).rejects.toThrow();
        });
    });

    describe('getUserByEmail', () => {
        it('should have getUserByEmail method', () => {
            expect(typeof service.getUserByEmail).toBe('function');
        });

        it('should return null for non-existent email', async () => {
            const result = await service.getUserByEmail('nonexistent@example.com');
            expect(result).toBeNull();
        });
    });

    describe('getUserById', () => {
        it('should have getUserById method', () => {
            expect(typeof service.getUserById).toBe('function');
        });
    });

    describe('password utilities', () => {
        it('should have verifyPassword method', () => {
            expect(typeof service.verifyPassword).toBe('function');
        });

        it('should have hashPassword method', () => {
            expect(typeof service.hashPassword).toBe('function');
        });
    });
});
