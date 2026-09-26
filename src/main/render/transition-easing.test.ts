import { spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { describe, expect, it } from 'vitest';
import {
  buildEasedAlphaEnvelope,
  buildEasedMotionExpr,
  buildPanelInExpr,
  buildPanelOutExpr,
  buildSmoothDissolveExpr,
  type EaseName,
  ease,
  easeExpr,
  quantizeToFrames,
} from './transition-easing';

/** Evaluate an FFmpeg arithmetic expression in JS (test-only mini evaluator). */
function evalFfmpegExpr(expr: string, vars: Record<string, number>): number {
  const js = expr.replace(/\bif\(/g, 'iff(');
  const names = Object.keys(vars);
  const fn = new Function('iff', 'lt', 'pow', 'clip', ...names, `return (${js});`) as (
    ...args: unknown[]
  ) => number;
  return fn(
    (c: number, a: number, b: number) => (c ? a : b),
    (a: number, b: number) => (a < b ? 1 : 0),
    Math.pow,
    (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v)),
    ...names.map((n) => vars[n]),
  );
}

function runFfmpeg(args: string[]): { status: number | null; stderr: string } {
  expect(ffmpegPath).toBeTruthy();
  const r = spawnSync(ffmpegPath as string, ['-hide_banner', '-loglevel', 'error', ...args], {
    encoding: 'utf8',
  });
  return { status: r.status, stderr: r.stderr };
}

const CURVES: EaseName[] = [
  'linear',
  'smoothstep',
  'easeInCubic',
  'easeOutCubic',
  'easeInOutCubic',
];

describe('ease', () => {
  it.each(CURVES)('%s starts at 0, ends at 1, and never decreases', (name) => {
    expect(ease(name, 0)).toBe(0);
    expect(ease(name, 1)).toBeCloseTo(1, 10);
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const v = ease(name, i / 100);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('clamps progress outside [0, 1]', () => {
    expect(ease('smoothstep', -2)).toBe(0);
    expect(ease('smoothstep', 3)).toBe(1);
    expect(ease('easeOutCubic', Number.NaN)).toBe(0);
  });

  it.each(CURVES)('easeExpr(%s) matches ease() at every sampled point', (name) => {
    const expr = easeExpr(name, 'q');
    for (let i = 0; i <= 20; i++) {
      const q = i / 20;
      expect(evalFfmpegExpr(expr, { q })).toBeCloseTo(ease(name, q), 10);
    }
  });
});

describe('quantizeToFrames', () => {
  it('rounds to whole frames with a one-frame floor', () => {
    expect(quantizeToFrames(0.3, 30)).toBeCloseTo(9 / 30, 10);
    expect(quantizeToFrames(0.001, 30)).toBeCloseTo(1 / 30, 10);
  });
});

describe('xfade custom expressions', () => {
  it('smooth dissolve eases (slow start, full midpoint blend, slow finish)', () => {
    const expr = buildSmoothDissolveExpr();
    const at = (forward: number): number => evalFfmpegExpr(expr, { A: 0, B: 1, P: 1 - forward });
    expect(at(0)).toBe(0);
    expect(at(0.5)).toBeCloseTo(0.5, 10);
    expect(at(1)).toBe(1);
    // Eased: the first 10% of time covers far less than 10% of the blend.
    expect(at(0.1)).toBeLessThan(0.05);
  });

  it.each([
    ['panel-in', buildPanelInExpr()],
    ['panel-out', buildPanelOutExpr()],
    ['dissolve', buildSmoothDissolveExpr()],
  ])('%s is accepted by the bundled FFmpeg xfade filter', (_name, expr) => {
    const r = runFfmpeg([
      '-f',
      'lavfi',
      '-i',
      'color=c=red:size=108x192:rate=30:duration=0.5',
      '-f',
      'lavfi',
      '-i',
      'color=c=blue:size=108x192:rate=30:duration=0.5',
      '-filter_complex',
      `[0:v][1:v]xfade=transition=custom:expr='${expr}':duration=0.3:offset=0.1[v]`,
      '-map',
      '[v]',
      '-f',
      'null',
      '-',
    ]);
    expect(r.status, r.stderr).toBe(0);
  });
});

describe('buildEasedAlphaEnvelope', () => {
  it('emits one single-frame step per ramp frame on entry and exit', () => {
    const env = buildEasedAlphaEnvelope(1, 3, 0.2, 30);
    const steps = env.split(',colorchannelmixer');
    expect(steps).toHaveLength(12); // 6 entry + 6 exit frames
    const alphas = [...env.matchAll(/aa=([0-9.]+)/g)].map((m) => Number(m[1]));
    const entry = alphas.slice(0, 6);
    expect(entry).toEqual([...entry].sort((a, b) => a - b));
    expect(Math.max(...alphas)).toBeLessThan(1);
    expect(Math.min(...alphas)).toBeGreaterThan(0);
  });

  it('returns a pass-through for windows too short to ramp', () => {
    expect(buildEasedAlphaEnvelope(1, 1.02, 0.3, 30)).toBe('null');
  });

  it('shapes the overlay opacity on real frames', () => {
    // White RGBA overlay over black, visible 0.2s→1.0s with a 0.2s ramp.
    const env = buildEasedAlphaEnvelope(0.2, 1.0, 0.2, 30);
    const r = spawnSync(
      ffmpegPath as string,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=black:size=16x16:rate=30:duration=1.2',
        '-f',
        'lavfi',
        '-i',
        'color=c=white:size=16x16:rate=30:duration=1.2',
        '-filter_complex',
        `[1:v]format=rgba,${env}[o];[0:v][o]overlay=0:0:enable='between(t,0.2,0.999)',` +
          'format=gray,scale=1:1[v]',
        '-map',
        '[v]',
        '-f',
        'rawvideo',
        '-',
      ],
      { maxBuffer: 1 << 20 },
    );
    expect(r.status, r.stderr?.toString()).toBe(0);
    const luma = [...r.stdout];
    // Before the window: black. Ramp frames rise monotonically. Hold: white.
    expect(luma[3]).toBeLessThan(5);
    const ramp = luma.slice(6, 12);
    expect(ramp).toEqual([...ramp].sort((a, b) => a - b));
    expect(ramp[0]).toBeGreaterThan(0);
    expect(ramp[0]).toBeLessThan(60);
    expect(luma[18]).toBeGreaterThan(250);
    // Exit ramp falls back toward black.
    expect(luma[29]).toBeLessThan(luma[24] ?? 0);
  });
});

describe('buildEasedMotionExpr', () => {
  it('starts at `from`, rests, and leaves toward `to` with eased velocity', () => {
    const expr = buildEasedMotionExpr({ start: 1, end: 3, dur: 0.4, from: 100, rest: 0, to: -100 });
    const at = (t: number): number => evalFfmpegExpr(expr, { t });
    expect(at(1)).toBeCloseTo(100, 6);
    expect(at(1.4)).toBeCloseTo(0, 6);
    expect(at(2)).toBeCloseTo(0, 6);
    expect(at(3)).toBeCloseTo(-100, 6);
    // Ease-out entry: the first 25% of the time covers well over 25% of travel.
    expect(100 - at(1.1)).toBeGreaterThan(50);
    // Ease-in exit: the first 25% of the exit covers little travel.
    expect(at(2.7)).toBeGreaterThan(-5);
  });
});
