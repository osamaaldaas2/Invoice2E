import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Circuit breaker states */
export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

/** Configuration for a circuit breaker instance */
export interface CircuitBreakerConfig {
  /** Name for logging/identification */
  readonly name: string;
  /** Number of consecutive failures before opening the circuit */
  readonly failureThreshold: number;
  /** Milliseconds to wait before transitioning from OPEN → HALF_OPEN */
  readonly resetTimeoutMs: number;
  /** Max attempts allowed in HALF_OPEN state before re-opening */
  readonly halfOpenMaxAttempts: number;
}

/** Snapshot of circuit breaker health */
export interface CircuitBreakerStatus {
  readonly name: string;
  readonly state: CircuitState;
  readonly failures: number;
  readonly lastFailureTime: number | null;
  readonly nextRetryTime: number | null;
}

// ─── Error ───────────────────────────────────────────────────────────────────

/** Thrown when a call is rejected because the circuit is open */
export class CircuitBreakerError extends AppError {
  constructor(circuitName: string) {
    super(
      'CIRCUIT_OPEN',
      `Circuit breaker "${circuitName}" is open — requests are being rejected`,
      503,
      { circuit: circuitName }
    );
    this.name = 'CircuitBreakerError';
  }
}

// ─── Default config ──────────────────────────────────────────────────────────

/**
 * FIX: Re-audit #67 — Verified production-ready defaults.
 *
 * - **failureThreshold (5):** Opens the circuit after 5 consecutive failures.
 *   Industry range 3–10; 5 tolerates transient blips without masking persistent
 *   outages.
 * - **resetTimeoutMs (30 000 ms / 30 s):** Cool-down before probing recovery.
 *   Industry range 10–60 s; 30 s balances fast recovery against overwhelming a
 *   provider that is still degraded.
 * - **halfOpenMaxAttempts (3):** Probe requests allowed before deciding whether
 *   to close or re-open. 3 gives a statistically meaningful success signal
 *   without flooding the recovering service.
 */
const DEFAULTS: Omit<CircuitBreakerConfig, 'name'> = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  halfOpenMaxAttempts: 3,
};

// ─── Circuit Breaker ─────────────────────────────────────────────────────────

/**
 * Implements the circuit breaker pattern for wrapping unreliable async calls.
 *
 * States:
 * - **CLOSED** — requests pass through normally; failures are counted.
 * - **OPEN** — requests are immediately rejected with `CircuitBreakerError`.
 * - **HALF_OPEN** — a limited number of probe requests are allowed through;
 *   success closes the circuit, failure re-opens it.
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private halfOpenAttempts = 0;
  private lastFailureTime: number | null = null;
  private readonly config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> & Pick<CircuitBreakerConfig, 'name'>) {
    this.config = { ...DEFAULTS, ...config };
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Execute an async function through the circuit breaker.
   *
   * @throws {CircuitBreakerError} if the circuit is OPEN and the reset
   *   timeout has not elapsed.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldTransitionToHalfOpen()) {
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        throw new CircuitBreakerError(this.config.name);
      }
    }

    if (
      this.state === CircuitState.HALF_OPEN &&
      this.halfOpenAttempts >= this.config.halfOpenMaxAttempts
    ) {
      this.transitionTo(CircuitState.OPEN);
      throw new CircuitBreakerError(this.config.name);
    }

    try {
      if (this.state === CircuitState.HALF_OPEN) {
        this.halfOpenAttempts++;
      }

      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /** Current circuit breaker status snapshot */
  getStatus(): CircuitBreakerStatus {
    return {
      name: this.config.name,
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      nextRetryTime:
        this.state === CircuitState.OPEN && this.lastFailureTime
          ? this.lastFailureTime + this.config.resetTimeoutMs
          : null,
    };
  }

  /** Convenience accessor */
  getState(): CircuitState {
    return this.state;
  }

  /** Force-reset the circuit to CLOSED (useful in tests / admin endpoints) */
  reset(): void {
    this.failures = 0;
    this.halfOpenAttempts = 0;
    this.lastFailureTime = null;
    this.transitionTo(CircuitState.CLOSED);
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.CLOSED);
    }
    this.failures = 0;
    this.halfOpenAttempts = 0;
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.OPEN);
      return;
    }

    if (this.failures >= this.config.failureThreshold) {
      this.transitionTo(CircuitState.OPEN);
    }
  }

  private shouldTransitionToHalfOpen(): boolean {
    if (!this.lastFailureTime) return false;
    return Date.now() - this.lastFailureTime >= this.config.resetTimeoutMs;
  }

  private transitionTo(newState: CircuitState): void {
    const prev = this.state;
    this.state = newState;

    if (newState === CircuitState.HALF_OPEN) {
      this.halfOpenAttempts = 0;
    }

    logger.info(`Circuit breaker "${this.config.name}" transitioned`, {
      from: prev,
      to: newState,
      failures: this.failures,
    });
  }
}
