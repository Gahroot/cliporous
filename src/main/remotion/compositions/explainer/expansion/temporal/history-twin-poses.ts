import { plottedValueText } from '../kits/plots';
import { representationValueText } from '../kits/representations';
import { compare, rationalPosition } from '../value-logic';
import type { ExpansionQuantity, ExpansionRational } from '../value-types';
import type { ExpansionHistoryTwinScene } from './history-twin-types';

export interface HistoryTwinPage {
  readonly id: string;
  readonly factId: string;
  readonly text: string;
  readonly lines: readonly string[];
}
export interface HistoryTwinPose {
  readonly reveal: number;
  readonly action: number;
  readonly response: number;
  readonly check: number;
  readonly resolve: number;
  readonly page: number;
}
export function historyTwinLabel(scene: ExpansionHistoryTwinScene, id: string): string {
  const entity = scene.entities.find((e) => e.id === id);
  if (!entity) throw new Error(`Missing source identity ${id}`);
  return entity.label;
}
/** One-em conservative wrap, including unbroken tokens. No deletion or font shrinking. */
export function historyTwinLines(text: string, columns = 19): string[] {
  const chars = Array.from(text);
  return Array.from({ length: Math.max(1, Math.ceil(chars.length / columns)) }, (_, i) =>
    chars.slice(i * columns, (i + 1) * columns).join(''),
  );
}
export function historyTwinStatus(fact: {
  state: string;
  qualification?: string;
  condition?: string;
}): string {
  return [fact.state, fact.qualification, fact.condition].filter(Boolean).join('; ');
}
export function historyTwinQuantity(q: ExpansionQuantity): string {
  return [
    q.actor,
    q.claim,
    q.state,
    plottedValueText(q),
    q.basis.unit,
    q.basis.population,
    q.basis.period,
    q.basis.denominator
      ? `denominator ${representationValueText({ state: 'known', value: q.basis.denominator })}`
      : '',
    'condition' in q ? q.condition : 'qualifier' in q ? q.qualifier : '',
  ]
    .filter(Boolean)
    .join('; ');
}
const pageCache = new WeakMap<ExpansionHistoryTwinScene, readonly HistoryTwinPage[]>();
export function historyTwinPages(scene: ExpansionHistoryTwinScene): readonly HistoryTwinPage[] {
  const cached = pageCache.get(scene);
  if (cached) return cached;
  const label = (id: string): string => historyTwinLabel(scene, id);
  const texts: { id: string; text: string }[] = [
    { id: 'context', text: `Source only; ${scene.scope}; ${scene.period}` },
  ];
  for (const e of scene.entities) texts.push({ id: e.id, text: e.label });
  if (scene.storyId === '47') {
    for (const r of scene.rules)
      texts.push({
        id: r.id,
        text: `${r.role}; ${label(r.actorId)}; ${label(r.fromId)} to ${label(r.toId)}; ${historyTwinStatus(r)}${r.thresholdId ? `; operand ${r.thresholdId}` : ''}`,
      });
    for (const v of scene.thresholds)
      texts.push({
        id: v.id,
        text: `${v.role}; represented threshold only; ${historyTwinQuantity(v.quantity)}`,
      });
    for (const h of scene.history)
      texts.push({
        id: h.id,
        text: `${label(h.actorId)}; retained history; ${h.dataTime}; ${historyTwinStatus(h)}${'valueId' in h ? `; ${label(h.valueId)}` : ''}`,
      });
    const r = scene.result;
    texts.push({
      id: 'result',
      text: `${label(r.actorId)}; ${r.claim}; ${historyTwinStatus(r)}${'valueId' in r ? `; ${label(r.valueId)}` : ''}; retains ${r.retainedHistoryIds.map((id) => scene.history.find((h) => h.id === id)?.dataTime ?? id).join('; ')}`,
    });
  } else {
    for (const s of scene.snapshots)
      texts.push({
        id: s.id,
        text: `${label(s.actorId)}; ${label(s.viewId)}; ${s.claim}; ${historyTwinStatus(s)}; data time ${s.dataTime}; controls ${s.controls.join('; ')}${'value' in s ? `; source value ${s.value}` : ''}`,
      });
    for (const v of scene.quantities)
      texts.push({
        id: v.id,
        text: `${label(v.viewId)}; supplied control only; ${historyTwinQuantity(v.quantity)}`,
      });
    texts.push({
      id: 'alignment',
      text: `Same ${label(scene.alignment.actorId)}; ${scene.alignment.viewIds.map(label).join(' linked to ')}; retains source controls`,
    });
    texts.push({
      id: 'result',
      text: `${label(scene.result.actorId)}; ${scene.result.claim}; ${historyTwinStatus(scene.result)}${'result' in scene.result ? `; ${scene.result.result}` : ''}; source comparison only`,
    });
  }
  const pages = texts.flatMap(({ id, text }) => {
    const lines = historyTwinLines(text);
    return Array.from({ length: Math.ceil(lines.length / 13) }, (_, i) => ({
      id: `${id}/page-${i}`,
      factId: id,
      text,
      lines: lines.slice(i * 13, (i + 1) * 13),
    }));
  });
  pageCache.set(scene, pages);
  return pages;
}
/** Only represented values are positioned. No switching, state evaluation or trend. */
export function historyTwinNumericPositions(
  quantities: readonly ExpansionQuantity[],
): readonly (number | null)[] {
  const values = quantities.map((q): ExpansionRational | null =>
    'amount' in q && q.amount.kind === 'rational' ? q.amount.value : null,
  );
  const supplied = values.filter((v): v is ExpansionRational => v !== null);
  if (!supplied.length) return values.map(() => null);
  let low = supplied[0],
    high = supplied[0];
  for (const v of supplied) {
    const a = compare(v, low),
      b = compare(v, high);
    if (!a.ok || !b.ok) throw new Error('Invalid represented operand');
    if (a.value < 0) low = v;
    if (b.value > 0) high = v;
  }
  return values.map((v) => {
    if (!v) return null;
    const equal = compare(low, high);
    if (!equal.ok) throw new Error('Invalid domain');
    if (equal.value === 0) return 0.5;
    const p = rationalPosition(v, low, high);
    if (!p.ok) throw new Error('Invalid represented position');
    return p.value;
  });
}
export function historyTwinPose(scene: ExpansionHistoryTwinScene, time: number): HistoryTwinPose {
  const t = Number.isFinite(time) ? time : scene.setupAt - 1;
  const ramp = (at: number): number => Math.max(0, Math.min(1, (t - at) / 0.3));
  const progress = Math.max(
    0,
    Math.min(1, (t - scene.setupAt) / (scene.resolveAt - scene.setupAt)),
  );
  const pages = historyTwinPages(scene);
  return {
    reveal: ramp(scene.setupAt),
    action: ramp(scene.actionAt),
    response: ramp(scene.responseAt),
    check: ramp(scene.checkAt),
    resolve: ramp(scene.resolveAt),
    page: Math.min(pages.length - 1, Math.floor(progress * pages.length)),
  };
}
