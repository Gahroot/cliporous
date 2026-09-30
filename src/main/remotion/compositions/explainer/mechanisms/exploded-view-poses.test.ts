import {
  BoxGeometry,
  type BufferGeometry,
  ExtrudeGeometry,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
} from 'three';
import { describe, expect, it } from 'vitest';
import { detailFocusOpacity, sampleDetailLayout } from '../editorial/detail-logic';
import { DETAIL_KINDS } from '../editorial/types';
import { gearShape } from '../hero-props/mechanics';
import { MECHANISM_CAMERA } from './anchors';
import {
  EXPLODED_TARGETS,
  EXPLODED_TEMPLATES,
  type ExplodedTemplate,
  type ExplodedViewScene,
} from './composed-types';
import {
  EXPLODED_PARTS,
  getExplodedDetailAnchor,
  sampleExplodedViewPose,
} from './exploded-view-poses';

import type { Vec3 } from './paths';

function expectSurface(geometry: BufferGeometry, origin: Vec3, point: Vec3, normal: Vec3): void {
  const material = new MeshBasicMaterial();
  try {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(...origin);
    mesh.updateMatrixWorld(true);
    const contact = new Vector3(...point);
    const direction = new Vector3(...normal);
    const ray = new Raycaster(contact.clone().addScaledVector(direction, 0.4), direction.negate());
    const hit = ray.intersectObject(mesh, false)[0];
    expect(hit).toBeDefined();
    if (!hit) throw new Error('Anchor missed the authored geometry');
    expect(hit.point.distanceTo(contact)).toBeLessThan(1e-6);
  } finally {
    material.dispose();
  }
}

