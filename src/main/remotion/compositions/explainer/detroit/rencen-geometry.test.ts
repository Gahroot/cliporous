import { describe, expect, it } from 'vitest';
import {
  projectRencen,
  RENCEN_CORES,
  RENCEN_PARTS,
  RENCEN_TOWERS,
  rencenOutline,
  rencenVisibleFaces,
} from './rencen-geometry';

describe('RenCen architectural recognition, not seven interchangeable cylinders', () => {
  it('pairs one cylindrical hotel with four faceted offices and two rectangular eastern blocks', () => {
    const hotel = RENCEN_TOWERS.find((tower) => tower.role === 'hotel');
    const offices = RENCEN_TOWERS.filter((tower) => tower.role === 'office');
    const east = RENCEN_TOWERS.filter((tower) => tower.role === 'east');
    expect(hotel?.sides).toBe(48);
    expect(offices).toHaveLength(4);
    expect(east).toHaveLength(2);
    for (const tower of offices) {
      expect(rencenOutline(tower)).toHaveLength(8);
      expect((hotel?.height ?? 0) / tower.height).toBeGreaterThan(1.35);
      expect((hotel?.height ?? 0) / tower.height).toBeLessThan(1.45);
    }
    expect(
      new Set(offices.map((tower) => `${Math.sign(tower.x)}/${Math.sign(tower.z)}`)).size,
    ).toBe(4);
    for (const tower of east) {
      expect(rencenOutline(tower)).toHaveLength(4);
      expect(tower.x - tower.radius).toBeGreaterThan(1.65);
      expect(tower.height).toBeLessThan(1.8);
    }
  });

  it('keeps attached circulation cores slender and separate from the seven tower identities', () => {
    expect(RENCEN_CORES).toHaveLength(5);
    for (const core of RENCEN_CORES) {
      expect(core.radius).toBeLessThanOrEqual(0.13);
      expect(core.sides).toBe(16);
      expect(core.id).toMatch(/-circulation$/);
    }
  });

  it('keeps the offices faceted instead of smoothing them back into cylinders', () => {
    const faceted = RENCEN_PARTS.filter((part) => part.surface !== null);
    expect(faceted).toHaveLength(6);
    for (const { solid, surface } of faceted) {
      expect(surface?.positions.length).toBe(solid.sides * 36);
      const normals = surface?.normals ?? new Float32Array();
      for (let face = 0; face < solid.sides; face++) {
        const offset = face * 36;
        const expected = [...normals.slice(offset, offset + 3)];
        for (let vertex = 1; vertex < 6; vertex++) {
          expect([...normals.slice(offset + vertex * 3, offset + vertex * 3 + 3)]).toEqual(
            expected,
          );
        }
      }
    }
  });
  it('bounds batched facade geometry and projects every tower inside the authored vector region', () => {
    let vertices = 0;
    for (const { solid, facade } of RENCEN_PARTS) {
      expect(facade.positions.length).toBe(facade.normals.length);
      expect(facade.positions.length % 9).toBe(0);
      expect([...facade.positions, ...facade.normals].every(Number.isFinite)).toBe(true);
      vertices += facade.positions.length / 3;
      expect(rencenVisibleFaces(solid).length).toBeGreaterThan(0);
      for (const [x, z] of rencenOutline(solid)) {
        for (const y of [solid.bottom, solid.bottom + solid.height]) {
          const p = projectRencen(x + solid.x, y, z + solid.z);
          expect(p[0]).toBeGreaterThan(0);
          expect(p[0]).toBeLessThan(952);
          expect(p[1]).toBeGreaterThan(0);
          expect(p[1]).toBeLessThan(440);
        }
      }
    }
    expect(vertices).toBeLessThanOrEqual(24_000);
  });
});
