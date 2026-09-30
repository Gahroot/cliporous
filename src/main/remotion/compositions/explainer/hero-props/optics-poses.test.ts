import { describe, expect, it } from 'vitest';
import { HERO_CATALOG, OPTICS_TIMING } from '../hero-catalog';
import {
  APERTURE_GEOMETRY as IRIS,
  sampleAperture,
  sampleMagnifier,
  samplePrism,
  sampleTelescope,
} from './optics-poses';

const cases = [
  {
    id: 'prism',
    sample: samplePrism,
    final: { incident: 1, through: 1, split: 1 },
    boundaries: [0.3, 0.7, 0.82, 1.1],
  },
  { id: 'aperture', sample: sampleAperture, final: { closed: 1 }, boundaries: [0.3, 1.1] },
  {
    id: 'magnifying-glass',
    sample: sampleMagnifier,
    final: { x: 0, y: 0.22, magnification: 2.5 },
    boundaries: [0.25, 0.8, 1.15],
  },
  {
    id: 'telescope',
    sample: sampleTelescope,
    final: { extension: 1, aim: 0.26 },
    boundaries: [0.25, 0.85, 1.25],
  },
] as const;

describe.each(cases)('$id authored signature', ({ id, sample, final, boundaries }) => {
  it('settles exactly on the catalog signature beat and holds without idle motion', () => {
    expect(HERO_CATALOG[id].impactSec).toBe(OPTICS_TIMING[id]);
    expect(sample(OPTICS_TIMING[id])).toEqual(final);
    for (const time of [3, 20, 10000, Number.MAX_VALUE]) expect(sample(time)).toEqual(final);
    expect(HERO_CATALOG[id].downHint).toBeUndefined();
    expect(HERO_CATALOG[id].downImpactSec).toBeUndefined();
  });

  it('is finite for all frame samples and bounded on invalid or extreme input', () => {
    for (let frame = -30; frame <= 150; frame++) {
      const pose = sample(frame / 30);
      expect(Object.values(pose).every(Number.isFinite)).toBe(true);
      for (const value of Object.values(pose)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(2.5);
      }
    }
    for (const time of [-100, -Number.MAX_VALUE, Number.NaN, Infinity, -Infinity]) {
      expect(sample(time)).toEqual(sample(0));
    }
  });

  it('is continuous across every phase boundary', () => {
    for (const at of boundaries) {
      const before = Object.values(sample(at - 1e-7));
      const after = Object.values(sample(at + 1e-7));
      before.forEach((value, index) => {
        expect(after[index]).toBeCloseTo(value, 5);
      });
    }
  });

  it('is independent of shuffled and reverse frame requests', () => {
    const times = [1.6, 0, 0.5, 0.9, 0.3, 2.5, 1.2];
    const expected = times.map((time) => sample(time));
    for (const t of times.slice().reverse()) sample(t);
    expect(times.map((time) => sample(time))).toEqual(expected);
  });
});

type Point = readonly [number, number];

function irisLeaves(closed: number): Point[][] {
  const turn = closed * IRIS.swing;
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (index * Math.PI) / 3;
    return IRIS.points.map(([x, y]): Point => {
      const px = IRIS.pivot + Math.cos(turn) * x - Math.sin(turn) * y;
      const py = Math.sin(turn) * x + Math.cos(turn) * y;
      return [
        px * Math.cos(angle) - py * Math.sin(angle),
        px * Math.sin(angle) + py * Math.cos(angle),
      ];
    });
  });
}

function leafCovers([x, y]: Point, points: readonly Point[]): boolean {
  return points.every(([ax, ay], index) => {
    const [bx, by] = points[(index + 1) % points.length];
    return (bx - ax) * (y - ay) - (by - ay) * (x - ax) >= -1e-9;
  });
}

describe('physical iris coverage', () => {
  it('has only the center opening, not fan-like gaps between outer leaf edges', () => {
    const gaps: { closed: number; angle: number; r: number }[] = [];
    for (let frame = 0; frame <= 10; frame++) {
      const closed = frame / 10;
      const leaves = irisLeaves(closed);
      expect(leaves.some((leaf) => leafCovers([0, 0], leaf))).toBe(false);
      for (let degree = 0; degree < 360; degree += 5) {
        const angle = (degree * Math.PI) / 180;
        let hit = false;
        for (let step = 1; step <= 64; step++) {
          const r = (IRIS.innerRadius * step) / 64;
          const covered = leaves.some((leaf) =>
            leafCovers([Math.cos(angle) * r, Math.sin(angle) * r], leaf),
          );
          if (!covered && hit && gaps.length < 10) gaps.push({ closed, angle: degree, r });
          hit ||= covered;
        }
        expect(hit, `No leaf at ${closed}/${degree}`).toBe(true);
      }
    }
    expect(gaps).toEqual([]);
  });

  it('keeps all leaves inside the housing, with nonintersecting depth layers', () => {
    expect(IRIS.bladeDepth).toBeLessThan(IRIS.layerStep);
    expect(5 * IRIS.layerStep + IRIS.bladeDepth).toBeLessThan(0.17);
    for (let step = 0; step <= 100; step++) {
      for (const leaf of irisLeaves(step / 100)) {
        for (const [x, y] of leaf) expect(Math.hypot(x, y)).toBeLessThan(IRIS.outerRadius);
      }
    }
  });
});

describe('optical action ordering', () => {
  it('never emits separated rays before the incoming beam reaches the prism', () => {
    for (let frame = 0; frame <= 50; frame++) {
      const p = samplePrism(frame / 30);
      if (p.incident < 1) expect(p.through).toBe(0);
      if (p.through < 1) expect(p.split).toBe(0);
      if (p.split > 0) expect([p.incident, p.through]).toEqual([1, 1]);
    }
    expect(samplePrism(0.7)).toEqual({ incident: 1, through: 0, split: 0 });
    expect(samplePrism(0.82)).toEqual({ incident: 1, through: 1, split: 0 });
  });

  it('closes the iris monotonically, with no overshoot or reopening', () => {
    let previous = 0;
    for (let frame = 0; frame <= 120; frame++) {
      const p = sampleAperture(frame / 60);
      expect(p.closed).toBeGreaterThanOrEqual(previous);
      expect(p.closed).toBeLessThanOrEqual(1);
      previous = p.closed;
    }
  });

  it('enlarges the detail only after the lens is centered on its authored source', () => {
    for (let frame = 0; frame <= 120; frame++) {
      const p = sampleMagnifier(frame / 60);
      if (p.x > 0) expect(p.magnification).toBe(1);
      if (p.magnification > 1) expect({ x: p.x, y: p.y }).toEqual({ x: 0, y: 0.22 });
    }
    expect(sampleMagnifier(0.8)).toEqual({ x: 0, y: 0.22, magnification: 1 });
  });

  it('extends the telescope before pivoting it; both motions finish monotonically', () => {
    let extension = 0;
    let aim = 0;
    for (let frame = 0; frame <= 120; frame++) {
      const p = sampleTelescope(frame / 60);
      expect(p.extension).toBeGreaterThanOrEqual(extension);
      expect(p.aim).toBeGreaterThanOrEqual(aim);
      if (p.extension < 1) expect(p.aim).toBe(0);
      if (p.aim > 0) expect(p.extension).toBe(1);
      extension = p.extension;
      aim = p.aim;
    }
  });
});
