import assert from 'node:assert/strict';
import type { startMetrics } from './metrics.mjs';

type RemotionModule = typeof import('../../src/main/remotion/render');
type EncodeModule = typeof import('../../src/main/render/longform-encode');
type SfxModule = typeof import('../../src/main/render/scene-sfx');
export type RenderOptions = Parameters<RemotionModule['renderRemotionSegment']>[0];
export type EncodeOptions = Parameters<EncodeModule['encodeLongformSceneSegment']>[0];
export type ConcatOptions = Parameters<EncodeModule['concatLongformSceneSegments']>[0];
export type MixArgs = Parameters<SfxModule['mixSceneSfx']>;
export interface ProofBoundary {
  unit: boolean;
  duration: number;
  ai: number;
  builds: number;
  renders: RenderOptions[];
  encodes: EncodeOptions[];
  concats: ConcatOptions[];
  mixes: { path: MixArgs[0]; cues: MixArgs[1]; opts: MixArgs[2] }[];
  paths: string[];
  failure: boolean;
  controller: AbortController | null;
  cancelAfterFrames: number;
  renderedFrames: number;
  alphaCapture: string;
  encoderStage: 'segment' | 'concat' | null;
  cancelEncoderStage: 'segment' | 'concat' | null;
  encoderStarts: string[];
}
export interface MediaContext {
  out: string;
  boundary: ProofBoundary;
  report: ReturnType<typeof startMetrics>;
}
export function required<T>(value: T | undefined | null, label: string): T {
  assert.ok(value !== undefined && value !== null, `Missing ${label}`);
  return value;
}
export function record(value: unknown): Record<string, unknown> {
  assert.ok(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    'Expected object',
  );
  return value as Record<string, unknown>;
}
export function jsonRecord(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  return record(value);
}
export function array(value: unknown): unknown[] {
  assert.ok(Array.isArray(value), 'Expected array');
  return value;
}
const TIME_KEYS = new Set([
  'at',
  'highlightAt',
  'rowsAt',
  'dotAt',
  'playAt',
  'glowAt',
  'shakeAt',
  'actionEndAt',
]);
/** Only authored absolute timestamps tolerate arithmetic round-off; every other leaf is exact. */
export function assertTimeRoundTrip(
  actual: unknown,
  expected: unknown,
  key = '',
  path = 'board',
): void {
  if (TIME_KEYS.has(key) && typeof actual === 'number' && typeof expected === 'number') {
    assert.ok(
      Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= 1e-9,
      `${path}: timestamp rebase drift`,
    );
    return;
  }
  if (Array.isArray(expected)) {
    const values = array(actual);
    assert.equal(values.length, expected.length, path);
    expected.forEach((value, index) => {
      assertTimeRoundTrip(values[index], value, '', `${path}[${index}]`);
    });
  } else if (expected !== null && typeof expected === 'object') {
    const left = record(actual),
      right = record(expected);
    assert.deepEqual(Object.keys(left).sort(), Object.keys(right).sort(), path);
    for (const [name, value] of Object.entries(right))
      assertTimeRoundTrip(left[name], value, name, `${path}.${name}`);
  } else assert.deepEqual(actual, expected, path);
}
