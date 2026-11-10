import { platformSchema } from '../tests/integration/platform-schema';
import { PGlite } from '@electric-sql/pglite';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import assert from 'node:assert/strict';
import { loadMigrationFiles } from './migration-files';

async function main() {
  const db = new PGlite({ extensions: { uuid_ossp, pgcrypto } });
  try {
    // Only Supabase platform primitives are stubbed; application SQL is unmodified.
    await db.exec(platformSchema);
    for (const m of loadMigrationFiles()) {
      try {
        await db.exec('BEGIN');
        await db.exec(m.sql);
        await db.exec('COMMIT');
      } catch (error) {
        throw new Error(`Migration failed: ${m.directory}/${m.name}`, { cause: error });
      }
    }
    console.log('PASS: complete migration chain on an empty PostgreSQL database');
    const user = '11111111-1111-4111-8111-111111111111';
    await db.query(
      `INSERT INTO users(id,email,password_hash,first_name,last_name) VALUES($1,'test@example.invalid','old','Test','User')`,
      [user]
    );
    await db.query(
      `INSERT INTO user_credits(user_id,available_credits,used_credits) VALUES($1,0,0)`,
      [user]
    );
    await db.query(
      `INSERT INTO payment_transactions(user_id,amount,credits_purchased,payment_method,payment_status,stripe_session_id)
      VALUES($1,10,10,'stripe','pending','cs_audit')`,
      [user]
    );
    const settle = (event: string) =>
      db.query(
        `SELECT settle_payment_credits($1,10,$2,'stripe','payment.verified','cs_audit') AS result`,
        [user, event]
      );
    await db.exec('SET ROLE service_role');
    await Promise.all([settle('evt_audit'), settle('verify_cs_audit')]);
    await settle('evt_repeat');
    await db.exec('RESET ROLE');
    const balance = await db.query<{ available_credits: number }>(
      'SELECT available_credits FROM user_credits WHERE user_id=$1',
      [user]
    );
    assert.equal(balance.rows[0]?.available_credits, 10);
    const receipts = await db.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM payment_credit_receipts'
    );
    assert.equal(receipts.rows[0]?.count, 1);
    console.log('PASS: webhook + verification + replay produce one credit allocation');

    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      await assert.rejects(settle('forbidden'));
      await assert.rejects(
        db.query("SELECT add_credits($1,100,'payment'::varchar,NULL::varchar)", [user])
      );
      await db.exec('RESET ROLE');
    }
    console.log('PASS: unprivileged roles cannot call credit RPCs');

    const sid = '22222222-2222-4222-8222-222222222222';
    await db.query(
      "INSERT INTO auth_sessions(id,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
      [sid, user]
    );
    const session = () =>
      db.query<{ result: unknown }>('SELECT resolve_active_session($1,$2) AS result', [sid, user]);
    assert.ok((await session()).rows[0]?.result);
    await db.query('UPDATE users SET is_banned=true WHERE id=$1', [user]);
    assert.equal((await session()).rows[0]?.result, null);
    await db.query('UPDATE users SET is_banned=false WHERE id=$1', [user]);
    assert.equal((await session()).rows[0]?.result, null);
    await db.query(
      "INSERT INTO auth_sessions(id,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
      [sid, user]
    );
    await db.query("UPDATE users SET password_hash='new' WHERE id=$1", [user]);
    assert.equal((await session()).rows[0]?.result, null);
    console.log('PASS: ban and password change revoke existing sessions permanently');

    const refund = () =>
      db.query("SELECT refund_credits_idempotent($1,2,'test','refund-test')", [user]);
    await Promise.all([refund(), refund()]);
    assert.equal(
      (
        await db.query<{ available_credits: number }>(
          'SELECT available_credits FROM user_credits WHERE user_id=$1',
          [user]
        )
      ).rows[0]?.available_credits,
      12
    );
    console.log('PASS: refund replay does not double-credit');

    const job = '33333333-3333-4333-8333-333333333333';
    await db.query('INSERT INTO batch_jobs(id,user_id,total_files) VALUES($1,$2,3)', [job, user]);
    const deduct = (amount: number) =>
      db.query<{ ok: boolean }>('SELECT deduct_batch_credits($1,$2,$3) AS ok', [job, user, amount]);
    assert.equal((await deduct(99)).rows[0]?.ok, false);
    assert.equal(
      (
        await db.query<{ credits_deducted: boolean }>(
          'SELECT credits_deducted FROM batch_jobs WHERE id=$1',
          [job]
        )
      ).rows[0]?.credits_deducted,
      false
    );
    assert.equal((await deduct(3)).rows[0]?.ok, true);
    assert.equal((await deduct(3)).rows[0]?.ok, true);
    assert.equal(
      (
        await db.query<{ available_credits: number }>(
          'SELECT available_credits FROM user_credits WHERE user_id=$1',
          [user]
        )
      ).rows[0]?.available_credits,
      9
    );
    console.log('PASS: batch marker and debit commit together; replay does not charge twice');

    await db.query(
      "INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,'reset-token',now()+interval '1 hour')",
      [user]
    );
    const reset = () =>
      db.query<{ ok: boolean }>("SELECT consume_password_reset('reset-token','replacement') AS ok");
    assert.equal((await reset()).rows[0]?.ok, true);
    assert.equal((await reset()).rows[0]?.ok, false);
    console.log('PASS: password reset tokens are single-use');
  } finally {
    await db.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
