import { boundedKitPose } from '../kits/geometry';
import { plottedValueText } from '../kits/plots';
import { type SignalWaveParameters, sampleSignalWave } from '../kits/signals';
import type { ExpansionKitPose } from '../scene-types';
import type { ExpansionQuantity } from '../value-types';
import type { ExpansionInterferenceCycleScene } from './interference-cycle-types';

export const INTERFERENCE_CYCLE_CAPS = { columns: 36, lines: 8, samples: 64 } as const;
export interface InterferenceCyclePage {
  readonly id: string;
  readonly state: string;
  readonly lines: readonly string[];
}
export function interferenceCycleLines(text: string): string[] {
  const chars = Array.from(text);
  return Array.from({ length: Math.max(1, Math.ceil(chars.length / 36)) }, (_, i) =>
    chars.slice(i * 36, (i + 1) * 36).join(''),
  );
}
/** Qualification is repeated on every continuation; full conditions are never metadata-only. */
export function interferenceCyclePages(
  scene: ExpansionInterferenceCycleScene,
): InterferenceCyclePage[] {
  const pages: InterferenceCyclePage[] = [];
  const put = (id: string, text: string, state: string, qualification = ''): void => {
    const header = interferenceCycleLines([state, qualification].filter(Boolean).join('; '));
    const lines = interferenceCycleLines(text);
    const capacity = 8 - header.length;
    if (capacity < 1) throw new Error('Qualification exceeds source page capacity');
    for (let i = 0; i < lines.length; i += capacity)
      pages.push({ id: `${id}/${i}`, state, lines: [...header, ...lines.slice(i, i + capacity)] });
  };
  put(
    'scope',
    `${scene.subject}; ${scene.scope}; ${scene.period}`,
    scene.evidence,
    scene.condition,
  );
  for (const e of scene.entities) put(e.id, e.label, scene.evidence, scene.condition);
  const label = (id: string): string => {
    const e = scene.entities.find((entry) => entry.id === id);
    if (!e) throw new Error('Missing source identity');
    return e.label;
  };
  for (const r of [...scene.records, ...scene.relations])
    put(
      r.id,
      `${label(r.actorId)}; ${r.targetIds.map(label).join('; ')}; ${r.role}; ${r.value ?? 'No supplied value'}; ${r.scope}; ${r.period}`,
      r.state,
      r.condition ?? r.qualifier,
    );
  if (scene.storyId === '77')
    for (const w of scene.waves)
      for (const [name, q] of Object.entries({
        amplitude: w.amplitude,
        frequency: w.frequency,
        phase: w.phaseData,
        duration: w.domainDuration,
      })) {
        const denominator = q.basis.denominator;
        put(
          `${w.id}/${name}`,
          `${q.actor}; ${q.claim}; ${plottedValueText(q)}; ${q.basis.unit}; ${q.basis.period}; ${q.basis.population}${denominator ? `; denominator ${denominator.numerator}/${denominator.denominator}` : ''}`,
          q.state,
          'condition' in q ? q.condition : 'qualifier' in q ? q.qualifier : undefined,
        );
      }
  put(
    'outcome',
    scene.outcome,
    scene.relations[0].state,
    scene.relations[0].condition ?? scene.relations[0].qualifier,
  );
  return pages;
}
export interface InterferenceCyclePose extends ExpansionKitPose {
  readonly page: number;
}
export function interferenceCyclePose(
  scene: ExpansionInterferenceCycleScene,
  time: number,
): InterferenceCyclePose {
  const t = Number.isFinite(time) ? time : scene.setupAt;
  const progress = (at: number): number => Math.max(0, Math.min(1, (t - at) / 0.35));
  const pages = interferenceCyclePages(scene);
  const first = Math.ceil(scene.setupAt * 30);
  const last = Math.floor(scene.resolveAt * 30);
  const frames = last - first + 1;
  if (frames < pages.length)
    throw new Error('Source pages exceed actual 30fps setup–resolve window');
  const frame = Math.max(0, Math.min(frames - 1, Math.floor(t * 30 + 1e-7) - first));
  return {
    ...boundedKitPose({
      reveal: progress(scene.setupAt),
      action: progress(scene.actionAt),
      response: progress(scene.responseAt),
      check: progress(scene.checkAt),
      resolve: progress(scene.resolveAt),
    }),
    page: Math.min(pages.length - 1, Math.floor((frame * pages.length) / frames)),
  };
}
function amount(q: ExpansionQuantity): number | null {
  return 'amount' in q && q.amount.kind === 'rational'
    ? q.amount.value.numerator / q.amount.value.denominator
    : null;
}
/** Parameter availability is independent of the editorial clock. Never guess absent inputs. */
export function interferenceCycleWaves(
  scene: ExpansionInterferenceCycleScene,
): readonly SignalWaveParameters[] | null {
  if (scene.storyId !== '77') return null;
  const waves: SignalWaveParameters[] = [];
  for (const w of scene.waves) {
    const a = amount(w.amplitude),
      f = amount(w.frequency),
      p = amount(w.phaseData),
      d = amount(w.domainDuration);
    if (a === null || f === null || p === null || d === null) return null;
    waves.push({ amplitude: a, frequency: f, phase: p, domain: [0, d], samples: 64 });
  }
  return waves;
}
export const INTERFERENCE_CYCLE_SAMPLES_PER_CYCLE = 8;
export type InterferenceCycleEligibility =
  | 'supported'
  | 'parameters-unavailable'
  | 'resolution-unavailable';
/** Fixed authored sampling density: refuse aliased connections without changing any source fact. */
export function interferenceCycleEligibility(
  scene: ExpansionInterferenceCycleScene,
): InterferenceCycleEligibility {
  const waves = interferenceCycleWaves(scene);
  if (!waves) return 'parameters-unavailable';
  return waves.every(
    (w) =>
      w.frequency * (w.domain[1] - w.domain[0]) * INTERFERENCE_CYCLE_SAMPLES_PER_CYCLE <=
      w.samples - 1,
  )
    ? 'supported'
    : 'resolution-unavailable';
}
export function interferenceCycleTraces(
  scene: ExpansionInterferenceCycleScene,
): readonly string[] | null {
  const waves = interferenceCycleWaves(scene);
  if (!waves || interferenceCycleEligibility(scene) !== 'supported') return null;
  const samples = waves.map(sampleSignalWave);
  const scale = Math.max(...waves.map((w) => w.amplitude)) * 2 || 1;
  const points = (values: readonly number[]) =>
    values.map((value, i) => `${100 + (700 * i) / 63},${145 - (10 * value) / scale}`).join(' ');
  const traces = samples.map((s) => points(s.map((p) => p.value)));
  // Only shared source domains authorize pointwise composition.
  if (waves[0].domain[1] === waves[1].domain[1])
    traces.push(points(samples[0].map((p, i) => p.value + samples[1][i].value)));
  return traces;
}
