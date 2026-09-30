import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Texture,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { projectAnchor } from '../mechanisms/anchors';
import { getExplodedDetailAnchor, sampleExplodedViewPose } from '../mechanisms/exploded-view-poses';
import * as stage from '../stage';
import { type CameraSpec, cameraRig } from '../three-helpers';
import {
  EXPLAINER_GLASS_RADIUS,
  EXPLAINER_STAGE_HEIGHT,
  EXPLAINER_STAGE_WIDTH,
  stageSafeBox,
} from '../types';
import { DetailOverlay } from './DetailOverlay';
import {
  DETAIL_CLIP_SIDES,
  detailFocusOpacity,
  installDetailClipping,
  sampleDetailLayout,
} from './detail-logic';
import { TreatedLabel } from './LabelTreatments';
import { MechanicalNumber } from './MechanicalNumber';
import { STAMP_CONTACT_SECONDS, sampleLabel, sampleStamp, semanticLetterPose } from './motion';
import { digitTravel, sampleMechanicalNumber } from './number-logic';
import { SemanticText } from './SemanticText';
import { StampTreatment } from './StampTreatments';
import type { DetailTreatment, NumberPresentation } from './types';

const clock = vi.hoisted(() => ({ frame: 90 }));
vi.mock('remotion', async (original) => ({
  ...(await original<typeof import('remotion')>()),
  useCurrentFrame: () => clock.frame,
  useVideoConfig: () => ({ fps: 30, width: 1080, height: 960, durationInFrames: 240 }),
}));

it.each([
  'letterpress',
  'embossed',
] as const)('%s contacts before the crisp impression and has a finite settle', (finish) => {
  expect(sampleStamp(1, 2, finish).visible).toBe(false);
  expect(sampleStamp(2.1, 2, finish).impression).toBe(0);
  expect(sampleStamp(2 + STAMP_CONTACT_SECONDS + 0.1, 2, finish).impression).toBe(1);
  expect(sampleStamp(5, 2, finish)).toMatchObject({
    impression: 1,
    dieOpacity: 0,
    highlight: 0,
    depression: 0,
  });
  clock.frame = 150;
  const markup = renderToStaticMarkup(
    createElement(StampTreatment, { word: 'THE CATCH', at: 2, finish }),
  );
  expect(markup).toContain(`data-editorial="${finish}"`);
  expect(markup).toContain('THE CATCH');
  expect(markup).not.toContain('NaN');
});

it('peels a corner before reveal and retracts redaction bars leaving punctuation and exact source text', () => {
  const peel = { kind: 'peel-back' as const, revealAt: 2 };
  expect(sampleLabel(2.1, peel).lift).toBeGreaterThan(0);
  expect(sampleLabel(2.1, peel).reveal).toBe(0);
  expect(sampleLabel(3, peel).reveal).toBe(1);
  const redaction = { kind: 'redaction' as const, revealAt: 2 };
  expect(sampleLabel(2.15, redaction, 0).reveal).toBeGreaterThan(
    sampleLabel(2.15, redaction, 2).reveal,
  );
  clock.frame = 120;
  const text = 'Keep privacy — not secrets.';
  const markup = renderToStaticMarkup(createElement(TreatedLabel, { text, treatment: redaction }));
  expect(markup).toContain(`aria-label="${text}"`);
  expect(markup).not.toContain('scaleX(');
});

it.each([
  'compress',
  'separate',
  'align',
] as const)('%s is bounded, seekable and returns to typeset order', (kind) => {
  const treatment = { kind, at: 2, targetIndex: 0 };
  for (const t of [0, 2, 2.2, 2.5, 3.5, 12]) {
    const p = semanticLetterPose(t, treatment, 0, 12);
    expect(Math.abs(p.x)).toBeLessThan(0.6);
    expect(Math.abs(p.y)).toBeLessThan(0.11);
    expect(p).toEqual(semanticLetterPose(t, treatment, 0, 12));
  }
  expect(semanticLetterPose(5, treatment, 0, 12)).toEqual({ x: 0, y: 0, scaleX: 1 });
  clock.frame = 150;
  expect(renderToStaticMarkup(createElement(SemanticText, { text: kind, treatment }))).toContain(
    `aria-label="${kind}"`,
  );
});

