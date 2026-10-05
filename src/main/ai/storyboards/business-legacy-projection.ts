import { capitalDependencyFacts } from '../../remotion/compositions/explainer/business/capital/dependency-presentation';
import { capitalCards } from '../../remotion/compositions/explainer/business/capital/presentation';
import { businessAlternativeFacts } from '../../remotion/compositions/explainer/business/decisions/alternative-presentation';
import { economicsReadingCards } from '../../remotion/compositions/explainer/business/economics/readability';
import { fundsRows } from '../../remotion/compositions/explainer/business/funds/presentation';
import { marketsRows } from '../../remotion/compositions/explainer/business/markets/presentation';
import type { BusinessPanelProjection, BusinessStoryboardScene } from './business-diagrams';

/** Complete version-one native paragraphs, without modern grouping or concision. */
export function projectLegacyBusinessContent(
  scene: BusinessStoryboardScene,
): Pick<BusinessPanelProjection, 'title' | 'headings' | 'rows' | 'notes'> | undefined {
  const notes = [
    `Subject: ${scene.subject}`,
    `Outcome: ${scene.outcome}`,
    ...('evidence' in scene ? [`Evidence: ${scene.evidence}`] : []),
    ...(scene.condition ? [`Condition: ${scene.condition}`] : []),
  ];
  const base = { title: scene.label, notes };
  switch (scene.kind) {
    case 'procurement-commitment':
      return {
        ...base,
        headings: ['Source fact', 'Evidence state', 'Complete source text'],
        rows: marketsRows(scene).map((row) => ({
          id: row.id,
          cells: [row.label, row.state, row.text],
        })),
      };
    case 'operating-cost':
    case 'scale-economics':
    case 'value-capture':
      return {
        ...base,
        headings: ['Source quantity', 'Complete basis / state'],
        rows: economicsReadingCards(scene).map((card) => ({
          id: card.id,
          cells: [card.title, card.lines.join('; ')],
        })),
      };
    case 'fund-lifecycle':
    case 'distribution-waterfall':
    case 'fund-liquidity':
      return {
        ...base,
        headings: ['Capital state', 'Amount / qualifier', 'Period / denominator'],
        rows: fundsRows(scene).map((row) => ({ id: row.id, cells: [...row.cells] })),
      };
    case 'economic-rights':
    case 'capital-structure':
    case 'investment-outcomes':
      return {
        ...base,
        headings: ['Source claim', 'Complete rights / quantity / basis'],
        rows: capitalCards(scene).map((card) => ({
          id: card.id,
          cells: [card.title, card.lines.map((line) => line.text).join('; ')],
        })),
      };
    case 'portfolio-exposure':
      if (scene.preset !== 'shared-driver' || !scene.dependencyLens) return undefined;
      return {
        ...base,
        headings: ['Source dependency', 'Complete qualitative fact'],
        rows: capitalDependencyFacts(scene.funds, scene.exposure, scene.dependencyLens).map(
          (fact) => ({ id: fact.id, cells: [fact.kind, fact.text], focusIds: [...fact.entityIds] }),
        ),
      };
    case 'possible-futures':
      if (scene.preset !== 'branching-scenarios' || !scene.businessAlternatives) return undefined;
      return {
        ...base,
        headings: ['Same-baseline source record', 'Complete qualifier / context'],
        rows: businessAlternativeFacts(scene, scene.businessAlternatives).map((fact) => ({
          id: fact.id,
          cells: [fact.kind, fact.text],
          focusIds: [...fact.entityIds],
        })),
        notes: [...notes, scene.uncertainty],
      };
    default:
      return undefined;
  }
}
