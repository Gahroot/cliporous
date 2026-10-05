import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { describe, expect, it } from 'vitest';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { MatrixMatchingDiagram } from './matrix-matching-Diagram';
import { MatrixMatchingModels } from './matrix-matching-models';
import {
  capacityPositions,
  matrixMatchingPages,
  matrixMatchingPose,
} from './matrix-matching-poses';
import { colors, matrixMatchingCases } from './matrix-matching-test-fixtures';

describe('matrix/matching composed geometry costs (CPU ledger, not GPU)', () => {
  for (const [index, scene] of matrixMatchingCases().entries())
    it(`counts every composed/hidden model and SVG node, all pages/beats and both modes: ${index}`, () => {
      let maxMesh = 0,
        maxSvg = 0;
      {
        const pages = matrixMatchingPages(scene);
        const times = [
          -1,
          NaN,
          scene.setupAt,
          scene.actionAt,
          scene.responseAt,
          scene.checkAt,
          scene.resolveAt,
          100,
        ];
        for (const pose of [
          ...times.map((t) => matrixMatchingPose(scene, t)),
          ...pages.map((_, page) => ({ ...matrixMatchingPose(scene, scene.resolveAt), page })),
        ]) {
          const model = renderToStaticMarkup(
            createElement(MatrixMatchingModels, { scene, pose, colors }),
          );
          expect(model).not.toMatch(/<(?:instancedMesh|skinnedMesh|primitive|canvas|text)\b/);
          const meshes = [...model.matchAll(/<mesh\b/g)].length;
          expect(meshes).toBe(scene.entities.length * 3);
          maxMesh = Math.max(maxMesh, meshes);
          const svg = (['diagram', 'hybrid'] as const).map((visualMode) =>
            renderToStaticMarkup(
              createElement(
                DiagramSurface,
                null,
                createElement(MatrixMatchingDiagram, {
                  scene: { ...scene, visualMode },
                  pose,
                }),
              ),
            ),
          );
          expect(svg[0]).toBe(svg[1]);
          const rows = scene.storyId === '37' ? scene.matrix.rowIds : scene.candidateIds;
          const columns = scene.storyId === '37' ? scene.matrix.columnIds : scene.destinationIds;
          const pairs = scene.storyId === '37' ? scene.relations : scene.eligibility;
          const empty = rows.reduce(
            (sum, id) =>
              sum +
              columns.filter(
                (to) =>
                  !pairs.some((p) =>
                    'fromId' in p
                      ? p.fromId === id && p.toId === to
                      : p.candidateId === id && p.destinationId === to,
                  ),
              ).length,
            0,
          );
          const page = pose.pages[pose.page];
          const active = pairs.find((r) => r.id === page.id);
          const record =
            scene.storyId === '38' ? scene.records.find((r) => r.id === page.id) : undefined;
          const linkCost = active
            ? 'direction' in active && active.direction === 'from-to'
              ? 3
              : 2
            : record?.type === 'match' && record.status === 'matched'
              ? 3
              : 0;
          const capCost =
            record?.type === 'capacity' ? 2 + capacityPositions(scene, record.id).length : 0;
          const expected =
            7 +
            2 * columns.length +
            2 * rows.length +
            2 * rows.length * columns.length +
            empty +
            2 * pairs.length +
            3 * scene.entities.length +
            linkCost +
            capCost +
            2 * page.lines.length;
          const nodes = [...svg[0].matchAll(/<(?:svg|g|rect|circle|path|text)\b/g)].length;
          expect(nodes).toBe(expected);
          maxSvg = Math.max(maxSvg, nodes);
          expect(svg[0]).not.toMatch(/<canvas|<foreignObject|<image|<use/);
          for (const e of scene.entities) {
            expect(model).toContain(e.id);
            expect(svg[0]).toContain(`data-entity-id="${e.id}"`);
          }
          if (scene.storyId === '37' && active && 'direction' in active)
            expect(svg[0]).toContain(`data-direction="${active.direction}"`);
        }
      }
      expect(maxMesh).toBe(scene.entities.length * 3);
      expect(maxSvg).toBeLessThanOrEqual(scene.storyId === '37' ? 150 : 141);
      if (
        scene.storyId === '37' &&
        scene.relations.length === 16 &&
        new Set(scene.relations.map((r) => `${r.fromId}:${r.toId}`)).size === 6
      ) {
        // Multiplicity ceiling: fixed 7 + axes 16 + cells 32 + ten absent-cell glyphs 10
        // + sixteen pair groups/glyphs 32 + eight identities 24 + directed edge 3 + lines 26 = 150.
        expect(maxSvg).toBe(150);
        expect(maxMesh).toBe(24);
      }
      if (
        scene.storyId === '38' &&
        scene.eligibility.length === 16 &&
        scene.records.some((r) => r.type === 'capacity' && r.quantity.state === 'disputed')
      ) {
        // Full 4x4: fixed 7 + columns 8 + rows 8 + cells 32 + pairs 32 + identities 24
        // + capacity group/rail/two alternatives 4 + thirteen wrapped lines 26 = 141.
        expect(maxSvg).toBe(141);
        expect(maxMesh).toBe(24);
      }
    });
  it('separates studio 8 meshes / 6 instances and two contact shadow meshes', () => {
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
    // 24 authored + 1 displayed shadow = 25 live; + 1 scratch = 26. Studio is separate.
  });
  it('checks real zero/one Canvas route and persistent planar surface without fake contexts', () => {
    const route = readFileSync(
      'src/main/remotion/compositions/explainer/expansion/relationships/matrix-matching-Scene.tsx',
      'utf8',
    );
    expect(route).toMatch(/if \(scene.visualMode === 'diagram'\)[\s\S]*?return <DiagramStage/);
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
