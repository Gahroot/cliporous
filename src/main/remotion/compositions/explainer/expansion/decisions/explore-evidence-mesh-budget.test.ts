import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { describe, expect, it } from 'vitest';
import { hybridDiagramLayer } from '../../diagrams/HybridStage';
import { ExploreEvidenceAssembly } from './explore-evidence-models';
import { exploreEvidencePageTimes, exploreEvidencePose } from './explore-evidence-poses';
import {
  exploreEvidenceHosts,
  exploreEvidenceMarkup,
  exploreEvidenceTestScenes,
} from './explore-evidence-test-fixtures';

const colors = { surface: '#fff', text: '#111', accent: '#835', muted: '#888' };
describe('actual composed geometry and SVG ledgers including hidden geometry (CPU)', () => {
  it('accounts for every mesh without instancing/primitive and keeps one factual SVG', () => {
    let maximum = 0,
      svgMaximum = 0;
    for (const scene of exploreEvidenceTestScenes()) {
      let hiddenMeshes = 0;
      for (const t of [0, 12]) {
        const hosts = exploreEvidenceHosts(
          createElement(ExploreEvidenceAssembly, {
            scene,
            pose: exploreEvidencePose(scene, t),
            colors,
          }),
        );
        expect(hosts.filter((h) => /primitive|instancedMesh|skinnedMesh/.test(h.tag))).toEqual([]);
        const meshes = hosts.filter((h) => h.tag === 'mesh').length;
        expect(
          hosts.filter((h) => /Geometry$/.test(h.tag)).length +
            hosts.filter((h) => h.tag === 'mesh' && h.props.geometry).length,
        ).toBe(meshes);
        for (const [index, host] of hosts.entries())
          if (host.tag === 'mesh') {
            expect(
              Number(Boolean(host.props.geometry)) +
                hosts.filter((child) => /Geometry$/.test(child.tag) && child.parentMesh === index)
                  .length,
            ).toBe(1);
          }
        for (const host of hosts.filter((h) => /Geometry$/.test(h.tag)))
          expect(host.parentMesh).toBeDefined();
        maximum = Math.max(maximum, meshes);
        // Hidden source documents are still included in the authored mesh cost.
        if (t === 0) hiddenMeshes = meshes;
        expect(meshes).toBe(hiddenMeshes);
      }
      for (const t of [0, ...exploreEvidencePageTimes(scene), 12]) {
        const svg = exploreEvidenceMarkup(scene, t);
        expect([...svg.matchAll(/<svg\b/g)]).toHaveLength(1);
        svgMaximum = Math.max(svgMaximum, [...svg.matchAll(/<(?!\/)[a-z][\w-]*(?:\s|>)/g)].length);
      }
    }
    expect(maximum).toBe(163);
    expect(svgMaximum).toBe(82);
    console.info(
      `ExploreEvidence authored maxima: ${maximum} meshes; ${svgMaximum} SVG/host elements; separate studio 8 meshes/6 instances and 2 shadow meshes`,
    );
  });
  it('uses a single existing studio branch, zero diagram Canvas, no duplicate factual surface', () => {
    const scene = readFileSync(
      'src/main/remotion/compositions/explainer/expansion/decisions/explore-evidence-Scene.tsx',
      'utf8',
    );
    expect(scene.match(/<HybridStage\b/g)).toHaveLength(1);
    expect(scene).toContain('diagram={null}');
    expect(hybridDiagramLayer(null, 0.5)).toBeNull();
    expect(scene.match(/<DiagramSurface\b/g)).toHaveLength(1);
    expect(scene).toContain("if (scene.visualMode === 'diagram')");
    const stage = readFileSync('src/main/remotion/compositions/explainer/Stage3D.tsx', 'utf8');
    expect(stage.match(/<ThreeCanvas\b/g)).toHaveLength(1);
    const room = new RoomEnvironment();
    let studioMeshes = 0,
      studioInstances = 0;
    room.traverse((object) => {
      if ('isMesh' in object && object.isMesh) studioMeshes++;
      if ('isInstancedMesh' in object && object.isInstancedMesh && 'count' in object)
        studioInstances += Number(object.count);
    });
    room.dispose();
    expect({ studioMeshes, studioInstances }).toEqual({ studioMeshes: 8, studioInstances: 6 });
    expect(stage.match(/<StudioEnvironment\b/g)).toHaveLength(1);
    expect(stage.match(/<ContactShadows\b/g)).toHaveLength(1);
    const shadows = readFileSync('node_modules/@react-three/drei/core/ContactShadows.js', 'utf8');
    expect(shadows.match(/new THREE.Mesh\(planeGeometry\)/g)).toHaveLength(1);
    expect(shadows.match(/React.createElement\("mesh"/g)).toHaveLength(1);
  });
});
