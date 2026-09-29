import { ExtrudeGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { HERO_CATALOG } from '../hero-catalog';
import { HERO_PROPS } from '../types';
import { createIconShapes, ICON_PROPS } from './icon-shapes';
import { ICON_PROP_DEFS } from './icons';

describe('curated extruded icons', () => {
  it.each(ICON_PROPS)('%s has a catalog entry, a renderer and finite bounded geometry', (icon) => {
    expect(HERO_PROPS).toContain(icon);
    expect(ICON_PROP_DEFS[icon].Model).toBeTypeOf('function');
    expect(HERO_CATALOG[icon].impactSec).toBeGreaterThan(0);
    const shapes = createIconShapes(icon);
    expect(shapes.body.length).toBeGreaterThan(0);
    for (const shape of [...shapes.body, ...shapes.detail]) {
      const geometry = new ExtrudeGeometry(shape, {
        depth: 0.24,
        bevelSegments: 3,
        bevelSize: 0.045,
        bevelThickness: 0.045,
        curveSegments: 16,
      });
      try {
        const coords = Array.from(geometry.getAttribute('position').array);
        expect(coords.length).toBeGreaterThan(0);
        expect(coords.every(Number.isFinite)).toBe(true);
        geometry.computeBoundingBox();
        const bounds = geometry.boundingBox;
        expect(bounds?.min.x).toBeGreaterThan(-1.5);
        expect(bounds?.max.x).toBeLessThan(1.5);
        expect(bounds?.min.y).toBeGreaterThan(-1.5);
        expect(bounds?.max.y).toBeLessThan(1.5);
        expect(geometry.getAttribute('position').count).toBeLessThan(15000);
      } finally {
        geometry.dispose();
      }
    }
  });
  it('creates fresh shapes rather than mutating shared geometry on a later render', () => {
    const a = createIconShapes('shield').body[0];
    const b = createIconShapes('shield').body[0];
    expect(a).not.toBe(b);
    expect(a?.getPoints()).toEqual(b?.getPoints());
  });
});
