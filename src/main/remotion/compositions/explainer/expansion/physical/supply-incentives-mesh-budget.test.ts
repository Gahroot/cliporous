import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InstancedMesh, Mesh } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { expect, it } from 'vitest';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { ExplainerProvider } from '../../stage';
import { SupplyIncentivesDiagram } from './supply-incentives-Diagram';
import { supplyIncentivesActiveRecord, supplyIncentivesPose } from './supply-incentives-poses';
import {
  supplyIncentivesCases,
  supplyIncentivesModelEvidence,
} from './supply-incentives-test-fixtures';

for (const [index, scene] of supplyIncentivesCases().entries())
  for (const presentation of [undefined, 'speaker-side', 'speaker-pip', 'full-frame'] as const) {
    it(`source ${index}, ${presentation ?? 'vertical'}: actual composed kit meshes/materials and reachable SVG hosts, including hidden geometry`, () => {
      const modelCache = new Map<string, ReturnType<typeof supplyIncentivesModelEvidence>>(),
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
        const pose = supplyIncentivesPose(scene, time),
          page = pose.pages[pose.page];
        const r = supplyIncentivesActiveRecord(scene, pose);
        let model = modelCache.get(r.id);
        if (!model) {
          // Real React SSR owns useWideStage/useMemo/Clay. No fake Remotion/Three provider.
          model = supplyIncentivesModelEvidence(scene, pose, presentation);
          modelCache.set(r.id, model);
        }
        expect(modelCache.size).toBeLessThanOrEqual(5);
        const meshes = [...model.markup.matchAll(/<mesh\b/g)].length;
        const expected =
          scene.storyId === '73'
            ? r.role === 'inventory' || r.role === 'replacement'
              ? 17
              : 15
            : 31;
        expect(meshes).toBe(expected);
        expect([...model.markup.matchAll(/<meshPhysicalMaterial\b/g)]).toHaveLength(meshes);
        expect(model.roundedResources + model.primitiveResources).toBe(meshes);
        expect(model.primitiveResources).toBe(
          scene.storyId === '73'
            ? r.role === 'inventory' || r.role === 'replacement'
              ? 3
              : 4
            : 11,
        );
        if (scene.storyId === '73')
          expect(model.markup).toContain(
            `name="shipment-source-${r.role === 'transfer' || r.role === 'replacement' ? 'visible' : 'hidden'}"`,
          );
        else
          expect([...model.markup.matchAll(/source-hidden"/g)].length).toBe(
            r.role === 'payment' || r.role === 'benefit' || r.role === 'external-effect' ? 2 : 3,
          );
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
                value: { aspect: presentation ? '16:9' : '9:16', presentation, nativeStage: true },
              },
              createElement(
                DiagramSurface,
                null,
                createElement(SupplyIncentivesDiagram, { scene, pose }),
              ),
            ),
          );
          const hosts = [...svg.matchAll(/<(svg|g|rect|path|circle|ellipse|text)\b/g)].length;
          expect([...svg.matchAll(/<svg\b/g)]).toHaveLength(1);
          expect([...svg.matchAll(/data-line-id=/g)]).toHaveLength(page.lines.length);
          if (page.quantityIndex !== undefined) {
            const q = scene.quantities[page.quantityIndex];
            expect(page.quantityState).toBe(q.state);
            expect(svg).toContain(`data-quantity-state="${q.state}"`);
            expect(svg).toContain(`Quantity: ${q.state}</text>`);
          } else expect(svg).not.toContain('data-quantity-state=');
          expect(svg).toContain(`data-fact-state="${page.state ?? scene.evidence}"`);
          expect([...svg.matchAll(/data-qualification-line=/g)]).toHaveLength(
            page.qualification.length,
          );
          expect(svg).not.toMatch(/NaN|Infinity|ellipsis|textLength|lengthAdjust|<canvas/);
          maxSvg = Math.max(maxSvg, hosts);
        }
      }
      expect(visited.size).toBe(supplyIncentivesPose(scene, scene.setupAt).pages.length);
      expect(maxMeshes).toBe(scene.storyId === '73' ? 17 : 31);
      expect(maxSvg).toBeLessThanOrEqual(54);
      if (scene.quantities.length === 7)
        expect(maxSvg).toBe(
          scene.storyId === '73'
            ? scene.quantities.some((q) => q.state === 'conditional')
              ? 54
              : 50
            : scene.quantities.some((q) => q.state === 'conditional')
              ? 53
              : 49,
        );
      console.info(
        `supply-incentives source ${index}, ${presentation ?? 'vertical'}: pages=${visited.size}, SVG hosts=${maxSvg}, authored meshes=${maxMeshes}, hybrid total=${maxMeshes + 8 + 2}, studio instances=6`,
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
  const route = readFileSync(`${root}expansion/physical/supply-incentives-Scene.tsx`, 'utf8');
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

it('PMREM source-only transient inventory is separate from authored/studio/shadow host ceilings; no fake GL execution', () => {
  const pmrem = readFileSync('node_modules/three/src/extras/PMREMGenerator.js', 'utf8');
  const studio = readFileSync(
    'src/main/remotion/compositions/explainer/StudioEnvironment.tsx',
    'utf8',
  );
  expect(studio).toContain('generator.fromScene(room, 0.04, 0.1, 100, { size: 128 })');
  expect(pmrem).toContain('const LOD_MIN = 4;');
  expect(pmrem).toContain('const EXTRA_LODS = 6;');
  expect(pmrem).toContain('const totalLods = lodMax - LOD_MIN + 1 + EXTRA_LODS;');
  expect(Math.log2(128) - 4 + 1 + 6).toBe(10);
  for (const source of [
    'lodMeshes.push( new Mesh( planes, null ) )',
    'const mesh = new Mesh( new BufferGeometry(), material )',
    'this._backgroundBox = new Mesh(',
    'this._pingPongRenderTarget = _createRenderTarget',
    'new WebGLRenderTarget',
    'this._pingPongRenderTarget.dispose()',
    'this._lodMeshes[ i ].geometry.dispose()',
  ])
    expect(pmrem).toContain(source);
  for (const source of ['generator.dispose()', 'room.dispose()', 'target.dispose()'])
    expect(studio).toContain(source);
  // Ten LOD mesh wrappers, a background box and a temporary filter mesh construction;
  // output/ping-pong render targets are NOT authored React hosts or a measured GPU ceiling.
});
