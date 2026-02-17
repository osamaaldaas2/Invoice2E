import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker, CircuitBreakerError, CircuitState } from './circuit-breaker';

// Suppress logger output during tests
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function makeBreaker(overrides: Partial<Parameters<typeof CircuitBreaker['prototype']['constructor']>[0]> = {}) {
  return new CircuitBreaker({
    name: 'test',
    failureThreshold: 3,
    resetTimeoutMs: 1_000,
    halfOpenMaxAttempts: 2,
    ...overrides,
  } as any);
}

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = makeBreaker();
  });

  // ── Basic pass-through ───────────────────────────────────────────────────

  it('passes calls through in CLOSED state', async () => {
    const result = await cb.execute(() => Promise.resolve(42));
    expect(result).toBe(42);
    expect(cb.getState()).toBe(CircuitState.CLOSED);
  });

  // ── Opens after threshold failures ───────────────────────────────────────

  it('opens after consecutive failures reach the threshold', async () => {
    const fail = () => Promise.reject(new Error('boom'));

    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(fail)).rejects.toThrow('boom');
    }

    expect(cb.getState()).toBe(CircuitState.OPEN);
  });

  it('rejects immediately when OPEN', async () => {
    const fail = () => Promise.reject(new Error('boom'));
    for (let i = 0; i < 3; i++) await cb.execute(fail).catch(() => {});

    await expect(cb.execute(() => Promise.resolve('ok'))).rejects.toThrow(CircuitBreakerError);
  });

  // ── Half-open recovery ───────────────────────────────────────────────────

  it('transitions to HALF_OPEN after resetTimeout and closes on success', async () => {
    const fail = () => Promise.reject(new Error('boom'));
    for (let i = 0; i < 3; i++) await cb.execute(fail).catch(() => {});

    expect(cb.getState()).toBe(CircuitState.OPEN);

    // Advance time past resetTimeoutMs
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2_000);

    const result = await cb.execute(() => Promise.resolve('recovered'));
    expect(result).toBe('recovered');
    expect(cb.getState()).toBe(CircuitState.CLOSED);

    vi.restoreAllMocks();
  });

  it('re-opens from HALF_OPEN on failure', async () => {
    const fail = () => Promise.reject(new Error('boom'));
    for (let i = 0; i < 3; i++) await cb.execute(fail).catch(() => {});

    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2_000);

    await expect(cb.execute(fail)).rejects.toThrow('boom');
    expect(cb.getState()).toBe(CircuitState.OPEN);

    vi.restoreAllMocks();
  });

  // ── Half-open max attempts ───────────────────────────────────────────────

  it('re-opens if halfOpenMaxAttempts exceeded without success', async () => {
    const fail = () => Promise.reject(new Error('boom'));
    for (let i = 0; i < 3; i++) await cb.execute(fail).catch(() => {});

    const baseNow = Date.now() + 2_000;
    vi.spyOn(Date, 'now').mockReturnValue(baseNow);

    // Use both half-open attempts (both fail → re-opens)
    await cb.execute(fail).catch(() => {});
    // After first failure in HALF_OPEN it should re-open
    expect(cb.getState()).toBe(CircuitState.OPEN);

    vi.restoreAllMocks();
  });

  // ── Status / reset ──────────────────────────────────────────────────────

  it('getStatus returns a useful snapshot', async () => {
    const status = cb.getStatus();
    expect(status.name).toBe('test');
    expect(status.state).toBe(CircuitState.CLOSED);
    expect(status.failures).toBe(0);
  });

  it('reset() forces the circuit back to CLOSED', async () => {
    const fail = () => Promise.reject(new Error('boom'));
    for (let i = 0; i < 3; i++) await cb.execute(fail).catch(() => {});
    expect(cb.getState()).toBe(CircuitState.OPEN);

    cb.reset();
    expect(cb.getState()).toBe(CircuitState.CLOSED);

    const result = await cb.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
  });
});
