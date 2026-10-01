import { createHash } from 'node:crypto';
import {
  EXPLAINER_SCENE_KINDS,
  type ExplainerScene,
  type ExplainerSceneKind,
  HERO_PROPS,
  type HeroProp,
} from '../../remotion/compositions/explainer/types';
import type { PlannedExplainerScene } from '../explainer-scenes';

export interface AnimationSignature {
  kind: ExplainerSceneKind;
  presetId?: string;
  prop?: HeroProp;
  tone?: 'up' | 'down';
  variantId?: string;
}
export interface UsageChoice {
  signature: AnimationSignature;
  count: number;
}
export interface UsageRecord {
  clipHash: string;
  order: number;
  choices: UsageChoice[];
}

const digest = (value: string): string => createHash('sha256').update(value).digest('hex');
const hash = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const clone = (record: UsageRecord): UsageRecord => ({
  ...record,
  choices: record.choices.map(({ signature, count }) => ({ signature: { ...signature }, count })),
});
function object(raw: unknown, keys: string[]): raw is Record<string, unknown> {
  return (
    !!raw &&
    typeof raw === 'object' &&
    Object.getPrototypeOf(raw) === Object.prototype &&
    Reflect.ownKeys(raw).every((key) => typeof key === 'string' && keys.includes(key))
  );
}

/** Persist only animation identity: never labels, timings, paths or transcript. */
export function animationSignature(scene: ExplainerScene): AnimationSignature {
  const signature: AnimationSignature = { kind: scene.kind };
  if ('preset' in scene) signature.presetId = digest(scene.preset);
  if (scene.kind === 'hero') {
    signature.prop = scene.prop;
    signature.tone = scene.tone ?? 'up';
  }
  const fields = ['template', 'target', 'route', 'style', 'trend', 'medium', 'heavier', 'variant'];
  const body = scene as unknown as Record<string, unknown>;
  const variants = fields
    .filter((key) => typeof body[key] === 'string')
    .map((key) => [key, body[key]]);
  if (variants.length) signature.variantId = digest(JSON.stringify(variants));
  return signature;
}

export function summarizeUsage(scenes: readonly PlannedExplainerScene[]): UsageChoice[] {
  const choices = new Map<string, UsageChoice>();
  for (const { scene } of scenes) {
    const signature = animationSignature(scene);
    const key = JSON.stringify(signature);
    const previous = choices.get(key);
    if (previous) previous.count = Math.min(64, previous.count + 1);
    else if (choices.size < 12) choices.set(key, { signature, count: 1 });
  }
  return [...choices.values()];
}

export function clipIdentity(sourceIdentity: string, start: number, end: number): string {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
    throw new Error('Invalid clip times');
  return digest(JSON.stringify([sourceIdentity, start, end]));
}

export function isUsageRecord(raw: unknown): raw is UsageRecord {
  if (
    !object(raw, ['clipHash', 'order', 'choices']) ||
    !hash(raw.clipHash) ||
    !Number.isSafeInteger(raw.order) ||
    (raw.order as number) < 0 ||
    !Array.isArray(raw.choices) ||
    raw.choices.length > 12
  )
    return false;
  return raw.choices.every((choice: unknown) => {
    if (
      !object(choice, ['signature', 'count']) ||
      !Number.isInteger(choice.count) ||
      (choice.count as number) < 1 ||
      (choice.count as number) > 64
    )
      return false;
    const s = choice.signature;
    return (
      object(s, ['kind', 'presetId', 'prop', 'tone', 'variantId']) &&
      EXPLAINER_SCENE_KINDS.some((kind) => kind === s.kind) &&
      (!('prop' in s) || HERO_PROPS.some((prop) => prop === s.prop)) &&
      (!('tone' in s) || s.tone === 'up' || s.tone === 'down') &&
      (!('presetId' in s) || hash(s.presetId)) &&
      (!('variantId' in s) || hash(s.variantId))
    );
  });
}

/** Inspect at most the last 64 inputs; return the last 20 distinct clips, oldest first. */
export function recentSnapshot(
  records: readonly UsageRecord[],
  excludeClipHash?: string,
): UsageRecord[] {
  const unique = new Map<string, UsageRecord>();
  for (const record of records
    .slice(-64)
    .filter(isUsageRecord)
    .sort((a, b) => a.order - b.order)) {
    if (record.clipHash !== excludeClipHash) unique.set(record.clipHash, record);
  }
  return [...unique.values()]
    .sort((a, b) => a.order - b.order)
    .slice(-20)
    .map(clone);
}

