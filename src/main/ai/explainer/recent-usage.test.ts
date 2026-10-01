import { describe, expect, it, vi } from 'vitest';
import type { ExplainerScene } from '../../remotion/compositions/explainer/types';
import type { PlannedExplainerScene } from '../explainer-scenes';
import {
  animationSignature,
  clipIdentity,
  createPlanningReservations,
  isUsageRecord,
  recencyPenalty,
  recentPromptContext,
  recentSnapshot,
  summarizeUsage,
  type UsageChoice,
  type UsageRecord,
} from './recent-usage';

const hero: ExplainerScene = { kind: 'hero', prop: 'battery', label: 'PRIVATE', at: 1 };
const choice: UsageChoice = { signature: { kind: 'hero', prop: 'battery', tone: 'up' }, count: 1 };
const hash = (n: number) => clipIdentity('PRIVATE/path.mp4', n, n + 1);
const record = (n: number): UsageRecord => ({ clipHash: hash(n), order: n, choices: [choice] });
const jobs = [0, 1, 2].map((n) => ({ key: String(n), clipHash: hash(n) }));
const planned = (scene: ExplainerScene): PlannedExplainerScene => ({
  scene,
  startTime: 0,
  endTime: 5,
  layout: 'stack',
  chained: false,
  transition: 'fade',
  cues: [],
});

describe('recent animation usage', () => {
  it('separates presets, props, tones and variants without retaining source text', () => {
    const relay: ExplainerScene = {
      kind: 'relay',
      preset: 'unlock',
      label: 'PRIVATE',
      sourceAt: 1,
      transferAt: 2,
      receiveAt: 3,
      outcomeAt: 4,
    };
    const a = animationSignature(relay);
    expect(a.presetId).toMatch(/^[a-f0-9]{64}$/);
    expect(a).not.toEqual(animationSignature({ ...relay, preset: 'nurture' }));
    expect(animationSignature(hero)).not.toEqual(animationSignature({ ...hero, prop: 'lock' }));
    expect(animationSignature(hero)).not.toEqual(animationSignature({ ...hero, tone: 'down' }));
    expect(animationSignature(hero)).toEqual(
      animationSignature({ ...hero, tone: 'up', label: 'new', at: 9 }),
    );
    const chart: ExplainerScene = {
      kind: 'chart',
      style: 'bars',
      trend: 'up',
      points: [],
      title: 'PRIVATE',
      growAt: 1,
    };
    expect(animationSignature(chart).variantId).toMatch(/^[a-f0-9]{64}$/);
    expect(animationSignature(chart)).not.toEqual(animationSignature({ ...chart, style: 'line' }));
    expect(JSON.stringify([a, animationSignature(chart), animationSignature(hero)])).not.toContain(
      'PRIVATE',
    );
    expect(summarizeUsage([planned(hero), planned({ ...hero, label: 'other' })])).toEqual([
      { ...choice, count: 2 },
    ]);
    expect(summarizeUsage(Array.from({ length: 100 }, () => planned(hero)))[0].count).toBe(64);
    expect(
      summarizeUsage(
        Array.from({ length: 20 }, (_, n) =>
          planned({ ...relay, preset: String(n) as typeof relay.preset }),
        ),
      ),
    ).toHaveLength(12);
  });

  it('hashes unambiguous source and time identities', () => {
    expect(hash(1)).toMatch(/^[a-f0-9]{64}$/);
    expect(hash(1)).toBe(hash(1));
    expect(hash(1)).not.toBe(hash(2));
    expect(clipIdentity('other', 1, 2)).not.toBe(hash(1));
    expect(clipIdentity('PRIVATE/path.mp4', 1, 3)).not.toBe(hash(1));
    expect(() => clipIdentity('source', Number.NaN, 2)).toThrow();
  });

  it('deduplicates rerenders by order, excludes same clip and bounds input/output', () => {
    const records = Array.from({ length: 80 }, (_, n) => record(n));
    expect(recentSnapshot(records).map((r) => r.order)).toEqual(
      records.slice(-20).map((r) => r.order),
    );
    expect(recentSnapshot([{ ...record(0), order: 999 }, ...records])).not.toContainEqual(
      expect.objectContaining({ order: 999 }),
    );
    expect(recentSnapshot([record(1), { ...record(1), order: 5 }, record(2)])).toEqual([
      record(2),
      { ...record(1), order: 5 },
    ]);
    expect(recentSnapshot(records, hash(79))).toHaveLength(20);
    expect(recentSnapshot(records, hash(79)).at(-1)?.order).toBe(78);
    const copy = recentSnapshot([record(1)]);
    copy[0].choices[0].count = 9;
    expect(choice.count).toBe(1);
  });

  it('strictly rejects sensitive fields, unknown IDs, invalid hashes and counts', () => {
    expect(isUsageRecord(record(1))).toBe(true);
    const invalid = [
      null,
      [],
      { ...record(1), path: 'PRIVATE' },
      { ...record(1), clipHash: 'source' },
      { ...record(1), order: 1.2 },
      { ...record(1), order: Number.MAX_SAFE_INTEGER + 1 },
      { ...record(1), choices: Array(13).fill(choice) },
      ...[0, -1, 1.2, 65, Infinity].map((count) => ({
        ...record(1),
        choices: [{ ...choice, count }],
      })),
      ...[
        { kind: 'unknown' },
        { kind: 'hero', prop: 'unknown' },
        { kind: 'hero', tone: 'sideways' },
        { kind: 'hero', presetId: 'PRIVATE' },
        { kind: 'hero', variantId: 'PRIVATE' },
        { kind: 'hero', label: 'PRIVATE' },
        { kind: 'hero', transcript: 'PRIVATE' },
      ].map((signature) => ({ ...record(1), choices: [{ signature, count: 1 }] })),
      { ...record(1), choices: [{ ...choice, path: 'PRIVATE' }] },
    ];
    for (const raw of invalid) expect(isUsageRecord(raw)).toBe(false);
    expect(isUsageRecord({ ...record(1), choices: [] })).toBe(true);
  });

  it('uses only relevant softly decaying history and emits bounded safe prompt IDs', () => {
    const unrelated: UsageRecord = {
      ...record(2),
      choices: [{ signature: { kind: 'chart' }, count: 1 }],
    };
    const query = { kind: 'hero', prop: 'battery' } as const;
    expect(recencyPenalty([], query)).toBe(0);
    expect(recencyPenalty([unrelated], query)).toBe(0);
    expect(recencyPenalty([record(1)], query)).toBeGreaterThan(
      recencyPenalty([record(1), unrelated], query),
    );
    expect(recencyPenalty([record(1)], query)).toBeGreaterThan(
      recencyPenalty([record(1)], { kind: 'hero', prop: 'lock' }),
    );
    expect(
      recencyPenalty(
        Array.from({ length: 80 }, (_, n) => record(n)),
        query,
      ),
    ).toBeLessThanOrEqual(0.5);
    const prompt = recentPromptContext(Array.from({ length: 80 }, (_, n) => record(n)));
    expect(prompt).toContain('battery');
    expect(prompt).not.toContain(hash(79));
    expect(prompt.length).toBeLessThanOrEqual(4096);
    expect(recentPromptContext([{ ...record(1), path: 'PRIVATE' } as UsageRecord])).not.toContain(
      'PRIVATE',
    );
  });
});

