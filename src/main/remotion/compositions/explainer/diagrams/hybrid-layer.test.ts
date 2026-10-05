import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { DiagramSurface } from './DiagramStage';
import { hybridDiagramLayer } from './HybridStage';

// Inspect the pure React layer tree. No mocked Remotion/WebGL contexts and no native-pixel claim.
describe('hybrid planar layer selection', () => {
  it('omits absent diagrams rather than allocating an empty extra SVG layer', () => {
    for (const opacity of [0, 0.25, 0.5, 1]) {
      expect(hybridDiagramLayer(null, opacity)).toBeNull();
      expect(hybridDiagramLayer(undefined, opacity)).toBeNull();
    }
  });
  it('keeps authored diagrams and numeric zero content unchanged throughout handoff', () => {
    const authored = createElement('g', { 'data-source-id': 'source-1' });
    for (const diagram of [authored, 0]) {
      for (const opacity of [0, 0.25, 0.5, 1]) {
        const layer = hybridDiagramLayer(diagram, opacity);
        expect(layer?.type).toBe(DiagramSurface);
        expect(layer?.props).toEqual({ opacity, children: diagram });
      }
    }
  });
});
