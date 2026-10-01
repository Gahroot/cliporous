import { describe, expect, it } from 'vitest';
import { DIAGRAM_REGIONS } from '../diagrams/layout';
import { projectToStage } from '../three-helpers';
import { DETROIT_CATALOG, getDetroitLandmark, namedDetroitLandmarks } from './catalog';
import { detroitPlacement } from './DetroitPlaceScene';
import { RENCEN_TOWERS } from './RenaissanceCenter';
import { RENCEN_CAMERA, RENCEN_PARTS, rencenOutline } from './rencen-geometry';
import type { DetroitPlaceScene as Scene } from './types';

describe('Detroit identities and recognition', () => {
  it('does not enable the uncleared sculpture or ambiguous aliases', () => {
    expect(getDetroitLandmark('spirit-of-detroit')).toBeUndefined();
    expect(namedDetroitLandmarks('fox central renaissance the train station')).toEqual([]);
    expect(namedDetroitLandmarks('The RenCen in Detroit')).toContain('renaissance-center');
  });
  it('retains seven separated towers and the tallest centre', () => {
    expect(RENCEN_TOWERS).toHaveLength(7);
    const centre = RENCEN_TOWERS.find((tower) => tower.id === 'central');
    expect(centre?.height).toBeGreaterThan(
      Math.max(
        ...RENCEN_TOWERS.filter((tower) => tower.id !== 'central').map((tower) => tower.height),
      ),
    );
    expect(new Set(RENCEN_TOWERS.map((tower) => `${tower.x}/${tower.z}`)).size).toBe(7);
    expect(
      RENCEN_TOWERS.filter((tower) => tower.role === 'office' && tower.sides === 8),
    ).toHaveLength(4);
    expect(
      RENCEN_TOWERS.filter((tower) => tower.role === 'east' && tower.sides === 4),
    ).toHaveLength(2);
  });
  it('keeps the RenCen dominant in the city portrait instead of equal-sized landmark tiles', () => {
    const scene: Pick<Scene, 'landmarks' | 'preset'> = {
      preset: 'city-portrait',
      landmarks: ['michigan-central', 'renaissance-center', 'fox-theatre'],
    };
    const primary = detroitPlacement(scene, 1);
    expect(primary.model.x).toBe(0);
    expect(primary.vector.labelX).toBe(476);
    for (const index of [0, 2]) {
      const support = detroitPlacement(scene, index);
      expect(primary.model.scale).toBeGreaterThan(support.model.scale * 2);
      expect(primary.vector.scale).toBeGreaterThan(support.vector.scale * 2);
      expect(support.model.y).toBeLessThan(primary.model.y);
      expect(support.vector.labelY + support.vector.size * 1.2).toBeLessThan(478);
    }
  });
  it('keeps the hotel crown below the maximum condition rail in hybrid mode', () => {
    const { model } = detroitPlacement(
      {
        preset: 'landmark-focus',
        landmarks: ['renaissance-center'],
        condition: 'W'.repeat(96),
      },
      0,
    );
    for (const { solid } of RENCEN_PARTS) {
      for (const [px, pz] of rencenOutline(solid)) {
        const x = (solid.x + px - 0.8) * model.scale + model.x;
        const y = (solid.bottom + solid.height + 0.075 - 1.22) * model.scale + model.y;
        const z = (solid.z + pz) * model.scale;
        for (const yaw of [-0.09, 0, 0.09]) {
          const projected = projectToStage(RENCEN_CAMERA, [
            x * Math.cos(yaw) + z * Math.sin(yaw),
            y,
            z * Math.cos(yaw) - x * Math.sin(yaw),
          ]);
          expect(projected.y).toBeGreaterThan(DIAGRAM_REGIONS.body.y + 8);
        }
      }
    }
  });
  it('every available catalog entry carries recognition and a provenance decision', () => {
    for (const entry of DETROIT_CATALOG) {
      expect(entry.provenance).toBe('authored-architectural-massing');
      expect(entry.recognition.length).toBeGreaterThan(1);
      expect(entry.meshCeiling).toBeLessThanOrEqual(100);
      expect(getDetroitLandmark(entry.id)).toBe(entry);
    }
  });
});
