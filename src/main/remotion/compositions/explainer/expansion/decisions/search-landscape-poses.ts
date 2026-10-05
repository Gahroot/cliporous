import { boundedKitPose } from '../kits/geometry';
import { plottedValueText } from '../kits/plots';
import { representationValueText } from '../kits/representations';
import type { ExpansionQuantity } from '../value-types';
import type { ExpansionSearchLandscapeScene } from './search-landscape-types';

export const SEARCH_SLOTS = {
  start: [64, 216],
  upper: [232, 72],
  lower: [232, 300],
  goal: [408, 216],
} as const;
export function searchWellSlots(
  scene: Extract<ExpansionSearchLandscapeScene, { storyId: '30' }>,
): readonly (readonly [number, number])[] {
  // Fixed authored qualitative teaching template, NEVER an objective-value evaluator.
  return scene.wells.map(
    (well, i) =>
      [
        i === 0 ? 132 : 348,
        well.role === 'local' ? 220 : well.role === 'global' ? 280 : 250,
      ] as const,
  );
}
export function searchLabel(scene: ExpansionSearchLandscapeScene, id: string): string {
  const entity = scene.entities.find((e) => e.id === id);
  if (!entity) throw new Error('Lost source entity');
  return entity.label;
}
/** One-em wrapping is conservative for shipped Inter; no character is discarded. */
export function searchLines(text: string, columns = 19): string[] {
  const chars = Array.from(text);
  return Array.from({ length: Math.max(1, Math.ceil(chars.length / columns)) }, (_, i) =>
    chars.slice(i * columns, (i + 1) * columns).join(''),
  );
}
export function searchQuantityText(q: ExpansionQuantity): string {
  const qualifier = 'condition' in q ? q.condition : 'qualifier' in q ? q.qualifier : '';
  const denominator = q.basis.denominator;
  return [
    q.actor,
    q.claim,
    q.state,
    plottedValueText(q),
    q.basis.unit,
    q.basis.period,
    q.basis.population,
    denominator
      ? `denominator ${representationValueText({ state: 'known', value: denominator })}`
      : '',
    qualifier,
  ]
    .filter(Boolean)
    .join('; ');
}
export function searchPages(scene: ExpansionSearchLandscapeScene) {
  const texts: {
    id: string;
    text: string;
    beat: 'setup' | 'action' | 'response' | 'check' | 'resolve';
  }[] = [];
  const put = (id: string, text: string, beat: (typeof texts)[number]['beat']) =>
    texts.push({ id, text, beat });
  put(
    'qualification',
    `${scene.qualification}; ${scene.template}; ${scene.storyId === '30' ? 'Schematic, not a measured function' : 'Authored map, not a shortest-path computation'}`,
    'setup',
  );
  if (scene.storyId === '29') {
    for (const n of scene.nodes)
      put(
        n.id,
        `${searchLabel(scene, n.entityId)}; ${n.slot}; ${n.status}; ${n.condition ?? ''}`,
        'action',
      );
    const nodeName = (id: string) =>
      searchLabel(scene, scene.nodes.find((n) => n.id === id)?.entityId ?? '');
    for (const l of scene.links)
      put(
        `${l.fromId}/${l.toId}`,
        `${nodeName(l.fromId)} → ${nodeName(l.toId)}; ${l.status}; ${l.condition ?? ''}${l.cost ? `; ${searchQuantityText(l.cost)}` : '; cost not stated'}`,
        'action',
      );
    put(
      'rule',
      `${scene.rule.kind}: ${scene.rule.kind === 'equal-cost' ? 'Every open link has equal cost; no unit cost inferred' : 'Every used link has its own supplied cost'}`,
      'action',
    );
    const names = (ids: readonly string[]) =>
      ids
        .map((id) => searchLabel(scene, scene.nodes.find((n) => n.id === id)?.entityId ?? ''))
        .join(' → ');
    put('frontier', `Stated frontier: ${names(scene.frontier.nodeIds)}`, 'response');
    put(
      'route',
      scene.route.nodeIds.length
        ? `Supplied route: ${names(scene.route.nodeIds)}${scene.route.cost ? `; ${searchQuantityText(scene.route.cost)}` : '; total cost not stated'}`
        : 'No supplied route',
      'check',
    );
  } else {
    put('objective', `${scene.objective.label}; minimize stated objective only`, 'setup');
    for (const w of scene.wells)
      put(
        w.id,
        `${searchLabel(scene, w.entityId)}; ${w.role}; ${w.condition ?? ''}${w.value ? `; ${searchQuantityText(w.value)}` : '; objective value not stated'}`,
        w.role === 'local' ? 'action' : 'response',
      );
    const wellName = (id: string) =>
      searchLabel(scene, scene.wells.find((w) => w.id === id)?.entityId ?? '');
    put(
      'branch',
      `${wellName(scene.branch.fromId)} → ${wellName(scene.branch.toId)}; ${scene.branch.status}; ${scene.branch.condition ?? ''}`,
      'check',
    );
  }
  put(
    'result',
    `${scene.qualification}; ${scene.result.status}; ${scene.storyId === '30' ? 'Roles apply only to these named wells on this schematic; depths encode no values' : 'Result applies only to this named grid; no shortest winner'}`,
    'resolve',
  );
  return texts.flatMap((entry) => {
    const lines = searchLines(entry.text);
    return Array.from({ length: Math.ceil(lines.length / 14) }, (_, part) => ({
      ...entry,
      id: `${entry.id}/${part}`,
      lines: lines.slice(part * 14, part * 14 + 14),
    }));
  });
}
export function searchPose(scene: ExpansionSearchLandscapeScene, seconds: number) {
  const t = Number.isFinite(seconds) ? seconds : scene.setupAt - 1;
  const progress = (at: number) => Math.max(0, Math.min(1, (t - at) / 0.2));
  const pose = boundedKitPose({
    reveal: progress(scene.setupAt),
    action: progress(scene.actionAt),
    response: progress(scene.responseAt),
    check: progress(scene.checkAt),
    resolve: progress(scene.resolveAt),
  });
  const pages = searchPages(scene);
  const beats = ['setup', 'action', 'response', 'check', 'resolve'] as const;
  const ats = [scene.setupAt, scene.actionAt, scene.responseAt, scene.checkAt, scene.resolveAt];
  let phase = 0;
  for (let i = 0; i < ats.length; i++) if (t >= ats[i]) phase = i;
  const candidates = pages.map((p, i) => ({ p, i })).filter(({ p }) => p.beat === beats[phase]);
  const fraction =
    phase === 4
      ? 0
      : Math.max(0, Math.min(0.999999, (t - ats[phase]) / (ats[phase + 1] - ats[phase])));
  return {
    ...pose,
    page:
      candidates[Math.min(candidates.length - 1, Math.floor(fraction * candidates.length))]?.i ?? 0,
  };
}
