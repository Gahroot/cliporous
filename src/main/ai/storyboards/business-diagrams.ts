import {
  BUSINESS_EXPLANATION_KINDS,
  type BusinessExplanationKind,
  type BusinessIdentityRole,
} from '../../../shared/business-explanation-source';
import { STORYBOARD_LIMITS, type StoryboardResult } from '../../../shared/storyboards';
import {
  authorityDeclaration,
  authorityFacts,
  authorityStatus,
} from '../../remotion/compositions/explainer/business/authority/readability';
import { capitalCards } from '../../remotion/compositions/explainer/business/capital/presentation';
import { commercialTable } from '../../remotion/compositions/explainer/business/commercial/presentation';
import { decisionRows } from '../../remotion/compositions/explainer/business/decisions/presentation';
import { economicsReadingCards } from '../../remotion/compositions/explainer/business/economics/readability';
import {
  fundsBasisText,
  fundsRows,
} from '../../remotion/compositions/explainer/business/funds/presentation';
import { fundsAmounts } from '../../remotion/compositions/explainer/business/funds/types';
import { infrastructureRows } from '../../remotion/compositions/explainer/business/infrastructure/presentation';
import { marketsRows } from '../../remotion/compositions/explainer/business/markets/presentation';
import { organizationPresentation } from '../../remotion/compositions/explainer/business/organization/presentation';
import type { BusinessWordSpan } from '../../remotion/compositions/explainer/business/types';
import { workTable } from '../../remotion/compositions/explainer/business/work/presentation';
import { formatMoney } from '../../remotion/compositions/explainer/finance/poses';
import type { ExplainerScene } from '../../remotion/compositions/explainer/types';
import {
  projectBusinessAlternatives,
  projectCapitalDependency,
} from './business-borrowed-projection';
import { projectFinancialReadingCards } from './business-financial-projection';
import { businessExplanationIdentities } from './business-identities';
import { projectLegacyBusinessContent } from './business-legacy-projection';
import { businessParagraphGroups } from './business-paragraph-groups';
import { projectEconomicRights } from './business-rights-projection';
import { BOARD_LAYOUT } from './catalog';

export type BusinessStoryboardScene = Extract<ExplainerScene, { kind: BusinessExplanationKind }>;
export function isBusinessStoryboardScene(scene: ExplainerScene): scene is BusinessStoryboardScene {
  return BUSINESS_EXPLANATION_KINDS.some((kind) => kind === scene.kind);
}
export interface BusinessPanelIdentity {
  id: string;
  label: string;
  /** Empty for legacy captions which the parsed scene cannot bind to a source identity. */
  roles: readonly BusinessIdentityRole[];
  source: BusinessWordSpan | null;
  version?: string;
}
export interface BusinessPanelProjection {
  sourceVersion?: 1 | 2;
  title: string;
  headings: readonly string[];
  rows: readonly { id: string; cells: readonly string[]; focusIds?: readonly string[] }[];
  /** Exact, code-authored paragraph membership; never admitted from saved source choices. */
  layoutGroups?: readonly { id: string; rowIds: readonly string[] }[];
  notes: readonly string[];
  identities: readonly BusinessPanelIdentity[];
  resources: {
    identities: number;
    /** Text blocks only; compilation must additionally count backgrounds/decorations. */
    textElements: number;
    /** No drawn edges/models. Native relationship caps remain the real parser's responsibility. */
    diagramEdges: 0;
    modelMeshes: 0;
    /** No readability claim before authored layout on the actual storyboard rails. */
    layoutRequired: true;
  };
}
export const BUSINESS_PANEL_LAYOUT_CONSTRAINTS = Object.freeze({
  panelWidth: BOARD_LAYOUT.panelWidth,
  panelHeight: BOARD_LAYOUT.panelHeight,
  inset: BOARD_LAYOUT.inset,
  minFontSize: 30,
  maxEntities: 8,
  maxRelationships: 12,
  maxElements: 48,
  maxPanels: 5,
  maxMeshes: 180,
});
function failure(message: string): StoryboardResult<never> {
  return { ok: false, diagnostics: [{ code: 'budget', message, repairable: true }] };
}
type Content = Omit<BusinessPanelProjection, 'identities' | 'resources'>;

