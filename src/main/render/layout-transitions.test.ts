import type { Archetype, TransitionType } from '@shared/types';
import { describe, expect, it } from 'vitest';
import {
  boundaryStepSeconds,
  layoutFamilyOf,
  pickFadeByBrightness,
  resolveBoundaryTransition,
  resolveSegmentTransitions,
  xfadeTransitionFor,
} from './layout-transitions';

describe('layoutFamilyOf', () => {
  it.each<[Archetype, string]>([
    ['talking-head', 'speaker'],
    ['tight-punch', 'speaker'],
    ['wide-breather', 'speaker'],
    ['quote-lower', 'speaker'],
    ['split-image', 'split'],
    ['fullscreen-image', 'graphic'],
    ['fullscreen-quote', 'graphic'],
  ])('%s → %s', (archetype, family) => {
    expect(layoutFamilyOf(archetype)).toBe(family);
  });
});

describe('resolveBoundaryTransition', () => {
  it.each<[Archetype, Archetype, TransitionType, string]>([
    // Full screen → split screen: the b-roll panel slides in, face settles.
    ['talking-head', 'split-image', 'hard-cut', 'panel-in'],
    ['tight-punch', 'split-image', 'crossfade', 'panel-in'],
    // Split screen → full screen: panel slides out (was a hard cut before).
    ['split-image', 'talking-head', 'hard-cut', 'panel-out'],
    // Speaker ↔ full graphic / b-roll: eased dissolve, even when the style
    // asked for a hard cut into the speaker.
    ['fullscreen-image', 'talking-head', 'hard-cut', 'smooth-dissolve'],
    ['talking-head', 'fullscreen-image', 'crossfade', 'smooth-dissolve'],
    ['split-image', 'fullscreen-image', 'crossfade', 'smooth-dissolve'],
    // Same layout family keeps the style's intent.
    ['talking-head', 'tight-punch', 'hard-cut', 'hard-cut'],
    ['talking-head', 'wide-breather', 'crossfade', 'smooth-dissolve'],
    ['split-image', 'split-image', 'hard-cut', 'hard-cut'],
    // Deliberate style accents are never overridden.
    ['talking-head', 'tight-punch', 'flash-cut', 'flash-cut'],
    ['talking-head', 'fullscreen-quote', 'color-wash', 'color-wash'],
    ['talking-head', 'split-image', 'flash-cut', 'flash-cut'],
  ])('%s → %s (requested %s) resolves to %s', (prev, next, requested, expected) => {
    expect(resolveBoundaryTransition(prev, next, requested)).toBe(expected);
  });
});

describe('resolveSegmentTransitions', () => {
  const segments = [
    { archetype: 'talking-head' as const, transitionIn: 'hard-cut' as const },
    { archetype: 'split-image' as const, transitionIn: 'hard-cut' as const },
    { archetype: 'talking-head' as const, transitionIn: 'hard-cut' as const },
  ];

  it('never transitions into the first segment', () => {
    expect(resolveSegmentTransitions(segments, true)).toEqual([
      'hard-cut',
      'panel-in',
      'panel-out',
    ]);
  });

  it('hard-cuts every boundary when the user disabled transitions', () => {
    expect(resolveSegmentTransitions(segments, false)).toEqual([
      'hard-cut',
      'hard-cut',
      'hard-cut',
    ]);
  });
});

describe('xfadeTransitionFor', () => {
  it('returns null for a hard cut and quoted custom exprs for eased transitions', () => {
    expect(xfadeTransitionFor('hard-cut')).toBeNull();
    expect(xfadeTransitionFor('smooth-dissolve')).toMatch(/^custom:expr='.+'$/);
    expect(xfadeTransitionFor('panel-in')).toMatch(/^custom:expr='.*b0\(/);
    expect(xfadeTransitionFor('panel-out')).toMatch(/^custom:expr='.*a0\(/);
  });

  it('keeps flash/wash on built-in fades picked by flash colour brightness', () => {
    expect(xfadeTransitionFor('flash-cut', '#FFFFFF')).toBe('fadewhite');
    expect(xfadeTransitionFor('color-wash', '#23100c')).toBe('fadeblack');
    expect(xfadeTransitionFor('color-wash')).toBe('fadeblack');
    expect(pickFadeByBrightness('not-a-colour')).toBe('fadewhite');
  });
});

describe('boundaryStepSeconds', () => {
  it('uses one frame for hard cuts and frame-quantized durations otherwise', () => {
    expect(boundaryStepSeconds('hard-cut', 0.3, 30)).toBeCloseTo(1 / 30, 10);
    expect(boundaryStepSeconds('smooth-dissolve', 0.3, 30)).toBeCloseTo(9 / 30, 10);
  });

  it('gives layout changes a slightly longer, still frame-aligned, move', () => {
    const s = boundaryStepSeconds('panel-in', 0.3, 30);
    expect(s).toBeGreaterThan(0.3);
    expect(Number.isInteger(Math.round(s * 30 * 1e6) / 1e6)).toBe(true);
  });
});
