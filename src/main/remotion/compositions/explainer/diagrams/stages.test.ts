import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HybridStage } from './HybridStage';
import type { DiagramStory } from './types';

vi.mock('../stage', async (original) => {
  const actual = await original<typeof import('../stage')>();
  return {
    ...actual,
    useStage: () => actual.STAGE,
    useSceneTime: () => ({ t: 5, frame: 150, fps: 30 }),
  };
});

// Mount real React components and context hooks; stop only at the WebGL boundary.
// Rendered media evidence remains separate from this stage-ownership assertion.
vi.mock('../Stage3D', () => ({
  Stage3D: () => createElement('div', { 'data-webgl-stage': 'true' }),
}));
const story: DiagramStory = {
  visualMode: 'diagram',
  label: 'Same meaning',
  subject: 'Example',
  outcome: 'Relationship retained',
  evidence: 'illustrative',
  setupAt: 0.3,
  actionAt: 2,
  responseAt: 4,
  checkAt: 6,
  resolveAt: 8,
};
describe('presentation stage ownership', () => {
  for (const visualMode of ['diagram', 'hybrid'] as const) {
    it(`${visualMode} mounts ${visualMode === 'diagram' ? 0 : 1} WebGL stages`, () => {
      const view = createElement(HybridStage, {
        scene: { ...story, visualMode },
        model: null,
        diagram: null,
      });
      const markup = renderToStaticMarkup(view);
      const count = markup.match(/data-webgl-stage="true"/g)?.length ?? 0;
      expect(count).toBe(visualMode === 'diagram' ? 0 : 1);
    });
  }
});
