import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { describe, expect, it } from 'vitest';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { ExplainerProvider } from '../../stage';
import { DistributionDiagram } from './distribution-Diagram';
import { DistributionModels } from './distribution-models';
import { distributionPose } from './distribution-poses';
import { distributionCases } from './distribution-poses.test';

const colors = { surface: '#fff', text: '#111', accent: '#999', muted: '#555' };
const tags = (s: string, name: string) => [...s.matchAll(new RegExp(`<${name}\\b`, 'g'))].length;

describe('distribution actual composed CPU geometry (not native/GPU proof)', () => {
  it('counts mounted and hidden meshes and every real source page with identical planar costs in both modes', () => {
    let meshes = 0,
      svg = 0,
      marks = 0;
    for (const scene of distributionCases()) {
      const visited = new Set<number>();
      for (let frame = 0; frame <= 420; frame++) {
        const pose = distributionPose(scene, frame / 30);
        if (visited.has(pose.page)) continue;
        visited.add(pose.page);
        const model = renderToStaticMarkup(
          createElement(DistributionModels, { scene, pose, colors }),
        );
        expect(model).not.toMatch(/<(?:instancedMesh|skinnedMesh|primitive|text|svg)\b/);
        expect(tags(model, 'mesh')).toBe(scene.storyId === '17' ? 25 : 21);
        meshes = Math.max(meshes, tags(model, 'mesh'));
        for (const aspect of ['9:16', '16:9'] as const) {
          const counts = (['diagram', 'hybrid'] as const).map((visualMode) => {
            const markup = renderToStaticMarkup(
              createElement(
                ExplainerProvider,
                {
                  value: {
                    aspect,
                    layout: aspect === '16:9' ? 'takeover' : 'stack',
                    nativeStage: true,
                  },
                },
                createElement(
                  DiagramSurface,
                  null,
                  createElement(DistributionDiagram, {
                    scene: { ...scene, visualMode },
                    pose,
                  }),
                ),
              ),
            );
            expect(tags(markup, 'svg')).toBe(1);
            expect(markup).not.toMatch(/<canvas\b|<mesh\b|NaN|Infinity|<image\b|<foreignObject\b/);
            const currentMarks =
              tags(markup, 'circle') +
              (scene.storyId === '17' ? tags(markup, 'rect') - scene.records.length : 0);
            expect(currentMarks).toBeLessThanOrEqual(100);
            marks = Math.max(marks, currentMarks);
            return [...markup.matchAll(/<(?:svg|g|rect|circle|path|text)\b/g)].length;
          });
          expect(counts[0]).toBe(counts[1]);
          svg = Math.max(svg, ...counts);
        }
      }
      expect(visited.size).toBe(distributionPose(scene, 100).pages.length);
    }
    expect({ meshes, svg, marks }).toEqual({ meshes: 25, svg: 84, marks: 24 });
  }, 60000);
  it('accounts separately for actual studio preparation and displayed/scratch shadows', () => {
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
    for (const tag of ['ThreeCanvas', 'StudioEnvironment', 'ContactShadows'])
      expect(stage.match(new RegExp(`<${tag}\\b`, 'g'))).toHaveLength(1);
    expect(stage).not.toMatch(/<mesh\b/);
    // Authored max 25 + displayed shadow 1 = 26 live; scratch +1 = 27.
    // Separate offline PMREM preparation: 8 meshes, including 6 instances.
  });
  it('gates zero diagram canvases/one hybrid canvas through real ownership without a fake ThreeCanvas context', () => {
    const route = readFileSync(
      'src/main/remotion/compositions/explainer/expansion/quantities/distribution-Scene.tsx',
      'utf8',
    );
    expect(route).toMatch(/if \(scene.visualMode === 'diagram'\)\s*return <DiagramStage/);
    expect(route.match(/<HybridStage\b/g)).toHaveLength(1);
    expect(route.match(/<DiagramSurface\b/g)).toHaveLength(1);
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
