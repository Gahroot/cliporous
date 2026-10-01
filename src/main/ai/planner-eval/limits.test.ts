import { describe, expect, it } from 'vitest';
import { createRunLimits, DEFAULT_RUN_LIMITS } from './limits';

describe('subscription resource limits', () => {
  it('reserves 20 of 120 attempts for holdout and counts every phase', () => {
    const budget = createRunLimits({ now: () => 0 });
    for (let i = 0; i < 100; i++) {
      expect(budget.begin('discovery').ok).toBe(true);
      budget.finish('completed');
    }
    expect(budget.begin('discovery')).toEqual({ ok: false, reason: 'holdout-reserve' });
    for (let i = 0; i < 20; i++) {
      expect(budget.begin('holdout').ok).toBe(true);
      budget.finish('completed');
    }
    expect(budget.begin('holdout')).toEqual({ ok: false, reason: 'attempt-limit' });
    expect(budget.snapshot().attempts).toBe(120);
  });
  it('allows only one request at a time and enforces a fixed wall clock', () => {
    let time = 0;
    const budget = createRunLimits({ now: () => time });
    expect(budget.begin('discovery').ok).toBe(true);
    expect(budget.begin('holdout')).toEqual({ ok: false, reason: 'in-flight' });
    budget.finish('completed');
    time = DEFAULT_RUN_LIMITS.wallMs;
    expect(budget.begin('holdout')).toEqual({ ok: false, reason: 'wall-limit' });
  });
  it.each([
    'quota',
    'billing',
    'auth',
    'configuration',
    'cancelled',
    'unknown',
  ] as const)('stops after %s without fallback/retry', (status) => {
    const budget = createRunLimits({ now: () => 0 });
    budget.begin('discovery');
    budget.finish(status);
    expect(budget.begin('holdout')).toEqual({ ok: false, reason: status });
    expect(budget.snapshot().attempts).toBe(1);
  });
  it('bounds clearly transient failures and never hides an unknown outcome', () => {
    const budget = createRunLimits({ now: () => 0 });
    budget.begin('discovery');
    budget.finish('transient');
    expect(budget.begin('discovery').ok).toBe(true);
    budget.finish('transient');
    expect(budget.begin('discovery')).toEqual({ ok: false, reason: 'retry-limit' });
  });
  it('validates resumable accounting and preserves stopped runs', () => {
    expect(() =>
      createRunLimits({
        now: () => 0,
        state: { startedAt: 0, attempts: -1, consecutiveTransient: 0, stop: null },
      }),
    ).toThrow();
    const budget = createRunLimits({
      now: () => 20,
      state: { startedAt: 0, attempts: 99, consecutiveTransient: 0, stop: null },
    });
    expect(budget.begin('discovery').ok).toBe(true);
    budget.finish('completed');
    expect(budget.begin('discovery').ok).toBe(false);
  });
});
