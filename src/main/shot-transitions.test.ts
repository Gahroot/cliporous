import { spawnSync } from 'node:child_process';
import type { ShotStyleConfig, ShotTransitionType } from '@shared/types';
import ffmpegPath from 'ffmpeg-static';
import { describe, expect, it } from 'vitest';
import { buildShotTransitionFilters, buildTransitionFilter } from './shot-transitions';

const FRAME = { width: 108, height: 192, fps: 30 };

function shots(types: ShotTransitionType[], shotLen = 0.6): ShotStyleConfig[] {
  const out: ShotStyleConfig[] = [];
  for (let i = 0; i <= types.length; i++) {
    const type = types[i];
    out.push({
      shotIndex: i,
      startTime: i * shotLen,
      endTime: (i + 1) * shotLen,
      ...(type ? { transitionOut: { type, duration: 0.4 } } : {}),
    } as ShotStyleConfig);
  }
  return out;
}

/** Run `filter` over a moving test pattern; return per-frame mean luma. */
function renderLuma(filter: string, duration: number): number[] {
  expect(ffmpegPath).toBeTruthy();
  const r = spawnSync(
    ffmpegPath as string,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      `testsrc2=size=${FRAME.width}x${FRAME.height}:rate=${FRAME.fps}:duration=${duration}`,
      '-vf',
      `${filter},format=gray,scale=1:1:flags=area`,
      '-f',
      'rawvideo',
      '-',
    ],
    { maxBuffer: 1 << 20 },
  );
  expect(r.status, r.stderr?.toString()).toBe(0);
  return [...r.stdout];
}

describe('buildShotTransitionFilters', () => {
  it.each<ShotTransitionType>([
    'crossfade',
    'dip-black',
    'glitch',
    'zoom-in',
    'zoom-punch',
    'swipe-left',
    'swipe-up',
    'swipe-down',
  ])('%s builds a filter the bundled FFmpeg accepts', (type) => {
    const filter = buildShotTransitionFilters(shots([type]), 1.2, FRAME);
    expect(filter).not.toBe('');
    const luma = renderLuma(filter, 1.2);
    expect(luma).toHaveLength(36);
  });

  it('crossfade dips luma in an eased bell centred on the cut', () => {
    const base = renderLuma('null', 1.2);
    const dipped = renderLuma(buildShotTransitionFilters(shots(['crossfade']), 1.2, FRAME), 1.2);
    const drop = dipped.map((v, i) => (base[i] ?? 0) - v);
    // Untouched outside the 0.4–0.8s window.
    expect(Math.max(...drop.slice(0, 11))).toBeLessThanOrEqual(1);
    expect(Math.max(...drop.slice(26))).toBeLessThanOrEqual(1);
    // Deepest at the cut (0.6s = frame 18), easing in and out of it.
    const peak = drop.indexOf(Math.max(...drop));
    expect(Math.abs(peak - 18)).toBeLessThanOrEqual(1);
    expect(drop[18]).toBeGreaterThan((drop[13] ?? 0) + 10);
  });

  it('folds every motion transition into a single zoompan pass', () => {
    const filter = buildShotTransitionFilters(
      shots(['zoom-in', 'swipe-up', 'zoom-punch', 'crossfade']),
      3,
      FRAME,
    );
    expect(filter.match(/zoompan=/g)).toHaveLength(1);
    expect(filter.match(/eq=/g)).toHaveLength(1);
    // `crop` cannot animate and rejects `enable` — it must not be used.
    expect(filter).not.toContain('crop=');
  });

  it('eases swipe headroom so the window edges do not pop', () => {
    const base = renderLuma('null', 1.2);
    const swiped = renderLuma(buildShotTransitionFilters(shots(['swipe-up']), 1.2, FRAME), 1.2);
    // First frame inside the 0.4s window barely differs; the cut differs a lot.
    const diff = swiped.map((v, i) => Math.abs(v - (base[i] ?? 0)));
    expect(diff[12]).toBeLessThanOrEqual(2);
  });

  it('skips motion transitions when output geometry is unknown', () => {
    expect(buildShotTransitionFilters(shots(['zoom-in']), 1.2)).toBe('');
    expect(buildTransitionFilter({ type: 'zoom-punch' }, 0.6, 1.2)).toBe('');
  });

  it('returns nothing for a single shot or all-none transitions', () => {
    expect(buildShotTransitionFilters(shots([]), 0.6, FRAME)).toBe('');
    expect(buildShotTransitionFilters(shots(['none']), 1.2, FRAME)).toBe('');
  });
});
