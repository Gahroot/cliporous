import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => tmpdir() } }));

import { resolveSegmentTransitions } from './layout-transitions';
import {
  type ResolvedSegment,
  renderedExplainerLayout,
  transitionArchetype,
} from './segment-render';

const dir = mkdtempSync(join(tmpdir(), 'seg-explainer-layout-'));
const stage = join(dir, 'stage.mp4');
writeFileSync(stage, '');
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function seg(extra: Partial<ResolvedSegment> = {}): ResolvedSegment {
  return {
    startTime: 0,
    endTime: 3,
    archetype: 'talking-head',
    zoom: { style: 'none', intensity: 1 },
    transitionIn: 'hard-cut',
    ...extra,
  };
}

const scene = (explainerLayout?: ResolvedSegment['explainerLayout']): ResolvedSegment =>
  seg({ archetype: 'split-image', videoPath: stage, explainerLayout });

describe('explainerLayout plumbing', () => {
  it("normalises 'stack' / undefined to the classic split (undefined)", () => {
    expect(renderedExplainerLayout(scene())).toBeUndefined();
    expect(renderedExplainerLayout(scene('stack'))).toBeUndefined();
    expect(renderedExplainerLayout(scene('pip'))).toBe('pip');
  });

  it('ignores the field when the segment is not a split-image with media', () => {
    expect(renderedExplainerLayout(seg({ explainerLayout: 'over' }))).toBeUndefined();
    expect(
      renderedExplainerLayout(
        seg({
          archetype: 'split-image',
          videoPath: join(dir, 'missing.mp4'),
          explainerLayout: 'over',
        }),
      ),
    ).toBeUndefined();
    expect(
      renderedExplainerLayout(
        seg({ archetype: 'fullscreen-image', videoPath: stage, explainerLayout: 'takeover' }),
      ),
    ).toBeUndefined();
  });

  it('keeps the classic panel wipes for stack scenes', () => {
    const t = resolveSegmentTransitions(
      [seg(), scene(), seg()].map((s) => ({
        archetype: transitionArchetype(s),
        transitionIn: s.transitionIn,
      })),
      true,
    );
    expect(t).toEqual(['hard-cut', 'panel-in', 'panel-out']);
  });

  it('resolves non-stack layouts by what they look like', () => {
    const run = (layout: ResolvedSegment['explainerLayout']) =>
      resolveSegmentTransitions(
        [seg(), scene(layout), seg()].map((s) => ({
          archetype: transitionArchetype(s),
          transitionIn: s.transitionIn,
        })),
        true,
      );
    // over = full-frame speaker + overlay: the style's cut (stage animates itself).
    expect(run('over')).toEqual(['hard-cut', 'hard-cut', 'hard-cut']);
    for (const layout of ['takeover', 'pip', 'stack-flipped'] as const) {
      expect(run(layout)).toEqual(['hard-cut', 'smooth-dissolve', 'smooth-dissolve']);
    }
  });

  it('transitions disabled → every boundary is a hard cut', () => {
    const t = resolveSegmentTransitions(
      [seg(), scene('pip'), seg()].map((s) => ({
        archetype: transitionArchetype(s),
        transitionIn: s.transitionIn,
      })),
      false,
    );
    expect(t).toEqual(['hard-cut', 'hard-cut', 'hard-cut']);
  });
});
