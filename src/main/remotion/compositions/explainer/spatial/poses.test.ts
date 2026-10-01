import { describe, expect, it } from 'vitest';
import { ACCESS_KEY_SOCKET, FURNITURE_RADIUS, spatialPose } from './poses';
import { SPATIAL_PRESETS, type SpatialScene } from './types';

const story = {
  label: 'The house',
  subject: 'House',
  outcome: 'The stated outcome',
  condition: 'If the source condition holds',
  setupAt: 0,
  actionAt: 0.8,
  responseAt: 2.2,
  checkAt: 3.8,
  resolveAt: 5.4,
};

const scenes: SpatialScene[] = [
  ...SPATIAL_PRESETS['house-cutaway'].map((preset) => ({
    ...story,
    kind: 'house-cutaway' as const,
    preset,
    parts: ['Kitchen', 'Bedroom', 'Living room'],
  })),
  ...SPATIAL_PRESETS['house-build'].map((preset) => ({
    ...story,
    kind: 'house-build' as const,
    preset,
    planLabel: 'The plan',
  })),
  ...SPATIAL_PRESETS['house-renovation'].map((preset) => ({
    ...story,
    kind: 'house-renovation' as const,
    preset,
    partLabel: 'The wall',
  })),
  ...SPATIAL_PRESETS['property-access'].map((preset) => ({
    ...story,
    kind: 'property-access' as const,
    preset,
    allowedLabel: 'Office',
    restrictedLabel: 'Bedroom',
  })),
  ...SPATIAL_PRESETS.neighborhood.map((preset) => ({
    ...story,
    kind: 'neighborhood' as const,
    preset,
    contextLabels: ['Park', 'Street'],
  })),
  ...SPATIAL_PRESETS['floorplan-fit'].map((preset) => ({
    ...story,
    kind: 'floorplan-fit' as const,
    preset,
    items: ['Sofa', 'Table', 'Chair'],
  })),
  ...SPATIAL_PRESETS['house-options'].map((preset) => ({
    ...story,
    kind: 'house-options' as const,
    preset,
    options: ['First option', 'Second option'],
  })),
  ...SPATIAL_PRESETS['property-lifecycle'].map((preset) => ({
    ...story,
    kind: 'property-lifecycle' as const,
    preset,
    stageLabels: ['Income', 'Expense'],
  })),
];
const samples = Array.from({ length: 181 }, (_, i) => i / 30);

function numbers(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(numbers);
  if (value && typeof value === 'object') return Object.values(value).flatMap(numbers);
  return [];
}

function sceneOf<K extends SpatialScene['kind']>(
  kind: K,
  preset: Extract<SpatialScene, { kind: K }>['preset'],
): Extract<SpatialScene, { kind: K }> {
  const scene = scenes.find((candidate) => candidate.kind === kind && candidate.preset === preset);
  if (!scene) throw new Error(`Missing fixture: ${kind}/${preset}`);
  return scene as Extract<SpatialScene, { kind: K }>;
}

it('covers every frozen spatial kind and all seventeen presets', () => {
  expect(scenes).toHaveLength(17);
  expect(new Set(scenes.map((scene) => `${scene.kind}/${scene.preset}`))).toEqual(
    new Set(
      Object.entries(SPATIAL_PRESETS).flatMap(([kind, presets]) =>
        presets.map((preset) => `${kind}/${preset}`),
      ),
    ),
  );
});

