import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InstancedMesh, Mesh } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { expect, it } from 'vitest';
import { composedHosts } from '../representations/projection-matrix-test-fixtures';
import { SectionUnfoldDiagram } from './section-unfold-Diagram';
import { SectionUnfoldModels } from './section-unfold-models';
import { sectionUnfoldPages, sectionUnfoldPose } from './section-unfold-poses';
import { sectionAccepted, sectionCases, sectionTreeCost } from './section-unfold-test-fixtures';

const colors = { surface: '#eeeeee', text: '#222222', accent: '#9988ee', muted: '#777777' };
for (const story of sectionCases)
  it(`audited actual model hosts including opacity-zero ${story.id}/${story.name}`, () => {
    const scene = sectionAccepted(story, 'hybrid');
    const pages = sectionUnfoldPages(scene);
    let maxMeshes = 0,
      maxSvg = 0;
    const svgCosts = new Map<number, number>();
    for (const t of [
      ...Array.from({ length: Math.ceil(story.window.endTime * 30) + 1 }, (_, f) => f / 30),
      NaN,
      Infinity,
      -Infinity,
      100,
    ]) {
      const tree = SectionUnfoldModels({ scene, pose: sectionUnfoldPose(scene, t, pages), colors });
      const cost = sectionTreeCost(tree);
      expect(cost.instances).toBe(0);
      expect(cost.meshes).toBeLessThanOrEqual(12);
      maxMeshes = Math.max(maxMeshes, cost.meshes);
      const hosts = composedHosts(tree);
      expect(hosts.filter((h) => h.type === 'meshPhysicalMaterial')).toHaveLength(cost.meshes);
      for (const host of hosts) {
        const values = [
          host.props.opacity,
          ...(Array.isArray(host.props.args) ? host.props.args : []),
          ...(Array.isArray(host.props.position) ? host.props.position : []),
          ...(Array.isArray(host.props.rotation) ? host.props.rotation : []),
        ].filter((v) => typeof v === 'number');
        expect(values.every(Number.isFinite)).toBe(true);
      }
      const pose = sectionUnfoldPose(scene, t, pages);
      const svg = renderToStaticMarkup(
        createElement('svg', null, createElement(SectionUnfoldDiagram, { scene, pose })),
      );
      const nodes = [...svg.matchAll(/<[a-zA-Z][\w:-]*\b/g)].length;
      expect(nodes).toBeLessThanOrEqual(70);
      expect(svg).not.toMatch(/<canvas|<mesh\b|<image|<foreignObject|NaN|Infinity/);
      maxSvg = Math.max(maxSvg, nodes);
      svgCosts.set(pose.page, nodes);
      // Existing persistent studio: eight mesh hosts, six instances, two shadows.
      expect(cost.meshes + 8 + 2).toBeLessThanOrEqual(22);
      expect(cost.instances + 6).toBe(6);
      expect(
        SectionUnfoldModels({
          scene: {
            ...scene,
            measurement: {
              ...scene.measurement,
              state: 'known',
              amount: { kind: 'rational', value: { numerator: 1000000000, denominator: 1 } },
            },
          },
          pose: sectionUnfoldPose(scene, t, pages),
          colors,
        }),
      ).toEqual(tree);
    }
    expect(svgCosts.size).toBe(pages.length);
    console.info(
      `${story.name}: authored meshes=${maxMeshes}; SVG=${maxSvg}; pages=${pages.length}; hybrid meshes=${maxMeshes + 10}, instances=6`,
    );
  });

it('actual offline studio geometry and installed contact-shadow host ledger', () => {
  const room = new RoomEnvironment();
  let meshes = 0,
    instances = 0;
  room.traverse((object) => {
    if (object instanceof Mesh) meshes++;
    if (object instanceof InstancedMesh) instances += object.count;
  });
  expect([meshes, instances]).toEqual([8, 6]);
  room.traverse((object) => {
    if (object instanceof InstancedMesh) object.dispose();
  });
  room.dispose();
  const contact = readFileSync('node_modules/@react-three/drei/core/ContactShadows.js', 'utf8');
  expect([...contact.matchAll(/new THREE\.Mesh\(|React\.createElement\("mesh",/g)].length).toBe(2);
});
it('actual production route: zero diagram WebGL, one hybrid canvas, same persistent Chrome', () => {
  const root = 'src/main/remotion/compositions/explainer/';
  const route = readFileSync(`${root}expansion/geometry/section-unfold-Scene.tsx`, 'utf8');
  expect(route).toMatch(/if \(scene.visualMode === 'diagram'\)\s*return <DiagramStage/);
  expect([...route.matchAll(/<HybridStage\b/g)]).toHaveLength(1);
  expect(route).toContain('diagram={null}');
  expect(route).toContain('<DiagramSurface>{diagram}</DiagramSurface>');
  const diagram = readFileSync(`${root}diagrams/DiagramStage.tsx`, 'utf8');
  const hybrid = readFileSync(`${root}diagrams/HybridStage.tsx`, 'utf8');
  expect(diagram).not.toMatch(/import[^;]*Stage3D|<Canvas\b/);
  expect(diagram).toMatch(
    /<DiagramChrome scene=\{scene\}(?: settledOutcome=\{settledOutcome\})? \/>/,
  );
  expect(hybrid).toMatch(
    /<DiagramChrome scene=\{scene\}(?: settledOutcome=\{settledOutcome\})? \/>/,
  );
  expect([...hybrid.matchAll(/<Stage3D\b/g)]).toHaveLength(1);
  const stage = readFileSync(`${root}Stage3D.tsx`, 'utf8');
  for (const tag of ['ThreeCanvas', 'StudioEnvironment', 'ContactShadows'])
    expect([...stage.matchAll(new RegExp(`<${tag}\\b`, 'g'))]).toHaveLength(1);
});
