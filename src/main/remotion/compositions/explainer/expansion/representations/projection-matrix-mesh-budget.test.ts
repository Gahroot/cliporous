import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InstancedMesh, Mesh } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { expect, it } from 'vitest';
import { ProjectionMatrixDiagram } from './projection-matrix-Diagram';
import { ProjectionMatrixModels } from './projection-matrix-models';
import {
  exactText,
  projectionMatrixPages,
  projectionMatrixPose,
  wrapSource,
} from './projection-matrix-poses';
import { cases, colors, composedHosts } from './projection-matrix-test-fixtures';

for (const [index, scene] of cases().entries()) {
  it(`source case ${index}: actual composed hosts, including hidden geometry, every page/frame`, () => {
    let maxSvg = 0,
      maxPages = 0;
    const pages = projectionMatrixPages(scene);
    maxPages = Math.max(maxPages, pages.length);
    const counts: number[] = [];
    for (let page = 0; page < pages.length; page++) {
      const pose = { ...projectionMatrixPose(scene, scene.resolveAt, pages), page };
      const markup = renderToStaticMarkup(
        createElement('svg', null, createElement(ProjectionMatrixDiagram, { scene, pose })),
      );
      let graphic = 0;
      const facts = pages[page];
      if (scene.storyId === '53') {
        const pair =
          scene.relations.find((r) => r.id === facts.correspondenceId) ?? scene.relations[0];
        graphic = 4;
        for (const [actorId, frameId] of [
          [pair.fromActorId, pair.fromFrameId],
          [pair.toActorId, pair.toFrameId],
        ]) {
          const actor = scene.entities.find((e) => e.id === actorId),
            frame = scene.frames.find((f) => f.id === frameId);
          if (!actor || !frame) throw new Error('Missing parsed endpoint');
          graphic +=
            4 + 2 * wrapSource(actor.label, 8).length + 2 * wrapSource(frame.label, 8).length;
        }
      } else {
        const matrix =
          scene.records.find((m) => m.id === facts.matrixId) ??
          scene.products.find((p) => p.id === facts.matrixId) ??
          scene.records[0];
        const row = matrix.rows.find((r) => r.id === facts.rowId) ?? matrix.rows[0];
        graphic =
          4 +
          2 * wrapSource('label' in matrix ? matrix.label : 'Derived matrix-product', 18).length;
        for (const column of matrix.columns) {
          const cell = matrix.cells.find((c) => c.rowId === row.id && c.columnId === column.id);
          const value = cell
            ? 'result' in cell
              ? exactText(cell.result)
              : 'amount' in cell.quantity && cell.quantity.amount.kind === 'rational'
                ? (cell.quantity.amount.notation ?? exactText(cell.quantity.amount.value))
                : cell.quantity.state
            : 'Not supplied';
          graphic += 3 + 2 * wrapSource(value, 4).length;
        }
      }
      const nodes = [...markup.matchAll(/<([a-zA-Z][\w:-]*)\b/g)].length;
      expect(nodes).toBe(1 + 1 + graphic + 2 * pages[page].lines.length);
      expect(markup).not.toMatch(/<canvas|<mesh\b|<image|<use\b|<foreignObject|NaN|Infinity/);
      expect([...markup.matchAll(/data-page-id=/g)]).toHaveLength(1);
      counts.push(nodes);
      maxSvg = Math.max(maxSvg, nodes);
    }
    for (const time of [
      ...Array.from({ length: 361 }, (_, f) => f / 30),
      NaN,
      Infinity,
      -Infinity,
      -1,
      100,
    ]) {
      const pose = projectionMatrixPose(scene, time, pages);
      expect(counts[pose.page]).toBeGreaterThan(0);
      const model = composedHosts(createElement(ProjectionMatrixModels, { scene, pose, colors }));
      const costs = new Map<string, number>();
      for (const host of model) costs.set(host.type, (costs.get(host.type) ?? 0) + 1);
      expect(Object.fromEntries(costs)).toEqual({
        group: 3,
        mesh: 5,
        boxGeometry: 3,
        meshPhysicalMaterial: 5,
        sphereGeometry: 2,
      });
      for (const host of model) {
        const numeric = [
          host.props.opacity,
          ...(Array.isArray(host.props.position) ? host.props.position : []),
          ...(Array.isArray(host.props.args) ? host.props.args : []),
        ].filter((v) => typeof v === 'number');
        expect(numeric.every(Number.isFinite)).toBe(true);
      }
    }
    console.info(
      `projection-matrix case ${index}: authored=5; max SVG=${maxSvg}; pages=${maxPages}`,
    );
  });
}
it('separate actual offline studio and source-owned live/scratch shadow ledger', () => {
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
  const contact = readFileSync('node_modules/@react-three/drei/core/ContactShadows.js', 'utf8');
  const shadows = [...contact.matchAll(/new THREE\.Mesh\(|React\.createElement\("mesh",/g)].length;
  expect(shadows).toBe(2);
  console.info(
    'projection-matrix CPU composed ledger: authored=5; studio=8 meshes/6 instances; shadows=2; hybrid total=15 hosts',
  );
});
it('diagram zero-WebGL route, hybrid one shared canvas with persistent factual surface (source wiring, not native evidence)', () => {
  const root = 'src/main/remotion/compositions/explainer/';
  const route = readFileSync(
    `${root}expansion/representations/projection-matrix-Scene.tsx`,
    'utf8',
  );
  expect(route).toMatch(/if \(scene.visualMode === 'diagram'\)\s*return <DiagramStage/);
  expect([...route.matchAll(/<HybridStage\b/g)]).toHaveLength(1);
  expect(route).toContain('diagram={null}');
  expect(route).toContain('<DiagramSurface>{diagram}</DiagramSurface>');
  const diagramStage = readFileSync(`${root}diagrams/DiagramStage.tsx`, 'utf8');
  expect(diagramStage).not.toMatch(/import[^;]*Stage3D|<Canvas\b|<ThreeCanvas\b/);
  const hybrid = readFileSync(`${root}diagrams/HybridStage.tsx`, 'utf8');
  expect([...hybrid.matchAll(/<Stage3D\b/g)]).toHaveLength(1);
  const stage = readFileSync(`${root}Stage3D.tsx`, 'utf8');
  expect([...stage.matchAll(/<ThreeCanvas\b/g)]).toHaveLength(1);
  expect([...stage.matchAll(/<StudioEnvironment\b/g)]).toHaveLength(1);
  expect([...stage.matchAll(/<ContactShadows\b/g)]).toHaveLength(1);
});
