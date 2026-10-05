import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InstancedMesh, Mesh } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { expect, it } from 'vitest';
import { SearchLandscapeDiagram } from './search-landscape-Diagram';
import { SearchLandscapeModels } from './search-landscape-models';
import { searchPose } from './search-landscape-poses';
import { searchCases } from './search-landscape-test-fixtures';

const root = 'src/main/remotion/compositions/explainer/';
const colors = { surface: '#f6ecd9', text: '#23100c', accent: '#9f75ff', muted: '#81706a' };
it('real composed SSR mesh/SVG ledger, including hidden geometry and explicit studio/shadow costs', () => {
  const room = new RoomEnvironment();
  let studioMeshes = 0,
    instances = 0;
  room.traverse((object) => {
    if (object instanceof Mesh) studioMeshes++;
    if (object instanceof InstancedMesh) instances += object.count;
  });
  expect([studioMeshes, instances]).toEqual([8, 6]);
  room.traverse((object) => {
    if (object instanceof InstancedMesh) object.dispose();
  });
  room.dispose();
  const stage = readFileSync(`${root}Stage3D.tsx`, 'utf8'),
    studio = readFileSync(`${root}StudioEnvironment.tsx`, 'utf8');
  expect([...stage.matchAll(/<ThreeCanvas\b/g)]).toHaveLength(1);
  expect([...stage.matchAll(/<StudioEnvironment\b/g)]).toHaveLength(1);
  expect([...stage.matchAll(/<ContactShadows\b/g)]).toHaveLength(1);
  expect(studio).toContain('new RoomEnvironment()');
  const contact = readFileSync('node_modules/@react-three/drei/core/ContactShadows.js', 'utf8');
  expect([...contact.matchAll(/new THREE\.Mesh\(/g)]).toHaveLength(1);
  expect([...contact.matchAll(/React\.createElement\("mesh",/g)]).toHaveLength(1);
  // One contact plane mesh and one blur plane mesh, depth/blur passes separate from environment PMREM.
  const shadowMeshes = [...contact.matchAll(/new THREE\.Mesh\(|React\.createElement\("mesh",/g)]
    .length;
  let maximumMeshes = 0,
    maximumSvg = 0;
  for (const scene of searchCases()) {
    const expected =
      scene.storyId === '29'
        ? scene.links.length +
          scene.nodes.reduce((sum, n) => sum + 3 + (n.status === 'blocked' ? 1 : 0), 0)
        : 5 + (scene.branch.status === 'supplied' ? 1 : 0);
    for (const t of [
      scene.setupAt - 1,
      scene.actionAt,
      scene.responseAt,
      scene.checkAt,
      scene.resolveAt + 1,
    ]) {
      const model = renderToStaticMarkup(
        createElement(SearchLandscapeModels, { scene, t, colors }),
      );
      expect([...model.matchAll(/<mesh\b/g)]).toHaveLength(expected);
      expect(model).not.toMatch(/<instancedMesh\b|<primitive\b|<skinnedMesh\b/);
      maximumMeshes = Math.max(maximumMeshes, expected);
    }
    const visited = new Set<number>();
    for (let frame = 0; frame <= 360; frame++) {
      const t = frame / 30,
        page = searchPose(scene, t).page;
      if (visited.has(page)) continue;
      visited.add(page);
      for (const visualMode of ['diagram', 'hybrid'] as const) {
        const svg = renderToStaticMarkup(
          createElement(
            'svg',
            null,
            createElement(SearchLandscapeDiagram, { scene: { ...scene, visualMode }, t }),
          ),
        );
        const count = [...svg.matchAll(/<([a-zA-Z][\w:-]*)\b/g)].length;
        maximumSvg = Math.max(maximumSvg, count);
        expect([...svg.matchAll(/data-entity-id=/g)]).toHaveLength(scene.entities.length);
        expect([...svg.matchAll(/data-active="true"/g)]).toHaveLength(1);
        expect([...svg.matchAll(/data-page-id=/g)]).toHaveLength(1);
        if (scene.storyId === '29') {
          expect([...svg.matchAll(/data-direction="supplied"/g)]).toHaveLength(scene.links.length);
          expect(svg).toContain('data-goal="true"');
        }
        expect(svg).not.toMatch(/<canvas|<mesh\b|NaN|Infinity/);
      }
    }
  }
  expect(maximumMeshes).toBe(16);
  expect(maximumSvg).toBe(69);
  console.info(
    `search-landscape CPU/SSR ledger: authored max=${maximumMeshes}; studio=${studioMeshes} meshes/${instances} instances; shadows=${shadowMeshes} meshes; hybrid total=${maximumMeshes + studioMeshes + shadowMeshes}; SVG max=${maximumSvg}`,
  );
});
it('production source wiring owns zero/one shared canvas and keeps planar facts; no manual hook calls/mocks', () => {
  const scene = readFileSync(`${root}expansion/decisions/search-landscape-Scene.tsx`, 'utf8');
  expect(scene).toContain("scene.visualMode === 'diagram'");
  expect(scene).toContain('<DiagramStage');
  expect(scene).toContain('diagram={null}');
  expect(scene).toContain('<DiagramSurface>{diagram}</DiagramSurface>');
  expect([...scene.matchAll(/<HybridStage\b/g)]).toHaveLength(1);
  const hybrid = readFileSync(`${root}diagrams/HybridStage.tsx`, 'utf8');
  expect([...hybrid.matchAll(/<Stage3D\b/g)]).toHaveLength(1);
  for (const name of ['poses.ts', 'models.tsx', 'Diagram.tsx', 'Scene.tsx']) {
    const source = readFileSync(`${root}expansion/decisions/search-landscape-${name}`, 'utf8');
    expect(source).not.toMatch(
      /Math\.random|setTimeout|setInterval|Date\.|<Canvas\b|<ThreeCanvas\b|<primitive\b|<instancedMesh\b|useFrame\(/,
    );
  }
  // SSR uses actual React hooks and actual composed models; never call a hook/component function directly.
});
