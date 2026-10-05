import { formatMoney } from '../../finance/poses';
import type { AuthorityBusinessScene, AuthorityCost, AuthorityLimit } from './types';

export const AUTHORITY_BODY = {
  width: 952,
  height: 478,
  fontSize: 26,
  lineHeight: 30,
  columns: 28,
};
export const AUTHORITY_MIN_READING_HOLD = 1.5;
export interface AuthorityFact {
  label: string;
  value: string;
}
export interface AuthorityPanel {
  label: string;
  lines: string[];
}

function limitValue(limit: AuthorityLimit): string {
  const m = limit.measurement;
  const direction =
    limit.operator === 'at-most'
      ? 'Max'
      : limit.operator === 'at-least'
        ? 'Min'
        : 'Direction unknown';
  if (m.kind === 'unknown') return `${direction}: quantity unknown`;
  const value = m.kind === 'money' ? formatMoney(m.amount) : `${m.value} ${m.basis.unit}`;
  return `${direction} ${value} / ${m.basis.denominator ?? 'unknown'} ${m.basis.population} / ${m.basis.period}`;
}
function costValue(cost: AuthorityCost): string {
  return cost.state === 'unknown'
    ? 'Unknown'
    : `${formatMoney(cost.amount)} / ${cost.basis.denominator ?? 'unknown'} ${cost.basis.population} / ${cost.basis.period}`;
}
function actor(scene: AuthorityBusinessScene, id: string | null): string {
  return id === null
    ? 'No approver stated'
    : 'actors' in scene
      ? (scene.actors.find((entry) => entry.id === id)?.label ?? 'Unknown')
      : 'Unknown';
}
/** Compact authored claims; subject stays in the persistent header, evidence in DiagramChrome. */
export function authorityFacts(scene: AuthorityBusinessScene): AuthorityFact[] {
  if (scene.preset === 'permissions')
    return [
      ...scene.permissions.map((entry) => ({
        label: entry.action.label,
        value: `Ability ${entry.capability}; permission ${entry.permission}`,
      })),
      { label: 'Scope', value: scene.scope.label },
      { label: 'Expiry', value: scene.expiry.value ?? 'Unknown' },
    ];
  const action = { label: 'Action', value: scene.action.label };
  if (scene.preset === 'action-limits')
    return [
      action,
      { label: 'Ability / permission', value: `${scene.capability} / ${scene.permission}` },
      { label: 'Scope', value: scene.scope.label },
      { label: scene.actionCondition.label, value: scene.actionCondition.state },
      { label: 'Expiry', value: scene.expiry.value ?? 'Unknown' },
      ...scene.limits.map((entry) => ({ label: entry.label, value: limitValue(entry) })),
    ];
  if (scene.preset === 'exception-review' || scene.preset === 'accountable-transfer') {
    const roles = [
      action,
      { label: 'Performer', value: actor(scene, scene.roles.performerId) },
      { label: 'Approver', value: actor(scene, scene.roles.approverId) },
      { label: 'Accountable owner', value: actor(scene, scene.roles.accountableOwnerId) },
    ];
    return scene.preset === 'exception-review'
      ? [
          ...roles,
          { label: scene.exception.label, value: `Review ${scene.review.state}` },
          { label: 'Review cost', value: costValue(scene.reviewCost) },
          { label: 'Retry cost', value: costValue(scene.retryCost) },
        ]
      : [
          ...roles,
          {
            label: 'Transfer',
            value: `${actor(scene, scene.fromId)} to ${actor(scene, scene.toId)}; ${scene.transfer.state}`,
          },
        ];
  }
  if (scene.preset === 'declared-audit-chain')
    return [
      action,
      { label: 'Source record', value: `${scene.record.identity.label} / ${scene.record.version}` },
      ...scene.events.map((entry, index) => ({
        label: `${index + 1}: ${entry.label}`,
        value: `${actor(scene, entry.actorId)} ${entry.verb}`,
      })),
    ];
  if (scene.preset === 'action-consequences')
    return [
      action,
      { label: 'Performer', value: actor(scene, scene.performerId) },
      { label: 'Reversibility', value: scene.reversibility.state },
      { label: 'Consequence', value: `${scene.consequence.state}: ${scene.consequence.label}` },
    ];
  if (scene.preset === 'conflicting-limits')
    return [
      action,
      ...scene.requirements.map((entry) => ({ label: entry.label, value: limitValue(entry) })),
      { label: 'Collision', value: 'Unresolved conflict' },
    ];
  return [
    action,
    { label: 'Source policy', value: `${scene.policy.identity.label} / ${scene.policy.version}` },
    ...scene.conditions.map((entry) => ({
      label: entry.label,
      value: `${entry.state}; date ${entry.date.value ?? 'unknown'}`,
    })),
    { label: 'Relationship', value: scene.relationship.state },
  ];
}
export function authorityLines(text: string, columns: number): string[] {
  if (!Number.isInteger(columns) || columns < 1)
    throw new Error('Positive authored column width required');
  const lines: string[] = [];
  let rest = text;
  while (rest.length > columns) {
    const boundary = rest.lastIndexOf(' ', columns);
    const cut = boundary > 0 ? boundary : columns;
    lines.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  lines.push(rest);
  return lines;
}
export function authorityPages(facts: readonly AuthorityFact[]): AuthorityPanel[][] {
  const panels: AuthorityPanel[] = [];
  for (const fact of facts) {
    const lines = authorityLines(fact.value, 14);
    for (let from = 0; from < lines.length; from += 3)
      panels.push({ label: fact.label, lines: lines.slice(from, from + 3) });
  }
  const pages: AuthorityPanel[][] = [];
  for (let from = 0; from < panels.length; from += 2) pages.push(panels.slice(from, from + 2));
  return pages;
}
export function authorityStatus(scene: AuthorityBusinessScene): string {
  const subject = `${scene.subject} — `;
  if (scene.preset === 'permissions')
    return `${subject}Permission states: ${[...new Set(scene.permissions.map((entry) => entry.permission))].join(' / ')}. Ability is separate.`;
  if (scene.preset === 'action-limits')
    return `${subject}Ability ${scene.capability}; permission ${scene.permission}; condition ${scene.actionCondition.state}.`;
  if (scene.preset === 'exception-review')
    return `${subject}Declared review: ${scene.review.state}. Not completed monitoring.`;
  if (scene.preset === 'declared-audit-chain')
    return `${subject}Declared audit chain; not live telemetry.`;
  if (scene.preset === 'action-consequences')
    return `${subject}Source reversibility: ${scene.reversibility.state}. No legal interpretation.`;
  if (scene.preset === 'accountable-transfer')
    return `${subject}Declared transfer: ${scene.transfer.state}. Execution not evidenced.`;
  if (scene.preset === 'conflicting-limits')
    return `${subject}Incompatible requirements remain unresolved.`;
  return `${subject}Conditions: ${[...new Set(scene.conditions.map((condition) => condition.state))].join(' / ')}. Relationship ${scene.relationship.state}.`;
}
export function authorityDeclaration(scene: AuthorityBusinessScene): string {
  return scene.evidence === 'illustrative'
    ? 'Declared illustration, not telemetry'
    : 'Source-stated facts, not inferred execution';
}
export interface AuthorityLayout {
  header: string[];
  footer: string[];
  panelTop: number;
  footerTop: number;
  panelHeight: number;
}
/** Exactly the native Scene.tsx baselines/padding, including all persistent status lines. */
export function authorityLayout(status: string, declaration: string): AuthorityLayout {
  const header = authorityLines(status, AUTHORITY_BODY.columns);
  const footer = authorityLines(declaration, AUTHORITY_BODY.columns);
  const panelTop = header.length * AUTHORITY_BODY.lineHeight + 16;
  const footerTop = AUTHORITY_BODY.height - footer.length * AUTHORITY_BODY.lineHeight - 8;
  return { header, footer, panelTop, footerTop, panelHeight: footerTop - panelTop - 12 };
}
export interface AuthorityReadability {
  pages: AuthorityPanel[][];
  readingStart: number;
  secondsPerPage: number;
  requiredSeconds: number;
  layout: AuthorityLayout;
  issue: string | null;
}
/** Every fixed-font page gets >=1.5s AFTER DiagramChrome/HybridStage is fully visible. */
export function authorityReadability(scene: AuthorityBusinessScene): AuthorityReadability {
  const pages = authorityPages(authorityFacts(scene));
  const readingStart =
    scene.visualMode === 'hybrid'
      ? scene.responseAt + Math.min(0.7, scene.checkAt - scene.responseAt)
      : scene.setupAt + 0.35;
  const available = scene.resolveAt - readingStart;
  const requiredSeconds = pages.length * AUTHORITY_MIN_READING_HOLD;
  const secondsPerPage =
    pages.length > 0 && Number.isFinite(available) ? available / pages.length : 0;
  const layout = authorityLayout(authorityStatus(scene), authorityDeclaration(scene));
  const outsideRails =
    layout.panelHeight <= 0 ||
    pages.some(
      (page) =>
        page.length > 2 ||
        page.some((panel) => {
          const labels = authorityLines(panel.label, 14);
          // Same last value baseline as Scene + 8px descender allowance + 12px bottom padding.
          const requiredHeight =
            44 + (labels.length + panel.lines.length - 1) * AUTHORITY_BODY.lineHeight + 8 + 12;
          return (
            requiredHeight > layout.panelHeight ||
            panel.lines.length > 3 ||
            panel.lines.some((line) => line.length > 14)
          );
        }),
    );
  const textOutsideBody =
    (layout.header.length - 1) * AUTHORITY_BODY.lineHeight + 28 + 8 > layout.panelTop ||
    layout.footerTop + 24 + (layout.footer.length - 1) * AUTHORITY_BODY.lineHeight + 8 >
      AUTHORITY_BODY.height;
  const issue =
    outsideRails || textOutsideBody
      ? 'authority status/detail text exceeds native fixed-font rails; split the source scene'
      : !pages.length ||
          !Number.isFinite(readingStart) ||
          !Number.isFinite(available) ||
          secondsPerPage < AUTHORITY_MIN_READING_HOLD
        ? `authority detail reading needs ${requiredSeconds.toFixed(1)}s after full ${scene.visualMode} visibility and before resolveAt; split the source scene`
        : null;
  return { pages, readingStart, secondsPerPage, requiredSeconds, layout, issue };
}
