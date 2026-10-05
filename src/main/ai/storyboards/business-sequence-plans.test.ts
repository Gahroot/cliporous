import { describe, expect, it } from 'vitest';
import { longformSourceFingerprint } from '../../../shared/longform-scenes';
import { BUILTIN_PALETTES } from '../../../shared/palettes';
import { STORYBOARD_LIMITS } from '../../../shared/storyboards';
import { LANDSCAPE_FPS } from '../../aspect-ratios';
import { buildLongformSceneTimeline } from '../../render/longform-scene-timeline';
import { buildLongformStoryboardProps } from '../../render/longform-storyboard-props';
import { validateSceneFirstLongformPlan } from '../longform-scene-contract';
import { BUSINESS_SEQUENCE_FIXTURES } from './business-sequences';
import { compileStoryboardSpec } from './compiler';
import { savedBoardFixture } from './fixtures';

/** Independent numeric-leaf check: clocks move, source indices/money/geometry do not. */
function assertClockShift(before: unknown, after: unknown, delta: number, key = ''): void {
  if (typeof before === 'number') {
    if (key === 'at' || key.endsWith('At')) expect(after).toBeCloseTo(before + delta, 10);
    else expect(after).toBe(before);
  } else if (Array.isArray(before)) {
    if (!Array.isArray(after)) throw new Error('Missing mapped array');
    expect(after).toHaveLength(before.length);
    before.forEach((value, index) => {
      assertClockShift(value, after[index], delta);
    });
  } else if (before && typeof before === 'object') {
    if (!after || typeof after !== 'object' || Array.isArray(after))
      throw new Error('Missing mapped object');
    const next = after as Record<string, unknown>;
    expect(Object.keys(next)).toEqual(Object.keys(before));
    for (const [name, value] of Object.entries(before))
      assertClockShift(value, next[name], delta, name);
  } else expect(after).toEqual(before);
}

describe('eight advanced sequences through saved production source reconstruction', () => {
  it('retains exactly the eight approved sequence targets', () => {
    expect(BUSINESS_SEQUENCE_FIXTURES.map((fixture) => fixture.id)).toEqual([
      'S-01',
      'S-02',
      'S-03',
      'S-04',
      'S-05',
      'S-06',
      'S-07',
      'S-08',
    ]);
  });

  it.each(
    BUSINESS_SEQUENCE_FIXTURES,
  )('$id: saved styles/palettes retain native meaning and segment clocks', (fixture) => {
    const original = JSON.stringify(fixture);
    expect(fixture.duration).toBeGreaterThan(STORYBOARD_LIMITS.longSourceSec);
    const compiled = compileStoryboardSpec(fixture.spec, fixture.words, {
      clipStart: 0,
      clipEnd: fixture.duration,
    });
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
    expect(compiled.value.endTime - compiled.value.startTime).toBeLessThanOrEqual(
      STORYBOARD_LIMITS.maxDurationSec,
    );
    expect(
      (compiled.value.endTime - compiled.value.startTime) / fixture.duration,
    ).toBeLessThanOrEqual(STORYBOARD_LIMITS.maxCoverage);
    expect(compiled.value.board.businessPanels?.length).toBeGreaterThan(0);
    const source = savedBoardFixture({
      words: [...fixture.words],
      duration: fixture.duration,
      spec: fixture.spec,
    });
    source.parserVersion = 3;
    for (const parserVersion of [2, 4]) {
      const incompatible = { ...source, parserVersion };
      const saved = JSON.stringify(incompatible);
      expect(validateSceneFirstLongformPlan(incompatible, fixture.words, fixture.duration).ok).toBe(
        false,
      );
      expect(JSON.stringify(incompatible)).toBe(saved);
    }
    expect(source.sourceFingerprint).toBe(
      longformSourceFingerprint(fixture.words, fixture.duration),
    );
    for (const style of ['ink', 'polish'] as const) {
      for (const palette of [BUILTIN_PALETTES[0], BUILTIN_PALETTES[1]]) {
        const saved = JSON.stringify({ ...source, storyboardStyle: style });
        const restored: unknown = JSON.parse(saved);
        const validated = validateSceneFirstLongformPlan(restored, fixture.words, fixture.duration);
        if (!validated.ok) throw new Error(validated.error);
        const scene = validated.value.scenes[0];
        if (scene.kind !== 'storyboard') throw new Error('Missing reconstructed storyboard');
        expect(scene.placement.sourceSpec).toEqual(fixture.spec);
        expect(scene.board).toEqual(compiled.value.board);
        const segment = buildLongformSceneTimeline(
          validated.value.plan,
          validated.value.scenes,
        ).segments.find((entry) => entry.kind === 'scene');
        if (!segment || segment.kind !== 'scene')
          throw new Error('Missing production scene segment');
        const props = buildLongformStoryboardProps(segment, style, palette);
        expect(props.style).toBe(style);
        expect(props.palette).toEqual(palette);
        expect(props.spec.businessPanels).toHaveLength(scene.board.businessPanels?.length ?? 0);
        scene.board.businessPanels?.forEach((panel, index) => {
          const mapped = props.spec.businessPanels?.[index];
          if (!mapped) throw new Error('Missing mapped native panel');
          expect(mapped.id).toBe(panel.id);
          expect(mapped.identityLinks).toEqual(panel.identityLinks);
          expect(mapped.startAt).toBeCloseTo(panel.startAt - segment.startTime, 10);
          expect(mapped.endAt).toBeCloseTo(panel.endAt - segment.startTime, 10);
          assertClockShift(panel.scene, mapped.scene, -segment.startTime);
        });
        expect(props.spec.durationSec).toBe(
          (segment.endFrame - segment.startFrame) / LANDSCAPE_FPS,
        );
        expect(JSON.stringify(restored)).toBe(saved);
      }
    }
    expect(JSON.stringify(fixture)).toBe(original);
  });
});