const scene = (template: ExplodedTemplate): ExplodedViewScene => ({
  kind: 'exploded-view',
  template,
  target: EXPLODED_TARGETS[template][0],
  label: 'Assembly',
  detailLabel: EXPLODED_TARGETS[template][0],
  assembleAt: 0.3,
  separateAt: 1,
  explainAt: 2,
  returnAt: 3.3,
});
describe('authored exploded assemblies and target grounding', () => {
  it.each(
    EXPLODED_TEMPLATES,
  )('%s keeps exactly three identified parts and returns exactly to assembly', (template) => {
    const s = scene(template);
    for (const t of [0, 1.5, 2.5, 3.5, 4.5]) {
      const p = sampleExplodedViewPose(s, t);
      expect(p.parts.map((part) => part.id)).toEqual(EXPLODED_TARGETS[template]);
      expect(p).toEqual(sampleExplodedViewPose(s, t));
      for (const part of p.parts)
        for (const n of [...part.position, ...part.size]) expect(Number.isFinite(n)).toBe(true);
    }
    expect(sampleExplodedViewPose(s, 100)).toEqual(sampleExplodedViewPose(s, 4.5));
    expect(sampleExplodedViewPose(s, 4.5).parts).toEqual(EXPLODED_PARTS[template]);
  });
  it('seats parcel papers on the tray floor and computing layers face-to-face', () => {
    const [base, contents, lid] = EXPLODED_PARTS.parcel;
    expect(contents.position[1] - contents.size[1] / 2).toBeCloseTo(
      base.position[1] - base.size[1] / 2 + 0.06,
      12,
    );
    expect(lid.position[1] - lid.size[1] / 2).toBeCloseTo(base.position[1] + base.size[1] / 2, 12);
    const [board, chip, heatsink] = EXPLODED_PARTS.computing;
    expect(board.position[1] + board.size[1] / 2).toBeCloseTo(
      chip.position[1] - chip.size[1] / 2,
      12,
    );
    expect(chip.position[1] + chip.size[1] / 2).toBeCloseTo(
      heatsink.position[1] - heatsink.size[1] / 2,
      12,
    );
  });
  it.each(
    EXPLODED_TEMPLATES,
  )('%s derives every target anchor and all four details from the exact sampled part', (template) => {
    for (const target of EXPLODED_TARGETS[template]) {
      const s = { ...scene(template), target };
      const p = sampleExplodedViewPose(s, 2.5);
      const anchor = getExplodedDetailAnchor(p, target);
      const part = p.parts.find((entry) => entry.id === target);
      expect(anchor).not.toBeNull();
      expect(part).toBeDefined();
      if (!anchor || !part) throw new Error('missing authored target');
      expect(anchor.radius).toBeCloseTo(Math.hypot(...part.size) / 2, 12);
      expect(anchor.point[1]).toBeGreaterThanOrEqual(part.position[1] - part.size[1] / 2);
      expect(anchor.point[1]).toBeLessThanOrEqual(part.position[1] + part.size[1] / 2);
      for (const compact of [false, true]) {
        const layout = sampleDetailLayout(MECHANISM_CAMERA, anchor, compact);
        expect(layout).not.toBeNull();
        expect(layout?.endpoints).toHaveLength(2);
        expect(layout?.cloneScale).toBeGreaterThan(0);
        for (const kind of DETAIL_KINDS) {
          const detail = { kind, target, at: 2, label: target };
          expect(detailFocusOpacity(detail, target, 2.5)).toBe(1);
          expect(detailFocusOpacity(detail, 'other', 2.5)).toBe(
            kind === 'focus-isolation' ? 0.26 : 1,
          );
        }
      }
      const before = getExplodedDetailAnchor(sampleExplodedViewPose(s, 0), target);
      expect(anchor.point[1] - (before?.point[1] ?? 0)).toBeCloseTo(
        part.position[1] -
          (EXPLODED_PARTS[template].find((entry) => entry.id === target)?.position[1] ?? 0),
        12,
      );
    }
  });
  it('grounds gear and chip labels AND measurement endpoints on actual solid geometry', () => {
    // Same authored gear shape/dimensions as AssemblyGear; actual mesh intersections, not box checks.
    const gear = new ExtrudeGeometry(gearShape(14, 0.13, 3), {
      depth: 0.18,
      bevelEnabled: false,
      curveSegments: 20,
    });
    gear.computeBoundingBox();
    const box = gear.boundingBox;
    if (!box) throw new Error('Missing gear bounds');
    gear.scale(1.3 / (box.max.x - box.min.x), 1.3 / (box.max.y - box.min.y), 1);
    gear.center();
    gear.rotateX(-Math.PI / 2);
    const body = new BoxGeometry(0.9 * 0.78, 0.24, 0.8 * 0.78);
    const pin = new BoxGeometry(0.9 * 0.11, 0.24 * 0.2, 0.06);
    try {
      for (const t of [0, 1.5, 2.5, 4.5]) {
        for (const [template, target] of [
          ['mechanism', 'gear'],
          ['computing', 'chip'],
        ] as const) {
          const pose = sampleExplodedViewPose(scene(template), t);
          const part = pose.parts.find((p) => p.id === target);
          const anchor = getExplodedDetailAnchor(pose, target);
          if (!part || !anchor) throw new Error('Missing target');
          const [x, y, z] = part.position;
          expectSurface(
            target === 'gear' ? gear : body,
            part.position,
            anchor.point,
            anchor.normal,
          );
          for (const [i, endpoint] of anchor.endpoints.entries()) {
            const side = i === 0 ? -1 : 1;
            const origin: Vec3 =
              target === 'gear' ? part.position : [x + side * 0.9 * 0.445, y - 0.24 * 0.3, z];
            expectSurface(target === 'gear' ? gear : pin, origin, endpoint, [side, 0, 0]);
          }
        }
      }
    } finally {
      gear.dispose();
      body.dispose();
      pin.dispose();
    }
  });
  it('refuses targets from another assembly', () => {
    expect(
      getExplodedDetailAnchor(sampleExplodedViewPose(scene('parcel'), 2.5), 'chip'),
    ).toBeNull();
  });
});