describe.each(scenes)('$kind / $preset', (scene) => {
  it('is finite and physically bounded at every sampled frame', () => {
    for (const t of [...samples, -Infinity, Infinity, NaN]) {
      const values = numbers(spatialPose(scene, t));
      expect(values.length).toBeGreaterThan(0);
      expect(values.every((value) => Number.isFinite(value) && Math.abs(value) <= 8)).toBe(true);
    }
  });

  it('has exact setup/final holds and meaningful motion', () => {
    const setup = spatialPose(scene, scene.setupAt);
    const final = spatialPose(scene, scene.resolveAt);
    expect(final).not.toEqual(setup);
    expect(spatialPose(scene, -100)).toEqual(setup);
    expect(spatialPose(scene, NaN)).toEqual(setup);
    for (const t of [scene.resolveAt + 1 / 30, scene.resolveAt + 2, 1000, Infinity]) {
      expect(spatialPose(scene, t)).toEqual(final);
    }
  });

  it('is seek-order independent and does not mutate the scene', () => {
    const before = structuredClone(scene);
    const times = [4.8, 0, 2.4, 5.4, 1.5, 3.8, 0.8, 2.2];
    const expected = times.map((t) => spatialPose(scene, t));
    for (const i of [7, 2, 5, 0, 4, 1, 6, 3, 0]) {
      expect(spatialPose(scene, times[i])).toEqual(expected[i]);
    }
    expect(scene).toEqual(before);
  });

  it('uses already-rebased beats without subtracting setup twice', () => {
    const offset = 18;
    const shifted = {
      ...scene,
      setupAt: scene.setupAt + offset,
      actionAt: scene.actionAt + offset,
      responseAt: scene.responseAt + offset,
      checkAt: scene.checkAt + offset,
      resolveAt: scene.resolveAt + offset,
    };
    const original = numbers(spatialPose(scene, 3.1));
    const rebased = numbers(spatialPose(shifted, 3.1 + offset));
    expect(rebased).toHaveLength(original.length);
    rebased.forEach((value, i) => {
      expect(value).toBeCloseTo(original[i], 10);
    });
  });
});

it('keeps every preset distinct from its siblings', () => {
  for (const kind of Object.keys(SPATIAL_PRESETS)) {
    const siblings = scenes.filter((scene) => scene.kind === kind);
    const signatures = siblings.map((scene) =>
      JSON.stringify([1.5, 2.8, 4.5, 5.4].map((t) => spatialPose(scene, t))),
    );
    expect(new Set(signatures).size).toBe(siblings.length);
  }
});

it('sequences foundation, walls and roof; mismatch remains exposed and offset', () => {
  const construct = sceneOf('house-build', 'construct');
  expect(spatialPose(construct, story.actionAt).build).toBeCloseTo(1 / 3);
  expect(spatialPose(construct, story.responseAt).build).toBeCloseTo(2 / 3);
  expect(spatialPose(construct, story.checkAt).build).toBe(1);
  const mismatch = spatialPose(sceneOf('house-build', 'plan-mismatch'), story.resolveAt);
  expect(mismatch.partitionOffset).toBe(0.62);
  expect(mismatch.frontOpen).toBe(1);
  expect(mismatch.roofLift).toBeGreaterThan(0);
  expect(spatialPose(construct, story.resolveAt).partitionOffset).toBe(0);
});

it('opens the shell before revealing utility routes', () => {
  const utilities = sceneOf('house-cutaway', 'utilities');
  const rooms = sceneOf('house-cutaway', 'rooms');
  expect(spatialPose(utilities, story.responseAt).roofLift).toBe(1);
  expect(spatialPose(utilities, story.responseAt).utilityReveal).toBe(0);
  expect(spatialPose(utilities, story.resolveAt).utilityReveal).toBe(1);
  expect(spatialPose(rooms, story.resolveAt).utilityReveal).toBe(0);
});

it('turns the scoped key only at contact, withdraws before opening, never opens restricted access', () => {
  const scoped = sceneOf('property-access', 'scoped-key');
  const contact = spatialPose(scoped, story.responseAt);
  expect(contact.key).toEqual(ACCESS_KEY_SOCKET);
  expect(contact.keyTurn).toBe(0);
  expect(contact.allowedOpen).toBe(0);
  const turnEnd = story.responseAt + (story.checkAt - story.responseAt) * 0.3;
  expect(spatialPose(scoped, turnEnd).key).toEqual(ACCESS_KEY_SOCKET);
  expect(spatialPose(scoped, turnEnd).keyTurn).toBe(Math.PI / 2);
  for (const t of samples) {
    const p = spatialPose(scoped, t);
    expect(p.restrictedOpen).toBe(0);
    if (p.allowedOpen > 0) expect(p.key[2]).toBeCloseTo(1.95);
  }
});

it('never grants or opens a revoked key and retains the revocation mark', () => {
  const scene = sceneOf('property-access', 'revoked-key');
  for (const t of samples) {
    const p = spatialPose(scene, t);
    expect(p.allowedOpen).toBe(0);
    expect(p.restrictedOpen).toBe(0);
    expect(p.keyTurn).toBe(0);
  }
  expect(spatialPose(scene, story.resolveAt).revoked).toBe(1);
});

