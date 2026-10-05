import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { describe, expect, it } from 'vitest';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { DeviationMultiplesDiagram } from './deviation-multiples-Diagram';
import { DeviationMultiplesModels } from './deviation-multiples-models';
import { deviationMultiplesPose } from './deviation-multiples-poses';
import { deviationMultiplesCases } from './deviation-multiples-poses.test';

const colors = { surface: '#fff', text: '#111', accent: '#999', muted: '#555' };
const tags = (s: string, name: string) => [...s.matchAll(new RegExp(`<${name}\\b`, 'g'))].length;

describe('deviation/multiples composed CPU geometry ceilings (not native/GPU proof)', () => {
  it('pins mounted geometry even during hidden beats and every source lens, with equal planar costs in both modes', () => {
    let meshes = 0,
      svg = 0;
    for (const scene of deviationMultiplesCases()) {
      const visited = new Set<number>();
      for (let frame = 0; frame <= 360; frame++) {
        const pose = deviationMultiplesPose(scene, frame / 30);
        visited.add(pose.page);
        const model = renderToStaticMarkup(
          createElement(DeviationMultiplesModels, { scene, pose, colors }),
        );
        expect(model).not.toMatch(/<(?:instancedMesh|skinnedMesh|primitive)\b/);
        const expected = scene.storyId === '23' ? 8 : scene.records.length * 4;
        expect(tags(model, 'mesh')).toBe(expected);
        meshes = Math.max(meshes, tags(model, 'mesh'));
        const counts = (['diagram', 'hybrid'] as const).map((visualMode) => {
          const markup = renderToStaticMarkup(
            createElement(
              DiagramSurface,
              null,
              createElement(DeviationMultiplesDiagram, {
                scene: { ...scene, visualMode },
                pose,
              }),
            ),
          );
          return [...markup.matchAll(/<(?:svg|g|rect|circle|path|text)\b/g)].length;
        });
        expect(counts[0]).toBe(counts[1]);
        svg = Math.max(svg, ...counts);
      }
      expect(visited.size).toBe(deviationMultiplesPose(scene, 12).pages.length);
    }
    expect({ meshes, svg }).toEqual({ meshes: 16, svg: 58 });
  }, 30000);
  it('accounts separately for 8 studio meshes/6 instances and displayed/scratch shadow costs', () => {
    const room = new RoomEnvironment();
    let meshes = 0,
      instances = 0;
    room.traverse((object) => {
      if ('isMesh' in object && object.isMesh) meshes++;
      if ('isInstancedMesh' in object && object.isInstancedMesh && 'count' in object)
        instances += Number(object.count);
    });
    room.dispose();
    const shadows = readFileSync('node_modules/@react-three/drei/core/ContactShadows.js', 'utf8');
    expect(shadows.match(/new THREE.Mesh\(planeGeometry\)/g)).toHaveLength(1);
    expect(shadows.match(/React.createElement\("mesh"/g)).toHaveLength(1);
    expect({
      studioMeshes: meshes,
      studioInstances: instances,
      displayedShadow: 1,
      scratchShadow: 1,
    }).toEqual({ studioMeshes: 8, studioInstances: 6, displayedShadow: 1, scratchShadow: 1 });
    const stage = readFileSync('src/main/remotion/compositions/explainer/Stage3D.tsx', 'utf8');
    expect(stage.match(/<ThreeCanvas\b/g)).toHaveLength(1);
    expect(stage.match(/<StudioEnvironment\b/g)).toHaveLength(1);
    expect(stage.match(/<ContactShadows\b/g)).toHaveLength(1);
    expect(stage).not.toMatch(/<mesh\b/);
    // Maximum live authored scene = 16 + 1 displayed shadow; scratch +1.
    // RoomEnvironment's 8 meshes (6 instances) are separate one-time PMREM preparation.
  });
  it('gates zero diagram canvases and one hybrid canvas through actual stage ownership, never a fake ThreeCanvas SSR context', () => {
    const route = readFileSync(
      'src/main/remotion/compositions/explainer/expansion/quantities/deviation-multiples-Scene.tsx',
      'utf8',
    );
    expect(route).toContain("if (scene.visualMode === 'diagram') return diagram;");
    expect(route.match(/<Stage3D\b/g)).toHaveLength(1);
    expect(route).not.toMatch(/<ThreeCanvas\b|<canvas\b|<HybridStage\b/);
    for (const token of ['driftDeg={0}', 'pushAmount={0}', 'bobAmount={0}'])
      expect(route).toContain(token);
    const diagram = readFileSync(
      'src/main/remotion/compositions/explainer/diagrams/DiagramStage.tsx',
      'utf8',
    );
    expect(diagram).not.toMatch(/import .*Stage3D|<ThreeCanvas\b|<canvas\b/);
  });
});
