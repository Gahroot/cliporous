import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InstancedMesh, Mesh } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { expect, it } from 'vitest';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { ExplainerProvider } from '../../stage';
import { RetryProductDiagram } from './retry-product-Diagram';
import { retryProductPose } from './retry-product-poses';
import { retryProductCases, retryProductModelEvidence } from './retry-product-test-fixtures';

for (const [index, scene] of retryProductCases().entries()) {
  it(`source ${index}: actual composed kit meshes/materials and reachable SVG hosts, including hidden geometry`, () => {
    const modelCache = new Map<string, ReturnType<typeof retryProductModelEvidence>>(),
      visited = new Set<number>();
    let maxMeshes = 0,
      maxSvg = 0;
    for (const time of [
      ...Array.from({ length: 361 }, (_, f) => f / 30),
      NaN,
      Infinity,
      -Infinity,
      -100,
      100,
    ]) {
      const pose = retryProductPose(scene, time),
        page = pose.pages[pose.page];
      const r =
        scene.records.find((record) => page.recordIds.includes(record.id)) ??
        scene.records[pose.phase];
      let model = modelCache.get(r.id);
      if (!model) {
        // Real React SSR owns useWideStage/useMemo/Clay. No fake Remotion/Three provider.
        model = retryProductModelEvidence(scene, pose);
        modelCache.set(r.id, model);
      }
      expect(modelCache.size).toBeLessThanOrEqual(5);
      const meshes = [...model.markup.matchAll(/<mesh\b/g)].length;
      const expected =
        scene.storyId === '67' ? 3 : r.shape === 'table' ? 7 : r.shape === 'task' ? 8 : 5;
      expect(meshes).toBe(expected);
      expect([...model.markup.matchAll(/<meshPhysicalMaterial\b/g)]).toHaveLength(meshes);
      expect(model.roundedResources + model.torusResources).toBe(meshes);
      expect(model.torusResources).toBe(r.shape === 'task' ? 3 : 0);
      expect(model.corners).toHaveLength(meshes * 8);
      expect(model.markup).not.toMatch(/NaN|Infinity|<instancedMesh/);
      expect([...model.markup.matchAll(/<group\b/g)].length).toBeGreaterThanOrEqual(3);
      maxMeshes = Math.max(maxMeshes, meshes);
      if (!visited.has(pose.page)) {
        visited.add(pose.page);
        const svg = renderToStaticMarkup(
          createElement(
            ExplainerProvider,
            {
              value: { nativeStage: true },
            },
            createElement(
              DiagramSurface,
              null,
              createElement(RetryProductDiagram, { scene, pose }),
            ),
          ),
        );
        const hosts = [...svg.matchAll(/<(svg|g|rect|path|circle|text)\b/g)].length;
        expect([...svg.matchAll(/<svg\b/g)]).toHaveLength(1);
        expect([...svg.matchAll(/data-line-id=/g)]).toHaveLength(page.lines.length);
        if (page.quantityIndex !== undefined) {
          const q = scene.quantities[page.quantityIndex];
          expect(page.quantityState).toBe(q.state);
          expect(svg).toContain(`data-quantity-state="${q.state}"`);
          expect(svg).toContain(`Quantity: ${q.state}</text>`);
        } else expect(svg).not.toContain('data-quantity-state=');
        expect(svg).not.toMatch(/NaN|Infinity|ellipsis|textLength|lengthAdjust|<canvas/);
        maxSvg = Math.max(maxSvg, hosts);
      }
    }
    expect(visited.size).toBe(retryProductPose(scene, scene.setupAt).pages.length);
    expect(maxMeshes).toBe(scene.storyId === '67' ? 3 : 8);
    expect(maxSvg).toBeLessThanOrEqual(57);
    if (scene.quantities.length === 7) expect(maxSvg).toBe(57);
    console.info(
      `retry-product source ${index}: pages=${visited.size}, SVG hosts=${maxSvg}, authored meshes=${maxMeshes}, hybrid total=${maxMeshes + 8 + 2}, studio instances=6`,
    );
  });
}
it('actual offline studio and source-owned hidden shadow meshes/instances', () => {
  const room = new RoomEnvironment();
  let meshes = 0,
    instances = 0;
  room.traverse((o) => {
    if (o instanceof Mesh) meshes++;
    if (o instanceof InstancedMesh) instances += o.count;
  });
  expect([meshes, instances]).toEqual([8, 6]);
  room.traverse((o) => {
    if (o instanceof InstancedMesh) o.dispose();
  });
  room.dispose();
  const root = 'src/main/remotion/compositions/explainer/';
  expect(readFileSync(`${root}StudioEnvironment.tsx`, 'utf8')).toContain('new RoomEnvironment()');
  const shadows = readFileSync('node_modules/@react-three/drei/core/ContactShadows.js', 'utf8');
  expect([...shadows.matchAll(/new THREE\.Mesh\(|React\.createElement\("mesh",/g)].length).toBe(2);
  const hybrid = readFileSync(`${root}diagrams/HybridStage.tsx`, 'utf8');
  expect(hybrid).toContain('groundY={-1.4}');
  expect([...hybrid.matchAll(/<Stage3D\b/g)]).toHaveLength(1);
  const stage = readFileSync(`${root}Stage3D.tsx`, 'utf8');
  for (const component of ['ThreeCanvas', 'StudioEnvironment', 'ContactShadows'])
    expect([...stage.matchAll(new RegExp(`<${component}\\b`, 'g'))]).toHaveLength(1);
  const route = readFileSync(`${root}expansion/computing/retry-product-Scene.tsx`, 'utf8');
  expect(route).toContain("scene.visualMode === 'diagram'");
  expect(route).toContain('<DiagramStage scene={scene}>');
  expect([...route.matchAll(/<HybridStage\b/g)]).toHaveLength(1);
  expect(route).toContain('diagram={null}');
  expect(route).toContain('{persistentDiagramSurface}');
  expect(route).not.toMatch(/<Canvas|<ThreeCanvas|Date\.|Math\.random|fetch\(/);
  expect(readFileSync(`${root}diagrams/DiagramStage.tsx`, 'utf8')).not.toMatch(
    /<Canvas|<ThreeCanvas|import[^;]*Stage3D/,
  );
});
