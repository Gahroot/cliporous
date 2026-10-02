import { describe, expect, it } from 'vitest';
import { containLongformSource, getLongformLayout } from '../../shared/longform-layout';
import {
  LONGFORM_PRESENTATIONS,
  type LongformScenePlacement,
  type SceneFirstLongformPlan,
} from '../../shared/longform-scenes';
import type { CompiledLongformScene } from '../ai/longform-scene-contract';
import { buildLongformSceneLayout } from '../layouts/longform-layouts';
import { buildLongformSceneTimeline } from './longform-scene-timeline';

function placement(id: string, startTime: number, endTime: number): LongformScenePlacement {
  return {
    id,
    startTime,
    endTime,
    kind: 'statement',
    startWord: 0,
    endWord: 1,
    sectionId: 'section',
    presentation: 'speaker-side',
    sourceSpec: {},
    label: id,
    purpose: 'Explain',
  };
}
function timeline(scenes: LongformScenePlacement[], sourceDuration: number) {
  const plan: SceneFirstLongformPlan = {
    mode: 'scene-first',
    schemaVersion: 2,
    parserVersion: 1,
    sourceFingerprint: 'unused',
    sourceDuration,
    blocks: [],
    phrases: [],
    sections: [],
    scenes,
    reasoning: '',
    generatedAt: 0,
  };
  const compiled: CompiledLongformScene[] = scenes
    .filter((scene) => !scene.omitted)
    .map((scene) => ({
      kind: 'explainer',
      placement: scene,
      planned: {
        startTime: scene.startTime,
        endTime: scene.endTime,
        scene: { kind: 'statement', words: [{ text: 'Source', at: scene.startTime }] },
        layout: 'takeover',
        chained: false,
        transition: 'fade',
        cues: [],
      },
    }));
  return { plan, compiled };
}

describe('approved scene timeline frame contract', () => {
  it('retains every frame and complete outward-rounded scene, including one-frame gaps/tails', () => {
    const { plan, compiled } = timeline(
      [placement('one', 1.013, 4.015), placement('two', 4.067, 4.1)],
      4.12,
    );
    const result = buildLongformSceneTimeline(plan, compiled);
    expect(result.totalFrames).toBe(124);
    expect(
      result.segments.map((segment) => [segment.kind, segment.startFrame, segment.endFrame]),
    ).toEqual([
      ['speaker', 0, 30],
      ['scene', 30, 121],
      ['speaker', 121, 122],
      ['scene', 122, 123],
      ['speaker', 123, 124],
    ]);
    expect(
      result.segments.reduce((sum, segment) => sum + segment.endFrame - segment.startFrame, 0),
    ).toBe(result.totalFrames);
    for (const segment of result.segments) {
      expect(segment.startTime).toBe(segment.startFrame / 30);
      expect(segment.endTime).toBe(segment.endFrame / 30);
    }
  });

  it('does not apply legacy block caps, six-second spacing or minimum insert lengths', () => {
    const { plan, compiled } = timeline(
      [placement('complete-story', 0, 18), placement('adjacent', 18, 20)],
      20,
    );
    expect(
      buildLongformSceneTimeline(plan, compiled).segments.map((segment) => [
        segment.kind,
        segment.startTime,
        segment.endTime,
      ]),
    ).toEqual([
      ['scene', 0, 18],
      ['scene', 18, 20],
    ]);
  });

  it('rejects frame collisions instead of silently dropping a scene or clipping its story', () => {
    const { plan, compiled } = timeline(
      [placement('first', 1, 4.01), placement('conflict', 4.02, 6)],
      10,
    );
    expect(() => buildLongformSceneTimeline(plan, compiled)).toThrow(/conflict.*overlaps/);
  });

  it('rejects missing compiled content and gives omissions explicit results', () => {
    const { plan, compiled } = timeline([placement('first', 1, 4)], 10);
    expect(() => buildLongformSceneTimeline(plan, [])).toThrow(/not reconstructed/);
    plan.scenes[0].omitted = true;
    const result = buildLongformSceneTimeline(plan, compiled);
    expect(result.segments).toEqual([
      { kind: 'speaker', startFrame: 0, endFrame: 300, startTime: 0, endTime: 10 },
    ]);
    expect(result.omitted).toEqual([expect.objectContaining({ id: 'first', status: 'omitted' })]);
  });
});

describe('FFmpeg shares the landscape presentation geometry', () => {
  it.each(
    LONGFORM_PRESENTATIONS,
  )('uses shared rectangles and safe contain for %s', (presentation) => {
    for (const [sourceWidth, sourceHeight] of [
      [1920, 1080],
      [1080, 1920],
      [1280, 1024],
    ]) {
      const filter = buildLongformSceneLayout({
        sourceWidth,
        sourceHeight,
        presentation,
        frameCount: 121,
        background: '#123456',
      });
      expect(filter).toContain('color=c=#123456:s=1920x1080:r=30');
      expect(filter).toContain('trim=end_frame=121');
      expect(filter).not.toMatch(/crop=|stretch|zoompan/);
      const speaker = getLongformLayout(presentation).speaker;
      if (speaker) {
        const contained = containLongformSource(sourceWidth, sourceHeight, speaker);
        expect(filter).toContain(`scale=${contained.width}:${contained.height}`);
        expect(filter).toContain(`overlay=x=${contained.x}:y=${contained.y}`);
      } else expect(filter).not.toContain('[0:v]');
      expect(filter).toContain('[1:v]');
    }
  });

  it('composites storyboard alpha above the whole contained source, not above black', () => {
    const filter = buildLongformSceneLayout({
      sourceWidth: 1080,
      sourceHeight: 1920,
      frameCount: 90,
      presentation: 'full-frame',
      sourceUnderlay: true,
      background: '#f6ecd9',
    });
    expect(filter).toContain('[0:v]');
    expect(filter).toContain('[base][speaker]overlay');
    expect(filter).toContain('[placed][scene]overlay=x=0:y=0');
    expect(filter.indexOf('[base][speaker]')).toBeLessThan(filter.indexOf('[placed][scene]'));
    expect(filter).toContain('[board]format=yuv420p[outv]');
    expect(() =>
      buildLongformSceneLayout({
        sourceWidth: 1920,
        sourceHeight: 1080,
        frameCount: 90,
        presentation: 'speaker-side',
        sourceUnderlay: true,
        background: '#f6ecd9',
      }),
    ).toThrow('full-frame');
  });

  it('contains the whole source in speaker-only fallback without an explanation input', () => {
    const filter = buildLongformSceneLayout({
      sourceWidth: 1080,
      sourceHeight: 1920,
      frameCount: 1,
      background: '#123456',
    });
    const source = containLongformSource(1080, 1920, { x: 0, y: 0, width: 1920, height: 1080 });
    expect(filter).toContain(`scale=${source.width}:${source.height}`);
    expect(filter).not.toContain('[1:v]');
    expect(filter).toContain('trim=end_frame=1');
  });
});
