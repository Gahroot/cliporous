import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Mesh } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { describe, expect, it } from 'vitest';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { ExplainerProvider } from '../../stage';
import { VariationRangeDiagram } from './variation-range-Diagram';
import { VariationRangeModels } from './variation-range-models';
import {
  variationRangePages,
  variationRangePageTimes,
  variationRangePose,
  variationRangeRecords,
} from './variation-range-poses';
import { variationRangeTestScenes } from './variation-range-poses.fixtures';

const tags = (source: string, tag: string) =>
  [...source.matchAll(new RegExp(`<${tag}(?:[ >])`, 'g'))].length;
const svgTags = (source: string) => [...source.matchAll(/<[a-zA-Z][^/ >]*/g)].length;

describe('variation/range actual hidden authored composition costs (CPU/SSR, not GPU)', () => {
  // Measured real component trees, including zero-opacity children and wrapped text tspans.
  const budgets = [
    [14, 27],
    [17, 24],
    [49, 73],
    [49, 101],
    [49, 101],
    [17, 29],
    [17, 27],
    [17, 27],
    [17, 29],
    [17, 33],
    [17, 33],
    [17, 29],
    [17, 24],
    [17, 24],
    [46, 73],
    [17, 27],
    [49, 150],
  ] as const;
  it('pins every composed model and SVG child at five beats, invisible setup and final hold in both modes', () => {
    for (const [index, original] of variationRangeTestScenes().entries())
      for (const visualMode of ['diagram', 'hybrid'] as const) {
        const scene = { ...original, visualMode },
          records = variationRangeRecords(scene);
        const populationMarks =
          scene.storyId === '13'
            ? records.filter(
                ({ quantity }) =>
                  quantity.basis.unit === 'count' &&
                  'amount' in quantity &&
                  quantity.amount.kind === 'rational' &&
                  quantity.amount.value.denominator === 1 &&
                  quantity.amount.value.numerator > 0,
              ).length
            : 0;
        const expectedMeshes =
          records.length * 4 + populationMarks * 3 + (scene.storyId === '14' ? 9 : 0);
        const counts: number[] = [];
        for (const t of [
          0,
          scene.setupAt,
          scene.actionAt + 0.2,
          scene.responseAt + 0.2,
          scene.checkAt + 0.2,
          scene.resolveAt + 0.2,
          scene.resolveAt + 100,
          ...variationRangePageTimes(scene),
        ]) {
          const pose = variationRangePose(scene, t);
          const model = renderToStaticMarkup(createElement(VariationRangeModels, { scene, pose }));
          const svg = renderToStaticMarkup(
            createElement('svg', {}, createElement(VariationRangeDiagram, { scene, pose })),
          );
          expect(tags(model, 'mesh')).toBe(budgets[index][0]);
          expect(tags(model, 'mesh')).toBe(expectedMeshes);
          expect(model).not.toMatch(/<(?:instancedMesh|skinnedMesh|primitive)[ >]/);
          counts.push(svgTags(svg));
          expect(svg.match(/data-page-record-id=/g)).toHaveLength(
            variationRangePages(scene).length,
          );
        }
        // All source-preserving detail pages remain composed even at zero opacity.
        expect(new Set(counts).size).toBe(1);
        expect(counts[0]).toBe(budgets[index][1]);
        const layers = visualMode === 'hybrid' ? 2 : 1;
        // Both hybrid planes remain composed at opacity zero; shared chrome is HTML, not SVG.
        for (const aspect of ['9:16', '16:9'] as const) {
          const planes = renderToStaticMarkup(
            createElement(
              ExplainerProvider,
              {
                value: {
                  aspect,
                  nativeStage: true,
                  presentation: aspect === '16:9' ? 'full-frame' : undefined,
                },
              },
              createElement(
                'div',
                {},
                ...Array.from({ length: layers }, (_, i) =>
                  createElement(
                    DiagramSurface,
                    {
                      key: i,
                      opacity: i ? 0 : 1,
                    },
                    createElement(VariationRangeDiagram, {
                      scene,
                      pose: variationRangePose(scene, scene.resolveAt + 0.2),
                    }),
                  ),
                ),
              ),
            ),
          );
          // Actual StageSpace controller is a fragment in portrait, a div in native-wide.
          expect(svgTags(planes)).toBe(
            1 + layers * (budgets[index][1] + (aspect === '16:9' ? 1 : 0)),
          );
          expect(tags(planes, 'svg')).toBe(layers);
        }
        expect(expectedMeshes).toBeLessThanOrEqual(49);
        if (scene.storyId === '14') expect(expectedMeshes).toBe(17);
        if (scene.storyId === '13' && records.length === 7)
          expect(expectedMeshes).toBe(populationMarks === 7 ? 49 : 46);
      }
  });
  it('separates shared studio generation: eight mesh objects, six instances, then display/scratch shadow planes', () => {
    const room = new RoomEnvironment();
    let meshObjects = 0,
      instances = 0;
    room.traverse((object) => {
      if (object instanceof Mesh) meshObjects++;
      if ('isInstancedMesh' in object && object.isInstancedMesh && 'count' in object)
        instances += Number(object.count);
    });
    expect({ meshObjects, instances }).toEqual({ meshObjects: 8, instances: 6 });
    room.dispose();
    const shadow = readFileSync('node_modules/@react-three/drei/core/ContactShadows.js', 'utf8');
    expect(shadow.match(/new THREE\.Mesh\(planeGeometry\)/g)).toHaveLength(1);
    expect(shadow.match(/React\.createElement\("mesh",/g)).toHaveLength(1);
    // Two shadow objects are separate from the 8-mesh environment and authored models; no fake GL/context.
    const shadowObjects = 2;
    expect(49 + meshObjects + shadowObjects).toBe(59);
    expect(17 + meshObjects + shadowObjects).toBe(27);
    const stage = readFileSync('src/main/remotion/compositions/explainer/Stage3D.tsx', 'utf8');
    expect(stage.match(/<ThreeCanvas\b/g)).toHaveLength(1);
    expect(stage.match(/<StudioEnvironment\b/g)).toHaveLength(1);
    expect(stage.match(/<ContactShadows\b/g)).toHaveLength(1);
  });
  it('checks ownership source marker only: one shared hybrid stage, zero diagram Canvas by branch, not a native execution claim', () => {
    const view = readFileSync(
      'src/main/remotion/compositions/explainer/expansion/probability/variation-range-Scene.tsx',
      'utf8',
    );
    const stage = readFileSync(
      'src/main/remotion/compositions/explainer/diagrams/HybridStage.tsx',
      'utf8',
    );
    expect(view.match(/<HybridStage\b/g)).toHaveLength(1);
    expect(view).not.toMatch(/<ThreeCanvas|<Stage3D/);
    expect(stage).toMatch(/if \(scene\.visualMode === 'diagram'\)\s*return \(?\s*<DiagramStage/);
    expect(stage.match(/<Stage3D\b/g)).toHaveLength(1);
    expect(stage).toContain('driftDeg={0}');
    expect(stage).toContain('pushAmount={0}');
    expect(stage).toContain('bobAmount={0}');
  });
});
