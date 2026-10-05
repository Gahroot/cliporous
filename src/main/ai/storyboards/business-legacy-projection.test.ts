import { describe, expect, it } from 'vitest';
import { capitalDependencyFacts } from '../../remotion/compositions/explainer/business/capital/dependency-presentation';
import { capitalCards } from '../../remotion/compositions/explainer/business/capital/presentation';
import { businessAlternativeFacts } from '../../remotion/compositions/explainer/business/decisions/alternative-presentation';
import { economicsReadingCards } from '../../remotion/compositions/explainer/business/economics/readability';
import { fundsRows } from '../../remotion/compositions/explainer/business/funds/presentation';
import { marketsRows } from '../../remotion/compositions/explainer/business/markets/presentation';
import { businessSourceFixtures } from '../../remotion/compositions/explainer/business/source-fixtures';
import { parseLongformSceneSpec } from '../explainer-scenes';
import { isBusinessStoryboardScene } from './business-diagrams';
import { projectLegacyBusinessContent } from './business-legacy-projection';

describe('version-one native business content', () => {
  it.each(businessSourceFixtures())('$fixtureId preserves complete helper bytes', (fixture) => {
    const planned = parseLongformSceneSpec(fixture.raw, fixture.words, {
      clipStart: 0,
      clipEnd: 90,
    });
    expect(planned).not.toBeNull();
    if (!planned || !isBusinessStoryboardScene(planned.scene)) throw new Error('Fixture rejected');
    const scene = planned.scene;
    const before = structuredClone(scene);
    const content = projectLegacyBusinessContent(scene);
    let headings: string[];
    let rows: { id: string; cells: readonly string[]; focusIds?: readonly string[] }[];
    const notes = [
      `Subject: ${scene.subject}`,
      `Outcome: ${scene.outcome}`,
      ...('evidence' in scene ? [`Evidence: ${scene.evidence}`] : []),
      ...(scene.condition ? [`Condition: ${scene.condition}`] : []),
    ];
    switch (scene.kind) {
      case 'procurement-commitment':
        headings = ['Source fact', 'Evidence state', 'Complete source text'];
        rows = marketsRows(scene).map((r) => ({ id: r.id, cells: [r.label, r.state, r.text] }));
        break;
      case 'operating-cost':
      case 'scale-economics':
      case 'value-capture':
        headings = ['Source quantity', 'Complete basis / state'];
        rows = economicsReadingCards(scene).map((r) => ({
          id: r.id,
          cells: [r.title, r.lines.join('; ')],
        }));
        break;
      case 'fund-lifecycle':
      case 'distribution-waterfall':
      case 'fund-liquidity':
        headings = ['Capital state', 'Amount / qualifier', 'Period / denominator'];
        rows = fundsRows(scene).map((row) => ({ id: row.id, cells: [...row.cells] }));
        break;
      case 'economic-rights':
      case 'capital-structure':
      case 'investment-outcomes':
        headings = ['Source claim', 'Complete rights / quantity / basis'];
        rows = capitalCards(scene).map((r) => ({
          id: r.id,
          cells: [r.title, r.lines.map((line) => line.text).join('; ')],
        }));
        break;
      case 'portfolio-exposure': {
        if (scene.preset !== 'shared-driver' || !scene.dependencyLens)
          throw new Error('Unregistered fixture');
        headings = ['Source dependency', 'Complete qualitative fact'];
        rows = capitalDependencyFacts(scene.funds, scene.exposure, scene.dependencyLens).map(
          (f) => ({ id: f.id, cells: [f.kind, f.text], focusIds: f.entityIds }),
        );
        const unregistered = structuredClone(scene);
        unregistered.dependencyLens = undefined;
        expect(projectLegacyBusinessContent(unregistered)).toBeUndefined();
        break;
      }
      case 'possible-futures': {
        if (scene.preset !== 'branching-scenarios' || !scene.businessAlternatives)
          throw new Error('Unregistered fixture');
        headings = ['Same-baseline source record', 'Complete qualifier / context'];
        rows = businessAlternativeFacts(scene, scene.businessAlternatives).map((f) => ({
          id: f.id,
          cells: [f.kind, f.text],
          focusIds: f.entityIds,
        }));
        notes.push(scene.uncertainty);
        const unregistered = structuredClone(scene);
        unregistered.businessAlternatives = undefined;
        expect(projectLegacyBusinessContent(unregistered)).toBeUndefined();
        break;
      }
      default:
        expect(content).toBeUndefined();
        expect(scene).toEqual(before);
        return;
    }
    expect(content).toEqual({ title: scene.label, headings, rows, notes });
    expect(JSON.stringify(content?.rows)).toBe(JSON.stringify(rows));
    expect(scene).toEqual(before);
  });
});
