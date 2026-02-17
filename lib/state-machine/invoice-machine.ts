/**
 * @module lib/state-machine/invoice-machine
 * @description XState v5 state machine for the invoice lifecycle.
 *
 * Intent: Model every valid transition an invoice can undergo — from upload
 * through scanning, extraction, review, conversion, and archival — with
 * guards that enforce business rules (retry budget, credit balance, format
 * validation) and actions that maintain context.
 *
 * Side-effects: None. This is a pure machine definition; actors and
 * services are wired at interpretation time.
 */

import { setup, assign } from 'xstate';
import {
  type InvoiceContext,
  type InvoiceEvent,
  MAX_RETRY_COUNT,
  VALID_FORMATS,
} from './types';

// ── Guards ─────────────────────────────────────────────────────────────

/**
 * Whether the invoice has remaining retry budget.
 * @param context Current machine context.
 * @returns `true` when retryCount < MAX_RETRY_COUNT.
 */
function canRetry({ context }: { context: InvoiceContext }): boolean {
  return context.retryCount < MAX_RETRY_COUNT;
}

/**
 * Placeholder credit check — in production this would query a credit
 * service.  Here we assume credits exist when `userId` is present.
 * @param context Current machine context.
 * @returns `true` when the user conceptually has credits.
 */
function hasCredits({ context }: { context: InvoiceContext }): boolean {
  return context.userId.length > 0;
}

/**
 * Whether the requested output format is supported.
 * @param context Current machine context.
 * @returns `true` when format is in VALID_FORMATS.
 */
function isValidFormat({ context }: { context: InvoiceContext }): boolean {
  return (VALID_FORMATS as readonly string[]).includes(context.format);
}

// ── Machine ────────────────────────────────────────────────────────────

/**
 * XState v5 invoice lifecycle machine created via `setup()`.
 *
 * ### States
 * UPLOADED → QUARANTINED → SCANNING → EXTRACTING → EXTRACTED → REVIEW →
 * CONVERTING → CONVERTED → ARCHIVED
 *
 * Failure branches: SCAN_FAILED, FAILED (terminal or retryable).
 */
export const invoiceMachine = setup({
  types: {
    context: {} as InvoiceContext,
    events: {} as InvoiceEvent,
  },
  guards: {
    canRetry,
    hasCredits,
    isValidFormat,
  },
  actions: {
    /** Log a state transition — in production pipe to structured logger. */
    logTransition: ({ context, event }) => {
      // Pure definition — logging wired at interpretation time.
      void context;
      void event;
    },
    /** Bump the retry counter by one. */
    incrementRetryCount: assign({
      retryCount: ({ context }) => context.retryCount + 1,
    }),
    /** Record an error message from a failing event. */
    setErrorMessage: assign({
      errorMessage: ({ event }) => {
        if (
          'errorMessage' in event &&
          typeof (event as Record<string, unknown>).errorMessage === 'string'
        ) {
          return (event as Record<string, unknown>).errorMessage as string;
        }
        return null;
      },
    }),
    /** Clear a previously stored error. */
    clearErrorMessage: assign({ errorMessage: () => null }),
    /** Placeholder credit deduction — wired to real service at runtime. */
    deductCredits: ({ context }) => {
      void context;
    },
  },
}).createMachine({
  id: 'invoice',
  initial: 'UPLOADED',
  context: {
    invoiceId: '',
    userId: '',
    retryCount: 0,
    format: '',
    errorMessage: null,
  },
  states: {
    // ── Upload & quarantine ────────────────────────────────────────────
    UPLOADED: {
      on: {
        QUARANTINE: {
          target: 'QUARANTINED',
          actions: ['logTransition'],
        },
      },
    },

    QUARANTINED: {
      on: {
        SCAN_PASS: {
          target: 'SCANNING',
          actions: ['logTransition'],
        },
      },
    },

    SCANNING: {
      on: {
        SCAN_PASS: {
          target: 'EXTRACTING',
          actions: ['logTransition', 'clearErrorMessage'],
        },
        SCAN_FAIL: {
          target: 'SCAN_FAILED',
          actions: ['logTransition', 'setErrorMessage'],
        },
      },
    },

    SCAN_FAILED: {
      on: {
        RETRY: {
          target: 'SCANNING',
          guard: 'canRetry',
          actions: ['logTransition', 'incrementRetryCount', 'clearErrorMessage'],
        },
      },
    },

    // ── Extraction ─────────────────────────────────────────────────────
    EXTRACTING: {
      on: {
        EXTRACT_SUCCESS: {
          target: 'EXTRACTED',
          actions: ['logTransition', 'clearErrorMessage'],
        },
        EXTRACT_FAIL: {
          target: 'FAILED',
          actions: ['logTransition', 'setErrorMessage'],
        },
      },
    },

    EXTRACTED: {
      on: {
        APPROVE: {
          target: 'REVIEW',
          actions: ['logTransition'],
        },
      },
    },

    // ── Review & conversion ────────────────────────────────────────────
    REVIEW: {
      on: {
        CONVERT: {
          target: 'CONVERTING',
          guard: { type: 'hasCredits' },
          actions: ['logTransition'],
        },
      },
    },

    CONVERTING: {
      on: {
        CONVERT_SUCCESS: {
          target: 'CONVERTED',
          actions: ['logTransition', 'deductCredits'],
        },
        CONVERT_FAIL: {
          target: 'FAILED',
          actions: ['logTransition', 'setErrorMessage'],
        },
      },
    },

    CONVERTED: {
      on: {
        ARCHIVE: {
          target: 'ARCHIVED',
          actions: ['logTransition'],
        },
      },
    },

    // ── Terminal / retryable failure ───────────────────────────────────
    FAILED: {
      on: {
        RETRY: {
          target: 'EXTRACTING',
          guard: 'canRetry',
          actions: ['logTransition', 'incrementRetryCount', 'clearErrorMessage'],
        },
      },
    },

    ARCHIVED: {
      type: 'final',
    },
  },
});

export type InvoiceMachine = typeof invoiceMachine;