/** Each grammar selects its complete native facts; no recursive scanning or drawing directives. */
function authored(scene: BusinessStoryboardScene): Content | null {
  const notes = [
    `Subject: ${scene.subject}`,
    `Outcome: ${scene.outcome}`,
    ...(scene.condition ? [`Condition: ${scene.condition}`] : []),
    ...('evidence' in scene ? [`Evidence: ${scene.evidence}`] : []),
  ];
  const base = { title: scene.label, notes };
  switch (scene.kind) {
    case 'task-map':
    case 'coordination-map':
    case 'work-redesign': {
      const table = workTable(scene);
      return { ...base, ...table, notes: [...notes, ...table.notes] };
    }
    case 'delegation-scope':
    case 'authority-handoff':
    case 'constraint-check':
      return {
        ...base,
        headings: ['Source fact', 'Declared state / value'],
        rows: authorityFacts(scene).map((fact, slot) => ({
          id: `authority:${slot}`,
          cells: [fact.label, fact.value],
        })),
        notes: [...notes, authorityStatus(scene), authorityDeclaration(scene)],
      };
    case 'business-blueprint':
    case 'business-replication': {
      const table = commercialTable(scene);
      return { ...base, ...table, notes: [...notes, ...table.notes] };
    }
    case 'organization-map':
    case 'system-reconciliation': {
      const table = organizationPresentation(scene);
      return {
        ...base,
        headings: table.columns,
        rows: table.rows.map((row) => ({ id: row.id, cells: [...row.cells] })),
      };
    }
    case 'operating-cost':
    case 'scale-economics':
    case 'value-capture': {
      const table = projectFinancialReadingCards(economicsReadingCards(scene));
      return {
        ...base,
        headings: table.headings,
        rows: table.rows,
        notes: [...notes, ...table.notes],
      };
    }
    case 'market-dependency':
      return {
        ...base,
        headings: ['Source fact', 'Evidence state', 'Complete source text'],
        rows: marketsRows(scene).map((row) => ({
          id: row.id,
          cells: [row.label, row.state, row.text],
        })),
      };
    case 'procurement-commitment':
      return {
        ...base,
        headings: ['Role/fact', 'State', 'Detail'],
        rows: marketsRows(scene)
          .filter(
            (row) =>
              row.id !== 'identities' ||
              !scene.actors.every((actor) =>
                Object.values(scene.roles).some((assignment) => assignment.actorId === actor.id),
              ),
          )
          .map((row) => {
            const role = (['requester', 'delegate', 'approver', 'payee'] as const).find(
              (candidate) => row.id === `role-${candidate}`,
            );
            if (role) {
              const actorId = scene.roles[role].actorId;
              const actor = scene.actors.find((candidate) => candidate.id === actorId);
              // Parsing admits complete affirmative assignments or explicit unknown roles only.
              // State their common task/item once; monetary values retain exact native bases.
              return {
                id: row.id,
                cells: [
                  role,
                  actorId === null ? 'unknown' : 'source-stated',
                  actor?.label ?? 'Unknown',
                ],
              };
            }
            const actorLabel = (role: 'requester' | 'delegate' | 'approver' | 'payee'): string =>
              scene.actors.find((actor) => actor.id === scene.roles[role].actorId)?.label ??
              'Unknown';
            // Only affirmative, unqualified clauses use the already source-validated role edges.
            // Non-affirmative action wording stays complete; monetary states/conditions remain explicit.
            const money =
              row.id === 'quote' ? scene.quote : row.id === 'payment' ? scene.payment : undefined;
            const monetary = money
              ? `${row.id === 'quote' ? `${actorLabel('payee')}→${actorLabel('requester')}` : `${actorLabel('requester')}→${actorLabel('payee')}`} ${money.identity.label}: ${money.amount ? formatMoney(money.amount) : 'Amount unknown'}; ${money.basis ? `${money.amount?.currency === money.basis.unit ? '' : `${money.basis.unit} `}per ${money.basis.denominator ?? 'unknown'} ${money.basis.population}; ${money.basis.period}` : 'Basis unknown'}`
              : undefined;
            const text =
              monetary ??
              (row.id === 'request' && scene.request.state === 'requested'
                ? `${actorLabel('requester')}→${actorLabel('delegate')}`
                : row.id === 'authority' && scene.authority.state === 'granted'
                  ? `${actorLabel('approver')}→${actorLabel('delegate')}`
                  : row.id === 'acceptance' && scene.acceptance.state === 'accepted'
                    ? `${actorLabel('requester')}→${scene.quote.identity.label}`
                    : row.text);
            return { id: row.id, cells: [row.label, row.state, text] };
          }),
        notes: [...notes, `Task: ${scene.task.label} · item: ${scene.item.label}`],
      };
    case 'fund-lifecycle':
    case 'distribution-waterfall':
    case 'fund-liquidity': {
      const amounts = fundsAmounts(scene);
      const first = amounts[0];
      const basis = first ? fundsBasisText(first) : undefined;
      const rows = fundsRows(scene);
      const sharedBasis =
        basis &&
        amounts.every(
          (amount) =>
            amount.basis.subjectId === first?.basis.subjectId && fundsBasisText(amount) === basis,
        ) &&
        rows.every((row) => row.cells[2] === basis || row.cells[2] === `${basis}; ${basis}`);
      return {
        ...base,
        headings: sharedBasis
          ? ['Account', 'Value / status']
          : ['Account', 'Value / status', 'Basis'],
        rows: rows.map((row) => ({
          id: row.id,
          cells: sharedBasis ? row.cells.slice(0, 2) : [...row.cells],
        })),
        notes: sharedBasis ? [...notes, `Shared basis: ${basis}`] : notes,
      };
    }
    case 'economic-rights': {
      const table = projectEconomicRights(scene);
      const distinctNotes = notes.filter(
        (note) => !(scene.subject === scene.company.label && note === `Subject: ${scene.subject}`),
      );
      return { ...base, ...table, notes: [...distinctNotes, ...table.notes] };
    }
    case 'capital-structure':
    case 'investment-outcomes': {
      const table = projectFinancialReadingCards(capitalCards(scene));
      return {
        ...base,
        headings: table.headings,
        rows: table.rows,
        notes: [...notes, ...table.notes],
      };
    }
    case 'capacity-map':
    case 'operating-lineage':
      return {
        ...base,
        headings: ['Source fact', 'Evidence state', 'Complete source text'],
        rows: infrastructureRows(scene).map((row) => ({
          id: row.id,
          cells: [row.label, row.state, row.text],
        })),
      };
    case 'staged-decision':
    case 'measurement-frame':
    case 'uncertainty-album':
      return {
        ...base,
        headings: ['Source fact', 'Evidence state', 'Complete source text'],
        rows: decisionRows(scene).map((row) => ({
          id: row.id,
          cells: [row.label, row.state, row.text],
        })),
      };
    case 'agent-workflow':
      if (scene.preset !== 'approval-gate') return null;
      return {
        ...base,
        headings: ['Source approval path', 'Validated terminal fact'],
        rows: [
          { id: 'task', cells: ['Source task', scene.subject] },
          { id: 'tool', cells: ['Tool', scene.toolLabel] },
          { id: 'check', cells: ['Result check', 'Passed'] },
          { id: 'approval', cells: ['Human approval', 'Granted'] },
          { id: 'result', cells: ['Task completion', scene.outcome] },
        ],
        notes: [
          ...notes,
          'Source-validated approval path; not telemetry. Permission and task completion are separate.',
        ],
      };
    case 'portfolio-exposure':
      if (scene.preset !== 'shared-driver' || !scene.dependencyLens) return null;
      {
        const table = projectCapitalDependency(scene);
        return { ...base, ...table, notes: [...notes, ...table.notes] };
      }
    case 'possible-futures':
      if (scene.preset !== 'branching-scenarios' || !scene.businessAlternatives) return null;
      {
        const table = projectBusinessAlternatives(scene);
        const distinctNotes = notes.filter(
          (note) =>
            !(
              scene.subject === scene.businessAlternatives?.baseline.subject.label &&
              note === `Subject: ${scene.subject}`
            ) && !(scene.condition && note === `Condition: ${scene.condition}`),
        );
        return { ...base, ...table, notes: [...distinctNotes, ...table.notes] };
      }
  }
}
function identities(scene: BusinessStoryboardScene): BusinessPanelIdentity[] {
  if (scene.kind === 'agent-workflow') {
    // Raw selectors are unavailable to the frozen scene-only API. These are unlinked captions;
    // the adapter owns independently source-bound actor/task/tool slots and their typed roles.
    return [
      { id: 'task', label: scene.subject, roles: [], source: null },
      { id: 'tool', label: scene.toolLabel, roles: [], source: null },
    ];
  }
  const entries: BusinessPanelIdentity[] = businessExplanationIdentities(scene).map((entry) => ({
    id: entry.identity.id,
    label: entry.identity.label,
    roles: [...entry.roles],
    source: { ...entry.identity.source },
    ...(entry.version === undefined ? {} : { version: entry.version }),
  }));
  if (scene.kind === 'portfolio-exposure')
    entries.push(
      ...[...scene.funds, scene.exposure].map((entry) => ({
        id: entry.id,
        label: entry.label,
        roles: [],
        source: null,
      })),
    );
  if (scene.kind === 'possible-futures')
    entries.push(
      ...scene.alternatives.map((entry) => ({
        id: entry.id,
        label: entry.label,
        roles: [],
        source: null,
      })),
    );
  return entries;
}

