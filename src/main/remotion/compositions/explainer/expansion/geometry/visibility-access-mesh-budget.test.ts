import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { InstancedMesh, Mesh } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { expect, it } from 'vitest';
import { VisibilityAccessDiagramBody } from './visibility-access-Diagram';
import { VisibilityAccessModels } from './visibility-access-models';
import { visibilityAccessPages, visibilityAccessPose } from './visibility-access-poses';
import { accepted, colors, composedHosts, sources } from './visibility-access-test-fixtures';

for (const [index, source] of sources.entries())
  it(`source ${index}: actual composed model/SVG hosts, hidden geometry included`, () => {
    const scene = accepted(source, 'hybrid');
    const pages = visibilityAccessPages(scene);
    const visited = new Set<number>();
    let maxSvg = 0,
      maxMeshes = 0;
    for (const time of [
      ...Array.from({ length: Math.floor(source.window.endTime * 30) + 1 }, (_, f) => f / 30),
      NaN,
      Infinity,
      -Infinity,
      100,
    ]) {
      const pose = visibilityAccessPose(scene, time, pages);
      const hosts = composedHosts(createElement(VisibilityAccessModels, { scene, pose, colors }));
      const meshes = hosts.filter((h) => h.type === 'mesh').length;
      expect(meshes).toBe(
        scene.storyId === '61' ? 12 : scene.template === 'courtyard-route' ? 17 : 16,
      );
      expect(hosts.filter((h) => h.type === 'meshPhysicalMaterial')).toHaveLength(meshes);
      expect(hosts.some((h) => h.type === 'instancedMesh')).toBe(false);
      maxMeshes = Math.max(maxMeshes, meshes);
      for (const h of hosts)
        for (const v of [
          h.props.opacity,
          ...(Array.isArray(h.props.position) ? h.props.position : []),
          ...(Array.isArray(h.props.rotation) ? h.props.rotation : []),
          ...(Array.isArray(h.props.args) ? h.props.args : []),
        ])
          if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
      if (!visited.has(pose.page)) {
        visited.add(pose.page);
        const svg = composedHosts(
          createElement(
            'svg',
            null,
            createElement(VisibilityAccessDiagramBody, { scene, pose, colors }),
          ),
        );
        expect(
          svg.every((h) => ['svg', 'g', 'text', 'path', 'rect', 'circle'].includes(h.type)),
        ).toBe(true);
        expect(svg.filter((h) => h.props['data-page-id'])).toHaveLength(1);
        const texts = svg
          .filter((h) => h.type === 'text' && h.props.x === 492)
          .map((h) => h.props.children);
        expect(texts).toEqual(pages[pose.page].lines);
        maxSvg = Math.max(maxSvg, svg.length);
      }
    }
    expect(visited.size).toBe(pages.length);
    expect(maxSvg).toBeLessThanOrEqual(64);
    console.info(
      `visibility-access source ${index}: pages=${pages.length}, SVG=${maxSvg}, authored meshes=${maxMeshes}, hybrid hosts=${maxMeshes + 8 + 2} (studio instances=6)`,
    );
  });
it('actual offline studio 8 mesh hosts/6 instances and two source-owned shadow meshes', () => {
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
  const shadows = readFileSync('node_modules/@react-three/drei/core/ContactShadows.js', 'utf8');
  expect([...shadows.matchAll(/new THREE\.Mesh\(|React\.createElement\("mesh",/g)].length).toBe(2);
});
it('zero canvas diagram + Chrome; one hybrid stage with null diagram and persistent factual surface', () => {
  const root = 'src/main/remotion/compositions/explainer/';
  const route = readFileSync(`${root}expansion/geometry/visibility-access-Scene.tsx`, 'utf8');
  expect(route).toMatch(/if \(scene.visualMode === 'diagram'\)\s*return <DiagramStage/);
  expect([...route.matchAll(/<HybridStage\b/g)]).toHaveLength(1);
  expect(route).toContain('diagram={null}');
  expect(route).toContain('<DiagramSurface>{diagram}</DiagramSurface>');
  const diagram = readFileSync(`${root}diagrams/DiagramStage.tsx`, 'utf8');
  expect(diagram).toMatch(
    /<DiagramChrome scene=\{scene\}(?: settledOutcome=\{settledOutcome\})? \/>/,
  );
  expect(diagram).not.toMatch(/import[^;]*Stage3D|<Canvas\b|<ThreeCanvas\b/);
  const hybrid = readFileSync(`${root}diagrams/HybridStage.tsx`, 'utf8');
  expect([...hybrid.matchAll(/<Stage3D\b/g)]).toHaveLength(1);
  const stage = readFileSync(`${root}Stage3D.tsx`, 'utf8');
  for (const component of ['ThreeCanvas', 'StudioEnvironment', 'ContactShadows'])
    expect([...stage.matchAll(new RegExp(`<${component}\\b`, 'g'))]).toHaveLength(1);
});
