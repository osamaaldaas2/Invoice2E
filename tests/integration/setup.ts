/**
 * Integration test setup using Testcontainers for real PostgreSQL testing.
 *
 * Intent: Provide a real PostgreSQL database for each test suite,
 * with all migrations applied, ensuring tests run against production-like DB behavior.
 *
 * Potential side effects: Requires Docker running on the host machine.
 * Testing approach: Each suite gets a clean database; teardown removes the container.
 */

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

/** Shared container reference for the current test suite */
let container: StartedPostgreSqlContainer | null = null;

/** Active pg.Client for the current suite */
let adminClient: Client | null = null;

const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

/** Timeout for container startup (PostgreSQL image pull can be slow on first run) */
const CONTAINER_STARTUP_TIMEOUT_MS = 120_000;

/**
 * Read and sort all migration files from db/migrations/ in alphabetical order.
 * Returns an array of { name, sql } objects.
 */
function loadMigrations(): Array<{ name: string; sql: string }> {
    const files = fs.readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql'))
        .sort();

    return files.map((name) => ({
        name,
        sql: fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf-8'),
    }));
}

/**
 * Apply all migrations sequentially to the given database client.
 * Wraps each migration in a try/catch so we get clear error messages.
 */
async function applyMigrations(client: Client): Promise<void> {
    const migrations = loadMigrations();

    // Create extensions that Supabase normally provides
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

    // Stub Supabase auth.uid() — returns a session variable we can set per-test
    await client.query(`
        CREATE SCHEMA IF NOT EXISTS auth;
        CREATE OR REPLACE FUNCTION auth.uid()
        RETURNS UUID AS $$
        BEGIN
            RETURN NULLIF(current_setting('app.current_user_id', true), '')::UUID;
        END;
        $$ LANGUAGE plpgsql;
    `);

    for (const migration of migrations) {
        try {
            await client.query(migration.sql);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            // Some migrations may fail on a plain PG (e.g. Supabase-specific grants).
            // Log and continue — tests will catch real failures.
            console.warn(`[migration] ${migration.name} — warning: ${message}`);
        }
    }
}

/**
 * Start a PostgreSQL Testcontainer and apply all migrations.
 * Call this in beforeAll() of each integration test suite.
 *
 * @returns Connection string and a pg.Client connected as admin
 */
export async function setupTestDatabase(): Promise<{
    connectionString: string;
    client: Client;
    container: StartedPostgreSqlContainer;
}> {
    container = await new PostgreSqlContainer('postgres:16-alpine')
        .withDatabase('invoice2e_test')
        .withUsername('test_user')
        .withPassword('test_password')
        .withStartupTimeout(CONTAINER_STARTUP_TIMEOUT_MS)
        .start();

    const connectionString = container.getConnectionUri();

    adminClient = new Client({ connectionString });
    await adminClient.connect();

    await applyMigrations(adminClient);

    return { connectionString, client: adminClient, container };
}

/**
 * Tear down the test database and container.
 * Call this in afterAll() of each integration test suite.
 */
export async function teardownTestDatabase(): Promise<void> {
    if (adminClient) {
        try {
            await adminClient.end();
        } catch {
            // Ignore close errors during teardown
        }
        adminClient = null;
    }

    if (container) {
        try {
            await container.stop();
        } catch {
            // Ignore stop errors during teardown
        }
        container = null;
    }
}

/**
 * Set the current user context for RLS testing.
 * This sets the session variable that our auth.uid() stub reads.
 */
export async function setCurrentUser(client: Client, userId: string): Promise<void> {
    await client.query(`SET app.current_user_id = '${userId}'`);
}

/**
 * Clear the current user context (simulate unauthenticated access).
 */
export async function clearCurrentUser(client: Client): Promise<void> {
    await client.query(`SET app.current_user_id = ''`);
}

/**
 * Create a test user directly in the database and return its ID.
 * Bypasses the application layer for test setup.
 */
export async function createTestUser(
    client: Client,
    overrides: Partial<{
        email: string;
        passwordHash: string;
        firstName: string;
        lastName: string;
        role: string;
        country: string;
    }> = {},
): Promise<string> {
    const email = overrides.email ?? `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const passwordHash = overrides.passwordHash ?? '$2b$10$dummyhashforintegrationtests000000000000000000000';
    const firstName = overrides.firstName ?? 'Test';
    const lastName = overrides.lastName ?? 'User';
    const role = overrides.role ?? 'user';
    const country = overrides.country ?? 'DE';

    const result = await client.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, role, country)
         VALUES ($1, $2, $3, $4, $5::user_role, $6)
         RETURNING id`,
        [email, passwordHash, firstName, lastName, role, country],
    );

    const userId = result.rows[0].id as string;

    // Create initial credits record
    await client.query(
        `INSERT INTO user_credits (user_id, available_credits, used_credits)
         VALUES ($1, 10, 0)`,
        [userId],
    );

    return userId;
}

/**
 * Clean all data from tables (preserving schema) for test isolation.
 * Use between tests if you want to reset state without restarting the container.
 */
export async function cleanAllTables(client: Client): Promise<void> {
    await client.query(`
        TRUNCATE TABLE audit_logs CASCADE;
        TRUNCATE TABLE payment_transactions CASCADE;
        TRUNCATE TABLE invoice_conversions CASCADE;
        TRUNCATE TABLE invoice_extractions CASCADE;
        TRUNCATE TABLE user_credits CASCADE;
        TRUNCATE TABLE users CASCADE;
    `);
}
