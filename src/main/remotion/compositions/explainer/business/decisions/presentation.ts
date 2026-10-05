import { diagramPose } from '../../diagrams/motion';
import { businessLabelLines, businessTextWidth } from '../text-width';
import type { BusinessIdentity } from '../types';
import {
  DECISIONS_LIMITS,
  type DecisionRow,
  type DecisionsScene,
  type UncertaintyAlbumScene,
} from './types';

export const DECISIONS_ALBUM_HEADER = {
  left: 24,
  top: 12,
  railWidth: 904,
  height: 94,
  gap: 6,
  padding: 8,
  fontSize: 24,
  lineHeight: 29,
  maxLines: 2,
} as const;
export function decisionAlbumHeaders(scene: UncertaintyAlbumScene): {
  id: string;
  text: string;
  lines: string[];
  x: number;
  y: number;
  width: number;
  height: number;
}[] {
  const H = DECISIONS_ALBUM_HEADER,
    width = H.railWidth / scene.alternatives.length - H.gap;
  return scene.alternatives.map((alternative, index) => {
    const text = `${alternative.entry.identity.label} · ${alternative.entry.version}`;
    return {
      id: alternative.entry.identity.id,
      text,
      lines: businessLabelLines(text, width - 2 * H.padding, H.fontSize),
      x: H.left + index * (width + H.gap),
      y: H.top,
      width,
      height: H.height,
    };
  });
}
export function decisionAlbumHeadersFit(scene: UncertaintyAlbumScene): boolean {
  const H = DECISIONS_ALBUM_HEADER;
  return (
    scene.alternatives.length >= 2 &&
    scene.alternatives.length <= DECISIONS_LIMITS.alternatives &&
    decisionAlbumHeaders(scene).every(
      (header) =>
        header.lines.length <= H.maxLines &&
        header.lines.every(
          (line) => businessTextWidth(line, H.fontSize) <= header.width - 2 * H.padding,
        ),
    )
  );
}

