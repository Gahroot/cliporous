import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InstancedMesh, Mesh } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { describe, expect, it } from 'vitest';
import { hybridDiagramLayer } from '../../diagrams/HybridStage';
import { VectorFactorizationDiagram } from './vector-factorization-Diagram';
import { VectorFactorizationModels } from './vector-factorization-models';
import {
  vectorFactorizationIdentity,
  vectorFactorizationPose,
  vectorFactorizationValue,
  vectorFactorizationWrap,
} from './vector-factorization-poses';
import {
  parseVectorFactorization,
  vectorFactorizationColors,
  vectorFactorizationFixtures,
} from './vector-factorization-test-fixtures';

const count = (markup: string, name: string): number =>
  [...markup.matchAll(new RegExp(`<${name}\\b`, 'g'))].length;
describe('vector/factorization composed actual model/SVG costs, CPU only', () => {
  it('counts hidden geometry and the current page, with the existing studio and shadows', () => {
    for (const fixture of vectorFactorizationFixtures())
      for (const mode of ['diagram', 'hybrid'] as const) {
        const scene = parseVectorFactorization(fixture, mode);
        for (const t of [
          -1,
          NaN,
          Infinity,
          scene.setupAt,
          scene.actionAt,
          scene.responseAt,
          scene.checkAt,
          scene.resolveAt,
          12,
        ]) {
          const pose = vectorFactorizationPose(scene, t);
          const model = renderToStaticMarkup(
            createElement(VectorFactorizationModels, {
              scene,
              pose,
              colors: vectorFactorizationColors,
            }),
          );
          const expected =
            scene.storyId === '55' ? 2 + scene.basis.length : 1 + scene.operands.length;
          expect(count(model, 'mesh')).toBe(expected);
          expect(expected + 8 + 2).toBeLessThanOrEqual(16);
          expect(model).not.toMatch(/NaN|Infinity|<(?:instancedMesh|primitive|skinnedMesh)\b/);
          const svg = renderToStaticMarkup(
            createElement('svg', null, createElement(VectorFactorizationDiagram, { scene, pose })),
          );
          const page = pose.pages[pose.page];
          let expectedSvg: number;
          if (scene.storyId === '55') {
            const vectors = [scene.vector, ...scene.basis];
            const vector =
              vectors.find((v) => v.components.some((c) => c.id === page.sourceId)) ?? scene.vector;
            const component =
              vector.components.find((c) => c.id === page.sourceId) ?? vector.components[0];
            const label = scene.entities.find((e) => e.id === vector.entityId)?.label;
            if (label === undefined) throw new Error('Lost supplied vector label');
            const heading = vectorFactorizationWrap(
              `${vector.id === scene.vector.id ? 'Vector' : 'Basis'}: ${label}`,
            );
            expectedSvg =
              19 +
              page.lines.length +
              heading.length +
              vectorFactorizationWrap(vectorFactorizationValue(component.quantity), 32).length;
          } else {
            const operand = scene.operands.find((o) => o.id === page.sourceId);
            const row = operand
              ? vectorFactorizationWrap(
                  `${operand.role}: ${vectorFactorizationValue(operand.quantity)}`,
                )
              : [];
            expectedSvg =
              7 +
              page.lines.length +
              vectorFactorizationWrap(vectorFactorizationIdentity(scene)).length +
              row.length;
          }
          expect([...svg.matchAll(/<(?:svg|g|rect|text)\b/g)].length).toBe(expectedSvg);
          expect(expectedSvg).toBeLessThanOrEqual(29);
          expect(count(svg, 'svg')).toBe(1);
          expect(svg).not.toMatch(/NaN|Infinity|<canvas|<mesh/);
        }
      }
    expect(hybridDiagramLayer(null, 1)).toBeNull();
  });
  it('audits the actual offline studio: eight meshes, six instances, plus two Stage3D shadows', () => {
    const room = new RoomEnvironment();
    let meshes = 0,
      instances = 0;
    room.traverse((object) => {
      if (object instanceof Mesh) meshes++;
      if (object instanceof InstancedMesh) instances += object.count;
    });
    expect(meshes).toBe(8);
    expect(instances).toBe(6);
    room.dispose();
  });
});
