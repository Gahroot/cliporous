import { diagramPose } from '../../diagrams/motion';
import { plottedValueText } from '../kits/plots';
import type { ExpansionKitPose } from '../scene-types';
import type { ExpansionReasoningScopeScene } from './scope-types';

export interface ScopeDetail {
  readonly id: string;
  readonly marker: string;
  readonly lines: readonly string[];
  readonly qualification: readonly string[];
}
export interface ScopePose extends ExpansionKitPose {
  readonly page: number;
  readonly pages: readonly ScopeDetail[];
  readonly frame: number;
  readonly modelTurn: number;
}
// Fixed-width lenses preserve even long unbroken source lexemes and whitespace.
const wrap = (fields: readonly string[]) =>
  fields.flatMap((field) => {
    const characters = Array.from(field);
    return Array.from({ length: Math.ceil(characters.length / 24) }, (_, i) =>
      characters.slice(i * 24, (i + 1) * 24).join(''),
    );
  });
/** Authored lenses, never edits to the source records or a derived quantity. */
export function scopeDetails(scene: ExpansionReasoningScopeScene): ScopeDetail[] {
  const actor = (id: string) => `${id}: ${scene.actors.find((a) => a.id === id)?.label ?? ''}`;
  const pages: ScopeDetail[] = [];
  const add = (id: string, marker: string, fields: string[], qualification = '') => {
    const lines = wrap(fields);
    for (let start = 0; start < lines.length; start += 10)
      pages.push({
        id,
        marker,
        lines: lines.slice(start, start + 10),
        qualification: wrap(qualification ? [qualification] : []),
      });
  };
  if (scene.storyId === '07') {
    scene.statements.forEach((s, i) => {
      add(
        s.id,
        `S${i + 1} · ${s.status}`,
        [
          s.label,
          `Actor ${actor(s.actorId)}`,
          `Source ${actor(s.sourceId)}`,
          `Version ${s.version}`,
          `Period ${s.period}`,
          `Scope ${s.scope}`,
          `Claim: ${s.claim}`,
          ...(s.condition ? [`Condition: ${s.condition}`] : []),
        ],
        s.condition ?? '',
      );
    });
    scene.relations.forEach((r, i) => {
      add(
        `relation-${i + 1}`,
        `R${i + 1} · ${r.status}`,
        [
          r.fromId,
          r.toId,
          r.role,
          ...(r.role === 'scope-distinction' ? [`Dimension: ${r.dimension}`] : []),
          ...(r.condition ? [`Condition: ${r.condition}`] : []),
        ],
        r.condition ?? '',
      );
    });
  } else {
    scene.facts.forEach((f, i) => {
      const q = f.quantity;
      add(
        f.id,
        `F${i + 1} · ${q.state}`,
        [
          f.label,
          `Actor ${actor(f.actorId)}`,
          `Claim: ${q.claim}`,
          `Amount: ${plottedValueText(q)}`,
          `Unit: ${q.basis.unit}`,
          `Period: ${q.basis.period}`,
          `Population: ${q.basis.population}`,
          ...(q.basis.denominator
            ? [`Denominator: ${q.basis.denominator.numerator}/${q.basis.denominator.denominator}`]
            : []),
          ...('condition' in q
            ? [`Condition: ${q.condition}`]
            : 'qualifier' in q
              ? [`Qualification: ${q.qualifier}`]
              : []),
        ],
        'condition' in q ? q.condition : 'qualifier' in q ? q.qualifier : '',
      );
    });
    scene.frames.forEach((f, i) => {
      add(f.id, `View ${i + 1}`, [f.label, `Reference: ${f.referenceFactId}`, ...f.factIds]);
    });
    scene.relations.forEach((r, i) => {
      add(
        `relation-${i + 1}`,
        `R${i + 1}`,
        [
          r.role,
          r.fromId,
          r.toId,
          `From reference: ${r.fromReferenceId}`,
          `To reference: ${r.toReferenceId}`,
          ...(r.condition ? [`Condition: ${r.condition}`] : []),
        ],
        r.condition ?? '',
      );
    });
  }
  add(
    'result',
    scene.result.status,
    [
      scene.outcome,
      `Evidence words ${scene.result.evidence.fromWord}–${scene.result.evidence.toWord}`,
    ],
    scene.result.condition ?? '',
  );
  return pages;
}
/** Seconds in the scene's existing absolute beat coordinate system. Final lens never cycles. */
export function scopePose(scene: ExpansionReasoningScopeScene, t: number): ScopePose {
  const time = Number.isFinite(t) ? t : scene.setupAt;
  const ramp = (at: number) => Math.max(0, Math.min(1, (time - at) / 0.2));
  const pages = scopeDetails(scene);
  const progress = Math.max(
    0,
    Math.min(1, (time - scene.actionAt) / Math.max(0.001, scene.resolveAt - scene.actionAt)),
  );
  return {
    reveal: ramp(scene.setupAt),
    action: ramp(scene.actionAt),
    response: ramp(scene.responseAt),
    check: ramp(scene.checkAt),
    resolve: ramp(scene.resolveAt),
    page: Math.min(pages.length - 1, Math.floor(progress * pages.length)),
    pages,
    frame: time < scene.responseAt ? 0 : 1,
    modelTurn: diagramPose(time, scene).modelTurn,
  };
}
