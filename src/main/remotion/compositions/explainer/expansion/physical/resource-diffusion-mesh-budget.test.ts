import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InstancedMesh, Mesh } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { afterAll, describe, expect, it } from 'vitest';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { hybridDiagramLayer } from '../../diagrams/HybridStage';
import { ExplainerProvider } from '../../stage';
import { ResourceDiffusionDiagram } from './resource-diffusion-Diagram';
import { ResourceDiffusionModels } from './resource-diffusion-models';
import { resourceDiffusionPose } from './resource-diffusion-poses';
import {
  resourceDiffusionCases,
  resourceDiffusionGeometry,
} from './resource-diffusion-test-fixtures';

const root = 'src/main/remotion/compositions/explainer/';
const placements = [undefined, 'speaker-side', 'speaker-pip', 'full-frame'] as const;

describe('resource/diffusion composed authored CPU inventory, not runtime GPU/RSS', () => {
  const room = new RoomEnvironment();
  let studioMeshes = 0,
    studioInstances = 0;
  room.traverse((o) => {
    if (o instanceof Mesh) studioMeshes++;
    if (o instanceof InstancedMesh) studioInstances += o.count;
  });
  room.dispose();
  let maximumSvg = 0,
    maximumMeshes = 0,
    maximumPages = 0;
  // The apparatus is static: test-local cache bounded by two stories × four placements × two opacity endpoints.
  const modelCache = new Map<string, string>();
  afterAll(() => {
    expect(maximumSvg).toBe(29);
    expect(maximumMeshes).toBe(29);
    expect(maximumPages).toBe(13);
    expect(modelCache.size).toBe(16);
  });
  for (const [index, scene] of resourceDiffusionCases().entries())
    for (const presentation of placements)
      it(`source ${index}/${presentation ?? 'vertical'}: current pages, hidden meshes, actual kit hosts`, () => {
        expect([studioMeshes, studioInstances]).toEqual([8, 6]);
        const shadow = readFileSync(
          'node_modules/@react-three/drei/core/ContactShadows.js',
          'utf8',
        );
        expect(shadow.match(/new THREE\.Mesh\(/g)).toHaveLength(1);
        expect(shadow.match(/React\.createElement\("mesh"/g)).toHaveLength(1);
        const base = resourceDiffusionPose(scene, scene.setupAt);
        maximumPages = Math.max(maximumPages, base.pages.length);
        for (const t of [scene.setupAt, scene.resolveAt + 0.8]) {
          const pose = resourceDiffusionPose(scene, t),
            key = `${scene.storyId}:${presentation}:${pose.reveal}`;
          let model = modelCache.get(key);
          if (!model) {
            model = renderToStaticMarkup(
              createElement(
                ExplainerProvider,
                {
                  value: {
                    aspect: presentation ? '16:9' : '9:16',
                    presentation,
                    nativeStage: true,
                  },
                },
                createElement(ResourceDiffusionModels, {
                  scene,
                  pose,
                  colors: {
                    surface: '#ffffff',
                    text: '#000000',
                    accent: '#555555',
                    muted: '#888888',
                  },
                }),
              ),
            );
            modelCache.set(key, model);
          }
          const meshes = [...model.matchAll(/<mesh\b/g)].length;
          expect(meshes).toBe(scene.storyId === '75' ? 7 : 19);
          expect([...model.matchAll(/<meshPhysicalMaterial\b/g)]).toHaveLength(meshes);
          expect(model).not.toMatch(/NaN|Infinity|<instancedMesh/);
          const solids = resourceDiffusionGeometry(scene.storyId);
          expect(solids).toHaveLength(meshes);
          for (const solid of solids) {
            expect(solid.geometry.getAttribute('position').count).toBeGreaterThan(0);
            solid.geometry.dispose();
          }
          maximumMeshes = Math.max(maximumMeshes, meshes + studioMeshes + 2);
          expect(meshes + studioMeshes + 2).toBeLessThanOrEqual(29);
        }
        for (let page = 0; page < base.pages.length; page++) {
          const pose = { ...base, page };
          const svg = renderToStaticMarkup(
            createElement(ResourceDiffusionDiagram, { scene, pose }),
          );
          const count = [...svg.matchAll(/<(?:g|rect|path|text)\b/g)].length;
          maximumSvg = Math.max(maximumSvg, count);
          expect(count).toBeLessThanOrEqual(29);
          const surface = renderToStaticMarkup(
            createElement(
              ExplainerProvider,
              {
                value: { aspect: presentation ? '16:9' : '9:16', presentation, nativeStage: true },
              },
              createElement(
                DiagramSurface,
                null,
                createElement(ResourceDiffusionDiagram, { scene, pose }),
              ),
            ),
          );
          expect([...surface.matchAll(/<svg\b/g)]).toHaveLength(1);
          expect([...surface.matchAll(/<(?:svg|g|rect|path|text)\b/g)]).toHaveLength(count + 1);
          expect(surface).not.toMatch(/NaN|Infinity|<canvas/);
        }
      });
  it('owns exactly zero diagram and one hybrid Canvas route, persistent planar facts and bounded seekable shared stage', () => {
    const view = readFileSync(`${root}expansion/physical/resource-diffusion-Scene.tsx`, 'utf8');
    expect(view).toContain("scene.visualMode === 'diagram'");
    expect(view.match(/<HybridStage\b/g)).toHaveLength(1);
    expect(view.match(/<DiagramSurface\b/g)).toHaveLength(1);
    expect(view).toContain('diagram={null}');
    expect(view).not.toMatch(/<Canvas|<ThreeCanvas|Date\.|Math\.random|fetch\(/);
    expect(hybridDiagramLayer(null, 1)).toBeNull();
    const hybrid = readFileSync(`${root}diagrams/HybridStage.tsx`, 'utf8');
    expect(hybrid.match(/<Stage3D\b/g)).toHaveLength(1);
    for (const setting of [
      'driftDeg={0}',
      'pushAmount={0}',
      'bobAmount={0}',
      'groundY={-1.4}',
      'shadowScale={9}',
      'rotation={[0, pose.modelTurn, 0]}',
    ])
      expect(hybrid).toContain(setting);
    const stage = readFileSync(`${root}Stage3D.tsx`, 'utf8');
    expect(stage.match(/<ThreeCanvas\b/g)).toHaveLength(1);
    expect(stage.match(/<StudioEnvironment\b/g)).toHaveLength(1);
    expect(stage.match(/<ContactShadows\b/g)).toHaveLength(1);
    const studio = readFileSync(`${root}StudioEnvironment.tsx`, 'utf8');
    expect(studio).toContain('new RoomEnvironment()');
  });
  it('separately inventories PMREM source-owned transient machinery; does not add it to mounted host counts', () => {
    const pmrem = readFileSync('node_modules/three/src/extras/PMREMGenerator.js', 'utf8');
    expect(pmrem.match(/new Mesh\(/g)).toHaveLength(3);
    expect(pmrem.match(/new WebGLRenderTarget\(/g)).toHaveLength(1);
    expect(pmrem).toContain('new Mesh( new BufferGeometry(), material )');
    expect(pmrem).toContain('this._backgroundBox = new Mesh(');
    expect(pmrem).toContain('lodMeshes.push( new Mesh( planes, null ) )');
    // These are allocation sites (LOD loop multiplicity/runtime targets are not measured).
    expect(pmrem).toContain('const planes = new BufferGeometry()');
  });
});
