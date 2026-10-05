import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { describe, expect, it } from 'vitest';
import { ScopeDiagram } from './scope-Diagram';
import { ScopeModels } from './scope-models';
import { scopePose } from './scope-poses';
import { maximumFactsScene, maximumScopeScene, scopeTestScenes } from './scope-poses.test';

const tags = (html: string, name: string) =>
  [...html.matchAll(new RegExp(`<${name}\\b`, 'g'))].length;

// ReactDOM is only a CPU tree walker here. Ignore expected R3F DOM warnings,
// not rendering errors, and never replace an authored component or asset.

describe('scope actual composed CPU costs (not native/GPU proof)', () => {
  const colors = { surface: '#fff', text: '#111', accent: '#999', muted: '#555' };
  const expected = [
    { diagramSvg: 38, hybridSvg: 40 },
    { diagramSvg: 53, hybridSvg: 55 },
    { diagramSvg: 94, hybridSvg: 96 },
    { diagramSvg: 94, hybridSvg: 96 },
    { diagramSvg: 133, hybridSvg: 135 },
    { diagramSvg: 135, hybridSvg: 137 },
    { diagramSvg: 141, hybridSvg: 143 },
  ];
  for (const [index, scene] of [
    ...scopeTestScenes,
    maximumScopeScene(),
    maximumScopeScene(true),
    maximumFactsScene(),
    maximumFactsScene(true),
    maximumFactsScene(false, true),
  ].entries()) {
    // Keep every frame and assertion; bound each test rather than increasing its timeout.
    for (let start = 0; start <= 360; start += 32) {
      it(`${scene.storyId}/case-${index}: mounted hidden geometry at frames ${start}–${Math.min(start + 31, 360)}`, () => {
        for (let frame = start; frame <= Math.min(start + 31, 360); frame++) {
          const model = renderToStaticMarkup(
            createElement(ScopeModels, { scene, pose: scopePose(scene, frame / 30), colors }),
          );
          expect(model).not.toMatch(/<(?:instancedMesh|skinnedMesh|primitive)\b/);
          expect(tags(model, 'mesh')).toBe(40);
        }
      });
    }
    it(`${scene.storyId}/case-${index}: exact all-frame SVG maxima including hidden sections and both modes`, () => {
      let diagramSvg = 0,
        hybridSvg = 0;
      for (let frame = 0; frame <= 360; frame++) {
        const pose = scopePose(scene, frame / 30);
        for (const visualMode of ['diagram', 'hybrid'] as const) {
          const markup = renderToStaticMarkup(
            createElement(
              'svg',
              {},
              createElement(ScopeDiagram, { scene: { ...scene, visualMode }, pose }),
            ),
          );
          const elements = [...markup.matchAll(/<[a-zA-Z][\w-]*(?:\s|>)/g)].length;
          if (visualMode === 'diagram') diagramSvg = Math.max(diagramSvg, elements);
          else hybridSvg = Math.max(hybridSvg, elements);
        }
      }
      expect({ diagramSvg, hybridSvg }).toEqual(expected[index]);
    });
  }

  it('separates stage, one-time studio preparation and displayed/scratch shadow geometry', () => {
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
      shadowDisplayed: 1,
      shadowScratch: 1,
    }).toEqual({ studioMeshes: 8, studioInstances: 6, shadowDisplayed: 1, shadowScratch: 1 });
    // Live hybrid: 40 authored + 1 displayed shadow; scratch shadow: +1.
    // The 8 room mesh objects (one instanced with 6 lights) are separate,
    // one-time PMREM preparation, not 8 permanently mounted scene meshes.
    const stage = readFileSync('src/main/remotion/compositions/explainer/Stage3D.tsx', 'utf8');
    expect(stage.match(/<ThreeCanvas\b/g)).toHaveLength(1);
    expect(stage.match(/<StudioEnvironment\b/g)).toHaveLength(1);
    expect(stage.match(/<ContactShadows\b/g)).toHaveLength(1);
    expect(stage).not.toMatch(/<mesh\b/);
    expect(stage).toContain('resolution={512}');
    const studio = readFileSync(
      'src/main/remotion/compositions/explainer/StudioEnvironment.tsx',
      'utf8',
    );
    expect(studio).toContain('size: 128');
    expect(studio).toContain('room.dispose()');
    expect(studio).toContain('target.dispose()');
  });

  it('gates zero/one canvas through the existing stage source, without replacing the stage', () => {
    const route = readFileSync(
      'src/main/remotion/compositions/explainer/expansion/reasoning/scope-Scene.tsx',
      'utf8',
    );
    expect(route).toMatch(/if \(scene\.visualMode === 'diagram'\)\s*return \(?\s*<DiagramStage/);
    expect(route.match(/<HybridStage\b/g)).toHaveLength(1);
    expect(route).not.toMatch(/<Stage3D\b|<ThreeCanvas\b|<canvas\b/);
    const hybrid = readFileSync(
      'src/main/remotion/compositions/explainer/diagrams/HybridStage.tsx',
      'utf8',
    );
    expect(hybrid).toMatch(/if \(scene\.visualMode === 'diagram'\)\s*return \(?\s*<DiagramStage/);
    expect(hybrid.match(/<Stage3D\b/g)).toHaveLength(1);
    expect(hybrid).toContain('driftDeg={0}');
    expect(hybrid).toContain('pushAmount={0}');
    expect(hybrid).toContain('bobAmount={0}');
    const diagram = readFileSync(
      'src/main/remotion/compositions/explainer/diagrams/DiagramStage.tsx',
      'utf8',
    );
    expect(diagram).not.toMatch(/import .*Stage3D|<ThreeCanvas\b|<canvas\b/);
  });
});
