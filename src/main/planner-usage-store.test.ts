import { mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UsageRecord } from './ai/explainer/recent-usage';
import { createPlannerUsageStore } from './planner-usage-store';

let directory: string;
const record = (clip: number, order = clip): UsageRecord => ({
  clipHash: clip.toString(16).padStart(64, '0'),
  order,
  choices: [{ signature: { kind: 'hero', prop: 'battery', tone: 'down' }, count: 1 }],
});
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'planner-history-test-'));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('derived local planner history', () => {
  it('writes atomically and idempotently, deduplicates rerenders, retains64 with20clip snapshots', async () => {
    const store = createPlannerUsageStore(directory);
    await store.load();
    for (let i = 1; i <= 70; i++) expect(await store.commit(record(i))).toBe(true);
    const file = join(directory, 'planner-usage-v1.json');
    const original = await readFile(file, 'utf8');
    expect(await store.commit(record(70))).toBe(true);
    expect(await readFile(file, 'utf8')).toBe(original);
    expect(JSON.parse(original).records).toHaveLength(64);
    expect(store.snapshot()).toHaveLength(20);
    expect(
      store.snapshot(record(70).clipHash).some((r) => r.clipHash === record(70).clipHash),
    ).toBe(false);
    expect(await store.commit({ ...record(70, 71), choices: [] })).toBe(true);
    expect((await store.load()).filter((r) => r.clipHash === record(70).clipHash)).toHaveLength(1);
    expect(await readdir(directory)).toEqual(['planner-usage-v1.json']);
  });
  it('preserves malformed history byte-for-byte and warns once without blocking exports', async () => {
    const file = join(directory, 'planner-usage-v1.json');
    await writeFile(file, 'malformed original');
    const warn = vi.fn();
    const store = createPlannerUsageStore(directory, { warn });
    expect(await store.load()).toEqual([]);
    expect(await store.commit(record(1))).toBe(false);
    expect(await store.commit(record(2))).toBe(false);
    expect(await readFile(file, 'utf8')).toBe('malformed original');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(store.disabled()).toBe(true);
  });
  it('a failed replacement cannot damage previous history or leak temp files', async () => {
    let fail = false;
    const warn = vi.fn();
    const store = createPlannerUsageStore(directory, {
      warn,
      replace: async (a, b) => {
        if (fail) throw new Error('disk full');
        await rename(a, b);
      },
    });
    await store.load();
    await store.commit(record(1));
    const before = await readFile(join(directory, 'planner-usage-v1.json'), 'utf8');
    fail = true;
    expect(await store.commit(record(2))).toBe(false);
    expect(await readFile(join(directory, 'planner-usage-v1.json'), 'utf8')).toBe(before);
    expect(await readdir(directory)).toEqual(['planner-usage-v1.json']);
    expect(warn).toHaveBeenCalledTimes(1);
  });
  it('serializes concurrent commits in explicit order rather than encoding finish order', async () => {
    const store = createPlannerUsageStore(directory);
    await store.load();
    expect(store.reserveOrders(3)).toBe(0);
    expect(store.reserveOrders(2)).toBe(3);
    await Promise.all([
      store.commit(record(3, 3)),
      store.commit(record(1, 1)),
      store.commit(record(2, 2)),
    ]);
    expect((await store.load()).map((r) => r.order)).toEqual([1, 2, 3]);
    await store.commit(record(3, 1));
    expect((await store.load()).at(-1)?.order).toBe(3);
  });
  it('rejects sensitive/unknown fields and does no write after cancellation', async () => {
    const store = createPlannerUsageStore(directory);
    await store.load();
    expect(await store.commit({ ...record(1), transcript: 'private' } as UsageRecord)).toBe(false);
    expect(await readdir(directory)).toEqual([]);
    const fresh = createPlannerUsageStore(directory);
    await fresh.load();
    expect(await fresh.commit(record(1), AbortSignal.abort())).toBe(false);
    expect(await readdir(directory)).toEqual([]);
  });
});
