import { diagramPose } from '../../diagrams/motion';
import { plottedValueText } from '../kits/plots';
import type { ExpansionKitPose } from '../scene-types';
import type { ExpansionBasis, ExpansionRational } from '../value-types';
import type { ExpansionRegionsDimensionsScene } from './regions-dimensions-types';

export const SOURCE_COLUMNS = 18;
export const SOURCE_LINES = 14;
export function wrapSource(value: string): string[] {
  const chars = Array.from(value);
  return Array.from({ length: Math.max(1, Math.ceil(chars.length / SOURCE_COLUMNS)) }, (_, i) =>
    chars.slice(i * SOURCE_COLUMNS, (i + 1) * SOURCE_COLUMNS).join(''),
  );
}
/** Condition uses the unchanged Chrome reservation but never its sub-22px wide fitter. */
export function regionsConditionFit(text: string, width: number, wide: boolean) {
  const fontSize = wide ? 22 : 24;
  const columns = wide ? Math.floor(width / fontSize) : 38;
  const chars = Array.from(text);
  return {
    fontSize,
    leading: wide ? 1.05 : 1.1,
    lines: Array.from({ length: Math.ceil(chars.length / columns) }, (_, i) =>
      chars.slice(i * columns, (i + 1) * columns).join(''),
    ),
  };
}
export function exactText(v: ExpansionRational): string {
  return v.denominator === 1 ? `${v.numerator}` : `${v.numerator}/${v.denominator}`;
}
function basisText(b: ExpansionBasis): string[] {
  return [
    `Unit: ${b.unit}`,
    `Population: ${b.population}`,
    `Period: ${b.period}`,
    ...(b.denominator ? [`Denominator: ${exactText(b.denominator)}`] : []),
  ];
}
function status(q: { state: string; condition?: string; qualifier?: string }): string {
  return `${q.state}${q.condition ? `: ${q.condition}` : q.qualifier ? `: ${q.qualifier}` : ''}`;
}
export interface RegionsDimensionsPage {
  id: string;
  lines: string[];
}
export interface RegionsDimensionsPose extends ExpansionKitPose {
  page: number;
  pages: RegionsDimensionsPage[];
  relation: 'overlap' | 'disjoint' | 'unresolved';
  member: 'inside' | 'outside' | 'unresolved';
  memberRegion: number;
  restrictionRegion: number;
  exponent: 1 | 2 | 3;
}
/** All distinct supplied facts survive. IDs/word indexes remain trace metadata, not prose. */
export function regionsDimensionsPages(
  scene: ExpansionRegionsDimensionsScene,
): RegionsDimensionsPage[] {
  const pages: RegionsDimensionsPage[] = [];
  const add = (id: string, fields: string[]) => {
    const lines = fields.flatMap(wrapSource);
    for (let i = 0; i < lines.length; i += SOURCE_LINES)
      pages.push({ id: `${id}:${i / SOURCE_LINES}`, lines: lines.slice(i, i + SOURCE_LINES) });
  };
  const label = (id: string) => scene.entities.find((e) => e.id === id)?.label ?? 'Not supplied';
  add('context', [
    scene.label,
    `Actor: ${label(scene.actorId)}`,
    `Scope: ${scene.scope}`,
    `Period: ${scene.period}`,
    scene.evidence,
    ...(scene.condition ? [scene.condition] : []),
  ]);
  if (scene.storyId === '63') {
    add(scene.membership.id, [
      `Member: ${label(scene.memberId)}`,
      `Region: ${label(scene.membership.regionId)}`,
      'Membership',
      status(scene.membership),
      ...('value' in scene.membership ? [scene.membership.value] : []),
    ]);
    add(scene.restriction.id, [
      `Region: ${label(scene.restriction.regionId)}`,
      'Restriction',
      status(scene.restriction),
      ...('value' in scene.restriction ? [scene.restriction.value] : []),
    ]);
    add(scene.overlap.id, [
      label(scene.regionIds[0]),
      label(scene.regionIds[1]),
      'Supplied relation',
      status(scene.overlap),
      ...('value' in scene.overlap ? [scene.overlap.value] : []),
    ]);
    add('summary', [scene.outcome, 'No inferred membership or rights']);
  } else {
    for (const item of [scene.scale, scene.original]) {
      const q = item.quantity;
      add(item.id, [q.actor, q.claim, status(q), plottedValueText(q), ...basisText(q.basis)]);
    }
    add('request', ['Explicit request', 'dimensional-scaling', scene.template]);
    const r = scene.result;
    add(
      'result',
      r.state === 'derived'
        ? [
            status(r),
            `Source: ${r.sourceState}`,
            ...(r.condition ? [r.condition] : []),
            ...(r.qualifier ? [r.qualifier] : []),
            `Scale: ${exactText(r.operands[0])}`,
            `Base: ${exactText(r.operands[1])}`,
            `Exponent: ${r.exponent}`,
            `Result: ${exactText(r.result)}`,
            ...basisText(r.basis),
          ]
        : [status(r), 'No numeric result'],
    );
  }
  return pages;
}
/** Fixed teaching dimensions, never a metric projection of supplied quantities. */
export function regionsDimensionsPose(
  scene: ExpansionRegionsDimensionsScene,
  time: number,
): RegionsDimensionsPose {
  const t = Number.isFinite(time) ? time : scene.setupAt;
  const p = diagramPose(t, scene);
  const pages = regionsDimensionsPages(scene);
  const progress = Math.max(
    0,
    Math.min(1, (t - scene.setupAt) / (scene.resolveAt - scene.setupAt)),
  );
  return {
    reveal: p.setup,
    action: p.action,
    response: p.response,
    check: p.check,
    resolve: p.resolve,
    pages,
    page: Math.min(pages.length - 1, Math.floor(progress * pages.length)),
    relation:
      scene.storyId === '63' && 'value' in scene.overlap ? scene.overlap.value : 'unresolved',
    member:
      scene.storyId === '63' && 'value' in scene.membership ? scene.membership.value : 'unresolved',
    memberRegion: scene.storyId === '63' ? scene.regionIds.indexOf(scene.membership.regionId) : 0,
    restrictionRegion:
      scene.storyId === '63' ? scene.regionIds.indexOf(scene.restriction.regionId) : 0,
    exponent:
      scene.storyId === '64'
        ? scene.template === 'line-length'
          ? 1
          : scene.template === 'square-area'
            ? 2
            : 3
        : 1,
  };
}
/** Only authored region boundaries have positions. Membership is a nonspatial source relation. */
export function regionPlacement(p: RegionsDimensionsPose) {
  const centers = p.relation === 'overlap' ? [160, 280] : [112, 340];
  return { centers, radius: 90, memberX: null };
}
