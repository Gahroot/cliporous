import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InstancedMesh, Mesh } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { expect, it } from 'vitest';
import { HistoryTwinDiagram } from './history-twin-Diagram';
import { HistoryTwinModels } from './history-twin-models';
import { historyTwinPages, historyTwinPose } from './history-twin-poses';
import { historyTwinCases } from './history-twin-test-fixtures';

for (const [caseIndex, scene] of historyTwinCases().entries()) {
  it(`composed model costs for every authored frame and nonfinite seek: source case ${caseIndex}`, () => {
    // Models consume time only through this complete pose; retain a per-case bounded
    // cache of actual composed hosts, including opacity-zero geometry.
    const markup = new Map<string, string>();
    const times = [...Array.from({ length: 361 }, (_, f) => f / 30), NaN, Infinity, -Infinity];
    const expected = scene.storyId === '47' ? 8 + scene.history.length * 3 : 9;
    for (const t of times) {
      const key = JSON.stringify(historyTwinPose(scene, t));
      let model = markup.get(key);
      if (model === undefined) {
        model = renderToStaticMarkup(createElement(HistoryTwinModels, { scene, t, colors }));
        markup.set(key, model);
      }
      expect([...model.matchAll(/<mesh\b/g)]).toHaveLength(expected);
      expect([...model.matchAll(/<meshPhysicalMaterial\b/g)]).toHaveLength(expected);
      expect(model).not.toMatch(/<instancedMesh\b|<primitive\b|<skinnedMesh\b|NaN|Infinity/);
    }
    expect(markup.size).toBeLessThanOrEqual(362);
  });
}

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
  for (const scene of historyTwinCases()) {
    const counts = new Set<number>();
    for (const t of [-1, scene.actionAt, scene.responseAt + 0.31, scene.checkAt + 0.31, 12, NaN]) {
      const model = renderToStaticMarkup(createElement(HistoryTwinModels, { scene, t, colors }));
      const count = [...model.matchAll(/<mesh\b/g)].length;
      counts.add(count);
      maximumMeshes = Math.max(maximumMeshes, count);
      expect(model).not.toMatch(/<instancedMesh\b|<primitive\b|<skinnedMesh\b|NaN|Infinity/);
      expect([...model.matchAll(/<meshPhysicalMaterial\b/g)]).toHaveLength(count);
    }
    expect(counts.size).toBe(1);
    expect([...counts]).toEqual([scene.storyId === '47' ? 8 + scene.history.length * 3 : 9]);
  }
  expect(maximumMeshes).toBe(29);
  console.info(
    `history-twin composed SSR: authored max=${maximumMeshes}; studio=${studioMeshes} meshes/${instances} instances; shadows=${shadows}; hybrid mesh hosts total=${maximumMeshes + studioMeshes + shadows}`,
  );
});
it('actual per-page SVG costs include the complete typed graph and retained source endpoints/statuses', () => {
  let maximumSvg = 0;
  for (const scene of historyTwinCases()) {
    const pages = historyTwinPages(scene),
      markup = new Map<number, string>();
    // Diagram's only temporal input is its page. Cache actual composed markup per page,
    // then check every authored frame against that complete (not estimated) geometry.
    for (let f = 0; f <= 360; f++) {
      const t = f / 30,
        index = historyTwinPose(scene, t).page;
      let svg = markup.get(index);
      if (svg === undefined) {
        svg = renderToStaticMarkup(
          createElement('svg', null, createElement(HistoryTwinDiagram, { scene, t })),
        );
        markup.set(index, svg);
      }
      maximumSvg = Math.max(maximumSvg, [...svg.matchAll(/<([a-zA-Z][\w:-]*)\b/g)].length);
      expect([...svg.matchAll(/data-page-id=/g)]).toHaveLength(1);
      expect(svg).not.toMatch(/<canvas|<mesh\b|NaN|Infinity|textLength|lengthAdjust/);
      if (scene.storyId === '47') {
        expect([...svg.matchAll(/data-rule-id=/g)]).toHaveLength(2);
        expect([...svg.matchAll(/data-history-id=/g)]).toHaveLength(scene.history.length);
      } else expect(svg).toContain('data-alignment="same-actor-source-controls"');
      expect(svg).toContain(`data-fact-id="${pages[index].factId}"`);
    }
    expect(markup.size).toBe(pages.length);
    expect(markup.size).toBeLessThanOrEqual(361);
  }
  console.info(`history-twin actual per-page SVG maximum=${maximumSvg}`);
  expect(maximumSvg).toBe(64);
});
it('production zero/one-canvas composition uses response handoff and persistent precision plane', () => {
  const scene = readFileSync(`${root}expansion/temporal/history-twin-Scene.tsx`, 'utf8');
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
    const source = readFileSync(`${root}expansion/temporal/history-twin-${name}`, 'utf8');
    expect(source).not.toMatch(
      /Math\.random|setTimeout|setInterval|Date\.|<Canvas\b|<ThreeCanvas\b|<primitive\b|<instancedMesh\b|useFrame\(/,
    );
  }
});
