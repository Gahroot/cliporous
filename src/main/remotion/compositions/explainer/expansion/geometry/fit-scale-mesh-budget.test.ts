import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InstancedMesh, Mesh } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { expect, it } from 'vitest';
import { FitScaleDiagram } from './fit-scale-Diagram';
import { FitScaleModels } from './fit-scale-models';
import { fitScalePose } from './fit-scale-poses';
import {
  accepted,
  composedHosts,
  linkedFixture,
  maximumPacking,
  packet,
  qualifiedResult,
} from './fit-scale-test-fixtures';

for (const [index, story] of [
  ...packet.stories,
  maximumPacking(),
  linkedFixture('measured'),
  linkedFixture('schematic'),
  linkedFixture('measured', true),
  ...(['unknown', 'missing', 'disputed'] as const).flatMap((s) => [
    qualifiedResult('59', s),
    qualifiedResult('60', s),
  ]),
].entries())
  it(`composed hidden hosts and current-page SVG case ${index}`, () => {
    const scene = accepted(story, 'hybrid');
    const counts: number[] = [];
    const base = fitScalePose(scene, 12);
    for (let page = 0; page < base.pages.length; page++) {
      const markup = renderToStaticMarkup(
        createElement(
          'svg',
          null,
          createElement(FitScaleDiagram, { scene, pose: { ...base, page } }),
        ),
      );
      const nodes = [...markup.matchAll(/<([a-zA-Z][\w:-]*)\b/g)].length;
      const qualification =
        'condition' in scene.result
          ? scene.result.condition
          : 'qualifier' in scene.result
            ? scene.result.qualifier
            : '';
      expect(nodes).toBe(
        2 +
          1 +
          Math.ceil(qualification.length / 18) +
          (scene.storyId === '59' ? 5 : 8) +
          base.pages[page].lines.length,
      );
      expect(markup).not.toMatch(/<canvas|<image|<use\b|<foreignObject|NaN|Infinity/);
      expect([...markup.matchAll(/data-page-id=/g)]).toHaveLength(1);
      counts.push(nodes);
    }
    for (const t of [
      ...Array.from({ length: 361 }, (_, i) => i / 30),
      NaN,
      Infinity,
      -Infinity,
      -1,
      100,
    ]) {
      const pose = fitScalePose(scene, t);
      expect(counts[pose.page]).toBeGreaterThan(0);
      const hosts = composedHosts(
        createElement(FitScaleModels, {
          scene,
          pose,
          colors: { surface: '#fff', text: '#000', accent: '#aaa', muted: '#777' },
        }),
      );
      const costs: Record<string, number> = {};
      for (const host of hosts) {
        costs[host.type] = (costs[host.type] ?? 0) + 1;
        const numbers = [
          host.props.opacity,
          ...(Array.isArray(host.props.position) ? host.props.position : []),
          ...(Array.isArray(host.props.args) ? host.props.args : []),
        ].filter((v) => typeof v === 'number');
        expect(numbers.every(Number.isFinite)).toBe(true);
      }
      const meshes = scene.storyId === '59' ? 5 : 7;
      expect(costs).toEqual({
        group: 1,
        mesh: meshes,
        boxGeometry: meshes,
        meshPhysicalMaterial: meshes,
      });
    }
    console.info(
      `fit-scale case ${index}: authored=${scene.storyId === '59' ? 5 : 7}; SVG=${Math.max(...counts)}; pages=${base.pages.length}`,
    );
  });
it('actual offline studio plus source-owned scratch/live shadows', () => {
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
  const contact = readFileSync('node_modules/@react-three/drei/core/ContactShadows.js', 'utf8');
  expect([...contact.matchAll(/new THREE\.Mesh\(|React\.createElement\("mesh",/g)].length).toBe(2);
});
it('actual route wiring: zero canvas diagram, one shared hybrid stage and persistent factual surface', () => {
  const root = 'src/main/remotion/compositions/explainer/';
  const route = readFileSync(`${root}expansion/geometry/fit-scale-Scene.tsx`, 'utf8');
  expect(route).toMatch(/if \(scene.visualMode === 'diagram'\)\s*return <DiagramStage/);
  expect([...route.matchAll(/<HybridStage\b/g)].length).toBe(1);
  expect(route).toContain('diagram={null}');
  expect(route).toContain('<DiagramSurface>{diagram}</DiagramSurface>');
  expect(readFileSync(`${root}diagrams/DiagramStage.tsx`, 'utf8')).not.toMatch(
    /import[^;]*Stage3D|<Canvas\b|<ThreeCanvas\b/,
  );
  expect(
    [...readFileSync(`${root}diagrams/HybridStage.tsx`, 'utf8').matchAll(/<Stage3D\b/g)].length,
  ).toBe(1);
  const stage = readFileSync(`${root}Stage3D.tsx`, 'utf8');
  for (const tag of ['ThreeCanvas', 'StudioEnvironment', 'ContactShadows'])
    expect([...stage.matchAll(new RegExp(`<${tag}\\b`, 'g'))].length).toBe(1);
});