export function recencyPenalty(
  records: readonly UsageRecord[],
  choice: { kind: ExplainerSceneKind; prop?: HeroProp },
): number {
  let weight = 0;
  recentSnapshot(records)
    .reverse()
    .forEach((record, age) => {
      for (const { signature, count } of record.choices) {
        if (signature.kind === choice.kind && (!choice.prop || signature.prop === choice.prop)) {
          weight += Math.min(count, 4) * 0.8 ** age;
        }
      }
    });
  return 0.5 * (1 - Math.exp(-weight / 4));
}

/** At most 12 recent identities, with bounded counts; no clip identifiers. */
export function recentPromptContext(records: readonly UsageRecord[]): string {
  const choices = new Map<string, UsageChoice>();
  for (const record of recentSnapshot(records).reverse()) {
    for (const { signature, count } of record.choices) {
      const key = JSON.stringify(signature);
      const previous = choices.get(key);
      if (previous) previous.count = Math.min(64, previous.count + count);
      else if (choices.size < 12) choices.set(key, { signature, count });
    }
  }
  return JSON.stringify([...choices.values()]);
}

export interface PlanningReservations {
  acquire(key: string, signal?: AbortSignal): Promise<UsageRecord[]>;
  reserve(key: string, choices: UsageChoice[]): void;
  release(key: string): void;
  record(key: string, choices: UsageChoice[]): UsageRecord;
}

/** Planning alone is serialized. Reservations survive encoding failures/releases. */
export function createPlanningReservations(
  jobs: readonly { key: string; clipHash: string }[],
  history: readonly UsageRecord[],
  startOrder: number,
): PlanningReservations {
  if (
    jobs.length > 1024 ||
    !Number.isSafeInteger(startOrder) ||
    startOrder < 0 ||
    !Number.isSafeInteger(startOrder + Math.max(0, jobs.length - 1)) ||
    new Set(jobs.map((job) => job.key)).size !== jobs.length ||
    jobs.some((job) => typeof job.key !== 'string' || !hash(job.clipHash))
  )
    throw new Error('Invalid planning jobs');
  type Waiter = {
    resolve: (records: UsageRecord[]) => void;
    reject: (error: Error) => void;
    clean: () => void;
  };
  const slots = jobs.map((job, index) => ({
    ...job,
    order: startOrder + index,
    state: 'waiting' as 'waiting' | 'active' | 'reserved' | 'released',
    waiter: undefined as Waiter | undefined,
    reservation: undefined as UsageRecord | undefined,
  }));
  const byKey = new Map(slots.map((slot) => [slot.key, slot]));
  const base = history.slice(-64).filter(isUsageRecord).map(clone);
  let cursor = 0;
  const abortError = () => Object.assign(new Error('Planning released'), { name: 'AbortError' });
  const get = (key: string) => {
    const slot = byKey.get(key);
    if (!slot) throw new Error('Unknown planning job');
    return slot;
  };
  const makeRecord = (key: string, choices: UsageChoice[]): UsageRecord => {
    const slot = get(key);
    const record = { clipHash: slot.clipHash, order: slot.order, choices };
    if (!isUsageRecord(record)) throw new Error('Invalid usage choices');
    return clone(record);
  };
  const pump = () => {
    while (slots[cursor] && ['reserved', 'released'].includes(slots[cursor].state)) cursor++;
    const slot = slots[cursor];
    if (slot?.state === 'waiting' && slot.waiter) {
      slot.state = 'active';
      const prior = slots.slice(0, cursor).flatMap((s) => (s.reservation ? [s.reservation] : []));
      slot.waiter.resolve(recentSnapshot([...base, ...prior], slot.clipHash));
    }
  };
  const release = (key: string): void => {
    const slot = get(key);
    if (slot.state === 'reserved' || slot.state === 'released') return;
    slot.state = 'released';
    slot.waiter?.clean();
    slot.waiter?.reject(abortError());
    slot.waiter = undefined;
    pump();
  };
  return {
    acquire(key: string, signal?: AbortSignal): Promise<UsageRecord[]> {
      return new Promise((resolve, reject) => {
        const slot = get(key);
        if (slot.state !== 'waiting' || slot.waiter)
          throw new Error('Planning already acquired or released');
        if (signal?.aborted) {
          release(key);
          reject(abortError());
          return;
        }
        const abort = () => release(key);
        slot.waiter = { resolve, reject, clean: () => signal?.removeEventListener('abort', abort) };
        signal?.addEventListener('abort', abort, { once: true });
        pump();
      });
    },
    reserve(key: string, choices: UsageChoice[]): void {
      const slot = get(key);
      if (slot.state !== 'active') throw new Error('Planning job is not active');
      slot.reservation = makeRecord(key, choices);
      slot.state = 'reserved';
      slot.waiter?.clean();
      slot.waiter = undefined;
      pump();
    },
    release,
    record(key: string, choices: UsageChoice[]): UsageRecord {
      if (get(key).state !== 'reserved') throw new Error('Planning job was not reserved');
      return makeRecord(key, choices);
    },
  };
}
