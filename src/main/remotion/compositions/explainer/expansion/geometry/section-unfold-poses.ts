import type { ExpansionKitPose } from '../scene-types';
import type { ExpansionAmount } from '../value-types';
import type {
  ExpansionGeometryFact,
  ExpansionSectionUnfoldScene,
  ExpansionUnfoldFace,
} from './section-unfold-types';

export const SECTION_SOURCE_COLUMNS = 18;
export const SECTION_SOURCE_LINES = 14;
export interface SectionSourcePage {
  id: string;
  lines: string[];
  rows: { id: string; text: string; baseline: number }[];
  sourceIds: string[];
}
export interface SectionUnfoldPose extends ExpansionKitPose {
  sweep: number;
  fold: number;
  page: number;
  pages: SectionSourcePage[];
  revealedIds: string[];
  visibleIds: string[];
  correspondenceIds: string[];
}
export function sectionWrap(text: string): string[] {
  const chars = Array.from(text);
  return Array.from(
    { length: Math.max(1, Math.ceil(chars.length / SECTION_SOURCE_COLUMNS)) },
    (_, i) => chars.slice(i * SECTION_SOURCE_COLUMNS, (i + 1) * SECTION_SOURCE_COLUMNS).join(''),
  );
}
function amountText(a: ExpansionAmount): string {
  if (a.notation) return a.notation;
  if (a.kind !== 'rational') throw new Error('Section measurements require rational lengths');
  return a.value.denominator === 1
    ? String(a.value.numerator)
    : `${a.value.numerator}/${a.value.denominator}`;
}
export function sectionFactText(f: ExpansionGeometryFact<string>): string[] {
  return [
    f.state,
    ...('value' in f ? [f.value] : 'alternatives' in f ? [...f.alternatives] : []),
    ...('condition' in f ? [f.condition] : 'qualifier' in f ? [f.qualifier] : []),
  ];
}
/** Every fact references the shared source dictionary, rather than repeating its internal IDs. */
export function sectionUnfoldPages(scene: ExpansionSectionUnfoldScene): SectionSourcePage[] {
  const pages: SectionSourcePage[] = [];
  const add = (id: string, fields: string[], sourceIds = [id]) => {
    const lines = fields.flatMap(sectionWrap);
    for (let i = 0; i < lines.length; i += SECTION_SOURCE_LINES)
      pages.push({
        id: `${id}:page:${i / SECTION_SOURCE_LINES}`,
        lines: lines.slice(i, i + SECTION_SOURCE_LINES),
        rows: lines.slice(i, i + SECTION_SOURCE_LINES).map((text, row) => ({
          id: `${id}:source-line:${i + row}`,
          text,
          baseline: 38 + row * 28,
        })),
        sourceIds,
      });
  };
  add('source', [
    scene.label,
    scene.subject,
    scene.outcome,
    scene.evidence,
    `Template: ${scene.template}`,
    ...(scene.storyId === '58' ? [`Net: ${scene.net}`] : []),
    ...(scene.condition ? [scene.condition] : []),
  ]);
  add('context', [
    `Identity: ${scene.identity}`,
    `Scope: ${scene.scope}`,
    `Period: ${scene.period}`,
  ]);
  const actor = new Map(scene.actors.map((a, i) => [a.id, `Actor ${i + 1}`]));
  add(
    'actors',
    scene.actors.map((a) => `${actor.get(a.id)}: ${a.label}`),
    scene.actors.map((a) => a.id),
  );
  const fact = (f: ExpansionGeometryFact<string>, role: string) =>
    add(f.id, [
      role,
      actor.get(f.actorId) ?? 'Actor not supplied',
      'Context: above',
      `Claim: ${f.claim}`,
      ...sectionFactText(f),
    ]);
  if (scene.storyId === '57') {
    for (const p of scene.parts) fact(p, p.part);
    const selected = scene.parts.find((p) => p.id === scene.section.partId);
    fact(scene.section, `Section: ${selected?.part ?? 'not supplied'}`);
    fact(
      scene.result,
      `Result: ${scene.parts.find((p) => p.id === scene.result.partId)?.part ?? 'not supplied'}`,
    );
  } else {
    add(
      'faces',
      scene.faces.map((f) => f.face),
      scene.faces.map((f) => f.id),
    );
    fact(scene.unfolding, 'Unfolding');
    fact(scene.correspondence, 'Correspondence');
    for (const l of scene.links)
      add(
        l.id,
        [
          `${scene.faces.find((f) => f.id === l.fromId)?.face} matches ${scene.faces.find((f) => f.id === l.toId)?.face}`,
          'Supplied correspondence',
        ],
        [l.id, l.fromId, l.toId],
      );
    fact(scene.result, 'Result');
  }
  const q = scene.measurement;
  add('measurement', [
    'Quoted measurement',
    q.actor,
    q.claim,
    q.state,
    ...('amount' in q
      ? [amountText(q.amount)]
      : 'alternatives' in q
        ? q.alternatives.map(amountText)
        : []),
    `Unit: ${q.basis.unit}`,
    `Period: ${q.basis.period}`,
    `Population: ${q.basis.population}`,
    ...(q.basis.denominator
      ? [`Denominator: ${q.basis.denominator.numerator}/${q.basis.denominator.denominator}`]
      : []),
    ...('condition' in q ? [q.condition] : 'qualifier' in q ? [q.qualifier] : []),
    'Not model dimensions',
  ]);
  return pages;
}
const clamp = (n: number): number => Math.max(0, Math.min(1, n));
function progress(t: number, at: number, end: number): number {
  const n = clamp((t - at) / Math.max(0.001, end - at));
  return n * n * (3 - 2 * n);
}
/** Page cycling starts at setup, so no source page is silently lost in a short hold. */
export function sectionUnfoldPose(
  scene: ExpansionSectionUnfoldScene,
  time: number,
  pages = sectionUnfoldPages(scene),
): SectionUnfoldPose {
  const t = Number.isFinite(time) ? time : scene.setupAt;
  const span = Math.max(1 / 30, scene.resolveAt - scene.setupAt);
  const action = progress(t, scene.actionAt, scene.responseAt);
  const response = progress(t, scene.responseAt, scene.checkAt);
  const check = progress(t, scene.checkAt, scene.resolveAt);
  const resolve = progress(t, scene.resolveAt, scene.resolveAt + 0.25);
  const page = Math.min(
    pages.length - 1,
    Math.floor(clamp((t - scene.setupAt) / span) * pages.length),
  );
  const visibleIds: string[] = [],
    revealedIds: string[] = [];
  if (scene.storyId === '57') {
    for (const p of scene.parts) {
      if (!('value' in p) || p.value === 'absent') continue;
      if (p.value === 'visible') visibleIds.push(p.id);
      if (
        p.id === scene.section.partId &&
        'value' in scene.section &&
        scene.section.value === 'intersects' &&
        'value' in scene.result &&
        scene.result.value === 'revealed' &&
        response > 0
      )
        revealedIds.push(p.id);
    }
  }
  return {
    reveal: progress(t, scene.setupAt, scene.actionAt),
    action,
    response,
    check,
    resolve,
    sweep: action,
    fold:
      scene.storyId === '58' && 'value' in scene.unfolding && scene.unfolding.value === 'cube-cross'
        ? action
        : 0,
    page,
    pages,
    visibleIds,
    revealedIds,
    correspondenceIds:
      scene.storyId === '58' &&
      'value' in scene.correspondence &&
      scene.correspondence.value === 'matched'
        ? scene.links.map((l) => l.id)
        : [],
  };
}
export function sectionTeachingLabel(scene: ExpansionSectionUnfoldScene): string {
  const facts =
    scene.storyId === '57'
      ? [...scene.parts, scene.section, scene.result]
      : [scene.unfolding, scene.correspondence, scene.result];
  const states = new Set(facts.map((f) => f.state));
  if (states.has('conditional')) return 'Conditional authored model';
  if (states.has('simulated') && states.has('illustrative')) return 'Qualified authored model';
  if (states.has('simulated')) return 'Simulated authored model';
  if (states.has('illustrative')) return 'Illustrative authored model';
  if (states.has('unknown') || states.has('missing') || states.has('disputed'))
    return 'Unresolved parts not inferred';
  return 'Authored model; not measured';
}
export const CUBE_FACE_PANELS: Record<ExpansionUnfoldFace, readonly [number, number]> = {
  front: [0, 0],
  right: [1, 0],
  left: [-1, 0],
  top: [0, -1],
  bottom: [0, 1],
  back: [0, -2],
};
type Point3 = readonly [number, number, number];
/** Identical hinge chain to the six mesh panels, with no source-derived dimensions. */
export function cubeFaceVertices(face: ExpansionUnfoldFace, fold: number): Point3[] {
  const angle = ((1 - clamp(Number.isFinite(fold) ? fold : 0)) * Math.PI) / 2;
  const rx = ([x, y, z]: Point3, a: number): Point3 => [
    x,
    y * Math.cos(a) - z * Math.sin(a),
    y * Math.sin(a) + z * Math.cos(a),
  ];
  const ry = ([x, y, z]: Point3, a: number): Point3 => [
    x * Math.cos(a) + z * Math.sin(a),
    y,
    -x * Math.sin(a) + z * Math.cos(a),
  ];
  const move = ([x, y, z]: Point3, dx: number, dy: number, dz = 0): Point3 => [
    x + dx,
    y + dy,
    z + dz,
  ];
  const corners: Point3[] = [
    [-0.5, -0.5, 0],
    [0.5, -0.5, 0],
    [0.5, 0.5, 0],
    [-0.5, 0.5, 0],
  ];
  return corners.map((p) => {
    let q = p;
    if (face === 'right') q = move(ry(move(q, 0.5, 0), angle), 0.5, 0);
    if (face === 'left') q = move(ry(move(q, -0.5, 0), -angle), -0.5, 0);
    if (face === 'bottom') q = move(rx(move(q, 0, -0.5), angle), 0, -0.5);
    if (face === 'top' || face === 'back') {
      q = move(q, 0, 0.5);
      if (face === 'back') q = move(rx(q, -angle), 0, 1);
      q = move(rx(q, -angle), 0, 0.5);
    }
    return move(q, 0, 0, 0.5);
  });
}
