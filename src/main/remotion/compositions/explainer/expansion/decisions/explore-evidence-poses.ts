import { plottedValueText } from '../kits/plots';
import type { ExpansionKitPose } from '../scene-types';
import type { ExpansionExploreEvidenceScene } from './explore-evidence-types';

export interface ExploreEvidencePage {
  readonly id: string;
  readonly optionId?: string;
  readonly phase: 'action' | 'response' | 'check' | 'resolve';
  readonly text: string;
}
export interface ExploreEvidencePose extends ExpansionKitPose {
  readonly time: number;
  readonly pageIndex: number;
}
/** Fixed font, conservative one-em wrapping even for unbroken source tokens. */
export function exploreEvidenceLines(text: string, width = 880): string[] {
  const chars = Array.from(text),
    columns = Math.floor(width / 22);
  return Array.from({ length: Math.max(1, Math.ceil(chars.length / columns)) }, (_, i) =>
    chars.slice(i * columns, (i + 1) * columns).join(''),
  );
}
export function exploreEvidenceRecords(scene: ExpansionExploreEvidenceScene) {
  return scene.storyId === '31' ? scene.events : scene.tests;
}
export function exploreEvidencePages(scene: ExpansionExploreEvidenceScene): ExploreEvidencePage[] {
  const name = (id: string) => scene.entities.find((e) => e.id === id)?.label ?? '';
  const records = exploreEvidenceRecords(scene);
  const pages: ExploreEvidencePage[] = records.map((record, index) => ({
    id: record.id,
    optionId: record.optionId,
    phase: index === 0 ? 'action' : 'response',
    text: `${index + 1}. ${name(record.optionId)}: ${'behavior' in record ? record.behavior : `${record.label} test`}; ${record.state}${'outcome' in record && record.outcome ? `; ${record.outcome}` : ''}${record.condition ? `; ${record.condition}` : record.qualification ? `; ${record.qualification}` : ''}`,
  }));
  if (scene.storyId === '31') {
    for (const reward of scene.rewards) {
      const q = reward.quantity,
        b = q.basis;
      pages.push({
        id: reward.id,
        optionId: reward.optionId,
        phase: 'check',
        text: `${q.actor}: ${q.claim}; ${q.state}; ${q.state === 'disputed' ? `alternatives: ${q.alternatives.map((amount) => plottedValueText({ ...q, state: 'known', amount })).join(' or ')}` : plottedValueText(q)} ${b.unit}; ${b.population}; ${b.period}${b.denominator ? `; denominator ${b.denominator.numerator}/${b.denominator.denominator}` : ''}${'condition' in q ? `; ${q.condition}` : 'qualifier' in q ? `; ${q.qualifier}` : ''}`,
      });
    }
  } else
    pages.push({
      id: 'gathering',
      phase: 'check',
      text: `${scene.tests.map((t) => t.label).join(', ')} tests gather evidence for ${scene.entities.map((e) => e.label).join(', ')}; ${scene.scope}; ${scene.period}`,
    });
  const conclusion = scene.storyId === '31' ? scene.decision : scene.conclusion;
  pages.push({
    id: 'conclusion',
    phase: 'resolve',
    text: `${conclusion.state}; retained alternatives: ${conclusion.retainedIds.map(name).join(', ')}${'selectedId' in conclusion && conclusion.selectedId ? `; selected: ${name(conclusion.selectedId)}` : ''}; ${conclusion.qualification}${'condition' in conclusion && conclusion.condition ? `; ${conclusion.condition}` : ''}`,
  });
  return pages.flatMap((page) => {
    const lines = exploreEvidenceLines(page.text);
    return Array.from({ length: Math.ceil(lines.length / 10) }, (_, i) => ({
      ...page,
      text: lines.slice(i * 10, i * 10 + 10).join(''),
    }));
  });
}
/** Ordered source events only; no draws, rewards, probability or winner computed by motion. */
export function exploreEvidencePose(
  scene: ExpansionExploreEvidenceScene,
  t: number,
): ExploreEvidencePose {
  const time = Math.max(0, Math.min(Number.isFinite(t) ? t : 0, scene.resolveAt + 0.2));
  const progress = (at: number) => Math.max(0, Math.min(1, (time - at) / 0.2));
  const pages = exploreEvidencePages(scene);
  const phase =
    time < scene.responseAt
      ? 'action'
      : time < scene.checkAt
        ? 'response'
        : time < scene.resolveAt
          ? 'check'
          : 'resolve';
  const indices = pages.flatMap((p, i) => (p.phase === phase ? [i] : []));
  const start = scene[`${phase}At`],
    end =
      phase === 'action'
        ? scene.responseAt
        : phase === 'response'
          ? scene.checkAt
          : phase === 'check'
            ? scene.resolveAt
            : scene.resolveAt + 0.2;
  const fraction = Math.max(0, Math.min(0.999999, (time - start) / (end - start)));
  return {
    time,
    pageIndex: indices[Math.floor(fraction * indices.length)] ?? 0,
    reveal: progress(scene.setupAt),
    action: progress(scene.actionAt),
    response: progress(scene.responseAt),
    check: progress(scene.checkAt),
    resolve: progress(scene.resolveAt),
  };
}
export function exploreEvidencePageTimes(scene: ExpansionExploreEvidenceScene) {
  const pages = exploreEvidencePages(scene);
  return pages.map((p, i) => {
    const peers = pages.flatMap((v, j) => (v.phase === p.phase ? [j] : []));
    const start = scene[`${p.phase}At`],
      end =
        p.phase === 'action'
          ? scene.responseAt
          : p.phase === 'response'
            ? scene.checkAt
            : p.phase === 'check'
              ? scene.resolveAt
              : scene.resolveAt + 0.2;
    return start + ((end - start) * (peers.indexOf(i) + 0.5)) / peers.length;
  });
}