export const DECISIONS_RAIL = {
  width: 952,
  height: 478,
  padding: 24,
  fontSize: 24,
  lineHeight: 29,
  bodyLines: 10,
  minimumPageSec: 1.5,
  finalHoldSec: 0.8,
} as const;
export function decisionLines(text: string): string[] {
  return businessLabelLines(
    text,
    DECISIONS_RAIL.width - 2 * DECISIONS_RAIL.padding,
    DECISIONS_RAIL.fontSize,
  );
}
export function decisionIdentities(scene: DecisionsScene): BusinessIdentity[] {
  switch (scene.preset) {
    case 'contingent-commitment':
      return [scene.owner, scene.commitment.identity, scene.action, scene.gate, scene.approver];
    case 'planned-observed':
      return [scene.owner, scene.task];
    case 'firms-functions-workers':
      return [scene.owner, ...scene.frames.map((frame) => frame.identity)];
    case 'original-and-surviving-cohorts':
      return [
        scene.owner,
        scene.original.identity,
        scene.surviving.identity,
        scene.attrition.identity,
      ];
    case 'alternatives-or-source-distribution':
      return [scene.owner, ...scene.alternatives.map((alternative) => alternative.entry.identity)];
  }
}
export function decisionRows(scene: DecisionsScene): DecisionRow[] {
  const rows: DecisionRow[] = [
    {
      id: 'identities',
      label: 'Source identities',
      state: 'source-named',
      text: decisionIdentities(scene)
        .map((identity) => identity.label)
        .join(' · '),
    },
  ];
  const add = (id: string, label: string, fact: { state: string; text: string }) =>
    rows.push({ id, label, state: fact.state, text: fact.text });
  switch (scene.preset) {
    case 'contingent-commitment':
      add(
        'commitment',
        `${scene.commitment.identity.label} · ${scene.commitment.version}`,
        scene.commitmentFact,
      );
      add('gate', 'Contingent gate', scene.gateFact);
      add('action', 'Action approval', scene.actionFact);
      break;
    case 'planned-observed':
      add('planned', 'Planned/configured — not observation', scene.planned);
      add('observed', 'Observation', scene.observed);
      break;
    case 'firms-functions-workers':
      for (const frame of scene.frames)
        add(
          `frame:${frame.identity.id}`,
          `${frame.frame} · ${frame.identity.label}`,
          frame.quantity,
        );
      break;
    case 'original-and-surviving-cohorts':
      add('original', `Original · ${scene.original.identity.label}`, scene.original.quantity);
      add('surviving', `Surviving · ${scene.surviving.identity.label}`, scene.surviving.quantity);
      add('attrition', `Attrition · ${scene.attrition.identity.label}`, scene.attrition.quantity);
      add('accounting', 'Cohort accounting', scene.accounting);
      break;
    case 'alternatives-or-source-distribution':
      for (const alternative of scene.alternatives) {
        const id = alternative.entry.identity.id;
        add(
          `alternative:${id}`,
          `${alternative.entry.identity.label} · ${alternative.entry.version}`,
          alternative.fact,
        );
        if (alternative.probability)
          add(`probability:${id}`, 'Source probability', {
            state: 'source-stated',
            text: alternative.probability.text,
          });
      }
      if (scene.distribution)
        add('distribution', 'Source distribution declaration', scene.distribution);
      break;
  }
  for (const native of scene.modelSource ?? [])
    add(`native:${native.asset}:${native.identityId}`, `Native illustration ${native.asset}`, {
      state: 'illustrative architecture',
      text: native.text,
    });
  add('evidence', 'Evidence', { state: scene.factEvidence.state, text: scene.outcome });
  if (scene.condition)
    add('condition', 'Source condition', { state: 'conditional', text: scene.condition });
  return rows;
}
export function decisionPages(scene: DecisionsScene): { rows: DecisionRow[]; lines: number }[] {
  const pages: { rows: DecisionRow[]; lines: number }[] = [];
  for (const row of decisionRows(scene)) {
    const lines =
      decisionLines(`${row.label} · ${row.state}`).length + decisionLines(row.text).length;
    const last = pages.at(-1);
    if (last && last.lines + lines <= DECISIONS_RAIL.bodyLines) {
      last.rows.push(row);
      last.lines += lines;
    } else pages.push({ rows: [row], lines });
  }
  return pages;
}
export function decisionReadingStart(scene: DecisionsScene): number {
  return scene.visualMode === 'diagram'
    ? scene.actionAt
    : scene.responseAt + Math.min(0.7, scene.checkAt - scene.responseAt);
}
export function decisionDetailWindows(
  scene: DecisionsScene,
): { page: { rows: DecisionRow[]; lines: number }; index: number; start: number; end: number }[] {
  const pages = decisionPages(scene),
    start = decisionReadingStart(scene);
  return pages.map((page, index) => ({
    page,
    index,
    start: start + ((scene.resolveAt - start) * index) / pages.length,
    end: start + ((scene.resolveAt - start) * (index + 1)) / pages.length,
  }));
}
export function decisionPageIndex(scene: DecisionsScene, seconds: number): number {
  let index = 0;
  if (!Number.isFinite(seconds)) return index;
  for (const window of decisionDetailWindows(scene))
    if (seconds >= window.start) index = window.index;
  return index;
}
export function decisionPresentationFits(scene: DecisionsScene, endTime: number): boolean {
  const pages = decisionPages(scene),
    start = decisionReadingStart(scene),
    R = DECISIONS_RAIL;
  return (
    Number.isFinite(endTime) &&
    (scene.preset !== 'alternatives-or-source-distribution' || decisionAlbumHeadersFit(scene)) &&
    endTime - scene.resolveAt >= R.finalHoldSec &&
    pages.length > 0 &&
    pages.length <= DECISIONS_LIMITS.pages &&
    (scene.resolveAt - start) / pages.length >= R.minimumPageSec &&
    diagramPose(start, scene).setup === 1 &&
    (scene.visualMode === 'diagram' || diagramPose(start, scene).diagramOpacity === 1) &&
    pages.every(
      (page) =>
        page.lines <= R.bodyLines &&
        page.rows.every((row) =>
          [row.text, `${row.label} · ${row.state}`].every((text) =>
            decisionLines(text).every(
              (line) => businessTextWidth(line, R.fontSize) <= R.width - 2 * R.padding,
            ),
          ),
        ),
    )
  );
}
