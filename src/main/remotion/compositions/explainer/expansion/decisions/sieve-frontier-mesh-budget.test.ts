import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { describe, expect, it } from 'vitest';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { SieveFrontierDiagram } from './sieve-frontier-Diagram';
import { SieveFrontierModels } from './sieve-frontier-models';
import {
  frontierMarks,
  sieveFrontierPages,
  sieveFrontierPose,
  sieveOptionStatus,
} from './sieve-frontier-poses';
import { colors, sieveFrontierCases } from './sieve-frontier-test-fixtures';

const tags = (s: string, name: string) => [...s.matchAll(new RegExp(`<${name}\\b`, 'g'))].length;

describe('sieve/frontier actual composed geometry ledger (not native/GPU)', () => {
  it('accounts every mounted/hidden mesh and SVG node on every accepted page and beat', () => {
    const maxima = { sieveMeshes: 0, frontierMeshes: 0, sieveSvg: 0, frontierSvg: 0 };
    for (const scene of sieveFrontierCases()) {
      const pages = sieveFrontierPages(scene);
      const times = [
        -1,
        scene.setupAt,
        scene.actionAt,
        scene.responseAt,
        scene.checkAt,
        scene.resolveAt,
        100,
        ...pages.map(
          (_, i) => scene.setupAt + ((i + 0.5) / pages.length) * (scene.resolveAt - scene.setupAt),
        ),
      ];
      for (const t of times) {
        const pose = sieveFrontierPose(scene, t);
        const model = renderToStaticMarkup(
          createElement(SieveFrontierModels, { scene, pose, colors }),
        );
        expect(model).not.toMatch(/<(?:instancedMesh|skinnedMesh|primitive|canvas|text)\b/);
        const meshes = tags(model, 'mesh');
        const expectedMeshes =
          scene.storyId === '25'
            ? scene.entities.reduce(
                (n, e) =>
                  n +
                  scene.requirements.length +
                  2 +
                  Number(
                    scene.records.some(
                      (r) => r.optionId === e.id && r.state === 'known' && r.status === 'fail',
                    ),
                  ),
                0,
              )
            : scene.criteria.length * 4;
        expect(meshes).toBe(expectedMeshes);
        const markup = (['diagram', 'hybrid'] as const).map((visualMode) =>
          renderToStaticMarkup(
            createElement(
              DiagramSurface,
              null,
              createElement(SieveFrontierDiagram, {
                scene: { ...scene, visualMode },
                pose,
              }),
            ),
          ),
        );
        expect(markup[0]).toBe(markup[1]);
        const svg = [...markup[0].matchAll(/<(?:svg|g|rect|circle|path|text)\b/g)].length;
        const n = scene.storyId === '25' ? scene.requirements.length : scene.criteria.length;
        const rings =
          scene.storyId === '26' && scene.result.state === 'derived'
            ? scene.result.nondominatedOptionIds.length
            : 0;
        const failPaths =
          scene.storyId === '25'
            ? scene.entities.filter((e) => sieveOptionStatus(scene, e.id).fail).length
            : 0;
        const markCount =
          scene.storyId === '26'
            ? frontierMarks(scene, scene.records[pose.pages[pose.page].record].criterionId).reduce(
                (n, m) => n + m.positions.length,
                0,
              )
            : 0;
        const expectedSvg =
          (scene.storyId === '25'
            ? 8 + n * 2 + scene.entities.length * 3 + scene.records.length * 3 + failPaths
            : 10 + scene.entities.length * 4 + rings + markCount) +
          pose.pages[pose.page].lines.length * 2;
        expect(svg).toBe(expectedSvg);
        if (scene.storyId === '25') {
          maxima.sieveMeshes = Math.max(maxima.sieveMeshes, meshes);
          maxima.sieveSvg = Math.max(maxima.sieveSvg, svg);
        } else {
          maxima.frontierMeshes = Math.max(maxima.frontierMeshes, meshes);
          maxima.frontierSvg = Math.max(maxima.frontierSvg, svg);
        }
      }
    }
    expect(maxima).toEqual({ sieveMeshes: 24, frontierMeshes: 16, sieveSvg: 92, frontierSvg: 60 });
  }, 30000);
  it('separates offline studio 8 meshes / 6 instances and live/scratch shadow costs', () => {
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
    // Max sieve: 24 authored + 1 displayed = 25 live, + 1 scratch = 26.
    // Max frontier: 16 authored + 1 displayed = 17 live, + 1 scratch = 18.
    // Studio PMREM 8 meshes / 6 instances is separate, never hidden scene geometry.
  });
  it('checks actual zero/one canvas ownership without fake Remotion or Three context', () => {
    const route = readFileSync(
      'src/main/remotion/compositions/explainer/expansion/decisions/sieve-frontier-Scene.tsx',
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
