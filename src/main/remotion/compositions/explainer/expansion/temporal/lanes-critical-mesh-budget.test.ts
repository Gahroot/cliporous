import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InstancedMesh, Mesh } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { expect, it } from 'vitest';
import { LanesCriticalDiagram } from './lanes-critical-Diagram';
import { LanesCriticalModels } from './lanes-critical-models';
import { lanesCriticalPages, lanesCriticalPose } from './lanes-critical-poses';
import {
  lanesCriticalCases,
  lanesCriticalStressSeed,
  parseLanesCritical,
} from './lanes-critical-test-fixtures';

const root = 'src/main/remotion/compositions/explainer/';
const colors = { surface: '#f6ecd9', text: '#23100c', accent: '#9f75ff', muted: '#81706a' };
it('composed maximum models, including static hidden geometry, with separate real studio/shadow costs', () => {
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
  const shadows = [...contact.matchAll(/new THREE\.Mesh\(|React\.createElement\("mesh",/g)].length;
  expect(shadows).toBe(2);
  let maximumMeshes = 0;
  for (const id of ['41', '42'] as const) {
    const scene = parseLanesCritical(lanesCriticalStressSeed(id, 'known'));
    const counts = new Set<number>();
    for (const t of [-1, scene.actionAt, scene.responseAt + 0.31, scene.checkAt + 0.31, 12, NaN]) {
      const model = renderToStaticMarkup(createElement(LanesCriticalModels, { scene, t, colors }));
      const count = [...model.matchAll(/<mesh\b/g)].length;
      counts.add(count);
      maximumMeshes = Math.max(maximumMeshes, count);
      expect(model).not.toMatch(/<instancedMesh\b|<primitive\b|<skinnedMesh\b|NaN|Infinity/);
      expect([...model.matchAll(/<meshPhysicalMaterial\b/g)]).toHaveLength(count);
    }
    expect(counts.size).toBe(1);
    expect([...counts]).toEqual([69]);
  }
  expect(maximumMeshes).toBe(69);
  console.info(
    `lanes-critical composed SSR: authored max=${maximumMeshes}; studio=${studioMeshes} meshes/${instances} instances; shadows=${shadows}; hybrid mesh hosts total=${maximumMeshes + studioMeshes + shadows}`,
  );
});
it('actual per-page SVG costs include the complete typed graph and retained source endpoints/statuses', () => {
  let maximumSvg = 0;
  for (const scene of lanesCriticalCases()) {
    const pages = lanesCriticalPages(scene),
      samples = new Map<number, number>();
    for (let f = 0; f <= 360; f++) samples.set(lanesCriticalPose(scene, f / 30).page, f / 30);
    expect(samples.size).toBe(pages.length);
    for (const t of samples.values()) {
      const svg = renderToStaticMarkup(
        createElement('svg', null, createElement(LanesCriticalDiagram, { scene, t })),
      );
      maximumSvg = Math.max(maximumSvg, [...svg.matchAll(/<([a-zA-Z][\w:-]*)\b/g)].length);
      expect([...svg.matchAll(/data-page-id=/g)]).toHaveLength(1);
      expect(svg).not.toMatch(/<canvas|<mesh\b|NaN|Infinity|textLength|lengthAdjust/);
      expect([...svg.matchAll(/data-relation-id=/g)]).toHaveLength(scene.relations.length);
      for (const r of scene.relations)
        expect(svg).toContain(
          `data-relation-id="${r.id}" data-type="${r.type}" data-status="${r.state}" data-from-id="${r.fromId}" data-to-id="${r.toId}"`,
        );
    }
  }
  console.info(`lanes-critical actual per-page SVG maximum=${maximumSvg}`);
  expect(maximumSvg).toBe(106);
});
it('production zero/one-canvas composition uses response handoff and persistent precision plane', () => {
  const scene = readFileSync(`${root}expansion/temporal/lanes-critical-Scene.tsx`, 'utf8');
  expect(scene).toContain("scene.visualMode === 'diagram'");
  expect(scene).toContain('<DiagramStage');
  expect(scene).toContain('diagram={null}');
  expect(scene).toContain('handoffBeat="response"');
  expect(scene).toContain('<DiagramSurface>{diagram}</DiagramSurface>');
  expect([...scene.matchAll(/<HybridStage\b/g)]).toHaveLength(1);
  const hybrid = readFileSync(`${root}diagrams/HybridStage.tsx`, 'utf8');
  expect([...hybrid.matchAll(/<Stage3D\b/g)]).toHaveLength(1);
  expect(hybrid).toContain('diagram === null || diagram === undefined ? null');
  for (const name of ['poses.ts', 'models.tsx', 'Diagram.tsx', 'Scene.tsx']) {
    const source = readFileSync(`${root}expansion/temporal/lanes-critical-${name}`, 'utf8');
    expect(source).not.toMatch(
      /Math\.random|setTimeout|setInterval|Date\.|<Canvas\b|<ThreeCanvas\b|<primitive\b|<instancedMesh\b|useFrame\(/,
    );
  }
});
