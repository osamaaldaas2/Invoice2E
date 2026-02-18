/**
 * @module lib/state-machine
 * @description Barrel export and helper utilities for the invoice state machine.
 *
 * Intent: Provide a single import point plus pure helper functions that
 * answer common questions about the machine without requiring an actor.
 */

import { createActor } from 'xstate';
import { invoiceMachine } from './invoice-machine';
import { type InvoiceContext, type InvoiceEvent, type InvoiceState } from './types';

// ── Re-exports ─────────────────────────────────────────────────────────

export { invoiceMachine } from './invoice-machine';
export type { InvoiceMachine } from './invoice-machine';
export { InvoiceStateEnum, MAX_RETRY_COUNT, VALID_FORMATS } from './types';
export type { InvoiceContext, InvoiceEvent, InvoiceState, ValidFormat } from './types';

// ── Terminal states ────────────────────────────────────────────────────

const TERMINAL_STATES: ReadonlySet<string> = new Set<string>(['ARCHIVED']);

/**
 * Whether the given state is terminal (no further transitions possible).
 * @param state Invoice state value.
 * @returns `true` for ARCHIVED.
 */
export function isTerminalState(state: InvoiceState): boolean {
  return TERMINAL_STATES.has(state);
}

// ── Next-state introspection ───────────────────────────────────────────

/**
 * Return the set of states reachable from `currentState` via one event.
 *
 * Creates a temporary actor, feeds every known event, and collects the
 * resulting state values that differ from the input.
 *
 * @param currentState The state to inspect.
 * @param context Optional context overrides (e.g. to test guard conditions).
 * @returns Array of reachable {@link InvoiceState} values.
 */
export function getNextStates(
  currentState: InvoiceState,
  context?: Partial<InvoiceContext>
): InvoiceState[] {
  const allEvents: InvoiceEvent[] = [
    { type: 'UPLOAD' },
    { type: 'QUARANTINE' },
    { type: 'SCAN_PASS' },
    { type: 'SCAN_FAIL' },
    { type: 'EXTRACT' },
    { type: 'EXTRACT_SUCCESS' },
    { type: 'EXTRACT_FAIL' },
    { type: 'APPROVE' },
    { type: 'CONVERT' },
    { type: 'CONVERT_SUCCESS' },
    { type: 'CONVERT_FAIL' },
    { type: 'ARCHIVE' },
    { type: 'RETRY' },
  ];

  const resolvedContext: InvoiceContext = {
    invoiceId: 'introspect',
    userId: 'introspect',
    retryCount: 0,
    format: 'zugferd',
    errorMessage: null,
    creditsAvailable: 0,
    creditsRequired: 1,
    ...context,
  };

  const reachable = new Set<InvoiceState>();

  for (const event of allEvents) {
    const actor = createActor(invoiceMachine, {
      snapshot: invoiceMachine.resolveState({
        value: currentState,
        context: resolvedContext,
      }),
    });
    actor.start();
    actor.send(event);
    const nextValue = actor.getSnapshot().value as InvoiceState;
    if (nextValue !== currentState) {
      reachable.add(nextValue);
    }
    actor.stop();
  }

  return Array.from(reachable);
}

/**
 * Whether a specific event can trigger a transition from the given state.
 *
 * @param currentState Current invoice state.
 * @param eventType The event type to check.
 * @param context Optional context overrides for guard evaluation.
 * @returns `true` when the event leads to a different state.
 */
export function canTransition(
  currentState: InvoiceState,
  eventType: InvoiceEvent['type'],
  context?: Partial<InvoiceContext>
): boolean {
  const resolvedContext: InvoiceContext = {
    invoiceId: 'introspect',
    userId: 'introspect',
    retryCount: 0,
    format: 'zugferd',
    errorMessage: null,
    creditsAvailable: 0,
    creditsRequired: 1,
    ...context,
  };

  const actor = createActor(invoiceMachine, {
    snapshot: invoiceMachine.resolveState({
      value: currentState,
      context: resolvedContext,
    }),
  });
  actor.start();
  actor.send({ type: eventType } as InvoiceEvent);
  const nextValue = actor.getSnapshot().value as InvoiceState;
  actor.stop();

  return nextValue !== currentState;
}
