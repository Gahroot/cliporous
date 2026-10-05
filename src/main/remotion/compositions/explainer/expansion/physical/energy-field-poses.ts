import { diagramPose } from '../../diagrams/motion';
import type { ExpansionAmount } from '../value-types';
import type { ExpansionEnergyFieldScene } from './energy-field-types';

export function energyFieldWrap(text: string): string[] {
  const chars = Array.from(text);
  return Array.from({ length: Math.max(1, Math.ceil(chars.length / 32)) }, (_, i) =>
    chars.slice(i * 32, (i + 1) * 32).join(''),
  );
}
export function energyFieldAmount(a: ExpansionAmount): string {
  return `${a.notation === undefined ? '' : `${a.notation}; `}${a.kind === 'rational' ? `${a.value.numerator}/${a.value.denominator}` : `${a.value.minorUnits} minor units ${a.value.currency}`}`;
}
export interface EnergyFieldPage {
  readonly state: string;
  readonly qualification: readonly string[];
  readonly lines: readonly string[];
  readonly recordId?: string;
}
export function energyFieldPages(scene: ExpansionEnergyFieldScene): EnergyFieldPage[] {
  const pages: EnergyFieldPage[] = [];
  const add = (state: string, qualification: string, fields: string[], recordId?: string) => {
    const lines = fields.flatMap(energyFieldWrap);
    for (let i = 0; i < lines.length; i += 6)
      pages.push({
        state,
        qualification: energyFieldWrap(qualification),
        lines: lines.slice(i, i + 6),
        recordId,
      });
  };
  const teaching = scene.storyId === '80' ? scene.qualification : scene.evidence;
  for (const r of [...scene.records].sort((a, b) => {
    const priority = (r: typeof a) =>
      scene.storyId === '80' &&
      r.actorId === scene.actorId &&
      r.quantity.claim === (scene.template === 'radial-field' ? 'strength' : 'direction')
        ? 0
        : 1;
    return priority(a) - priority(b);
  })) {
    const q = r.quantity;
    add(
      q.state,
      [
        teaching,
        ...('condition' in q ? [q.condition] : []),
        ...('qualifier' in q ? [q.qualifier] : []),
      ].join('; '),
      [
        q.actor,
        q.claim,
        q.basis.unit,
        q.basis.population,
        q.basis.period,
        ...(q.basis.denominator
          ? [`Denominator: ${q.basis.denominator.numerator}/${q.basis.denominator.denominator}`]
          : []),
        ...('amount' in q
          ? [energyFieldAmount(q.amount)]
          : q.state === 'disputed'
            ? q.alternatives.map(energyFieldAmount)
            : ['No supplied amount']),
      ],
      r.id,
    );
  }
  add(scene.evidence, teaching, [scene.label, scene.subject, scene.scope, scene.period]);
  for (const source of Object.values(scene.sourceSpans)) {
    const record = scene.records.find(
      (r) =>
        source.includes(r.quantity.actor) &&
        (source.includes(r.quantity.claim) ||
          ('condition' in r.quantity && source.includes(r.quantity.condition)) ||
          (scene.storyId === '80' &&
            r.actorId === scene.actorId &&
            source.includes(`illustrates ${scene.template}`))),
    );
    const q = record?.quantity;
    add(
      q?.state ?? scene.evidence,
      [
        teaching,
        ...(q && 'condition' in q ? [q.condition] : []),
        ...(q && 'qualifier' in q ? [q.qualifier] : []),
      ].join('; '),
      [source],
      record?.id,
    );
  }
  for (const r of scene.relations) {
    const record = scene.records.find((v) => v.id === r.recordId);
    if (!record) throw new Error('Missing energy/field relation record');
    const q = record.quantity;
    const name = (id: string) => scene.entities.find((e) => e.id === id)?.label ?? id;
    add(
      q.state,
      [
        teaching,
        ...('condition' in q ? [q.condition] : []),
        ...('qualifier' in q ? [q.qualifier] : []),
      ].join('; '),
      [
        name(r.fromId),
        scene.storyId === '79' ? 'Source transfer' : 'Authored teaching field',
        name(r.toId),
        q.claim,
        scene.scope,
        scene.period,
      ],
      record.id,
    );
  }
  return pages;
}
/** Fixed teaching arrows; no force, trajectory, magnitude or numerical physics encoded. */
export interface EnergyFieldArrow {
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
  readonly available: boolean;
}
export function energyFieldArrows(scene: ExpansionEnergyFieldScene): EnergyFieldArrow[] {
  if (scene.storyId !== '80') return [];
  const direction = scene.records.find(
    (r) => r.actorId === scene.actorId && r.quantity.claim === 'direction',
  )?.quantity;
  const angle =
    direction && 'amount' in direction && direction.amount.kind === 'rational'
      ? ((direction.amount.value.numerator / direction.amount.value.denominator) * Math.PI) / 180
      : undefined;
  return Array.from({ length: 9 }, (_, i) => {
    const x = ((i % 3) - 1) * 70,
      y = (Math.floor(i / 3) - 1) * 70;
    const a =
      scene.template === 'radial-field'
        ? x === 0 && y === 0
          ? undefined
          : Math.atan2(y, x)
        : angle;
    return {
      x,
      y,
      dx: a === undefined ? 0 : Math.cos(a) * 24,
      dy: a === undefined ? 0 : Math.sin(a) * 24,
      available: a !== undefined,
    };
  });
}
export interface EnergyFieldPose {
  readonly reveal: number;
  readonly action: number;
  readonly response: number;
  readonly check: number;
  readonly resolve: number;
  readonly pages: readonly EnergyFieldPage[];
  readonly page: number;
  readonly arrows: readonly EnergyFieldArrow[];
  readonly fieldVisible: boolean;
}
export function energyFieldPose(scene: ExpansionEnergyFieldScene, time: number): EnergyFieldPose {
  const t = Number.isFinite(time) ? time : scene.setupAt;
  const p = diagramPose(t, scene),
    pages = energyFieldPages(scene);
  const frames = Math.max(1, Math.floor((scene.resolveAt - scene.setupAt) * 30));
  if (pages.length > frames) throw new Error('Source pages exceed actual 30fps window');
  const frame = Math.max(0, Math.min(frames - 1, Math.floor((t - scene.setupAt) * 30)));
  return {
    reveal: p.setup,
    action: p.action,
    response: p.response,
    check: p.check,
    resolve: p.resolve,
    pages,
    page: Math.min(pages.length - 1, Math.floor((frame * pages.length) / frames)),
    arrows: energyFieldArrows(scene),
    fieldVisible:
      scene.storyId === '80' &&
      scene.records.some(
        (r) =>
          r.id ===
            pages[Math.min(pages.length - 1, Math.floor((frame * pages.length) / frames))]
              .recordId &&
          r.actorId === scene.actorId &&
          r.quantity.claim === (scene.template === 'radial-field' ? 'strength' : 'direction'),
      ),
  };
}
