import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InstancedMesh, Mesh } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { expect, it } from 'vitest';
import { DelayPhaseDiagram } from './delay-phase-Diagram';
import { DelayPhaseModels } from './delay-phase-models';
import { DELAY_PHASE_CAPS, delayPhasePages } from './delay-phase-poses';
import { delayPhaseCases } from './delay-phase-test-fixtures';

const root = 'src/main/remotion/compositions/explainer/';
const colors = { surface: '#f6ecd9', text: '#23100c', accent: '#9f75ff', muted: '#81706a' };
it('actual composed model/SVG costs: hidden geometry, studio meshes/instances, shadow planes; no unaudited instancing', () => {
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
  const stage = readFileSync(`${root}Stage3D.tsx`, 'utf8');
  expect([...stage.matchAll(/<ThreeCanvas\b/g)]).toHaveLength(1);
  expect([...stage.matchAll(/<StudioEnvironment\b/g)]).toHaveLength(1);
  expect([...stage.matchAll(/<ContactShadows\b/g)]).toHaveLength(1);
  expect(readFileSync(`${root}StudioEnvironment.tsx`, 'utf8')).toContain('new RoomEnvironment()');
  const contact = readFileSync('node_modules/@react-three/drei/core/ContactShadows.js', 'utf8');
  const shadows = [...contact.matchAll(/new THREE\.Mesh\(|React\.createElement\("mesh",/g)].length;
  expect(shadows).toBe(2);
  let maximumMeshes = 0,
    maximumSvg = 0;
  const totals = new Map<string, number>();
  for (const scene of delayPhaseCases()) {
    const pages = delayPhasePages(scene);
    for (const t of [
      NaN,
      Infinity,
      scene.setupAt - 1,
      scene.actionAt,
      scene.responseAt,
      scene.checkAt,
      scene.resolveAt + 1,
    ]) {
      const model = renderToStaticMarkup(createElement(DelayPhaseModels, { scene, t, colors }));
      const meshes = [...model.matchAll(/<mesh\b/g)].length;
      expect(meshes).toBe(scene.storyId === '45' ? 12 : 4);
      expect(model).not.toMatch(/<instancedMesh\b|<primitive\b|<skinnedMesh\b|NaN|Infinity/);
      maximumMeshes = Math.max(maximumMeshes, meshes);
      totals.set(scene.storyId, meshes);
    }
    for (let page = 0; page < pages.length; page++) {
      const t =
        page === pages.length - 1
          ? scene.resolveAt + 1
          : scene.setupAt + ((page + 0.5) * (scene.resolveAt - scene.setupAt)) / (pages.length - 1);
      const svg = renderToStaticMarkup(
        createElement('svg', null, createElement(DelayPhaseDiagram, { scene, t })),
      );
      maximumSvg = Math.max(maximumSvg, [...svg.matchAll(/<([a-zA-Z][\w:-]*)\b/g)].length);
      expect([...svg.matchAll(/data-source-page="current"/g)]).toHaveLength(1);
      expect(svg).not.toMatch(/<canvas|<mesh\b|NaN|Infinity/);
    }
  }
  expect(maximumMeshes).toBe(DELAY_PHASE_CAPS.meshes);
  expect(maximumSvg).toBeLessThanOrEqual(24);
  console.info(
    `delay-phase composed SSR ledger: authored delay=${totals.get('45')}, phase=${totals.get('46')} meshes (hidden included), 0 authored instances; studio=${studioMeshes} meshes/${instances} instances; shadows=${shadows} meshes; hybrid delay=${12 + studioMeshes + shadows}, phase=${4 + studioMeshes + shadows}; SVG maximum=${maximumSvg}`,
  );
});
it('production wiring: zero diagram canvases, one hybrid canvas, persistent planar facts, frame-pure authored sources', () => {
  const scene = readFileSync(`${root}expansion/temporal/delay-phase-Scene.tsx`, 'utf8');
  expect(scene).toContain("scene.visualMode === 'diagram'");
  expect(scene).toContain('<DiagramStage');
  expect(scene).toContain('diagram={null}');
  expect(scene).toContain('<DiagramSurface>{diagram}</DiagramSurface>');
  expect([...scene.matchAll(/<HybridStage\b/g)]).toHaveLength(1);
  const hybrid = readFileSync(`${root}diagrams/HybridStage.tsx`, 'utf8');
  expect([...hybrid.matchAll(/<Stage3D\b/g)]).toHaveLength(1);
  expect(readFileSync(`${root}diagrams/DiagramStage.tsx`, 'utf8')).not.toMatch(
    /<Canvas\b|<ThreeCanvas\b|<Stage3D\b/,
  );
  for (const name of ['poses.ts', 'models.tsx', 'Diagram.tsx', 'Scene.tsx']) {
    expect(readFileSync(`${root}expansion/temporal/delay-phase-${name}`, 'utf8')).not.toMatch(
      /Math\.random|setTimeout|setInterval|Date\.|<Canvas\b|<ThreeCanvas\b|<primitive\b|<instancedMesh\b|useFrame\(/,
    );
  }
});