describe('run-owned planning reservations', () => {
  it('gates racing requests in list order, keeping encoding/export independent', async () => {
    const gate = createPlanningReservations(jobs, [record(8)], 10);
    const events: string[] = [];
    const third = gate.acquire('2').then((context) => {
      events.push('2');
      return context;
    });
    const second = gate.acquire('1').then((context) => {
      events.push('1');
      return context;
    });
    expect(await gate.acquire('0')).toEqual([record(8)]);
    expect(events).toEqual([]);
    gate.reserve('0', [choice]);
    expect((await second).map((r) => r.order)).toEqual([8, 10]);
    expect(events).toEqual(['1']);
    gate.release('0');
    gate.reserve('1', [choice]);
    expect((await third).map((r) => r.order)).toEqual([8, 10, 11]);
    gate.reserve('2', [choice]);
    expect(gate.record('2', [choice]).order).toBe(12);
    expect(gate.record('0', [choice]).order).toBe(10);
    expect(events).toEqual(['1', '2']);
  });

  it('excludes current clip and isolates history, choices and runs', async () => {
    const gate = createPlanningReservations(
      [jobs[0], { ...jobs[1], clipHash: hash(0) }],
      [record(0)],
      5,
    );
    expect(await gate.acquire('0')).toEqual([]);
    gate.reserve('0', [choice]);
    expect(await gate.acquire('1')).toEqual([]);
    expect(await createPlanningReservations([jobs[0]], [], 0).acquire('0')).toEqual([]);
  });

  it('unblocks skipped/failed slots and cancelled waiters, removing abort listeners', async () => {
    const gate = createPlanningReservations(jobs, [], 0);
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const waiting = gate.acquire('1', controller.signal);
    const rejected = expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    const third = gate.acquire('2');
    gate.release('0');
    expect(await third).toEqual([]);
    expect(remove).toHaveBeenCalled();
    gate.release('2');
    expect(() => gate.reserve('1', [choice])).toThrow();
  });

  it('release cancels an outstanding waiter; abort before acquire also releases its slot', async () => {
    const gate = createPlanningReservations(jobs, [], 0);
    const waiting = expect(gate.acquire('1')).rejects.toMatchObject({ name: 'AbortError' });
    gate.release('1');
    await waiting;
    const controller = new AbortController();
    controller.abort();
    await expect(gate.acquire('0', controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(await gate.acquire('2')).toEqual([]);
  });

  it('validates job bounds, unique keys, order and choices without leaking gates', async () => {
    expect(() => createPlanningReservations(Array(1025).fill(jobs[0]), [], 0)).toThrow();
    expect(() => createPlanningReservations([jobs[0], jobs[0]], [], 0)).toThrow();
    expect(() => createPlanningReservations(jobs, [], Number.MAX_SAFE_INTEGER)).toThrow();
    const gate = createPlanningReservations(jobs, [], 0);
    await expect(gate.acquire('missing')).rejects.toThrow();
    expect(() => gate.reserve('1', [choice])).toThrow();
    await gate.acquire('0');
    expect(() => gate.reserve('0', [{ ...choice, count: 0 }])).toThrow();
    gate.release('0');
    expect(await gate.acquire('1')).toEqual([]);
  });
});
