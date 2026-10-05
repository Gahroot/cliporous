import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  BoxGeometry,
  type BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  OctahedronGeometry,
  PerspectiveCamera,
  Quaternion,
  TorusGeometry,
  Vector3,
} from 'three';
import { describe, expect, it } from 'vitest';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { SetsTopologyDiagram } from './sets-topology-Diagram';
import {
  SETS_TOPOLOGY_CAMERA,
  setsTopologyModelPlacement,
  topologyModelPlacement,
} from './sets-topology-models';
import { setsTopologyPages, setsTopologyPose, topologySlot } from './sets-topology-poses';
import { interExtent, setsTopologyCases } from './sets-topology-test-fixtures';

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'" };
const decode = (s: string): string =>
  s.replace(/&(amp|lt|gt|quot|#x27);/g, (_, k: string) => entities[k] ?? k);
const attrs = (s: string): Record<string, string> =>
  Object.fromEntries([...s.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], decode(m[2])]));
describe('sets/topology full planar identity, source paging and authored projection', () => {
  it('actual composed Inter ink fits and never overlaps on every maximum/state page in both modes', () => {
    for (const scene of setsTopologyCases()) {
      const pages = setsTopologyPages(scene);
      for (let i = 0; i < pages.length; i++) {
        const pose = setsTopologyPose(
          scene,
          scene.setupAt + ((i + 0.5) / pages.length) * (scene.resolveAt - scene.setupAt),
        );
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
        expect(markup[0]).not.toMatch(/textLength|lengthAdjust|clipPath|ellipsis/);
        const boxes = [...markup[0].matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)].map((m) => {
          const a = attrs(m[1]),
            size = Number(a['font-size']);
          expect(size).toBeGreaterThanOrEqual(22);
          const [l, t, r, b] = interExtent(decode(m[2]), size),
            x = Number(a.x),
            y = Number(a.y);
          const box = [x + l, y + t, x + r, y + b];
          expect(box[0], m[2]).toBeGreaterThanOrEqual(0);
          expect(box[1], m[2]).toBeGreaterThanOrEqual(0);
          expect(box[2], m[2]).toBeLessThanOrEqual(x >= 500 ? 940 : 478);
          expect(box[3], m[2]).toBeLessThanOrEqual(478);
          return box;
        });
        for (let a = 0; a < boxes.length; a++)
          for (let b = a + 1; b < boxes.length; b++) {
            const A = boxes[a],
              B = boxes[b];
            expect(A[2] <= B[0] || B[2] <= A[0] || A[3] <= B[1] || B[3] <= A[1]).toBe(true);
          }
        if (scene.storyId === '40')
          expect([...markup[0].matchAll(/data-edge-id=/g)]).toHaveLength(scene.edges.length);
      }
    }
  });
  it('authored topology slots and actual edge/marker geometry project clear of persistent text in all layout dimensions', () => {
    const scenes = setsTopologyCases().filter((s) => s.storyId === '40');
    for (const wide of [undefined, { width: 1920, height: 1080 }, { width: 1080, height: 960 }]) {
      const width = wide?.width ?? 1080,
        height = wide?.height ?? 960;
      const camera = new PerspectiveCamera(SETS_TOPOLOGY_CAMERA.fov, width / height, 0.1, 100);
      camera.position.set(...SETS_TOPOLOGY_CAMERA.position);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      const meet = wide ? Math.min(width / 952, height / 478) : 1;
      const originX = wide ? (width - 952 * meet) / 2 : 64,
        originY = wide ? (height - 478 * meet) / 2 : 262;
      const audit = (
        geometry: BufferGeometry,
        center: Vector3,
        rotation = new Quaternion(),
        scale = 1,
      ): void => {
        const positions = geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i++) {
          const point = new Vector3()
            .fromBufferAttribute(positions, i)
            .multiplyScalar(scale)
            .applyQuaternion(rotation)
            .add(center)
            .project(camera);
          const x = (((point.x + 1) * width) / 2 - originX) / meet;
          const y = (((1 - point.y) * height) / 2 - originY) / meet;
          expect(x).toBeGreaterThan(0);
          expect(x).toBeLessThan(478);
          expect(y).toBeGreaterThan(394);
          expect(y).toBeLessThan(428);
        }
        geometry.dispose();
      };
      for (const scene of scenes) {
        if (scene.storyId !== '40') throw new Error('Expected topology');
        for (const entity of scene.entities) {
          const p = topologyModelPlacement(scene, entity.id, wide),
            slot = topologySlot(scene, entity.id);
          const projected = new Vector3(...p.position).project(camera);
          expect((((projected.x + 1) * width) / 2 - originX) / meet).toBeCloseTo(slot[0]);
          expect((((1 - projected.y) * height) / 2 - originY) / meet).toBeCloseTo(
            410 + (slot[1] - 198) * 0.09,
          );
          audit(new BoxGeometry(1.2, 0.48, 0.19), new Vector3(...p.position), undefined, p.scale);
        }
        for (const edge of scene.edges) {
          const from = topologyModelPlacement(scene, edge.fromId, wide),
            to = topologyModelPlacement(scene, edge.toId, wide);
          const a = new Vector3(...from.position),
            b = new Vector3(...to.position),
            delta = b.clone().sub(a);
          const rotation = new Quaternion().setFromUnitVectors(
            new Vector3(0, 1, 0),
            delta.clone().normalize(),
          );
          const center = a.clone().add(b).multiplyScalar(0.5);
          audit(
            new CylinderGeometry(0.022, 0.022, delta.length(), 10),
            center.clone().add(new Vector3(0, 0, -0.04)),
            rotation,
          );
          const mark = from.scale * 0.5;
          if (edge.role === 'membership')
            audit(
              new ConeGeometry(mark * 0.5, mark * 1.5, 8),
              a
                .clone()
                .multiplyScalar(0.3)
                .add(b.clone().multiplyScalar(0.7))
                .add(new Vector3(0, 0, 0.03)),
              rotation,
            );
          else
            audit(
              new ConeGeometry(0.07, 0.14, 10),
              b.clone().add(new Vector3(0, 0, -0.04)),
              rotation,
            );
          center.z = 0.03;
          if (edge.status === 'failed')
            for (const angle of [Math.PI / 4, -Math.PI / 4])
              audit(
                new BoxGeometry(mark * 2, mark * 0.3, mark * 0.3),
                center,
                new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), angle),
              );
          if (edge.status === 'absent') audit(new TorusGeometry(mark, mark * 0.15, 6, 12), center);
          if (edge.status === undefined) audit(new OctahedronGeometry(mark, 0), center);
        }
      }
    }
  });
  it('full clay carrier boxes project into reserved footer, disjoint from glyphs and other carriers in every permitted layout', () => {
    for (const wide of [undefined, { width: 1920, height: 1080 }, { width: 1080, height: 960 }]) {
      const width = wide?.width ?? 1080,
        height = wide?.height ?? 960;
      const camera = new PerspectiveCamera(SETS_TOPOLOGY_CAMERA.fov, width / height, 0.1, 100);
      camera.position.set(...SETS_TOPOLOGY_CAMERA.position);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      const meet = wide ? Math.min(width / 952, height / 478) : 1;
      const originX = wide ? (width - 952 * meet) / 2 : 64,
        originY = wide ? (height - 478 * meet) / 2 : 262;
      for (const count of [4, 8]) {
        const boxes = Array.from({ length: count }, (_, i) => {
          const p = setsTopologyModelPlacement(i, count, wide);
          const points = [-0.95, 0.95].flatMap((x) =>
            [-0.3, 0.4].flatMap((y) =>
              [-0.65, 0.65].map((z) => {
                const v = new Vector3(
                  p.position[0] + x * p.scale,
                  p.position[1] + y * p.scale,
                  z * p.scale,
                ).project(camera);
                return [((v.x + 1) * width) / 2, ((1 - v.y) * height) / 2];
              }),
            ),
          );
          const box = [
            Math.min(...points.map((p) => p[0])),
            Math.min(...points.map((p) => p[1])),
            Math.max(...points.map((p) => p[0])),
            Math.max(...points.map((p) => p[1])),
          ];
          expect(box[0]).toBeGreaterThan(originX);
          expect(box[2]).toBeLessThan(originX + 478 * meet);
          expect(box[1]).toBeGreaterThan(originY + 394 * meet);
          expect(box[3]).toBeLessThan(originY + 425 * meet);
          return box;
        });
        for (let i = 1; i < boxes.length; i++) expect(boxes[i - 1][2]).toBeLessThan(boxes[i][0]);
      }
    }
  });
});
