import { diagramPose } from '../../diagrams/motion';
import type { ExpansionKitPose } from '../scene-types';
import type { ExpansionAmount, ExpansionQuantity } from '../value-types';
import type { ExpansionRetryProductScene } from './retry-product-types';

export const RETRY_PRODUCT_DETAIL = {
  x: 500,
  y: 66,
  columns: 18,
  lines: 12,
  leading: 28,
  font: 22,
} as const;
/** Character runs preserve every source character, including whitespace. */
export function retryProductWrap(text: string, columns = 18): string[] {
  const chars = Array.from(text);
  return Array.from({ length: Math.max(1, Math.ceil(chars.length / columns)) }, (_, i) =>
    chars.slice(i * columns, (i + 1) * columns).join(''),
  );
}
export function retryProductAmount(a: ExpansionAmount): string {
  const exact =
    a.kind === 'money'
      ? `${a.value.minorUnits} minor units ${a.value.currency}`
      : `${a.value.numerator}/${a.value.denominator}`;
  return a.notation === undefined ? exact : `${a.notation} = ${exact}`;
}
export function retryProductQuantity(q: ExpansionQuantity): string[] {
  return [
    q.actor,
    q.claim,
    q.state,
    ...('condition' in q ? [q.condition] : []),
    ...('qualifier' in q ? [q.qualifier] : []),
    ...('amount' in q
      ? [retryProductAmount(q.amount)]
      : q.state === 'disputed'
        ? q.alternatives.map(retryProductAmount)
        : []),
    `Unit: ${q.basis.unit}`,
    `Period: ${q.basis.period}`,
    `Population: ${q.basis.population}`,
    ...(q.basis.denominator
      ? [`Denominator: ${q.basis.denominator.numerator}/${q.basis.denominator.denominator}`]
      : []),
  ];
}
export interface RetryProductPage {
  readonly id: string;
  readonly recordIds: readonly string[];
  readonly fields: readonly string[];
  readonly lines: readonly string[];
  readonly lineIds: readonly string[];
  readonly quantityState?: ExpansionQuantity['state'];
  readonly quantityIndex?: number;
}
export function retryProductPages(scene: ExpansionRetryProductScene): RetryProductPage[] {
  const name = (id: string) => scene.entities.find((e) => e.id === id)?.label ?? id;
  const lenses = [
    {
      id: `${scene.storyId}:context`,
      recordIds: [],
      fields: [
        scene.label,
        scene.subject,
        scene.evidence,
        scene.records[0].scope,
        scene.records[0].period,
        ...(scene.condition ? [scene.condition] : []),
      ],
    },
    ...scene.records.map((r) => ({
      id: r.id,
      recordIds: [r.id],
      fields: [
        name(r.actorId),
        name(r.identityId),
        r.role,
        r.claim,
        r.value,
        r.state,
        r.scope,
        r.period,
        ...(r.condition ? [r.condition] : []),
        ...(r.qualifier ? [r.qualifier] : []),
        ...(r.shape ? [r.shape] : []),
      ],
    })),
    ...scene.relations.map((r) => ({
      id: r.id,
      recordIds: [],
      fields: [name(r.fromId), r.role, name(r.toId)],
    })),
    ...scene.quantities.map((q, i) => ({
      id: `${scene.storyId}:quantity:${i}`,
      recordIds: [],
      quantityState: q.state,
      quantityIndex: i,
      fields: retryProductQuantity(q),
    })),
    { id: `${scene.storyId}:outcome`, recordIds: [scene.records[4].id], fields: [scene.outcome] },
  ];
  return lenses.flatMap((lens) => {
    const lines = lens.fields.flatMap((f) => retryProductWrap(f));
    return Array.from(
      { length: Math.ceil(lines.length / RETRY_PRODUCT_DETAIL.lines) },
      (_, page) => {
        const start = page * RETRY_PRODUCT_DETAIL.lines;
        return {
          ...lens,
          lines: lines.slice(start, start + RETRY_PRODUCT_DETAIL.lines),
          lineIds: lines
            .slice(start, start + RETRY_PRODUCT_DETAIL.lines)
            .map((_, i) => `${lens.id}:line:${start + i}`),
        };
      },
    );
  });
}
export interface RetryProductPose extends ExpansionKitPose {
  readonly page: number;
  readonly pages: readonly RetryProductPage[];
  readonly phase: number;
}
export function retryProductPose(
  scene: ExpansionRetryProductScene,
  time: number,
): RetryProductPose {
  const t = Number.isFinite(time) ? time : scene.setupAt;
  const p = diagramPose(t, scene),
    pages = retryProductPages(scene);
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
    phase: [scene.actionAt, scene.responseAt, scene.checkAt, scene.resolveAt].filter(
      (at) => t >= at,
    ).length,
  };
}
