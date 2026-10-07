import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => '', on: vi.fn() } }));

const { resolveRenderConcurrency } = await import('./render');

describe('resolveRenderConcurrency', () => {
  it.each([
    { requested: undefined, concurrent: 1, cpus: 16, expected: 8 },
    { requested: undefined, concurrent: 2, cpus: 16, expected: 4 },
    { requested: undefined, concurrent: 3, cpus: 4, expected: 1 },
    { requested: 3, concurrent: 2, cpus: 16, expected: 3 },
  ])('requested=$requested concurrent=$concurrent cpus=$cpus → $expected', (c) => {
    expect(resolveRenderConcurrency(c.requested, c.concurrent, c.cpus)).toBe(c.expected);
  });
});
