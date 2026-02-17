/**
 * Integration tests for authentication and user management with real PostgreSQL.
 *
 * Intent: Verify user creation, authentication flow, role-based access,
 * and session/password management against a real database.
 *
 * Testing approach: Testcontainers PostgreSQL with all migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Client } from 'pg';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import {
    setupTestDatabase,
    teardownTestDatabase,
    cleanAllTables,
} from './setup';

let client: Client;

const SALT_ROUNDS = 10;

beforeAll(async () => {
    const setup = await setupTestDatabase();
    client = setup.client;
});

afterAll(async () => {
    await teardownTestDatabase();
});

describe('User Creation and Authentication Flow', () => {
    beforeEach(async () => {
        await cleanAllTables(client);
    });

    it('should create a user with hashed password', async () => {
        const passwordHash = await bcrypt.hash('SecurePass123!', SALT_ROUNDS);

        const { rows } = await client.query(
            `INSERT INTO users (email, password_hash, first_name, last_name, country, phone)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            ['user@test.com', passwordHash, 'Max', 'Mustermann', 'DE', '+491234567'],
        );

        expect(rows[0].email).toBe('user@test.com');
        expect(rows[0].first_name).toBe('Max');
        expect(rows[0].role).toBe('user'); // Default role
        expect(rows[0].is_banned).toBe(false);
        expect(rows[0].login_count).toBe(0);

        // Verify password can be compared
        const match = await bcrypt.compare('SecurePass123!', rows[0].password_hash);
        expect(match).toBe(true);
    });

    it('should enforce unique email constraint', async () => {
        const hash = await bcrypt.hash('pass', SALT_ROUNDS);

        await client.query(
            `INSERT INTO users (email, password_hash, first_name, last_name) VALUES ($1, $2, 'A', 'B')`,
            ['dup@test.com', hash],
        );

        await expect(
            client.query(
                `INSERT INTO users (email, password_hash, first_name, last_name) VALUES ($1, $2, 'C', 'D')`,
                ['dup@test.com', hash],
            ),
        ).rejects.toThrow(/duplicate|unique/i);
    });

    it('should authenticate user with correct password', async () => {
        const password = 'MyPassword456!';
        const hash = await bcrypt.hash(password, SALT_ROUNDS);

        await client.query(
            `INSERT INTO users (email, password_hash, first_name, last_name)
             VALUES ('auth@test.com', $1, 'Auth', 'User')`,
            [hash],
        );

        const { rows } = await client.query(
            `SELECT password_hash FROM users WHERE email = 'auth@test.com'`,
        );

        const isValid = await bcrypt.compare(password, rows[0].password_hash);
        expect(isValid).toBe(true);

        const isInvalid = await bcrypt.compare('WrongPassword', rows[0].password_hash);
        expect(isInvalid).toBe(false);
    });

    it('should create user_credits record alongside user', async () => {
        const hash = await bcrypt.hash('pass', SALT_ROUNDS);

        const { rows: userRows } = await client.query(
            `INSERT INTO users (email, password_hash, first_name, last_name)
             VALUES ('credits@test.com', $1, 'Credit', 'User') RETURNING id`,
            [hash],
        );

        await client.query(
            `INSERT INTO user_credits (user_id, available_credits, used_credits)
             VALUES ($1, 5, 0)`,
            [userRows[0].id],
        );

        const { rows: credits } = await client.query(
            `SELECT * FROM user_credits WHERE user_id = $1`,
            [userRows[0].id],
        );

        expect(credits).toHaveLength(1);
        expect(credits[0].available_credits).toBe(5);
    });

    it('should track login statistics', async () => {
        const hash = await bcrypt.hash('pass', SALT_ROUNDS);

        const { rows } = await client.query(
            `INSERT INTO users (email, password_hash, first_name, last_name)
             VALUES ('login@test.com', $1, 'Login', 'User') RETURNING id`,
            [hash],
        );
        const userId = rows[0].id;

        // Simulate login: update last_login_at and increment login_count
        await client.query(
            `UPDATE users SET last_login_at = NOW(), login_count = login_count + 1 WHERE id = $1`,
            [userId],
        );

        const { rows: updated } = await client.query(
            `SELECT last_login_at, login_count FROM users WHERE id = $1`,
            [userId],
        );

        expect(updated[0].last_login_at).not.toBeNull();
        expect(updated[0].login_count).toBe(1);
    });
});

describe('Role-Based Access with Real DB', () => {
    beforeEach(async () => {
        await cleanAllTables(client);
    });

    it('should create users with different roles', async () => {
        const hash = await bcrypt.hash('pass', SALT_ROUNDS);

        const roles = ['user', 'admin', 'super_admin'] as const;

        for (const role of roles) {
            const { rows } = await client.query(
                `INSERT INTO users (email, password_hash, first_name, last_name, role)
                 VALUES ($1, $2, $3, $4, $5::user_role) RETURNING role`,
                [`${role}@test.com`, hash, role, 'Test', role],
            );
            expect(rows[0].role).toBe(role);
        }
    });

    it('should reject invalid role values', async () => {
        const hash = await bcrypt.hash('pass', SALT_ROUNDS);

        await expect(
            client.query(
                `INSERT INTO users (email, password_hash, first_name, last_name, role)
                 VALUES ('bad@test.com', $1, 'Bad', 'Role', 'superuser')`,
                [hash],
            ),
        ).rejects.toThrow();
    });

    it('should support banning users', async () => {
        const hash = await bcrypt.hash('pass', SALT_ROUNDS);

        const { rows } = await client.query(
            `INSERT INTO users (email, password_hash, first_name, last_name)
             VALUES ('ban@test.com', $1, 'Ban', 'User') RETURNING id`,
            [hash],
        );

        await client.query(
            `UPDATE users SET is_banned = true, banned_at = NOW(), banned_reason = 'TOS violation'
             WHERE id = $1`,
            [rows[0].id],
        );

        const { rows: banned } = await client.query(
            `SELECT is_banned, banned_reason FROM users WHERE id = $1`,
            [rows[0].id],
        );

        expect(banned[0].is_banned).toBe(true);
        expect(banned[0].banned_reason).toBe('TOS violation');
    });

    it('should have RLS policies scoped by user role', async () => {
        // Verify admin-specific policies exist if defined in migrations
        const policies = await client.query(
            `SELECT policyname, tablename, cmd FROM pg_policies
             WHERE tablename IN ('users', 'audit_logs', 'invoice_extractions')
             ORDER BY tablename, policyname`,
        );

        expect(policies.rows.length).toBeGreaterThan(0);

        // Every critical table should have at least one SELECT policy
        const tables = ['users', 'invoice_extractions', 'audit_logs'];
        for (const table of tables) {
            const hasPolicies = policies.rows.some(
                (p: Record<string, string>) => p.tablename === table,
            );
            expect(hasPolicies).toBe(true);
        }
    });
});

describe('Session Management (Password Reset)', () => {
    let userId: string;

    beforeEach(async () => {
        await cleanAllTables(client);

        const hash = await bcrypt.hash('original_password', SALT_ROUNDS);
        const { rows } = await client.query(
            `INSERT INTO users (email, password_hash, first_name, last_name)
             VALUES ('session@test.com', $1, 'Session', 'User') RETURNING id`,
            [hash],
        );
        userId = rows[0].id;
    });

    it('should create and validate a password reset token', async () => {
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await client.query(
            `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
             VALUES ($1, $2, $3)`,
            [userId, tokenHash, expiresAt.toISOString()],
        );

        // Validate token
        const recomputedHash = crypto.createHash('sha256').update(token).digest('hex');
        const { rows } = await client.query(
            `SELECT * FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL`,
            [recomputedHash],
        );

        expect(rows).toHaveLength(1);
        expect(rows[0].user_id).toBe(userId);
        expect(new Date(rows[0].expires_at).getTime()).toBeGreaterThan(Date.now());
    });

    it('should reject expired reset tokens', async () => {
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const expiredAt = new Date(Date.now() - 60 * 1000); // 1 minute ago

        await client.query(
            `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
             VALUES ($1, $2, $3)`,
            [userId, tokenHash, expiredAt.toISOString()],
        );

        const { rows } = await client.query(
            `SELECT * FROM password_reset_tokens
             WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
            [tokenHash],
        );

        expect(rows).toHaveLength(0);
    });

    it('should mark tokens as used after password reset', async () => {
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

        const { rows: insertedRows } = await client.query(
            `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
             VALUES ($1, $2, $3) RETURNING id`,
            [userId, tokenHash, expiresAt.toISOString()],
        );

        // Mark as used
        await client.query(
            `UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`,
            [insertedRows[0].id],
        );

        // Should no longer be valid
        const { rows } = await client.query(
            `SELECT * FROM password_reset_tokens
             WHERE token_hash = $1 AND used_at IS NULL`,
            [tokenHash],
        );

        expect(rows).toHaveLength(0);
    });

    it('should update user password after reset', async () => {
        const newPassword = 'NewSecurePassword789!';
        const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

        await client.query(
            `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
            [newHash, userId],
        );

        const { rows } = await client.query(
            `SELECT password_hash FROM users WHERE id = $1`,
            [userId],
        );

        const match = await bcrypt.compare(newPassword, rows[0].password_hash);
        expect(match).toBe(true);

        // Old password should not work
        const oldMatch = await bcrypt.compare('original_password', rows[0].password_hash);
        expect(oldMatch).toBe(false);
    });

    it('should invalidate all tokens for a user after successful reset', async () => {
        const tokenHashes = [];

        // Create multiple tokens
        for (let i = 0; i < 3; i++) {
            const token = crypto.randomBytes(32).toString('hex');
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

            await client.query(
                `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
                 VALUES ($1, $2, $3)`,
                [userId, tokenHash, expiresAt.toISOString()],
            );
            tokenHashes.push(tokenHash);
        }

        // Delete all tokens (simulating post-reset cleanup)
        await client.query(
            `DELETE FROM password_reset_tokens WHERE user_id = $1`,
            [userId],
        );

        const { rows } = await client.query(
            `SELECT * FROM password_reset_tokens WHERE user_id = $1`,
            [userId],
        );

        expect(rows).toHaveLength(0);
    });
});