describe('mechanical values and fixed slots', () => {
  it.each([
    { value: 123456789.25, decimals: 2, prefix: '$', suffix: 'k', expected: '$123,456,789.25k' },
    { value: -1234.5, decimals: 2, suffix: '%', expected: '−1,234.50%' },
    { value: 0.01, decimals: 2, prefix: '+', suffix: 'hrs', expected: '+0.01hrs' },
    { value: 999, decimals: 0, prefix: '-', suffix: '', expected: '-999' },
  ])('preserves $expected exactly and never reverses the count', ({ expected, ...input }) => {
    const scene = { ...input, countAt: 1, landAt: 3 };
    const samples = Array.from({ length: 151 }, (_, frame) =>
      sampleMechanicalNumber(scene, frame / 30),
    );
    const landed = samples.at(-1);
    if (!landed) throw new Error('Expected a final mechanical-number sample');
    expect(landed.text).toBe(expected);
    expect(new Set(samples.map((s) => s.chars.length)).size).toBe(1);
    samples.forEach((s, i) => {
      if (i === 0) return;
      const previous = samples[i - 1];
      if (!previous) throw new Error('Expected the preceding count sample');
      expect(s.current).toBeGreaterThanOrEqual(previous.current);
    });
    for (const cell of landed.chars)
      if (cell.place !== undefined)
        expect(digitTravel(landed.current, landed.target, cell.place, 1)).toBe(Number(cell.char));
    for (const presentation of ['odometer', 'split-flap'] as NumberPresentation[]) {
      clock.frame = 150;
      const props = { scene: { ...scene, label: 'Source quantity', presentation } };
      const markup = renderToStaticMarkup(createElement(MechanicalNumber, props));
      expect(markup).toContain(`aria-label="${expected}"`);
      expect(markup).toEqual(renderToStaticMarkup(createElement(MechanicalNumber, props)));
    }
  });
});

const base: CameraSpec = { position: [3, 2, 12], fov: 36 };
const anchor = {
  point: [0.7, 0.3, 0] as [number, number, number],
  endpoints: [
    [0.1, 0.3, 0],
    [1.3, 0.3, 0],
  ] as const,
  radius: 0.6,
};
it.each(['9:16', '16:9'] as const)('keeps the %s focus mask inside the floating card', (aspect) => {
  clock.frame = 150;
  const detail: DetailTreatment = {
    kind: 'focus-isolation',
    at: 2,
    target: 'gear',
    label: 'Gear teeth',
  };
  const content = createElement(DetailOverlay, { detail, camera: base, anchor });
  const safe = stageSafeBox('over', aspect);
  const scale = Math.min(safe.width / EXPLAINER_STAGE_WIDTH, safe.height / EXPLAINER_STAGE_HEIGHT);
  const layout = vi.spyOn(stage, 'useLayout').mockReturnValue({
    layout: 'over',
    aspect,
    width: aspect === '9:16' ? 1080 : 1920,
    height: aspect === '9:16' ? 1920 : 1080,
    safe,
    unit: 1,
    floating: true,
  });
  try {
    const markup = renderToStaticMarkup(content);
    expect(markup).toContain(`clip-path:inset(0 round ${EXPLAINER_GLASS_RADIUS / scale}px)`);
    expect(markup.match(/clip-path/g)).toHaveLength(1);
  } finally {
    layout.mockRestore();
  }
  expect(renderToStaticMarkup(content)).not.toContain('clip-path');
});

it('projects leaders, endpoints and inset with the shared moving camera, with safe compact labels', () => {
  for (const t of [0, 1.4, 5, 2.2, 1.4]) {
    const camera = cameraRig(base, t, { focusAt: 2 });
    const p = sampleDetailLayout(camera, anchor, true);
    expect(p).not.toBeNull();
    if (!p) throw new Error('Expected the authored target to project inside the stage');
    expect(p.source).toEqual(projectAnchor(camera, anchor.point));
    expect(p.endpoints?.[0]).toEqual(projectAnchor(camera, anchor.endpoints[0]));
    const projectedInset = projectAnchor(camera, p.insetWorld);
    expect(projectedInset).not.toBeNull();
    if (!projectedInset) throw new Error('Expected the inset world position to project');
    expect(projectedInset.x).toBeCloseTo(p.inset.x, 5);
    expect(projectedInset.y).toBeCloseTo(p.inset.y, 5);
    expect(p.label.x).toBeGreaterThanOrEqual(72);
    expect(p.label.x + 350).toBeLessThanOrEqual(1008);
    expect(p.label.y + 116).toBeLessThanOrEqual(836);
    expect(p).toEqual(sampleDetailLayout(camera, anchor, true));
  }
});