/** Full facts only. Authored board layout MUST establish >=30px fit and aggregate budgets. */
export function businessPanelProjection(
  scene: BusinessStoryboardScene,
  sourceVersion: 1 | 2 = 2,
): StoryboardResult<BusinessPanelProjection> {
  let content: Content | null;
  try {
    content =
      (sourceVersion === 1 ? projectLegacyBusinessContent(scene) : undefined) ?? authored(scene);
  } catch {
    return failure(
      'Complete native facts exceed the bounded authored presentation or lack valid source relationships',
    );
  }
  if (!content)
    return failure('Unsupported native preset or missing independently source-bound opt-in lens');
  let entries: BusinessPanelIdentity[];
  try {
    entries = identities(scene);
  } catch {
    return failure(
      'Native concrete identity vocabulary is incomplete or has conflicting source IDs',
    );
  }
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length)
    return failure('Native semantic ID collision');
  if (entries.length > BUSINESS_PANEL_LAYOUT_CONSTRAINTS.maxEntities)
    return failure('Explanation exceeds the unchanged eight-entity native ceiling');
  const textElements =
    1 +
    content.headings.length +
    content.notes.length +
    content.rows.reduce((count, row) => count + row.cells.length, 0);
  if (textElements > BUSINESS_PANEL_LAYOUT_CONSTRAINTS.maxElements)
    return failure(
      'Complete fact text alone exceeds the unchanged 48-element board ceiling; split the source board',
    );
  return {
    ok: true,
    value: {
      ...content,
      sourceVersion,
      ...(sourceVersion === 2 && content.rows.length > STORYBOARD_LIMITS.maxItems
        ? { layoutGroups: businessParagraphGroups(content.rows) }
        : {}),
      headings: [...content.headings],
      rows: content.rows.map((row) => ({
        ...row,
        cells: [...row.cells],
        ...(row.focusIds ? { focusIds: [...row.focusIds] } : {}),
      })),
      notes: [...content.notes],
      identities: entries,
      resources: {
        identities: entries.length,
        textElements,
        diagramEdges: 0,
        modelMeshes: 0,
        layoutRequired: true,
      },
    },
  };
}
