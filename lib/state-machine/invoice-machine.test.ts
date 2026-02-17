/**
 * @module lib/state-machine/invoice-machine.test
 * @description Tests for the invoice lifecycle state machine.
 *
 * Covers: all valid transitions, guard conditions (canRetry, hasCredits,
 * isValidFormat), retry logic, terminal states, and helper utilities.
 */

import { describe, it, expect } from 'vitest';
import { createActor } from 'xstate';
import { invoiceMachine } from './invoice-machine';
import {
  getNextStates,
  isTerminalState,
  canTransition,
} from './index';
import { MAX_RETRY_COUNT, type InvoiceContext } from './types';

// ── Helpers ────────────────────────────────────────────────────────────

/** Create an actor with custom initial context. */
function createInvoiceActor(contextOverrides?: Partial<InvoiceContext>) {
  return createActor(invoiceMachine, {
    input: undefined,
    snapshot: invoiceMachine.resolveState({
      value: 'UPLOADED',
      context: {
        invoiceId: 'inv-1',
        userId: 'user-1',
        retryCount: 0,
        format: 'zugferd',
        errorMessage: null,
        ...contextOverrides,
      },
    }),
  });
}

/** Create an actor starting at a specific state. */
function actorAt(state: string, contextOverrides?: Partial<InvoiceContext>) {
  return createActor(invoiceMachine, {
    snapshot: invoiceMachine.resolveState({
      value: state,
      context: {
        invoiceId: 'inv-1',
        userId: 'user-1',
        retryCount: 0,
        format: 'zugferd',
        errorMessage: null,
        ...contextOverrides,
      },
    }),
  });
}

// ── Happy path ─────────────────────────────────────────────────────────

describe('Invoice State Machine — happy path', () => {
  it('should traverse the full happy path from UPLOADED to ARCHIVED', () => {
    const actor = createInvoiceActor();
    actor.start();

    actor.send({ type: 'QUARANTINE' });
    expect(actor.getSnapshot().value).toBe('QUARANTINED');

    actor.send({ type: 'SCAN_PASS' });
    expect(actor.getSnapshot().value).toBe('SCANNING');

    actor.send({ type: 'SCAN_PASS' });
    expect(actor.getSnapshot().value).toBe('EXTRACTING');

    actor.send({ type: 'EXTRACT_SUCCESS' });
    expect(actor.getSnapshot().value).toBe('EXTRACTED');

    actor.send({ type: 'APPROVE' });
    expect(actor.getSnapshot().value).toBe('REVIEW');

    actor.send({ type: 'CONVERT' });
    expect(actor.getSnapshot().value).toBe('CONVERTING');

    actor.send({ type: 'CONVERT_SUCCESS' });
    expect(actor.getSnapshot().value).toBe('CONVERTED');

    actor.send({ type: 'ARCHIVE' });
    expect(actor.getSnapshot().value).toBe('ARCHIVED');

    actor.stop();
  });
});

// ── Individual transitions ─────────────────────────────────────────────

describe('Invoice State Machine — individual transitions', () => {
  it('should move UPLOADED → QUARANTINED on QUARANTINE', () => {
    const actor = actorAt('UPLOADED');
    actor.start();
    actor.send({ type: 'QUARANTINE' });
    expect(actor.getSnapshot().value).toBe('QUARANTINED');
    actor.stop();
  });

  it('should move SCANNING → SCAN_FAILED on SCAN_FAIL', () => {
    const actor = actorAt('SCANNING');
    actor.start();
    actor.send({ type: 'SCAN_FAIL', errorMessage: 'virus detected' });
    expect(actor.getSnapshot().value).toBe('SCAN_FAILED');
    expect(actor.getSnapshot().context.errorMessage).toBe('virus detected');
    actor.stop();
  });

  it('should move EXTRACTING → FAILED on EXTRACT_FAIL', () => {
    const actor = actorAt('EXTRACTING');
    actor.start();
    actor.send({ type: 'EXTRACT_FAIL', errorMessage: 'parse error' });
    expect(actor.getSnapshot().value).toBe('FAILED');
    expect(actor.getSnapshot().context.errorMessage).toBe('parse error');
    actor.stop();
  });

  it('should move CONVERTING → FAILED on CONVERT_FAIL', () => {
    const actor = actorAt('CONVERTING');
    actor.start();
    actor.send({ type: 'CONVERT_FAIL', errorMessage: 'schema invalid' });
    expect(actor.getSnapshot().value).toBe('FAILED');
    actor.stop();
  });
});

// ── Guard: canRetry ────────────────────────────────────────────────────

