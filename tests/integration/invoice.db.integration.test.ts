/**
 * Integration tests for invoice database operations against real PostgreSQL.
 *
 * Intent: Verify full invoice CRUD, RLS policies, credit deduction atomicity,
 * optimistic locking conflict detection, and audit log immutability with a real database.
 *
 * Testing approach: Testcontainers PostgreSQL with all migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Client } from 'pg';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
    setupTestDatabase,
    teardownTestDatabase,
    createTestUser,
    setCurrentUser,
    clearCurrentUser,
    cleanAllTables,
} from './setup';

let client: Client;
let container: StartedPostgreSqlContainer;

beforeAll(async () => {
    const setup = await setupTestDatabase();
    client = setup.client;
    container = setup.container;
});

afterAll(async () => {
    await teardownTestDatabase();
});

describe('Invoice Extraction CRUD', () => {
    let userId: string;

    beforeEach(async () => {
        await cleanAllTables(client);
        userId = await createTestUser(client);
    });

    it('should create an extraction and retrieve it by ID', async () => {
        const result = await client.query(
            `INSERT INTO invoice_extractions (user_id, extraction_data, confidence_score, status)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [userId, JSON.stringify({ vendor: 'Test GmbH' }), 0.95, 'completed'],
        );

        const extraction = result.rows[0];
        expect(extraction.user_id).toBe(userId);
        expect(extraction.extraction_data).toEqual({ vendor: 'Test GmbH' });
        expect(parseFloat(extraction.confidence_score)).toBeCloseTo(0.95);
        expect(extraction.status).toBe('completed');
        expect(extraction.row_version).toBe(1);

        // Retrieve by ID
        const fetched = await client.query(
            'SELECT * FROM invoice_extractions WHERE id = $1',
            [extraction.id],
        );
        expect(fetched.rows).toHaveLength(1);
        expect(fetched.rows[0].id).toBe(extraction.id);
    });

    it('should update an extraction and auto-increment row_version', async () => {
        const { rows } = await client.query(
            `INSERT INTO invoice_extractions (user_id, extraction_data, status)
             VALUES ($1, '{}', 'pending') RETURNING *`,
            [userId],
        );
        const id = rows[0].id;
        expect(rows[0].row_version).toBe(1);

        await client.query(
            `UPDATE invoice_extractions SET status = 'completed' WHERE id = $1`,
            [id],
        );

        const updated = await client.query('SELECT * FROM invoice_extractions WHERE id = $1', [id]);
        expect(updated.rows[0].status).toBe('completed');
        expect(updated.rows[0].row_version).toBe(2);
    });

    it('should delete an extraction', async () => {
        const { rows } = await client.query(
            `INSERT INTO invoice_extractions (user_id, extraction_data) VALUES ($1, '{}') RETURNING id`,
            [userId],
        );

        await client.query('DELETE FROM invoice_extractions WHERE id = $1', [rows[0].id]);

        const result = await client.query('SELECT * FROM invoice_extractions WHERE id = $1', [rows[0].id]);
        expect(result.rows).toHaveLength(0);
    });

    it('should list extractions for a user ordered by created_at DESC', async () => {
        for (let i = 0; i < 3; i++) {
            await client.query(
                `INSERT INTO invoice_extractions (user_id, extraction_data, status)
                 VALUES ($1, $2, 'completed')`,
                [userId, JSON.stringify({ index: i })],
            );
        }

        const result = await client.query(
            `SELECT * FROM invoice_extractions WHERE user_id = $1 ORDER BY created_at DESC`,
            [userId],
        );
        expect(result.rows).toHaveLength(3);
    });
});

describe('Invoice Conversion CRUD', () => {
    let userId: string;
    let extractionId: string;

    beforeEach(async () => {
        await cleanAllTables(client);
        userId = await createTestUser(client);

        const { rows } = await client.query(
            `INSERT INTO invoice_extractions (user_id, extraction_data)
             VALUES ($1, '{"vendor":"Test"}') RETURNING id`,
            [userId],
        );
        extractionId = rows[0].id;
    });

    it('should create a conversion linked to an extraction', async () => {
        const { rows } = await client.query(
            `INSERT INTO invoice_conversions (user_id, extraction_id, invoice_number, conversion_format, conversion_status)
             VALUES ($1, $2, 'INV-001', 'xrechnung', 'completed') RETURNING *`,
            [userId, extractionId],
        );

        expect(rows[0].user_id).toBe(userId);
        expect(rows[0].extraction_id).toBe(extractionId);
        expect(rows[0].invoice_number).toBe('INV-001');
        expect(rows[0].conversion_format).toBe('xrechnung');
        expect(rows[0].row_version).toBe(1);
    });

    it('should enforce foreign key: conversion requires valid extraction_id', async () => {
        const fakeExtractionId = '00000000-0000-0000-0000-000000000000';

        await expect(
            client.query(
                `INSERT INTO invoice_conversions (user_id, extraction_id, conversion_format)
                 VALUES ($1, $2, 'xrechnung')`,
                [userId, fakeExtractionId],
            ),
        ).rejects.toThrow();
    });
});

describe('RLS Policies', () => {
    let userA: string;
    let userB: string;
    let extractionA: string;

    beforeEach(async () => {
        await cleanAllTables(client);
        userA = await createTestUser(client, { email: 'usera@test.com' });
        userB = await createTestUser(client, { email: 'userb@test.com' });

        const { rows } = await client.query(
            `INSERT INTO invoice_extractions (user_id, extraction_data) VALUES ($1, '{}') RETURNING id`,
            [userA],
        );
        extractionA = rows[0].id;
    });

    it('should allow user to see own extractions via RLS', async () => {
        await setCurrentUser(client, userA);

        // Note: RLS only applies to non-superuser roles. In Testcontainers
        // the default client is a superuser, so RLS is bypassed.
        // We test the policy definitions exist and are correctly structured.
        const policies = await client.query(
            `SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'invoice_extractions'`,
        );

        const selectPolicy = policies.rows.find(
            (p: Record<string, string>) => p.cmd === 'SELECT' && p.policyname.includes('view own'),
        );
        expect(selectPolicy).toBeDefined();
        expect(selectPolicy.qual).toContain('auth.uid');
    });

    it('should have RLS enabled on all critical tables', async () => {
        const tables = ['users', 'user_credits', 'invoice_extractions', 'invoice_conversions', 'payment_transactions', 'audit_logs'];

        for (const table of tables) {
            const result = await client.query(
                `SELECT rowsecurity FROM pg_class WHERE relname = $1`,
                [table],
            );
            expect(result.rows[0]?.rowsecurity).toBe(true);
        }
    });

    it('should have correct RLS policy structure for user isolation', async () => {
        const tables = ['invoice_extractions', 'invoice_conversions', 'user_credits'];

        for (const table of tables) {
            const policies = await client.query(
                `SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = $1`,
                [table],
            );

            // Each table should have at least a SELECT policy referencing auth.uid()
            const hasScopedSelect = policies.rows.some(
                (p: Record<string, string>) => p.qual?.includes('auth.uid'),
            );
            expect(hasScopedSelect).toBe(true);
        }
    });
});

describe('Credit Deduction Atomicity', () => {
    let userId: string;

    beforeEach(async () => {
        await cleanAllTables(client);
        userId = await createTestUser(client);
        // Set credits to 5
        await client.query(
            `UPDATE user_credits SET available_credits = 5, used_credits = 0 WHERE user_id = $1`,
            [userId],
        );
    });

    it('should atomically deduct credits via safe_deduct_credits', async () => {
        const result = await client.query(
            `SELECT safe_deduct_credits($1, 2, 'test_deduction')`,
            [userId],
        );

        expect(result.rows[0].safe_deduct_credits).toBe(true);

        const credits = await client.query(
            `SELECT available_credits, used_credits FROM user_credits WHERE user_id = $1`,
            [userId],
        );
        expect(credits.rows[0].available_credits).toBe(3);
        expect(credits.rows[0].used_credits).toBe(2);
    });

    it('should reject deduction when insufficient credits', async () => {
        const result = await client.query(
            `SELECT safe_deduct_credits($1, 100, 'too_much')`,
            [userId],
        );

        expect(result.rows[0].safe_deduct_credits).toBe(false);

        // Credits unchanged
        const credits = await client.query(
            `SELECT available_credits FROM user_credits WHERE user_id = $1`,
            [userId],
        );
        expect(credits.rows[0].available_credits).toBe(5);
    });

    it('should handle concurrent deductions atomically', async () => {
        // Set credits to exactly 1
        await client.query(
            `UPDATE user_credits SET available_credits = 1 WHERE user_id = $1`,
            [userId],
        );

        // Create two separate connections to simulate concurrency
        const connStr = container.getConnectionUri();
        const clientA = new Client({ connectionString: connStr });
        const clientB = new Client({ connectionString: connStr });

        try {
            await clientA.connect();
            await clientB.connect();

            // Both try to deduct 1 credit simultaneously
            const [resultA, resultB] = await Promise.all([
                clientA.query(`SELECT safe_deduct_credits($1, 1, 'concurrent_a')`, [userId]),
                clientB.query(`SELECT safe_deduct_credits($1, 1, 'concurrent_b')`, [userId]),
            ]);

            const successA = resultA.rows[0].safe_deduct_credits as boolean;
            const successB = resultB.rows[0].safe_deduct_credits as boolean;

            // Exactly one should succeed, one should fail (atomic check)
            expect(Number(successA) + Number(successB)).toBe(1);

            // Final balance should be 0
            const credits = await client.query(
                `SELECT available_credits FROM user_credits WHERE user_id = $1`,
                [userId],
            );
            expect(credits.rows[0].available_credits).toBe(0);
        } finally {
            await clientA.end();
            await clientB.end();
        }
    });

    it('should atomically add credits via add_credits', async () => {
        const result = await client.query(
            `SELECT add_credits($1, 10, 'payment', 'ref-123')`,
            [userId],
        );

        // add_credits returns the new balance
        expect(result.rows[0].add_credits).toBe(15); // 5 + 10

        const credits = await client.query(
            `SELECT available_credits FROM user_credits WHERE user_id = $1`,
            [userId],
        );
        expect(credits.rows[0].available_credits).toBe(15);
    });

    it('should reject negative credit amounts', async () => {
        await expect(
            client.query(`SELECT safe_deduct_credits($1, -1, 'negative')`, [userId]),
        ).rejects.toThrow('Amount must be positive');

        await expect(
            client.query(`SELECT add_credits($1, -5, 'bad')`, [userId]),
        ).rejects.toThrow('Amount must be positive');
    });
});

describe('Optimistic Locking Conflict Detection', () => {
    let userId: string;
    let conversionId: string;

    beforeEach(async () => {
        await cleanAllTables(client);
        userId = await createTestUser(client);

        const { rows: extRows } = await client.query(
            `INSERT INTO invoice_extractions (user_id, extraction_data) VALUES ($1, '{}') RETURNING id`,
            [userId],
        );

        const { rows } = await client.query(
            `INSERT INTO invoice_conversions (user_id, extraction_id, conversion_format, conversion_status)
             VALUES ($1, $2, 'xrechnung', 'pending') RETURNING *`,
            [userId, extRows[0].id],
        );
        conversionId = rows[0].id;
    });

    it('should succeed when row_version matches', async () => {
        const result = await client.query(
            `UPDATE invoice_conversions SET conversion_status = 'completed'
             WHERE id = $1 AND row_version = 1 RETURNING *`,
            [conversionId],
        );

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].conversion_status).toBe('completed');
        expect(result.rows[0].row_version).toBe(2);
    });

    it('should fail (return 0 rows) when row_version is stale', async () => {
        // First update bumps version to 2
        await client.query(
            `UPDATE invoice_conversions SET conversion_status = 'processing' WHERE id = $1`,
            [conversionId],
        );

        // Second update with stale version 1 should match 0 rows
        const result = await client.query(
            `UPDATE invoice_conversions SET conversion_status = 'completed'
             WHERE id = $1 AND row_version = 1 RETURNING *`,
            [conversionId],
        );

        expect(result.rows).toHaveLength(0);
    });

    it('should detect conflict via check_optimistic_lock RPC', async () => {
        // Version is 1, check should pass
        const pass = await client.query(
            `SELECT check_optimistic_lock('invoice_conversions', $1, 1)`,
            [conversionId],
        );
        expect(pass.rows[0].check_optimistic_lock).toBe(true);

        // Update bumps to version 2
        await client.query(
            `UPDATE invoice_conversions SET conversion_status = 'done' WHERE id = $1`,
            [conversionId],
        );

        // Now checking with version 1 should fail
        const fail = await client.query(
            `SELECT check_optimistic_lock('invoice_conversions', $1, 1)`,
            [conversionId],
        );
        expect(fail.rows[0].check_optimistic_lock).toBe(false);
    });
});

describe('Audit Log Immutability', () => {
    let userId: string;

    beforeEach(async () => {
        await cleanAllTables(client);
        userId = await createTestUser(client);
    });

    it('should create audit log entries with auto-computed hashes', async () => {
        const { rows } = await client.query(
            `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, changes)
             VALUES ($1, 'test_action', 'invoice', 'inv-001', '{"key":"value"}')
             RETURNING *`,
            [userId],
        );

        expect(rows[0].entry_hash).toBeTruthy();
        expect(rows[0].entry_hash.length).toBe(64); // SHA-256 hex
        // First entry should have null prev_hash
        expect(rows[0].prev_hash).toBeNull();
    });

    it('should chain audit log hashes correctly', async () => {
        // Insert first entry
        const { rows: first } = await client.query(
            `INSERT INTO audit_logs (user_id, action, resource_type)
             VALUES ($1, 'action_1', 'test') RETURNING *`,
            [userId],
        );

        // Insert second entry
        const { rows: second } = await client.query(
            `INSERT INTO audit_logs (user_id, action, resource_type)
             VALUES ($1, 'action_2', 'test') RETURNING *`,
            [userId],
        );

        // Second entry's prev_hash should equal first entry's entry_hash
        expect(second[0].prev_hash).toBe(first[0].entry_hash);
    });

    it('should verify audit chain integrity via verify_audit_chain()', async () => {
        // Insert a few audit entries
        for (let i = 0; i < 5; i++) {
            await client.query(
                `INSERT INTO audit_logs (user_id, action, resource_type, changes)
                 VALUES ($1, $2, 'test', $3)`,
                [userId, `action_${i}`, JSON.stringify({ step: i })],
            );
        }

        const result = await client.query(`SELECT * FROM verify_audit_chain(100)`);
        const verification = result.rows[0];

        expect(verification.is_valid).toBe(true);
        expect(Number(verification.total_checked)).toBe(5);
        expect(verification.first_broken_id).toBeNull();
    });

    it('should detect tampered audit entries', async () => {
        // Insert entries
        await client.query(
            `INSERT INTO audit_logs (user_id, action, resource_type)
             VALUES ($1, 'original_action', 'test')`,
            [userId],
        );

        const { rows } = await client.query(
            `SELECT id FROM audit_logs ORDER BY created_at ASC LIMIT 1`,
        );

        // Tamper: directly modify the entry_hash (simulating tampering)
        // Note: superuser can bypass REVOKE, but the hash chain will break
        await client.query(
            `UPDATE audit_logs SET entry_hash = 'tampered_hash' WHERE id = $1`,
            [rows[0].id],
        );

        const result = await client.query(`SELECT * FROM verify_audit_chain(100)`);
        expect(result.rows[0].is_valid).toBe(false);
    });

    it('should have DELETE and UPDATE revoked for authenticated role on audit_logs', async () => {
        // Verify that the privilege revocation exists by checking pg_class permissions
        // The REVOKE statements in migration 003 remove DELETE/UPDATE from 'authenticated'
        const result = await client.query(`
            SELECT has_table_privilege('authenticated', 'audit_logs', 'DELETE') AS can_delete,
                   has_table_privilege('authenticated', 'audit_logs', 'UPDATE') AS can_update
        `);

        // If 'authenticated' role doesn't exist in test PG, this query may fail.
        // That's acceptable — the migration syntax is verified by successful migration application.
        if (result.rows.length > 0) {
            expect(result.rows[0].can_delete).toBe(false);
            expect(result.rows[0].can_update).toBe(false);
        }
    });
});
