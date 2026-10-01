// biome-ignore-all lint/correctness/noChildrenProp: React 19 createElement types require these components' required children prop.
import { createElement, Fragment, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { getLongformLayout } from '../../../../shared/longform-layout';
import type { LongformPresentation } from '../../../../shared/longform-scenes';
import { DiagramStage } from './diagrams/DiagramStage';
import { HybridStage } from './diagrams/HybridStage';
import type { DiagramStory } from './diagrams/types';
import { ExplanationStage } from './explanation-kit';
import { type ExplainerContextValue, ExplainerProvider } from './stage';
import { Outcome, TechText } from './technology/primitives';

vi.mock('remotion', async (original) => ({
  ...(await original<typeof import('remotion')>()),
  useCurrentFrame: () => 180,
  useVideoConfig: () => ({ fps: 30, width: 1920, height: 1080, durationInFrames: 240 }),
}));
// Exercise the actual Stage3D owner and sizing without pretending this is a WebGL/media proof.
vi.mock('@remotion/three', () => ({
  ThreeCanvas: ({ width, height, style }: { width: number; height: number; style: object }) =>
    createElement('canvas', { width, height, style }),
}));

const story: DiagramStory = {
  visualMode: 'hybrid',
  label: 'Conditional source-grounded explanation',
  subject: 'Subject',
  condition: 'Only if the stated condition holds',
  outcome: 'No invented outcome',
  evidence: 'illustrative',
  setupAt: 0,
  actionAt: 1,
  responseAt: 2,
  checkAt: 3,
  resolveAt: 4,
};
function render(children: ReactNode, value: Partial<ExplainerContextValue>): string {
  return renderToStaticMarkup(createElement(ExplainerProvider, { value, children }));
}
function ownerContent(): ReactNode {
  return createElement(
    Fragment,
    null,
    createElement(ExplanationStage, {
      scene: story,
      children: null,
    }),
    createElement(TechText, {
      x: 72,
      y: 205,
      width: 936,
      slot: 'status',
      children: 'Awaiting approval',
    }),
    createElement(Outcome, { text: 'Possible result', opacity: 1, status: 'waiting' }),
  );
}

for (const presentation of ['speaker-side', 'speaker-pip', 'full-frame'] as const)
  describe(presentation, () => {
    const layout = getLongformLayout(presentation);
    const value = {
      aspect: '16:9' as const,
      layout: 'over' as const,
      presentation,
      nativeStage: true,
    };
    it('shares one actual rectangular canvas and a fixed text rail across hybrid handoffs', () => {
      const html = render(
        createElement(HybridStage, {
          scene: story,
          model: null,
          diagram: createElement('text', null, 'Source diagram'),
        }),
        value,
      );
      expect(html.match(/<canvas/g)).toHaveLength(1);
      expect(html).toContain(`width="${layout.model.width}" height="${layout.model.height}"`);
      expect(html).toContain(`left:${layout.model.x}px;top:${layout.model.y}px`);
      expect(html).toContain('viewBox="0 0 952 478"');
      expect(html).toContain('preserveAspectRatio="xMidYMid meet"');
      for (const slot of ['title', 'condition', 'evidence', 'outcome'])
        expect(html).toContain(`data-longform-text="${slot}"`);
      // Editorial line breaks are intentional; verify the rendered copy, not HTML whitespace.
      expect(html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')).toContain('Illustrative example');
      expect(html).not.toContain('NaN');
    });
    it('gives diagrams the model region, no WebGL canvas, and preserves source copy', () => {
      const html = render(
        createElement(DiagramStage, {
          scene: story,
          children: createElement('text', null, '-100.25 USD'),
        }),
        value,
      );
      expect(html).not.toContain('<canvas');
      expect(html).toContain('-100.25 USD');
      expect(html).toContain(`width:${layout.model.width}px;height:${layout.model.height}px`);
      expect(html).toContain('data-longform-text="condition"');
    });
    it('reflows explanation/technology editorial copy without relocating model anchors', () => {
      const html = render(ownerContent(), value);
      expect(html.match(/<canvas/g)).toHaveLength(1);
      for (const slot of ['title', 'condition', 'status', 'outcome'])
        expect(html).toContain(`data-longform-text="${slot}"`);
      const anchored = render(
        createElement(TechText, { x: 321, y: 432, width: 250, children: 'Object label' }),
        value,
      );
      expect(anchored).toContain('left:321px;top:432px;width:250px');
      expect(anchored).not.toContain('data-longform-text');
    });
  });

it('ignores presentation completely in portrait, for every legacy layout and shared owner', () => {
  for (const layout of ['stack', 'stack-flipped', 'takeover', 'pip', 'over'] as const) {
    for (const content of [
      ownerContent(),
      createElement(HybridStage, { scene: story, model: null, diagram: null }),
      createElement(DiagramStage, { scene: story, children: null }),
    ]) {
      const baseline = render(content, { aspect: '9:16', layout, nativeStage: true });
      for (const presentation of [
        'speaker-side',
        'speaker-pip',
        'full-frame',
      ] as LongformPresentation[]) {
        expect(render(content, { aspect: '9:16', layout, presentation, nativeStage: true })).toBe(
          baseline,
        );
      }
      expect(baseline).not.toContain('data-longform-text');
    }
  }
});

it('preserves legacy landscape props and only opts in through the audited SceneFrame decision', () => {
  const legacy = render(ownerContent(), { aspect: '16:9', nativeStage: true });
  expect(legacy).toContain('width="1080" height="960"');
  expect(legacy).not.toContain('data-longform-text');
  const fallback = render(ownerContent(), {
    aspect: '16:9',
    presentation: 'full-frame',
    nativeStage: false,
  });
  expect(fallback).toBe(legacy);
});
