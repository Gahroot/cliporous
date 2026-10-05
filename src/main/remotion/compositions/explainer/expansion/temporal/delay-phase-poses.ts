import { boundedKitPose } from '../kits/geometry';
import { plottedValueText } from '../kits/plots';
import { sampleSignalWave } from '../kits/signals';

import { compare, compatibleBasis, rationalPosition } from '../value-logic';
import type { ExpansionBasis, ExpansionQuantity, ExpansionRational } from '../value-types';
import type {
  ExpansionDelayPhaseScene,
  ExpansionPeriodicPhaseScene,
  PeriodicSignal,
} from './delay-phase-types';

export const DELAY_PHASE_AXIS = { start: 100, end: 800, width: 700 } as const;
export const DELAY_PHASE_CAPS = {
  samples: 64,
  cycles: 2,
  columns: 39,
  lines: 8,
  meshes: 12,
  instances: 0,
} as const;
export interface DelayPhasePage {
  readonly id: string;
  readonly actorId?: string;
  readonly recordId?: string;
  readonly lines: readonly string[];
}
export function delayPhaseLines(text: string): string[] {
  const chars = Array.from(text);
  return Array.from(
    { length: Math.max(1, Math.ceil(chars.length / DELAY_PHASE_CAPS.columns)) },
    (_, i) =>
      chars.slice(i * DELAY_PHASE_CAPS.columns, (i + 1) * DELAY_PHASE_CAPS.columns).join(''),
  );
}
export function delayPhaseLabel(scene: ExpansionDelayPhaseScene, id: string): string {
  const entity = scene.entities.find((e) => e.id === id);
  if (!entity) throw new Error('Missing parser entity');
  return entity.label;
}
export function delayPhaseRational(value: ExpansionRational): string {
  return value.denominator === 1 ? `${value.numerator}` : `${value.numerator}/${value.denominator}`;
}
export function delayPhaseBasis(b: ExpansionBasis): string {
  return `${b.unit}; during ${b.period}; among ${b.population}${b.denominator ? `; denominator ${delayPhaseRational(b.denominator)}` : ''}`;
}
function qualification(value: { state: string; condition?: string; qualifier?: string }): string {
  return [value.state, value.condition, value.qualifier].filter(Boolean).join('; ');
}
export function delayPhasePages(scene: ExpansionDelayPhaseScene): DelayPhasePage[] {
  const pages: DelayPhasePage[] = [];
  const put = (id: string, text: string, actorId?: string, recordId?: string): void => {
    const lines = delayPhaseLines(text);
    for (let i = 0; i < lines.length; i += DELAY_PHASE_CAPS.lines)
      pages.push({
        id: `${id}/${i}`,
        actorId,
        recordId,
        lines: lines.slice(i, i + DELAY_PHASE_CAPS.lines),
      });
  };
  put(
    'scope',
    `${scene.evidence}; ${scene.period}; ${scene.population}; ${scene.storyId === '45' ? 'Latency and throughput are independent. No reciprocal rate or winner inferred.' : 'Authored teaching signals, not measured curves. Only supplied period, phase, direction and reference. No phase inferred for an absent record.'}`,
  );
  for (const e of scene.entities) put(e.id, e.label, e.id);
  for (const r of scene.records) {
    const q = r.quantity;
    put(
      r.id,
      `${delayPhaseLabel(scene, r.actorId)}; ${r.dimension}; ${q.claim}; ${qualification(q)}; ${plottedValueText(q)}; ${delayPhaseBasis(q.basis)}${'referenceId' in r && r.referenceId ? `; reference ${delayPhaseLabel(scene, r.referenceId)}` : ''}`,
      r.actorId,
      r.id,
    );
  }
  if (scene.storyId === '46')
    for (const s of scene.signals)
      put(
        s.id,
        `${delayPhaseLabel(scene, s.actorId)}; ${s.template}; ${qualification(s)}; ${s.direction ?? 'direction not supplied'}; schematic teaching signal, not measured`,
        s.actorId,
      );
  for (const r of scene.relations)
    put(
      r.id,
      `${delayPhaseLabel(scene, r.fromId)} → ${delayPhaseLabel(scene, r.toId)}; ${qualification(r)}; ${'comparisonLabel' in r ? `${r.comparisonLabel}; ${r.dimension}; ${r.order ?? 'order not supplied'}; ${delayPhaseBasis(r.basis)}` : (r.relationship ?? 'relationship not supplied')}`,
      r.fromId,
    );
  put('resolve', `${scene.outcome}; ${scene.meaning}`);
  return pages;
}
export function delayPhasePose(
  scene: ExpansionDelayPhaseScene,
  time: number,
): {
  readonly reveal: number;
  readonly action: number;
  readonly response: number;
  readonly check: number;
  readonly resolve: number;
  readonly page: number;
  readonly elapsed: number;
} {
  const t = Number.isFinite(time) ? time : 0;
  const progress = (at: number): number => Math.max(0, Math.min(1, (t - at) / 0.35));
  const pose = boundedKitPose({
    reveal: progress(scene.setupAt),
    action: progress(scene.actionAt),
    response: progress(scene.responseAt),
    check: progress(scene.checkAt),
    resolve: progress(scene.resolveAt),
  });
  const pages = delayPhasePages(scene);
  const span = Math.max(0.01, scene.resolveAt - scene.setupAt);
  return {
    ...pose,
    page: Math.min(
      pages.length - 1,
      Math.floor(Math.max(0, Math.min(1, (t - scene.setupAt) / span)) * (pages.length - 1)),
    ),
    elapsed: Math.max(0, Math.min(scene.checkAt - scene.actionAt, t - scene.actionAt)),
  };
}
export function delayPhaseAmount(q: ExpansionQuantity): ExpansionRational | null {
  return 'amount' in q && q.amount.kind === 'rational' ? q.amount.value : null;
}
/** Separate compatible domains only; disputed/absent values cannot silently become zero. */
export function delayPhaseExtent(
  scene: Extract<ExpansionDelayPhaseScene, { storyId: '45' }>,
  recordId: string,
): {
  readonly width: number;
  readonly zero: boolean;
  readonly subpixel: boolean;
  readonly upper: ExpansionRational;
} | null {
  const record = scene.records.find((r) => r.id === recordId);
  if (!record) return null;
  const value = delayPhaseAmount(record.quantity);
  if (!value) return null;
  let upper: ExpansionRational = { numerator: 0, denominator: 1 };
  for (const r of scene.records) {
    if (
      r.dimension !== record.dimension ||
      !compatibleBasis(r.quantity.basis, record.quantity.basis)
    )
      continue;
    const v = delayPhaseAmount(r.quantity);
    if (!v) continue;
    const c = compare(v, upper);
    if (c.ok && c.value > 0) upper = v;
  }
  const zero = compare(value, { numerator: 0, denominator: 1 });
  if (upper.numerator === 0) return { width: 0, zero: true, subpixel: false, upper };
  const projected = rationalPosition(value, { numerator: 0, denominator: 1 }, upper);
  if (!projected.ok) throw new Error('Invalid compatible latency/rate domain');
  const width = projected.value * DELAY_PHASE_AXIS.width;
  return {
    width,
    zero: zero.ok && zero.value === 0,
    subpixel: zero.ok && zero.value > 0 && width < 1,
    upper,
  };
}
export interface DelayPhaseSignalPose {
  readonly angle: number;
  readonly period: ExpansionRational;
  readonly phase: ExpansionRational;
  readonly referenceId: string;
  readonly points: string;
  readonly template: PeriodicSignal['template'];
}
/** Pure bounded illustration. A reference origin is not an inferred absolute phase. */
export function delayPhaseSignal(
  scene: ExpansionPeriodicPhaseScene,
  actorId: string,
  time: number,
  recordId?: string,
): DelayPhaseSignalPose | null {
  const signal = scene.signals.find((s) => s.actorId === actorId);
  const periodRecord = scene.records.find((r) => r.actorId === actorId && r.dimension === 'period');
  const phaseRecord = scene.records.find(
    (r) => r.actorId === actorId && r.dimension === 'phase' && (!recordId || r.id === recordId),
  );
  if (!signal?.direction || !periodRecord || !phaseRecord || phaseRecord.dimension !== 'phase')
    return null;
  const period = delayPhaseAmount(periodRecord.quantity),
    phase = delayPhaseAmount(phaseRecord.quantity);
  if (!period || !phase) return null;
  const radians =
    phaseRecord.quantity.basis.unit === 'degree'
      ? ((phase.numerator / phase.denominator) * Math.PI) / 180
      : phase.numerator / phase.denominator;
  if (periodRecord.quantity.basis.unit !== 'second') return null;
  const seconds = period.numerator / period.denominator;
  const elapsed = Math.min(delayPhasePose(scene, time).elapsed, seconds * DELAY_PHASE_CAPS.cycles);
  const direction = signal.direction === 'clockwise' ? 1 : -1;
  const angle = direction * ((2 * Math.PI * elapsed) / seconds + radians);
  // Reverse evaluation time, not signal magnitude. Positive phase leads along the
  // supplied rotational direction; numeric source phase itself remains unwrapped.
  const normalizedPhase = Math.atan2(Math.sin(direction * radians), Math.cos(direction * radians));
  const samples = sampleSignalWave({
    amplitude: 1,
    frequency: 1,
    phase: normalizedPhase,
    domain: direction === 1 ? [0, DELAY_PHASE_CAPS.cycles] : [-DELAY_PHASE_CAPS.cycles, 0],
    samples: DELAY_PHASE_CAPS.samples,
  });
  const points = samples
    .map((_, index) => {
      const sample = samples[direction === 1 ? index : samples.length - 1 - index];
      if (!sample) throw new Error('Missing authored analytic sample');
      const value = sample.value;
      const position = rationalPosition(
        { numerator: index * 2, denominator: 63 },
        { numerator: 0, denominator: 1 },
        { numerator: 2, denominator: 1 },
      );
      if (!position.ok) throw new Error('Invalid authored signal domain');
      const v = signal.template === 'pulse' ? (value >= 0 ? 1 : -1) : value;
      return `${100 + position.value * 700},${88 - v * 48}`;
    })
    .join(' ');
  return {
    angle,
    period,
    phase,
    referenceId: phaseRecord.referenceId,
    points,
    template: signal.template,
  };
}
