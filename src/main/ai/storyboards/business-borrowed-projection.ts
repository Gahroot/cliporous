import { capitalDependencyFacts } from '../../remotion/compositions/explainer/business/capital/dependency-presentation';
import { BUSINESS_ALTERNATIVE_SCOPE } from '../../remotion/compositions/explainer/business/decisions/alternative-presentation';
import type { PossibleFuturesScene } from '../../remotion/compositions/explainer/concepts/perspective/types';
import type { PortfolioExposureScene } from '../../remotion/compositions/explainer/finance/types';

export interface BorrowedPanelContent {
  headings: string[];
  rows: { id: string; cells: string[] }[];
  notes: string[];
}

/** Fail closed rather than truncate native field bytes or silently normalize source text. */
function bounded(content: BorrowedPanelContent): BorrowedPanelContent {
  const paragraphs = [
    ...content.headings,
    ...content.rows.flatMap((row) => row.cells),
    ...content.notes,
  ];
  if (
    content.rows.length > 4 ||
    paragraphs.some((text) =>
      [...text].some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      ),
    ) ||
    content.rows.some((row) => row.cells.join(' · ').length > 512) ||
    content.notes.some((note) => note.length > 512)
  )
    throw new Error('Borrowed native content exceeds its complete paragraph budget');
  return content;
}

/** Each directed source chain stays in one row; the driver is displayed once, not reworded. */
export function projectCapitalDependency(scene: PortfolioExposureScene): BorrowedPanelContent {
  const lens = scene.dependencyLens;
  if (!lens) throw new Error('Source lacks dependency lens');
  const facts = capitalDependencyFacts(scene.funds, scene.exposure, lens);
  return bounded({
    headings: ['Fund holds → Company depends on → Common driver'],
    rows: scene.funds.map((fund) => {
      const firm = lens.firms.find((entry) => entry.fundId === fund.id);
      if (!firm) throw new Error('Source lacks held company');
      return {
        id: `${fund.id}:holds:${firm.identity.id}`,
        cells: [
          `Fund ${fund.label} holds → Company ${firm.identity.label} depends on → common driver`,
        ],
      };
    }),
    notes: [
      `Common driver: ${scene.exposure.label}.`,
      'Funds maintain asset ownership and economic claim records.',
      ...facts.filter((fact) => fact.kind === 'scope').map((fact) => fact.text),
      ...(scene.condition === undefined ? [] : [`Condition: ${scene.condition}`]),
    ],
  });
}

/** Shared actual context once; source alternatives remain illustrative and unresolved. */
export function projectBusinessAlternatives(scene: PossibleFuturesScene): BorrowedPanelContent {
  const lens = scene.businessAlternatives;
  if (!lens) throw new Error('Source lacks business alternatives');
  const b = lens.baseline;
  return bounded({
    headings: [
      'Alternative',
      'Illustrative operating-unit record',
      'Qualitative capacity',
      'Condition',
    ],
    rows: scene.alternatives.map((alternative) => {
      const record = lens.records.find((entry) => entry.alternativeId === alternative.id);
      if (!record) throw new Error('Source lacks alternative record');
      if (
        record.baselineId !== b.identity.id ||
        record.subjectId !== b.subject.id ||
        record.period !== b.period ||
        record.revision !== b.revision
      ) {
        throw new Error('Alternative record differs from shared actual baseline');
      }
      return {
        id: `record:${record.identity.id}`,
        cells: [
          alternative.label,
          record.identity.label,
          alternative.change,
          alternative.qualifier,
        ],
      };
    }),
    notes: [
      `Actual baseline: ${b.subject.label}; ${b.identity.label}; period: ${b.period}; revision: ${b.revision}.`,
      `Evidence: ${lens.evidence.label}; ${lens.evidence.state}.`,
      ...(lens.native
        ? ['Baseline subject maintains these illustrative operating-unit records.']
        : []),
      BUSINESS_ALTERNATIVE_SCOPE,
      scene.uncertainty,
      ...(scene.condition === undefined ? [] : [`Condition: ${scene.condition}`]),
    ],
  });
}
