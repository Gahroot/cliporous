import { diagramPose } from '../../diagrams/motion';
import { plottedValueText } from '../kits/plots';
import type { ExpansionKitPose } from '../scene-types';
import type {
  ExpansionTaxonomyRightsScene,
  RightsRelation,
  TaxonomyRelation,
} from './taxonomy-rights-types';

export interface TaxonomyRightsPage {
  readonly id: string;
  readonly lines: readonly string[];
}
export interface TaxonomyRightsPose extends ExpansionKitPose {
  readonly modelTurn: number;
  readonly page: number;
  readonly pages: readonly TaxonomyRightsPage[];
}
export function relationshipJudgment(r: TaxonomyRelation | RightsRelation): string {
  if (r.state === 'disputed') return `disputed: ${r.alternatives.join(' / ')}`;
  return `${r.state}${'status' in r ? `: ${r.status}` : ''}${'condition' in r ? `; ${r.condition}` : 'qualifier' in r ? `; ${r.qualifier}` : ''}`;
}
/** Fixed character lenses preserve whitespace and unbroken source lexemes without ellipsis. */
export function taxonomyRightsPages(scene: ExpansionTaxonomyRightsScene): TaxonomyRightsPage[] {
  const pages: TaxonomyRightsPage[] = [];
  const add = (id: string, fields: readonly string[]): void => {
    const lines = fields.flatMap((field) => {
      const chars = Array.from(field);
      return Array.from({ length: Math.ceil(chars.length / 20) }, (_, i) =>
        chars.slice(i * 20, (i + 1) * 20).join(''),
      );
    });
    for (let i = 0; i < lines.length; i += 13) pages.push({ id, lines: lines.slice(i, i + 13) });
  };
  add('source', [
    scene.label,
    scene.subject,
    scene.scope,
    scene.period,
    scene.meaning,
    ...(scene.condition ? [scene.condition] : []),
  ]);
  scene.entities.forEach((e, i) => {
    add(e.id, [
      `E${i + 1}: ${e.label}`,
      `Type: ${e.type}`,
      `Record: ${scene.records.find((r) => r.entityId === e.id)?.id ?? ''}`,
    ]);
  });
  const entity = (id: string): string =>
    `${id}: ${scene.entities.find((e) => e.id === id)?.label ?? ''}`;
  scene.relations.forEach((r, i) => {
    const fields = [`R${i + 1}: ${r.id}`];
    if ('fromId' in r)
      fields.push(`Child: ${entity(r.fromId)}`, `Parent: ${entity(r.toId)}`, `Type: ${r.role}`);
    else
      fields.push(
        `Actor: ${entity(r.actorId)}`,
        `Resource: ${entity(r.resourceId)}`,
        `Right: ${r.right}`,
      );
    fields.push(
      relationshipJudgment(r),
      `Scope: ${r.scope}`,
      `Period: ${r.period}`,
      `Evidence: ${r.evidence.fromWord}–${r.evidence.toWord}`,
    );
    add(r.id, fields);
    if ('share' in r && r.share) {
      const q = r.share.quantity;
      add(r.id, [
        `Share: ${plottedValueText(q)}`,
        `State: ${q.state}`,
        `Actor: ${q.actor}`,
        `Claim: ${q.claim}`,
        `Unit: ${q.basis.unit}`,
        `Period: ${q.basis.period}`,
        `Basis: ${q.basis.population}`,
        `Denominator: ${q.basis.denominator?.numerator}/${q.basis.denominator?.denominator}`,
        `Denominator unit: ${r.share.denominatorUnit}`,
        ...('condition' in q ? [q.condition] : 'qualifier' in q ? [q.qualifier] : []),
      ]);
    }
  });
  add('resolve', [scene.outcome, scene.meaning]);
  return pages;
}
/** Pure source-coordinate seconds; nonfinite seeks reset, and resolve holds the final page. */
export function taxonomyRightsPose(
  scene: ExpansionTaxonomyRightsScene,
  t: number,
): TaxonomyRightsPose {
  const time = Number.isFinite(t) ? t : scene.setupAt;
  const ramp = (at: number): number => Math.max(0, Math.min(1, (time - at) / 0.2));
  const pages = taxonomyRightsPages(scene);
  const progress = Math.max(
    0,
    Math.min(1, (time - scene.setupAt) / (scene.resolveAt - scene.setupAt)),
  );
  return {
    modelTurn: diagramPose(time, scene).modelTurn,
    reveal: ramp(scene.setupAt),
    action: ramp(scene.actionAt),
    response: ramp(scene.responseAt),
    check: ramp(scene.checkAt),
    resolve: ramp(scene.resolveAt),
    page: Math.min(pages.length - 1, Math.floor(progress * pages.length)),
    pages,
  };
}
