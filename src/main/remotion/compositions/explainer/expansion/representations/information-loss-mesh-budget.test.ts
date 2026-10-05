import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InstancedMesh, Mesh } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { describe, expect, it } from 'vitest';
import { ExplainerProvider } from '../../stage';
import { InformationLossDiagram } from './information-loss-Diagram';
import { InformationLossModels } from './information-loss-models';
import { informationLossPose } from './information-loss-poses';
import { informationLossCases } from './information-loss-test-fixtures';

describe('information loss composed authored host costs (CPU, not GPU/RSS)', () => {
  it('counts all actual model/SVG hosts including hidden geometry, offline studio and source-owned shadow passes', () => {
    const room = new RoomEnvironment();
    let studioMeshes = 0,
      studioInstances = 0;
    room.traverse((object) => {
      if (object instanceof Mesh) studioMeshes++;
      if (object instanceof InstancedMesh) studioInstances += object.count;
    });
    expect([studioMeshes, studioInstances]).toEqual([8, 6]);
    room.dispose();
    const studioSource = readFileSync(
      'src/main/remotion/compositions/explainer/StudioEnvironment.tsx',
      'utf8',
    );
    expect(studioSource).toContain('new RoomEnvironment()');
    const shadowSource = readFileSync(
      'node_modules/@react-three/drei/core/ContactShadows.js',
      'utf8',
    );
    // One returned mesh and one off-tree blur mesh: neither hidden host may be omitted.
    expect(shadowSource.match(/new THREE\.Mesh\(/g)).toHaveLength(1);
    expect(shadowSource.match(/React\.createElement\("mesh"/g)).toHaveLength(1);
    const shadows = 2;
    let maxMeshes = 0,
      maxSvg = 0;
    for (const scene of informationLossCases()) {
      const base = informationLossPose(scene, scene.setupAt);
      for (let page = 0; page < base.pages.length; page++) {
        const pose = { ...base, page };
        // Real React SSR runs useWideStage/Clay in their provider, never calls hooks directly.
        const model = renderToStaticMarkup(
          createElement(
            ExplainerProvider,
            {
              value: {},
            },
            createElement(InformationLossModels, {
              scene,
              pose,
              colors: { surface: '#ffffff', text: '#000000', accent: '#555555', muted: '#888888' },
            }),
          ),
        );
        const meshes = [...model.matchAll(/<mesh\b/g)].length;
        expect(meshes).toBe(pose.pages[page].recordIds.length);
        expect(meshes).toBeLessThanOrEqual(2);
        expect([...model.matchAll(/<boxGeometry\b/g)]).toHaveLength(meshes);
        expect([...model.matchAll(/<meshPhysicalMaterial\b/g)]).toHaveLength(meshes);
        expect(model).not.toMatch(/NaN|Infinity|<instancedMesh/);
        maxMeshes = Math.max(maxMeshes, meshes + studioMeshes + shadows);
        const svg = renderToStaticMarkup(createElement(InformationLossDiagram, { scene, pose }));
        const hosts = [...svg.matchAll(/<(?:g|rect|path|text)\b/g)].length;
        maxSvg = Math.max(maxSvg, hosts);
        expect(hosts).toBeLessThanOrEqual(54);
      }
    }
    expect(maxMeshes).toBe(12);
    expect(maxSvg).toBe(54);
  }, 90000);
  it('keeps zero Canvas diagram, one HybridStage and shared persistent planar facts in the actual view source', () => {
    const source = readFileSync(
      'src/main/remotion/compositions/explainer/expansion/representations/information-loss-Scene.tsx',
      'utf8',
    );
    expect(source).toContain("scene.visualMode === 'diagram'");
    expect(source).toContain('<DiagramStage scene={scene}>');
    expect(source.match(/<HybridStage\b/g)).toHaveLength(1);
    expect(source).toContain('diagram={null}');
    expect(source).toContain('{persistentDiagramSurface}');
    expect(source).not.toMatch(/<Canvas|<ThreeCanvas|Date\.|Math\.random|fetch\(/);
  });
});
