import { diagramPose } from '../../diagrams/motion';
import { EXPLANATION_CAMERA } from '../../explanation-layout';
import { cameraRig, projectToStage } from '../../three-helpers';
import { plottedValueText } from '../kits/plots';
import type { ExpansionKitPose } from '../scene-types';
import { compare } from '../value-logic';
import type { ExpansionQuantity, ExpansionRational } from '../value-types';
import type { ExpansionProbabilityVariationRangeScene } from './variation-range-types';

export interface VariationRangePose extends ExpansionKitPose {
  readonly time: number;
  readonly detailIndex: number;
  readonly records: readonly { readonly id: string; readonly reveal: number }[];
}
export function variationRangeRecords(scene: ExpansionProbabilityVariationRangeScene) {
  return scene.storyId === '13'
    ? scene.samples.map((sample) => ({
        id: sample.id,
        label: sample.quantity.actor,
        quantity: sample.quantity,
      }))
    : [
        { id: `${scene.actorId}-lower`, label: 'Lower endpoint', quantity: scene.lower },
        { id: `${scene.actorId}-upper`, label: 'Upper endpoint', quantity: scene.upper },
      ];
}
/** Absence is never converted to a number. Validated contracts currently reject absent operands. */
export function variationRangeMagnitude(
  quantity: ExpansionQuantity,
): ExpansionRational | undefined {
  if (!('amount' in quantity)) return undefined;
  return quantity.amount.kind === 'rational'
    ? quantity.amount.value
    : { numerator: quantity.amount.value.minorUnits, denominator: 100 };
}
/** Fixed complete source domain, plus the explicit zero axis reference; never resampled. */
export function variationRangeDomain(
  scene: ExpansionProbabilityVariationRangeScene,
): readonly [ExpansionRational, ExpansionRational] {
  let low = { numerator: 0, denominator: 1 },
    high = low;
  for (const record of variationRangeRecords(scene)) {
    const value = variationRangeMagnitude(record.quantity);
    if (!value) continue;
    const below = compare(value, low),
      above = compare(value, high);
    if (!below.ok || !above.ok) throw new RangeError('Invalid source domain');
    if (below.value < 0) low = value;
    if (above.value > 0) high = value;
  }
  // Explicit reference only for the degenerate all-zero case, never a supplied observation.
  return low.numerator === 0 && high.numerator === 0
    ? [
        { numerator: -1, denominator: 1 },
        { numerator: 1, denominator: 1 },
      ]
    : [low, high];
}
export function variationRangePose(
  scene: ExpansionProbabilityVariationRangeScene,
  t: number,
): VariationRangePose {
  const time = Math.max(0, Math.min(Number.isFinite(t) ? t : 0, scene.resolveAt + 0.2));
  const progress = (at: number) => Math.max(0, Math.min(1, (time - at) / 0.2));
  const pages = variationRangePages(scene);
  const detailIndex = Math.min(
    pages.length - 1,
    Math.floor(
      Math.max(0, Math.min(1, (time - scene.responseAt) / (scene.resolveAt - scene.responseAt))) *
        pages.length,
    ),
  );
  return {
    time,
    detailIndex,
    reveal: progress(scene.setupAt),
    action: progress(scene.actionAt),
    response: progress(scene.responseAt),
    check: progress(scene.checkAt),
    resolve: progress(scene.resolveAt),
    // Source facts are presented at authored phases, not invented sample/draw times.
    records: variationRangeRecords(scene).map((record, index) => ({
      id: record.id,
      reveal: progress(index === 0 ? scene.actionAt : scene.responseAt),
    })),
  };
}
export function variationRangeModelPosition(index: number): [number, number, number] {
  if (!Number.isInteger(index) || index < 0 || index > 7) throw new RangeError('Model station');
  return [((index % 4) - 1.5) * 1.65, 0.6 - Math.floor(index / 4) * 1.1, 0];
}
export function variationRangeModelProjection(
  scene: ExpansionProbabilityVariationRangeScene,
  t: number,
  index: number,
  width = 1080,
  height = 960,
  offset: readonly [number, number, number] = [0, 0, 0],
) {
  const time = variationRangePose(scene, t).time;
  const angle = diagramPose(time, scene, 'response').modelTurn;
  const station = variationRangeModelPosition(index);
  const [x, y, z] = station.map((value, axis) => value + offset[axis]);
  return projectToStage(
    cameraRig(EXPLANATION_CAMERA, time, {
      focusAt: scene.responseAt,
      driftDeg: 0,
      pushAmount: 0,
      bobAmount: 0,
    }),
    [x * Math.cos(angle) + z * Math.sin(angle), y, z * Math.cos(angle) - x * Math.sin(angle)],
    width,
    height,
  );
}
/** Essential text stays at a fixed stage font; pagination never drops a source character. */
export const VARIATION_RANGE_FONT = 22;
export function variationRangePages(scene: ExpansionProbabilityVariationRangeScene) {
  return variationRangeRecords(scene).flatMap((record, recordIndex) => {
    const q = record.quantity;
    const qualifier = 'qualifier' in q ? q.qualifier : 'condition' in q ? q.condition : '';
    const meaning =
      scene.storyId === '14'
        ? `${scene.meaning.kind}: ${scene.meaning.qualification}`
        : scene.meaning.qualification;
    const text = [q.claim, qualifier, meaning].filter(Boolean).join('; ');
    const lines = variationRangeLines(text, 920, VARIATION_RANGE_FONT);
    return Array.from({ length: Math.ceil(lines.length / 4) }, (_, part) => ({
      recordIndex,
      part,
      text: lines.slice(part * 4, part * 4 + 4).join(''),
      summary: `${scene.storyId === '13' ? q.actor : `${q.actor}; ${record.label}`}: ${plottedValueText(q)} ${q.basis.unit}`,
    }));
  });
}
export function variationRangePageTimes(scene: ExpansionProbabilityVariationRangeScene) {
  return variationRangePages(scene).map(
    (_, i, pages) =>
      scene.responseAt + ((i + 0.5) / pages.length) * (scene.resolveAt - scene.responseAt),
  );
}
/** Conservative one-em source wrapping, including unbroken tokens. No truncation. */
export function variationRangeLines(text: string, width: number, size: number): string[] {
  const chars = Array.from(text),
    columns = Math.max(1, Math.floor(width / size));
  return Array.from({ length: Math.max(1, Math.ceil(chars.length / columns)) }, (_, i) =>
    chars.slice(i * columns, (i + 1) * columns).join(''),
  );
}
export function variationRangeMeet(width: number, height: number) {
  const scale = Math.min(width / 952, height / 478);
  return { scale, x: (width - 952 * scale) / 2, y: (height - 478 * scale) / 2 };
}
