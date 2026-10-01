import { describe, expect, it, vi } from 'vitest';
import { informationProject, informationTransformPose } from './poses';
import { informationTransformLabels, informationTransformWire } from './Scene';
import { informationBody, informationFixtures } from './test-fixtures';
import { INFORMATION_LIMITS, type InformationTransformScene } from './types';

// The label seam is DOM-only; these tests must not initialize the studio/WebGL renderer.
vi.mock('../../explanation-kit', () => ({}));
vi.mock('./models', () => ({}));

type Box = { x: number; y: number; width: number; height: number; size: number };

/** Conservative one-em glyphs, including greedy word wrapping and unbroken cap-length words.
 * This is a space reservation bound, not a browser/font measurement.
 */
function reservedTextHeight(text: string, box: Box): number {
  const capacity = Math.floor(box.width / box.size);
  let lines = 1;
  let used = 0;
  for (const word of text.split(' ')) {
    if (used && used + 1 + word.length > capacity) {
      lines++;
      used = 0;
    }
    if (used) used++;
    for (const _character of word) {
      if (used === capacity) {
        lines++;
        used = 0;
      }
      used++;
    }
  }
  return lines * box.size * 1.16;
}

function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

const stressTexts = [
  // Pinned review fixture: synthetic endings are intentional, not cropped text.
  {
    labels: ['Transcript WIDE WORDSW', 'Photograph WIDE WORDSW', 'Recording WIDE WORDS W'],
    fields: ['Words WIDE WORDS WIDEW', 'Appearance WIDE WORDSW', 'Sound WIDE WORDS WIDEW'],
    details: [
      'spoken request WIDE WORDS WI',
      'red doorway WIDE WORDS WIDEW',
      'bell sound WIDE WORDS WIDE W',
    ],
  },
  {
    labels: Array(3).fill('W'.repeat(INFORMATION_LIMITS.actorLabel)),
    fields: Array(3).fill('W'.repeat(INFORMATION_LIMITS.actorLabel)),
    details: Array(3).fill('W'.repeat(INFORMATION_LIMITS.detail)),
  },
  {
    labels: Array(3).fill('WWWWW WWWWW WWWWW WWWW'),
    fields: Array(3).fill('WWWWWWW WWWWWWW WWWWWW'),
    details: Array(3).fill('WWWWWWWWW WWWWWWWWW WWWWWWWW'),
  },
  {
    labels: Array(3).fill('WWWWW WWWWW WWWWW WWWW'),
    fields: Array(3).fill('WWWWW WWWWW WWWWW WWWW'),
    details: Array(3).fill('WWWWW WWWWW WWWWW WWWWW WWWW'),
  },
];

describe('information-transform maximum-text reading rails', () => {
  it.each(
    informationFixtures.filter((fx) => fx.plannerInput.kind === 'information-transform'),
  )('$name separates every input name, field and detail through the final hold', (fx) => {
    const original = informationBody(fx);
    if (original.kind !== 'information-transform') throw new Error('Expected transform');
    const counts =
      original.preset === 'multimodal-fusion'
        ? [INFORMATION_LIMITS.inputs]
        : [2, INFORMATION_LIMITS.inputs];
    for (const count of counts) {
      for (const text of stressTexts) {
        const scene: InformationTransformScene = {
          ...original,
          resultLabel: 'W'.repeat(INFORMATION_LIMITS.actorLabel),
          inputs: Array.from({ length: count }, (_, index) => ({
            ...original.inputs[index % original.inputs.length],
            id: `input-${index}`,
            label: text.labels[index],
            field: text.fields[index],
            detail: text.details[index],
          })),
        };
        const labels = informationTransformLabels(scene);
        expect(labels.inputs).toHaveLength(count);
        const boxes = [
          labels.heading,
          ...labels.inputs.flatMap((row) => [row.source, row.field, row.detail]),
        ];
        for (const [index, box] of boxes.entries()) {
          expect(box.size).toBeGreaterThanOrEqual(22);
          expect(box.x).toBeGreaterThanOrEqual(64);
          expect(box.x + box.width).toBeLessThanOrEqual(1016);
          expect(box.y).toBeGreaterThanOrEqual(220);
          expect(box.y + box.height).toBeLessThanOrEqual(716); // 16px before provenance footer.
          for (const other of boxes.slice(index + 1)) expect(intersects(box, other)).toBe(false);
        }
        expect(reservedTextHeight(scene.resultLabel, labels.heading)).toBeLessThanOrEqual(
          labels.heading.height,
        );
        for (const [index, row] of labels.inputs.entries()) {
          const input = scene.inputs[index];
          expect(row.id).toBe(input.id);
          expect(input.label.length).toBeLessThanOrEqual(INFORMATION_LIMITS.actorLabel);
          expect(input.field.length).toBeLessThanOrEqual(INFORMATION_LIMITS.actorLabel);
          expect(input.detail.length).toBeLessThanOrEqual(INFORMATION_LIMITS.detail);
          expect(reservedTextHeight(input.label, row.source)).toBeLessThanOrEqual(
            row.source.height,
          );
          expect(reservedTextHeight(input.field, row.field)).toBeLessThanOrEqual(row.field.height);
          expect(reservedTextHeight(input.detail, row.detail)).toBeLessThanOrEqual(
            row.detail.height,
          );
          expect(row.detail.x - (row.field.x + row.field.width)).toBeGreaterThanOrEqual(28);
          if (index)
            expect(
              row.source.y - (labels.inputs[index - 1].source.y + row.source.height),
            ).toBeGreaterThanOrEqual(12);
        }
        for (let frame = 0; frame <= Math.floor(fx.durationSec * 30); frame++) {
          const pose = informationTransformPose(scene, frame / 30);
          expect(pose.inputs.map((input) => input.id)).toEqual(
            labels.inputs.map((input) => input.id),
          );
          expect(informationTransformLabels(scene)).toEqual(labels);
          for (const [index, input] of pose.inputs.entries()) {
            const wire = informationTransformWire(input.source);
            // Preserve the authored source and binder attachments, including at partial reveal.
            expect(wire.from).toEqual([-1.96, input.source[1] - 0.08, 0.1]);
            expect(wire.to).toEqual([0.62, input.source[1] - 0.08, 0.1]);
            const start = informationProject(wire.from);
            const end = informationProject(wire.to);
            const field = labels.inputs[index].field;
            expect(field.x - end.x).toBeGreaterThanOrEqual(16);
            expect(field.x - end.x).toBeLessThanOrEqual(24);
            // Full projected segment is a superset of every reveal. Eight pixels cover the
            // 0.022-world-unit tube radius plus visible air, not just its zero-width centerline.
            const clearance = 8;
            const segment = {
              x: Math.min(start.x, end.x) - clearance,
              y: Math.min(start.y, end.y) - clearance,
              width: Math.abs(end.x - start.x) + clearance * 2,
              height: Math.abs(end.y - start.y) + clearance * 2,
              size: 0,
            };
            for (const box of boxes) expect(intersects(segment, box)).toBe(false);
          }
        }
      }
    }
  });
});