it('magnifies the authored surface detail 2x, centres that point rather than the part, and seeks identically', () => {
  const camera: CameraSpec = { position: [3.1, 5.2, 10.8], fov: 32 };
  const scene = {
    kind: 'exploded-view' as const,
    template: 'mechanism' as const,
    target: 'gear' as const,
    label: 'Gear assembly',
    detailLabel: 'Gear teeth',
    assembleAt: 0.3,
    separateAt: 1.2,
    explainAt: 2.3,
    returnAt: 4.8,
  };
  const right = new Vector3(camera.position[2], 0, -camera.position[0]).normalize();
  const up = new Vector3().crossVectors(new Vector3(...camera.position).normalize(), right);
  const sample = (time: number) => {
    const pose = sampleExplodedViewPose(scene, time);
    const target = getExplodedDetailAnchor(pose, 'gear');
    if (!target) throw new Error('Expected authored gear anchor');
    expect(target.partOrigin).toEqual(pose.parts.find((part) => part.id === 'gear')?.position);
    const layout = sampleDetailLayout(camera, target);
    if (!layout) throw new Error('Expected gear detail layout');
    const toClone = (world: Vector3) =>
      world
        .clone()
        .sub(new Vector3(...target.partOrigin))
        .add(new Vector3(...layout.cloneOffset))
        .multiplyScalar(layout.cloneScale)
        .add(new Vector3(...layout.insetWorld));
    const point = new Vector3(...target.point);
    const centre = toClone(point);
    expect(centre.distanceTo(new Vector3(...layout.insetWorld))).toBeLessThan(1e-10);
    const cloneCentre = projectAnchor(camera, centre.toArray());
    if (!cloneCentre) throw new Error('Expected inset projection');
    expect(cloneCentre.x).toBeCloseTo(layout.inset.x, 8);
    expect(cloneCentre.y).toBeCloseTo(layout.inset.y, 8);
    for (const axis of [right, up]) {
      const neighbour = point.clone().addScaledVector(axis, 0.05);
      const source = projectAnchor(camera, neighbour.toArray());
      const clone = projectAnchor(camera, toClone(neighbour).toArray());
      if (!source || !clone) throw new Error('Expected neighbour projections');
      const originalDistance = Math.hypot(source.x - layout.source.x, source.y - layout.source.y);
      const insetDistance = Math.hypot(clone.x - cloneCentre.x, clone.y - cloneCentre.y);
      expect(insetDistance / originalDistance).toBeCloseTo(2, 7);
    }
    const backingCentre = projectAnchor(camera, layout.backingWorld);
    expect(backingCentre?.x).toBeCloseTo(layout.inset.x, 7);
    expect(backingCentre?.y).toBeCloseTo(layout.inset.y, 7);
    return layout;
  };
  const first = sample(100 / 30);
  sample(5.5);
  sample(2.5);
  expect(sample(100 / 30)).toEqual(first);
});

it('clips to a 24-sided inscribed screen circle at both nearer and farther depths', () => {
  const camera: CameraSpec = { position: [3.1, 5.2, 10.8], fov: 32 };
  const layout = sampleDetailLayout(camera, { ...anchor, partOrigin: [0, 0, 0] });
  if (!layout) throw new Error('Expected detail aperture');
  const threeCamera = new PerspectiveCamera(camera.fov, 1080 / 960, 0.01, 100);
  threeCamera.position.set(...camera.position);
  threeCamera.lookAt(0, 0, 0);
  threeCamera.updateMatrixWorld();
  const eye = new Vector3(...camera.position);
  const retained = (x: number, y: number, depth: number) => {
    const ray = new Vector3(x / 540 - 1, 1 - y / 480, 0.5)
      .unproject(threeCamera)
      .sub(eye)
      .normalize();
    const point = eye.clone().addScaledVector(ray, depth);
    return layout.clippingPlanes.every((plane) => plane.distanceToPoint(point) >= -1e-9);
  };
  expect(layout.clippingPlanes).toHaveLength(DETAIL_CLIP_SIDES);
  for (const plane of layout.clippingPlanes) {
    expect(plane.distanceToPoint(new Vector3(...layout.insetWorld))).toBeGreaterThan(0);
    expect(plane.distanceToPoint(eye)).toBeCloseTo(0, 8);
  }
  for (const depth of [2, 6, 12])
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 48) {
      for (const ratio of [0, 0.9, 1.01, 1.4]) {
        const x = layout.inset.x + Math.cos(angle) * layout.inset.radius * ratio;
        const y = layout.inset.y + Math.sin(angle) * layout.inset.radius * ratio;
        expect(retained(x, y, depth)).toBe(ratio < 1);
      }
    }
});