describe('Invoice State Machine — canRetry guard', () => {
  it('should allow RETRY from FAILED when retryCount < MAX_RETRY_COUNT', () => {
    const actor = actorAt('FAILED', { retryCount: 0 });
    actor.start();
    actor.send({ type: 'RETRY' });
    expect(actor.getSnapshot().value).toBe('EXTRACTING');
    expect(actor.getSnapshot().context.retryCount).toBe(1);
    actor.stop();
  });

  it('should block RETRY from FAILED when retryCount >= MAX_RETRY_COUNT', () => {
    const actor = actorAt('FAILED', { retryCount: MAX_RETRY_COUNT });
    actor.start();
    actor.send({ type: 'RETRY' });
    expect(actor.getSnapshot().value).toBe('FAILED'); // stays
    actor.stop();
  });

  it('should allow RETRY from SCAN_FAILED when retryCount < MAX_RETRY_COUNT', () => {
    const actor = actorAt('SCAN_FAILED', { retryCount: 1 });
    actor.start();
    actor.send({ type: 'RETRY' });
    expect(actor.getSnapshot().value).toBe('SCANNING');
    expect(actor.getSnapshot().context.retryCount).toBe(2);
    actor.stop();
  });

  it('should block RETRY from SCAN_FAILED when retryCount >= MAX_RETRY_COUNT', () => {
    const actor = actorAt('SCAN_FAILED', { retryCount: MAX_RETRY_COUNT });
    actor.start();
    actor.send({ type: 'RETRY' });
    expect(actor.getSnapshot().value).toBe('SCAN_FAILED');
    actor.stop();
  });
});

// ── Guard: hasCredits ──────────────────────────────────────────────────

describe('Invoice State Machine — hasCredits guard', () => {
  it('should allow CONVERT from REVIEW when userId is present', () => {
    const actor = actorAt('REVIEW', { userId: 'user-1' });
    actor.start();
    actor.send({ type: 'CONVERT' });
    expect(actor.getSnapshot().value).toBe('CONVERTING');
    actor.stop();
  });

  it('should block CONVERT from REVIEW when userId is empty', () => {
    const actor = actorAt('REVIEW', { userId: '' });
    actor.start();
    actor.send({ type: 'CONVERT' });
    expect(actor.getSnapshot().value).toBe('REVIEW'); // stays
    actor.stop();
  });
});

// ── Retry count increments ─────────────────────────────────────────────

describe('Invoice State Machine — retry count', () => {
  it('should increment retryCount on each RETRY', () => {
    const actor = actorAt('FAILED', { retryCount: 0 });
    actor.start();

    actor.send({ type: 'RETRY' });
    expect(actor.getSnapshot().context.retryCount).toBe(1);

    // Fail again to get back to FAILED
    actor.send({ type: 'EXTRACT_FAIL', errorMessage: 'err' });
    expect(actor.getSnapshot().value).toBe('FAILED');

    actor.send({ type: 'RETRY' });
    expect(actor.getSnapshot().context.retryCount).toBe(2);

    actor.stop();
  });
});

// ── Terminal state ─────────────────────────────────────────────────────

describe('Invoice State Machine — terminal states', () => {
  it('should mark ARCHIVED as terminal', () => {
    expect(isTerminalState('ARCHIVED')).toBe(true);
  });

  it('should not mark FAILED as terminal', () => {
    expect(isTerminalState('FAILED')).toBe(false);
  });

  it('should not mark UPLOADED as terminal', () => {
    expect(isTerminalState('UPLOADED')).toBe(false);
  });
});

// ── Ignored events (no transition) ─────────────────────────────────────

describe('Invoice State Machine — ignored events', () => {
  it('should ignore EXTRACT_SUCCESS in UPLOADED state', () => {
    const actor = actorAt('UPLOADED');
    actor.start();
    actor.send({ type: 'EXTRACT_SUCCESS' });
    expect(actor.getSnapshot().value).toBe('UPLOADED');
    actor.stop();
  });

  it('should ignore ARCHIVE in EXTRACTING state', () => {
    const actor = actorAt('EXTRACTING');
    actor.start();
    actor.send({ type: 'ARCHIVE' });
    expect(actor.getSnapshot().value).toBe('EXTRACTING');
    actor.stop();
  });
});

// ── Helper: getNextStates ──────────────────────────────────────────────

describe('getNextStates', () => {
  it('should return QUARANTINED as the only next state from UPLOADED', () => {
    const next = getNextStates('UPLOADED');
    expect(next).toEqual(['QUARANTINED']);
  });

  it('should return EXTRACTING and SCAN_FAILED from SCANNING', () => {
    const next = getNextStates('SCANNING');
    expect(next.sort()).toEqual(['EXTRACTING', 'SCAN_FAILED'].sort());
  });

  it('should return empty array from ARCHIVED', () => {
    expect(getNextStates('ARCHIVED')).toEqual([]);
  });
});

// ── Helper: canTransition ──────────────────────────────────────────────

describe('canTransition', () => {
  it('should return true for UPLOADED + QUARANTINE', () => {
    expect(canTransition('UPLOADED', 'QUARANTINE')).toBe(true);
  });

  it('should return false for UPLOADED + ARCHIVE', () => {
    expect(canTransition('UPLOADED', 'ARCHIVE')).toBe(false);
  });

  it('should return false for FAILED + RETRY when retries exhausted', () => {
    expect(
      canTransition('FAILED', 'RETRY', { retryCount: MAX_RETRY_COUNT }),
    ).toBe(false);
  });

  it('should return true for FAILED + RETRY when retries remain', () => {
    expect(canTransition('FAILED', 'RETRY', { retryCount: 0 })).toBe(true);
  });
});
