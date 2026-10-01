import { describe, expect, it } from 'vitest';
import { retrievalGroundingCamera, retrievalSlipTextRect } from './retrieval-camera';
import { retrievalGroundingPose } from './retrieval-grounding';
import {
  retrievalLibraryCaption,
  retrievalSlipText,
  retrievalTextWidth,
  RETRIEVAL_TYPE as T,
} from './retrieval-text';
import type { RetrievalGroundingScene } from './types';

const scene: RetrievalGroundingScene = {
  kind: 'retrieval-grounding',
  preset: 'two-sources',
  label: 'Source-backed answer',
  subject: 'Question',
  outcome: 'Both sources retained',
  setupAt: 0.3,
  actionAt: 1.5,
  responseAt: 3,
  checkAt: 6.8,
  resolveAt: 8.4,
  sources: [
    { label: 'W'.repeat(22), excerpt: 'W'.repeat(40) },
    { label: 'M'.repeat(22), excerpt: 'M'.repeat(40) },
  ],
};

it('reports only the slips selected at the actual sequential departure beats', () => {
  const caption = (t: number) => retrievalLibraryCaption(retrievalGroundingPose(scene, t));
  const second = scene.responseAt + (scene.checkAt - scene.responseAt) / 2;
  expect(caption(scene.setupAt)).toBe('Source documents');
  expect(caption(scene.actionAt + 0.01)).toBe('Searching documents');
  expect(caption(scene.responseAt)).toBe('Excerpt selected');
  expect(caption(second - 1 / 30)).toBe('Excerpt selected');
  expect(caption(second)).toBe('Two excerpts selected');
  expect(caption(scene.resolveAt)).toBe('Two excerpts selected');
  const empty = { ...scene, preset: 'no-evidence' as const, sources: [] };
  expect(retrievalLibraryCaption(retrievalGroundingPose(empty, scene.resolveAt))).toBe('No match');
  const single = {
    ...scene,
    preset: 'evidence-found' as const,
    sources: scene.sources.slice(0, 1),
  };
  expect(retrievalLibraryCaption(retrievalGroundingPose(single, scene.resolveAt))).toBe(
    'Excerpt selected',
  );
});

const cases = [
  ...Array.from({ length: 95 }, (_, i) => String.fromCharCode(i + 32)),
  'MMMMMMM ',
  'WWWWW WWWW ',
  'International policies ',
  'counterrevolutionaries',
  'Ä',
  '界',
].map((token) => ({
  label: token.repeat(40).slice(0, 22),
  excerpt: token.repeat(40).slice(0, 40),
}));

describe('fixed readable source/excerpt typography', () => {
  it('preserves all maximum-length source characters, including spaces and unbroken words', () => {
    expect(T.sourceSize).toBeGreaterThanOrEqual(24);
    expect(T.excerptSize).toBeGreaterThanOrEqual(26);
    for (const source of cases) {
      const text = retrievalSlipText(source.label, source.excerpt, 2);
      expect(text.sourceLines.join('')).toBe(`[2] ${source.label}`);
      expect(text.excerptLines.join('')).toBe(source.excerpt);
      expect(text.sourceLines.length).toBeLessThanOrEqual(2);
      expect(text.excerptLines.length).toBeLessThanOrEqual(4);
      for (const line of text.sourceLines)
        expect(retrievalTextWidth(line, T.sourceSize)).toBeLessThanOrEqual(T.width);
      for (const line of text.excerptLines)
        expect(retrievalTextWidth(line, text.excerptSize)).toBeLessThanOrEqual(T.width);
      expect(text.height).toBeLessThanOrEqual(168);
      expect(text.excerptSize).toBeGreaterThanOrEqual(26);
      expect(text.excerptSize).toBeLessThanOrEqual(34);
    }
  });

  it('uses the available space to make ordinary excerpts easier to read', () => {
    const text = retrievalSlipText('Returns guide', 'Returns last thirty days', 1);
    expect(text.excerptSize).toBe(34);
    expect(text.height).toBeLessThanOrEqual(168);
    expect(text.excerptLines.join('')).toBe('Returns last thirty days');
  });

  it('fits worst-case wrapped text inside both projected papers at every camera/transfer frame', () => {
    for (let frame = 0; frame <= 306; frame++) {
      const t = frame / 30;
      const pose = retrievalGroundingPose(scene, t);
      const camera = retrievalGroundingCamera(scene, t);
      const rects = pose.slips.map((slip) => {
        const rect = retrievalSlipTextRect(camera, slip, pose.workspaceOffset);
        const text = retrievalSlipText(slip.label, slip.excerpt, slip.reference);
        expect(rect.width, `frame ${frame}, source ${slip.reference}`).toBeGreaterThanOrEqual(
          T.width,
        );
        expect(rect.height, `frame ${frame}, source ${slip.reference}`).toBeGreaterThanOrEqual(168);
        expect(text.height).toBeLessThanOrEqual(rect.height);
        expect(rect.top).toBeGreaterThanOrEqual(210);
        expect(rect.left).toBeGreaterThanOrEqual(64);
        expect(rect.left + T.width).toBeLessThanOrEqual(1016);
        return rect;
      });
      // Both full-height text regions remain separate, even during sequential transfers.
      expect(rects[0].top + 168).toBeLessThan(rects[1].top);
    }
  });
});