it('owns only inset material clones, updates planes without reallocating, and restores/disposes on cleanup', () => {
  const geometry = new BoxGeometry();
  const texture = new Texture();
  const source = new MeshStandardMaterial({ map: texture });
  const second = new MeshStandardMaterial();
  const assembly = new Mesh(geometry, source);
  const inset = new Mesh(geometry, [source, second]);
  const originalArray = inset.material;
  const root = new Group();
  root.add(inset);
  const layout = sampleDetailLayout(base, anchor);
  if (!layout) throw new Error('Expected clipping planes');
  const renderer = { localClippingEnabled: false };
  const sourceDispose = vi.spyOn(source, 'dispose');
  const geometryDispose = vi.spyOn(geometry, 'dispose');
  const textureDispose = vi.spyOn(texture, 'dispose');
  const release = installDetailClipping(root, renderer, layout.clippingPlanes);
  expect(renderer.localClippingEnabled).toBe(true);
  expect(assembly.material).toBe(source);
  expect(source.clippingPlanes).toBeNull();
  expect(source.version).toBe(0);
  expect(inset.material).not.toBe(originalArray);
  const cloned = inset.material;
  const disposals = cloned.map((material) => vi.spyOn(material, 'dispose'));
  const clone = cloned[0];
  const plane = layout.clippingPlanes[0];
  if (!clone || !plane) throw new Error('Expected owned material and plane');
  expect(clone).not.toBe(source);
  expect(clone.map).toBe(texture);
  expect(clone.clippingPlanes).toBe(layout.clippingPlanes);
  expect(clone.clipIntersection).toBe(false);
  plane.constant += 0.25;
  expect(clone.clippingPlanes?.[0]?.constant).toBe(plane.constant);
  expect(inset.material).toBe(cloned);
  release();
  release();
  expect(renderer.localClippingEnabled).toBe(false);
  expect(inset.material).toBe(originalArray);
  for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
  expect(sourceDispose).not.toHaveBeenCalled();
  expect(geometryDispose).not.toHaveBeenCalled();
  expect(textureDispose).not.toHaveBeenCalled();
  source.dispose();
  second.dispose();
  geometry.dispose();
  texture.dispose();
});

it('shares the renderer clipping lease and preserves pre-existing enabled state', () => {
  const renderer = { localClippingEnabled: false };
  const a = installDetailClipping(new Group(), renderer, []);
  const b = installDetailClipping(new Group(), renderer, []);
  a();
  expect(renderer.localClippingEnabled).toBe(true);
  b();
  expect(renderer.localClippingEnabled).toBe(false);
  renderer.localClippingEnabled = true;
  const release = installDetailClipping(new Group(), renderer, []);
  release();
  expect(renderer.localClippingEnabled).toBe(true);
});

it.each([
  'magnified-inset',
  'tracked-callout',
  'measurement',
  'focus-isolation',
] as const)('renders content-bearing %s without another canvas', (kind) => {
  clock.frame = 120;
  const detail: DetailTreatment = {
    kind,
    target: 'gear',
    label: kind === 'measurement' ? '12 mm' : 'gear',
    at: 2,
  };
  const markup = renderToStaticMarkup(
    createElement(DetailOverlay, { detail, camera: base, anchor, compact: true }),
  );
  expect(markup).toContain(`data-editorial="${kind}"`);
  expect(markup).toContain(detail.label);
  expect(markup).not.toMatch(/<canvas|NaN|Infinity/);
  expect(detailFocusOpacity(detail, 'gear', 5)).toBe(1);
  expect(detailFocusOpacity(detail, 'shaft', 1)).toBe(1);
  expect(detailFocusOpacity(detail, 'shaft', 5)).toBeCloseTo(kind === 'focus-isolation' ? 0.26 : 1);
});

it('authored fixture metadata covers exactly ten treatment IDs, including signed numbers and source-referenced measurements', () => {
  const fixtures = JSON.parse(
    readFileSync('scripts/explainer-stills/fixtures/editorial.json', 'utf8'),
  );
  const ids = new Set(
    fixtures.flatMap((f: { covers: { category: string; id: string }[] }) =>
      f.covers.filter((c) => c.category === 'treatment').map((c) => c.id),
    ),
  );
  expect([...ids].sort()).toEqual([
    'embossed',
    'focus-isolation',
    'letterpress',
    'magnified-inset',
    'measurement',
    'mechanical-number',
    'peel-back',
    'redaction',
    'semantic-text',
    'tracked-callout',
  ]);
  expect(
    fixtures.some(
      (f: { scene: { value?: number; prefix?: string } }) =>
        (f.scene.value ?? 0) < 0 || f.scene.prefix === '-',
    ),
  ).toBe(true);
  const measurement = fixtures.find(
    (f: { scene: { detail?: { kind: string } } }) => f.scene.detail?.kind === 'measurement',
  );
  expect(measurement.sourceRefs[0].quote).toContain(measurement.scene.detail.label);
  expect(measurement.sourceRefs[0].target).toBe(measurement.scene.detail.target);
});
