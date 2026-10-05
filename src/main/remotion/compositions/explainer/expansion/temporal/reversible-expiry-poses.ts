import { plottedValueText } from '../kits/plots';
import type { ExpansionKitPose } from '../scene-types';
import { compare, compatibleBasis, rationalPosition } from '../value-logic';
import type { ExpansionQuantity, ExpansionRational } from '../value-types';
import type {
  ExpansionReversibleExpiryScene,
  ReversibleExpiryPermission,
} from './reversible-expiry-types';

export interface ReversibleExpiryPage {
  readonly id: string;
  readonly lines: readonly string[];
}
export interface TimingMark {
  readonly id: string;
  readonly role: string;
  readonly quantity: ExpansionQuantity;
  readonly x: number | null;
}
export interface ReversibleExpiryPose extends ExpansionKitPose {
  readonly page: number;
  readonly pages: readonly ReversibleExpiryPage[];
  readonly marks: readonly TimingMark[];
}
export function permissionText(value: ReversibleExpiryPermission): string {
  return value.state === 'conditional'
    ? `conditional: ${value.status}; ${value.condition}`
    : value.state;
}
/** Only comparable supplied amounts occupy the clock rail; absent/disputed facts remain off it. */
export function timingMarks(scene: ExpansionReversibleExpiryScene): TimingMark[] {
  if (scene.storyId === '43') return [];
  const entries = scene.records.flatMap((r) =>
    r.type === 'deadline'
      ? [{ id: r.id, role: 'deadline', quantity: r.representedDeadline }]
      : r.type === 'attempt'
        ? [{ id: r.id, role: 'attempt', quantity: r.representedEventTime }]
        : [
            { id: `${r.id}:start`, role: 'start', quantity: r.representedStart },
            { id: `${r.id}:end`, role: 'end', quantity: r.representedEnd },
          ],
  );
  const measured = entries.filter(
    (e) => e.quantity.state === 'known' || e.quantity.state === 'conditional',
  );
  const values: ExpansionRational[] = measured.flatMap((e) =>
    'amount' in e.quantity && e.quantity.amount.kind === 'rational'
      ? [e.quantity.amount.value]
      : [],
  );
  let low = values[0],
    high = values[0];
  for (const value of values) {
    const lower = low ? compare(value, low) : null,
      upper = high ? compare(value, high) : null;
    if (lower?.ok && lower.value < 0) low = value;
    if (upper?.ok && upper.value > 0) high = value;
  }
  return entries.map((e) => {
    let x: number | null = null;
    const q = e.quantity;
    if (
      low &&
      high &&
      measured.every((m) => compatibleBasis(q.basis, m.quantity.basis)) &&
      (q.state === 'known' || q.state === 'conditional') &&
      q.amount.kind === 'rational'
    ) {
      const equal = compare(low, high);
      const position = rationalPosition(q.amount.value, low, high);
      if (equal.ok && equal.value === 0) x = 220;
      else if (position.ok) x = 40 + position.value * 360;
    }
    return { ...e, x };
  });
}
export function reversibleExpiryPages(
  scene: ExpansionReversibleExpiryScene,
): ReversibleExpiryPage[] {
  const pages: ReversibleExpiryPage[] = [];
  const add = (id: string, fields: readonly string[]): void => {
    const lines = fields.flatMap((s) =>
      Array.from({ length: Math.ceil(Array.from(s).length / 20) }, (_, i) =>
        Array.from(s)
          .slice(i * 20, i * 20 + 20)
          .join(''),
      ),
    );
    for (let i = 0; i < lines.length; i += 13) pages.push({ id, lines: lines.slice(i, i + 13) });
  };
  const entity = (id: string): string => scene.entities.find((e) => e.id === id)?.label ?? id;
  add('source', [
    scene.label,
    `Actor: ${entity(scene.actorId)}`,
    `Resource: ${entity(scene.resourceId)}`,
    `Scope: ${scene.scope}`,
    `Period: ${scene.period}`,
    ...(scene.storyId === '44' ? [`Clock: ${scene.timingBasis}`] : []),
  ]);
  for (const e of scene.entities) add(e.id, [e.label, e.id]);
  if (scene.storyId === '43') {
    for (const r of scene.records) {
      add(r.id, [
        'Reported state',
        r.state,
        ...('valueId' in r ? [entity(r.valueId)] : []),
        ...('condition' in r ? [r.condition] : []),
      ]);
    }
    for (const r of scene.relations) {
      add(r.id, [
        'Transition permission',
        `From: ${entity(r.fromId)}`,
        `To: ${entity(r.toId)}`,
        permissionText(r),
        'Not execution',
        `Evidence: ${r.evidence.fromWord}–${r.evidence.toWord}`,
      ]);
    }
  } else {
    timingMarks(scene).forEach((m) => {
      const q = m.quantity;
      add(m.id, [
        m.role,
        plottedValueText(q),
        q.state,
        q.actor,
        q.claim,
        `Unit: ${q.basis.unit}`,
        `Period: ${q.basis.period}`,
        `Clock: ${q.basis.population}`,
        ...('condition' in q ? [q.condition] : 'qualifier' in q ? [q.qualifier] : []),
        `Evidence: ${q.evidence.fromWord}–${q.evidence.toWord}`,
      ]);
    });
    for (const r of scene.relations) {
      add(r.id, [
        `Authorization: ${entity(r.eventId)}`,
        permissionText(r),
        `Evidence: ${r.evidence.fromWord}–${r.evidence.toWord}`,
      ]);
    }
  }
  add(scene.result.id, [
    scene.outcome,
    'Supplied result',
    permissionText(scene.result),
    ...('eventId' in scene.result ? [entity(scene.result.eventId)] : []),
    `Evidence: ${scene.result.evidence.fromWord}–${scene.result.evidence.toWord}`,
  ]);
  return pages;
}
/** Seekable seconds affect emphasis only, never represented times, state or permission. */
export function reversibleExpiryPose(
  scene: ExpansionReversibleExpiryScene,
  t: number,
): ReversibleExpiryPose {
  const time = Number.isFinite(t) ? t : scene.setupAt;
  const ramp = (at: number): number => Math.max(0, Math.min(1, (time - at) / 0.2));
  const pages = reversibleExpiryPages(scene);
  const progress = Math.max(
    0,
    Math.min(1, (time - scene.setupAt) / (scene.resolveAt - scene.setupAt)),
  );
  return {
    reveal: ramp(scene.setupAt),
    action: ramp(scene.actionAt),
    response: ramp(scene.responseAt),
    check: ramp(scene.checkAt),
    resolve: ramp(scene.resolveAt),
    page: Math.min(pages.length - 1, Math.floor(progress * pages.length)),
    pages,
    marks: timingMarks(scene),
  };
}
