import { diagramPose } from '../../diagrams/motion';
import type { ExpansionKitPose } from '../scene-types';
import type { ExpansionAmount, ExpansionQuantity } from '../value-types';
import type {
  ExpansionInformationLossScene,
  InformationLossQualification,
} from './information-loss-types';

export const INFORMATION_LOSS_DETAIL = {
  x: 500,
  y: 66,
  columns: 18,
  lines: 12,
  leading: 28,
  font: 22,
} as const;
export function informationLossWrap(
  text: string,
  columns: number = INFORMATION_LOSS_DETAIL.columns,
): string[] {
  const chars = Array.from(text);
  return Array.from({ length: Math.max(1, Math.ceil(chars.length / columns)) }, (_, i) =>
    chars.slice(i * columns, (i + 1) * columns).join(''),
  );
}
/** Keys address immutable source character offsets, not mutable presentation array positions. */
export function informationLossRuns(
  text: string,
  sourceId: string,
  columns: number = INFORMATION_LOSS_DETAIL.columns,
): { id: string; text: string }[] {
  let offset = 0;
  return informationLossWrap(text, columns).map((line) => {
    const run = { id: `${sourceId}:character:${offset}`, text: line };
    offset += Array.from(line).length;
    return run;
  });
}
export function informationLossQualification(value: InformationLossQualification): string[] {
  return [
    value.state,
    ...('condition' in value ? [value.condition] : 'qualifier' in value ? [value.qualifier] : []),
  ];
}
export function informationLossAmount(amount: ExpansionAmount): string {
  return amount.kind === 'money'
    ? `${amount.value.minorUnits} minor units ${amount.value.currency}`
    : `${amount.value.numerator}/${amount.value.denominator}`;
}
export function informationLossQuantity(q: ExpansionQuantity): string[] {
  return [
    q.actor,
    q.claim,
    ...informationLossQualification(q),
    ...('amount' in q
      ? [informationLossAmount(q.amount)]
      : q.state === 'disputed'
        ? q.alternatives.map(informationLossAmount)
        : []),
    `Unit: ${q.basis.unit}`,
    `Period: ${q.basis.period}`,
    `Population: ${q.basis.population}`,
    ...(q.basis.denominator
      ? [`Denominator: ${q.basis.denominator.numerator}/${q.basis.denominator.denominator}`]
      : []),
  ];
}
export interface InformationLossLens {
  readonly id: string;
  readonly recordIds: readonly string[];
  readonly relationId?: string;
  readonly fields: readonly string[];
}
/** Enumerate supplied facts, never infer an omitted field or a reconstructed decoder. */
export function informationLossLenses(scene: ExpansionInformationLossScene): InformationLossLens[] {
  const context = [
    scene.label,
    scene.subject,
    scene.evidence,
    scene.scope,
    scene.period,
    ...(scene.condition ? [scene.condition] : []),
  ];
  const name = (id: string) => scene.records.find((r) => r.id === id)?.label ?? id;
  const actor = (id: string) => scene.entities.find((entity) => entity.id === id)?.label ?? id;
  return [
    { id: `${scene.storyId}:context`, recordIds: [], fields: context },
    ...scene.records.map((r) => ({
      id: r.id,
      recordIds: [r.id],
      fields: [
        actor(r.actorId),
        r.stage,
        r.label,
        ...informationLossQualification(r),
        r.scope,
        r.period,
        ...(r.details.length ? r.details : ['No supplied details']),
      ],
    })),
    ...scene.quantities.map((v) => ({
      id: v.id,
      recordIds: [v.recordId],
      fields: [name(v.recordId), v.detail, ...informationLossQuantity(v.quantity)],
    })),
    ...scene.relations.map((r) => ({
      id: r.id,
      recordIds: [r.fromId, r.toId],
      relationId: r.id,
      fields: [
        actor(r.actorId),
        name(r.fromId),
        r.type,
        name(r.toId),
        ...(r.detail ? [r.detail] : []),
        ...informationLossQualification(r),
        r.scope,
        r.period,
      ],
    })),
    {
      id: scene.result.id,
      recordIds: [scene.result.fromId, scene.result.toId],
      fields: [
        'Supplied result',
        actor(scene.result.actorId),
        name(scene.result.fromId),
        name(scene.result.toId),
        scene.result.behavior,
        ...informationLossQualification(scene.result),
        scene.result.scope,
        scene.result.period,
        scene.outcome,
      ],
    },
  ];
}
export interface InformationLossPage extends InformationLossLens {
  readonly lines: readonly string[];
  readonly lineIds: readonly string[];
}
export function informationLossPages(scene: ExpansionInformationLossScene): InformationLossPage[] {
  return informationLossLenses(scene).flatMap((lens) => {
    const lines = lens.fields.flatMap((field) => informationLossWrap(field));
    return Array.from(
      { length: Math.ceil(lines.length / INFORMATION_LOSS_DETAIL.lines) },
      (_, page) => {
        const start = page * INFORMATION_LOSS_DETAIL.lines;
        return {
          ...lens,
          lines: lines.slice(start, start + INFORMATION_LOSS_DETAIL.lines),
          lineIds: lines
            .slice(start, start + INFORMATION_LOSS_DETAIL.lines)
            .map((_, i) => `${lens.id}:line:${start + i}`),
        };
      },
    );
  });
}
export interface InformationLossPose extends ExpansionKitPose {
  readonly page: number;
  readonly pages: readonly InformationLossPage[];
}
export function informationLossPose(
  scene: ExpansionInformationLossScene,
  time: number,
): InformationLossPose {
  const t = Number.isFinite(time) ? time : scene.setupAt;
  const p = diagramPose(t, scene),
    pages = informationLossPages(scene);
  const progress = Math.max(
    0,
    Math.min(1, (t - scene.setupAt) / Math.max(0.001, scene.resolveAt - scene.setupAt)),
  );
  return {
    reveal: p.setup,
    action: p.action,
    response: p.response,
    check: p.check,
    resolve: p.resolve,
    pages,
    page: Math.min(pages.length - 1, Math.floor(progress * pages.length)),
  };
}