it('clears the old beam before installing the new one; cosmetic work does not open the structure', () => {
  const structural = sceneOf('house-renovation', 'structural');
  for (const t of samples) {
    const p = spatialPose(structural, t);
    if (p.newBeam[0] < 3.45) expect(p.oldBeam[0]).toBe(-3.45);
    if (p.replacementVisible) expect(p.newBeam[0] - p.oldBeam[0]).toBeGreaterThan(2.85);
    expect(p.finish).toBe(0);
  }
  const cosmetic = spatialPose(sceneOf('house-renovation', 'cosmetic'), story.resolveAt);
  expect(cosmetic.finish).toBe(1);
  expect(cosmetic.frontOpen).toBe(0);
  expect(cosmetic.replacementVisible).toBe(false);
});

it('bounds replication and preserves house scale while only context changes', () => {
  const context = sceneOf('neighborhood', 'context');
  for (const t of samples) {
    const p = spatialPose(context, t);
    expect(p.houseScale).toBe(0.7);
    expect(p.copies).toEqual([0, 0]);
    expect(p.park + p.street).toBeCloseTo(1);
  }
  expect(spatialPose(sceneOf('neighborhood', 'replicate'), story.resolveAt).copies).toEqual([1, 1]);
});

it('keeps furniture inside the fixed walls and mutually separated throughout both paths', () => {
  for (const preset of SPATIAL_PRESETS['floorplan-fit']) {
    for (const count of [2, 3]) {
      const scene = {
        ...sceneOf('floorplan-fit', preset),
        items: ['Sofa', 'Table', 'Bed'].slice(0, count),
      };
      for (const t of samples) {
        const p = spatialPose(scene, t);
        expect(p.furniture).toHaveLength(count);
        p.furniture.forEach(({ position }, i) => {
          const [x, y, z] = position;
          expect(Math.hypot(x, z)).toBeCloseTo(FURNITURE_RADIUS);
          // Conservative furniture footprint radius is 0.74 after the authored 0.62 scale.
          expect(Math.abs(x) + 0.74).toBeLessThan(2.135);
          expect(Math.abs(z) + 0.74).toBeLessThan(2.135);
          expect(y).toBeGreaterThanOrEqual(-1.16);
          if (preset === 'rearrange') expect(y).toBe(-1.16);
          p.furniture.slice(i + 1).forEach(({ position: other }) => {
            expect(Math.hypot(x - other[0], z - other[2])).toBeGreaterThan(1.48);
          });
        });
      }
    }
  }
});

it('keeps alternatives equally presented without inventing structural changes or a winner', () => {
  const compare = spatialPose(sceneOf('house-options', 'compare'), story.resolveAt);
  const tradeoff = spatialPose(sceneOf('house-options', 'tradeoff'), story.resolveAt);
  expect(compare.separation).toBe(tradeoff.separation);
  expect(compare.leftOpen).toBe(0);
  expect(compare.rightOpen).toBe(0);
  expect(tradeoff.leftOpen).toBe(tradeoff.rightOpen);
  expect(tradeoff.leftRoof).toBe(tradeoff.rightRoof);
  expect(tradeoff).not.toHaveProperty('leftPartition');
  expect(tradeoff).not.toHaveProperty('rightPartition');
  expect(tradeoff).not.toHaveProperty('winner');
});

it('keeps turnover at an open doorway and closes only after arrival', () => {
  const occupancy = sceneOf('property-lifecycle', 'occupancy');
  for (const t of samples) {
    const p = spatialPose(occupancy, t);
    for (const person of [p.outgoing, p.incoming]) {
      if (person[2] > 0.9 && person[2] < 1.55) {
        expect(person[0]).toBe(0);
        expect(p.doorOpen).toBe(1);
      }
    }
  }
  const final = spatialPose(occupancy, story.resolveAt);
  expect(final.doorOpen).toBe(0);
  expect(final.incoming[2]).toBeLessThan(0.9);
});

it('finishes maintenance without perpetual tool motion and keeps income/expense separate', () => {
  const maintenance = spatialPose(sceneOf('property-lifecycle', 'maintenance'), story.resolveAt);
  expect(maintenance.serviceOpen).toBe(0);
  expect(maintenance.wrenchTurn).toBeCloseTo(0, 10);
  const cashFlow = sceneOf('property-lifecycle', 'cash-flow');
  for (const t of samples) {
    const p = spatialPose(cashFlow, t);
    expect(p.income[0]).toBeLessThan(0);
    expect(p.expense[0]).toBeGreaterThan(0);
    expect(p.doorOpen).toBe(0);
    expect(p.serviceOpen).toBe(0);
  }
});
