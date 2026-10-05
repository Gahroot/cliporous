import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { describe, expect, it } from 'vitest';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { SetsTopologyDiagram } from './sets-topology-Diagram';
import { SetsTopologyModels } from './sets-topology-models';
import { setsTopologyPages, setsTopologyPose } from './sets-topology-poses';
import { colors, setsTopologyCases } from './sets-topology-test-fixtures';

const tags = (markup: string, name: string): number =>
  [...markup.matchAll(new RegExp(`<${name}\\b`, 'g'))].length;

describe('sets/topology composed geometry ledger (not native/GPU)', () => {
  it('counts all mounted and hidden model geometry at maximum accepted caps and five beats', () => {
    const maxima = { sets: 0, topology: 0 };
    for (const scene of setsTopologyCases()) {
      for (const time of [
        -1,
        scene.setupAt,
        scene.actionAt,
        scene.responseAt,
        scene.checkAt,
        scene.resolveAt,
        100,
      ]) {
        const pose = setsTopologyPose(scene, time);
        const markup = renderToStaticMarkup(
          createElement(SetsTopologyModels, { scene, pose, colors }),
        );
        expect(markup).not.toMatch(/<(?:instancedMesh|skinnedMesh|primitive|canvas|text)\b/);
        const meshes = tags(markup, 'mesh');
        const expected =
          scene.storyId === '39'
            ? scene.memberIds.length * 3 +
              scene.setIds.length * 4 +
              scene.memberships.filter((r) => r.state === 'known' && r.membership === 'included')
                .length
            : scene.entities.length * 3 +
              scene.edges.reduce(
                (n, r) =>
                  n +
                  2 +
                  (r.status === 'failed'
                    ? 2
                    : r.status === 'absent' || r.status === undefined
                      ? 1
                      : 0),
                0,
              );
        expect(meshes).toBe(expected);
        const inlineGeometry = [
          ...markup.matchAll(
            /<(?:boxGeometry|cylinderGeometry|coneGeometry|torusGeometry|octahedronGeometry)\b/gi,
          ),
        ].length;
        const roundedGeometry = [...markup.matchAll(/<mesh\b[^>]*\bgeometry="\[object Object\]"/g)]
          .length;
        expect(inlineGeometry + roundedGeometry).toBe(meshes);
        if (scene.storyId === '39') maxima.sets = Math.max(maxima.sets, meshes);
        else {
          maxima.topology = Math.max(maxima.topology, meshes);
          expect(tags(markup, 'cylinderGeometry')).toBe(scene.edges.length);
        }
      }
    }
    expect(maxima).toEqual({ sets: 42, topology: 28 });
  });
  it('audits the actual persistent SVG on every page and final hold in both modes', () => {
    const maxima = { sets: 0, topology: 0 };
    for (const scene of setsTopologyCases()) {
      const pages = setsTopologyPages(scene);
      const times = [
        ...pages.map(
          (_, i) => scene.setupAt + ((i + 0.5) / pages.length) * (scene.resolveAt - scene.setupAt),
        ),
        100,
      ];
      for (const time of times) {
        const pose = setsTopologyPose(scene, time);
        const markup = (['diagram', 'hybrid'] as const).map((visualMode) =>
          renderToStaticMarkup(
            createElement(
              DiagramSurface,
              null,
              createElement(SetsTopologyDiagram, {
                scene: { ...scene, visualMode },
                pose,
              }),
            ),
          ),
        );
        expect(markup[0]).toBe(markup[1]);
        expect(tags(markup[0], 'svg')).toBe(1);
        expect(tags(markup[0], 'text')).toBeGreaterThan(pose.pages[pose.page].lines.length);
        expect(markup[0]).not.toMatch(/<(?:canvas|foreignObject|image|use)\b/);
        const svg = [...markup[0].matchAll(/<(?:svg|g|rect|circle|path|text)\b/g)].length;
        if (scene.storyId === '39') maxima.sets = Math.max(maxima.sets, svg);
        else {
          maxima.topology = Math.max(maxima.topology, svg);
          expect([...markup[0].matchAll(/data-edge-id=/g)]).toHaveLength(scene.edges.length);
          expect(tags(markup[0], 'path')).toBe(
            scene.edges.length * 2 + scene.edges.filter((r) => r.status === 'failed').length,
          );
        }
      }
    }
    expect(maxima).toEqual({ sets: 87, topology: 64 });
  });
  it('separately measures offline studio meshes/instances and reads live/scratch shadow allocations', () => {
    const room = new RoomEnvironment();
    let meshes = 0,
      instances = 0;
    room.traverse((o) => {
      if ('isMesh' in o && o.isMesh) meshes++;
      if ('isInstancedMesh' in o && o.isInstancedMesh && 'count' in o) instances += Number(o.count);
    });
    room.dispose();
    expect({ meshes, instances }).toEqual({ meshes: 8, instances: 6 });
    const shadow = readFileSync('node_modules/@react-three/drei/core/ContactShadows.js', 'utf8');
    expect(shadow.match(/new THREE.Mesh\(planeGeometry\)/g)).toHaveLength(1);
    expect(shadow.match(/React.createElement\("mesh"/g)).toHaveLength(1);
    const studio = readFileSync(
      'src/main/remotion/compositions/explainer/StudioEnvironment.tsx',
      'utf8',
    );
    expect(studio).toContain('RoomEnvironment');
    // Separate costs: sets 42 authored + 1 live shadow + 1 scratch = 44;
    // topology 28 authored + 1 live shadow + 1 scratch = 30.
    // Offline PMREM room: 8 meshes, including 6 instances, not live story geometry.
  });
  it('checks zero/one canvas routing without fake Remotion/Canvas or direct hook calls', () => {
    const route = readFileSync(
      'src/main/remotion/compositions/explainer/expansion/relationships/sets-topology-Scene.tsx',
      'utf8',
    );
    expect(route).toContain("if (scene.visualMode === 'diagram') return <DiagramStage");
    expect(route.match(/<HybridStage\b/g)).toHaveLength(1);
    expect(route).toContain('diagram={null}');
    expect(route.match(/<DiagramSurface\b/g)).toHaveLength(1);
    expect(route).not.toMatch(/<ThreeCanvas|<Stage3D|<canvas/);
    const hybrid = readFileSync(
      'src/main/remotion/compositions/explainer/diagrams/HybridStage.tsx',
      'utf8',
    );
    expect(hybrid.match(/<Stage3D\b/g)).toHaveLength(1);
    const stage = readFileSync('src/main/remotion/compositions/explainer/Stage3D.tsx', 'utf8');
    for (const tag of ['ThreeCanvas', 'StudioEnvironment', 'ContactShadows'])
      expect(stage.match(new RegExp(`<${tag}\\b`, 'g'))).toHaveLength(1);
    expect(
      readFileSync('src/main/remotion/compositions/explainer/diagrams/DiagramStage.tsx', 'utf8'),
    ).not.toMatch(/<ThreeCanvas|<Stage3D|<canvas/);
  });
});
