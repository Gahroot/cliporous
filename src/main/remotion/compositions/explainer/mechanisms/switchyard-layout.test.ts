import { describe, expect, it } from 'vitest';
import { sampleRailHeading, sampleRailPoint, sampleRailStop } from '../hero-props/transport-poses';
import { MECHANISM_CAMERA, projectAnchor, transformAnchor } from './anchors';
import { RAIL_CARRIER_SIZE } from './rail-hardware';
import {
  SWITCHYARD_LABEL_SIZE,
  switchyardLabel,
  switchyardLabelFontSize,
  switchyardTransform,
} from './switchyard-layout';

for (const compact of [false, true]) {
  describe(`switchyard ${compact ? 'compact' : 'stacked'} label clearance`, () => {
    it('keeps both label boxes clear of the title, each other, full carts and receiving stops', () => {
      const boxes = (['left', 'right'] as const).map((branch) => {
        const label = switchyardLabel(MECHANISM_CAMERA, branch, compact);
        expect(label).not.toBeNull();
        if (!label) throw new Error('Expected visible label');
        expect(label.y).toBeGreaterThanOrEqual(150);
        expect(label.x).toBeGreaterThanOrEqual(72);
        expect(label.x + SWITCHYARD_LABEL_SIZE.width).toBeLessThanOrEqual(1008);
        const stop = sampleRailStop(branch);
        // Conservative upper bound includes the rotated crossbar and its mounting feet.
        for (const x of [-0.2, 0.2]) {
          for (const z of [-0.06, 0.06]) {
            const corner = transformAnchor([x, 0.07, z], {
              position: stop.position,
              rotation: [0, 0, stop.heading],
            });
            const top = projectAnchor(
              MECHANISM_CAMERA,
              transformAnchor(corner, switchyardTransform(compact)),
            );
            expect(top).not.toBeNull();
            expect(label.y + SWITCHYARD_LABEL_SIZE.height + 12).toBeLessThan(top?.y ?? 0);
          }
        }
        // The actual-JSX model tests enforce this envelope, including flanges and reel cargo.
        // Check the whole trip, not just the carrier center at arrival.
        const C = RAIL_CARRIER_SIZE;
        for (let step = 0; step <= 100; step++) {
          const progress = step / 100;
          for (const x of [-C.halfWidth, C.halfWidth]) {
            for (const y of [-C.halfLength, C.halfLength]) {
              for (const z of [C.wheelZ - C.flangeRadius, C.topZ]) {
                const corner = transformAnchor([x, y, z], {
                  position: sampleRailPoint(progress, branch),
                  rotation: [0, 0, sampleRailHeading(progress, branch)],
                });
                const projected = projectAnchor(
                  MECHANISM_CAMERA,
                  transformAnchor(corner, switchyardTransform(compact)),
                );
                expect(projected).not.toBeNull();
                expect(label.y + SWITCHYARD_LABEL_SIZE.height + 12).toBeLessThan(projected?.y ?? 0);
              }
            }
          }
        }
        return label;
      });
      expect(boxes[0].x + SWITCHYARD_LABEL_SIZE.width + 12).toBeLessThan(boxes[1].x);
    });

    it('fits the maximum-length wide-character labels within two readable lines', () => {
      for (const text of ['Review the draft', 'Publish the post', 'WWWWWWWWWWWWWWWW']) {
        const size = switchyardLabelFontSize(text, compact);
        expect(size).toBeGreaterThanOrEqual(37);
        expect(size * text.length).toBeLessThanOrEqual(2 * (SWITCHYARD_LABEL_SIZE.width - 24));
        expect(2 * size * 1.12 + 16).toBeLessThanOrEqual(SWITCHYARD_LABEL_SIZE.height);
      }
    });
  });
}
