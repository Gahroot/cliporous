import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { describe, expect, it } from 'vitest';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { DenominatorPartitionDiagram } from './denominator-partition-Diagram';
import { DenominatorPartitionModels } from './denominator-partition-models';
import { denominatorPartitionPose } from './denominator-partition-poses';
import { denominatorPartitionCases } from './denominator-partition-test-fixtures';

const colors = { surface: '#fff', text: '#111', accent: '#999', muted: '#555' };
const tags = (s: string, name: string) => [...s.matchAll(new RegExp(`<${name}\\b`, 'g'))].length;

describe('denominator/partition composed CPU geometry ceilings (not native/GPU proof)', () => {
  it('pins mounted geometry even during hidden beats and every source lens, with equal planar costs in both modes', () => {
    let meshes = 0,
      svg = 0;
    const storySvg = { '19': 0, '20': 0 };
    const ledger: Record<string, number[]> = {};
    const plots = readFileSync(
      'src/main/remotion/compositions/explainer/expansion/kits/plots.tsx',
      'utf8',
    );
    const instrument = plots.slice(
      plots.indexOf('export function PrecisionPlotClay('),
      plots.indexOf('export function PlotBandSvg('),
    );
    expect(instrument.match(/<ClayBlock\b/g)).toHaveLength(4);
    for (const size of [
      '[2.7, 1.6, 0.12]',
      '[2.75, 0.12, 0.44]',
      '[0.04, 1.3, 0.03]',
      '[2.3, 0.04, 0.03]',
    ]) {
      expect(instrument).toContain(`size={${size}}`);
    }
    for (const scene of denominatorPartitionCases()) {
      const criticalTimes = [
        scene.setupAt - 1,
        scene.setupAt,
        scene.actionAt,
        scene.responseAt,
        scene.checkAt,
        scene.resolveAt,
        12,
        NaN,
        Infinity,
        -Infinity,
      ];
      const visited = new Set<number>();
      const recordTimes = new Map<number, number>();
      const pagePoses = [];
      for (let frame = 0; frame <= 360; frame++) {
        const pose = denominatorPartitionPose(scene, frame / 30);
        if (!visited.has(pose.page)) pagePoses.push(pose);
        visited.add(pose.page);
        if (!recordTimes.has(pose.record)) recordTimes.set(pose.record, frame / 30);
      }
      expect(visited.size).toBe(denominatorPartitionPose(scene, 12).pages.length);
      expect(recordTimes.size).toBe(
        scene.storyId === '19' ? scene.comparisons.length : scene.parts.length,
      );
      let shape: string | undefined;
      for (const time of [...criticalTimes, ...recordTimes.values()]) {
        const pose = denominatorPartitionPose(scene, time);
        const model = renderToStaticMarkup(
          createElement(DenominatorPartitionModels, { scene, pose, colors }),
        );
        expect(model).not.toMatch(/<(?:instancedMesh|skinnedMesh|primitive)\b/);
        const expected = 8;
        expect(tags(model, 'mesh')).toBe(expected);
        meshes = Math.max(meshes, tags(model, 'mesh'));
        expect(model.match(/<mesh\b[^>]*\bgeometry=/g)).toHaveLength(8);
        expect(tags(model, 'meshPhysicalMaterial')).toBe(8);
        expect(model).not.toMatch(/NaN|Infinity/);
        // Opacity may vary; all mounted geometry, materials and physical placement remain identical.
        const staticShape = model.replace(/ opacity="[^"]*"/g, '');
        shape ??= staticShape;
        expect(staticShape).toBe(shape);
      }
      for (const pose of pagePoses) {
        const counts = (['diagram', 'hybrid'] as const).map((visualMode) => {
          const markup = renderToStaticMarkup(
            createElement(
              DiagramSurface,
              null,
              createElement(DenominatorPartitionDiagram, {
                scene: { ...scene, visualMode },
                pose,
              }),
            ),
          );
          expect(tags(markup, 'circle') + tags(markup, 'rect')).toBeLessThanOrEqual(100);
          const counts = ['svg', 'g', 'rect', 'circle', 'path', 'text'].map((tag) =>
            tags(markup, tag),
          );
          const total = counts.reduce((a, b) => a + b, 0);
          if (total > storySvg[scene.storyId]) ledger[scene.storyId] = counts;
          return total;
        });
        expect(counts[0]).toBe(counts[1]);
        svg = Math.max(svg, ...counts);
        storySvg[scene.storyId] = Math.max(storySvg[scene.storyId], ...counts);
      }
      expect(visited.size).toBe(denominatorPartitionPose(scene, 12).pages.length);
    }
    // Two ratio-bound groups add 2g + 4text to story 19's former 69 nodes.
    // Accepted maxima: two comparisons/two ratios, six parts and 13 source lines.
    expect({ meshes, svg, storySvg }).toEqual({
      meshes: 8,
      svg: 78,
      storySvg: { '19': 75, '20': 78 },
    });
    expect(ledger).toEqual({ '19': [1, 27, 0, 6, 6, 35], '20': [1, 26, 5, 6, 8, 32] });
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
    // Maximum live authored scene = 8 + 1 displayed shadow; scratch +1.
    // RoomEnvironment's 8 meshes (6 instances) are separate one-time PMREM preparation.
  });
  it('gates zero diagram canvases and one hybrid canvas through actual stage ownership, never a fake ThreeCanvas SSR context', () => {
    const route = readFileSync(
      'src/main/remotion/compositions/explainer/expansion/quantities/denominator-partition-Scene.tsx',
      'utf8',
    );
    expect(route).toMatch(/if \(scene.visualMode === 'diagram'\)[\s\S]*?<DiagramStage/);
    expect(route.match(/<HybridStage\b/g)).toHaveLength(1);
    expect(route).not.toMatch(/<Stage3D\b|<ThreeCanvas\b|<canvas\b/);
    const hybrid = readFileSync(
      'src/main/remotion/compositions/explainer/diagrams/HybridStage.tsx',
      'utf8',
    );
    expect(hybrid.match(/<Stage3D\b/g)).toHaveLength(1);
    for (const token of ['driftDeg={0}', 'pushAmount={0}', 'bobAmount={0}'])
      expect(hybrid).toContain(token);
    const diagram = readFileSync(
      'src/main/remotion/compositions/explainer/diagrams/DiagramStage.tsx',
      'utf8',
    );
    expect(diagram).not.toMatch(/import .*Stage3D|<ThreeCanvas\b|<canvas\b/);
  });
});
