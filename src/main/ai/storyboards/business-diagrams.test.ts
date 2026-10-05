import { describe, expect, it } from 'vitest';
import { BUSINESS_EXPLANATION_KINDS } from '../../../shared/business-explanation-source';
import { authorityFacts } from '../../remotion/compositions/explainer/business/authority/readability';
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
import {
  type BusinessSourceFixture,
  businessSourceFixture,
  businessSourceFixtures,
} from '../../remotion/compositions/explainer/business/source-fixtures';
import { workTable } from '../../remotion/compositions/explainer/business/work/presentation';
import { formatMoney } from '../../remotion/compositions/explainer/finance/poses';
import { parsePlanWithDiagnostics } from '../explainer-scenes';
import {
  projectBusinessAlternatives,
  projectCapitalDependency,
} from './business-borrowed-projection';
import {
  BUSINESS_PANEL_LAYOUT_CONSTRAINTS,
  type BusinessStoryboardScene,
  businessPanelProjection,
} from './business-diagrams';
import {
  projectFinancialReadingCards,
  reconstructFinancialReadingCards,
} from './business-financial-projection';
import { businessExplanationIdentities } from './business-identities';
import { projectEconomicRights } from './business-rights-projection';
import { BOARD_LAYOUT } from './catalog';

const sources = businessSourceFixtures();
function sourceById(id: string): BusinessSourceFixture {
  const found = sources.find((source) => source.id === id);
  if (!found) throw new Error(`Missing authored source ${id}`);
  return found;
}
function native(source: BusinessSourceFixture): BusinessStoryboardScene {
  const parsed = parsePlanWithDiagnostics(
    { scenes: [{ ...source.raw, layout: 'stack' }] },
    source.words,
    { minStart: 0, maxEnd: 90 },
  );
  expect(parsed.rejected).toEqual([]);
  expect(parsed.omitted).toEqual([]);
  expect(parsed.accepted).toHaveLength(1);
  const scene = parsed.accepted[0].scene;
  if (!BUSINESS_EXPLANATION_KINDS.some((kind) => kind === scene.kind))
    throw new Error('Fixture escaped the business source allowlist');
  // The real parser's source fixture index fixes the allowlisted kind, not a scene construction mock.
  return scene as BusinessStoryboardScene;
}
function freeze(value: unknown): void {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
}
function rows(scene: BusinessStoryboardScene): readonly (readonly string[])[] {
  switch (scene.kind) {
    case 'task-map':
    case 'coordination-map':
    case 'work-redesign':
      return workTable(scene).rows.map((row) => row.cells);
    case 'delegation-scope':
    case 'authority-handoff':
    case 'constraint-check':
      return authorityFacts(scene).map((fact) => [fact.label, fact.value]);
    case 'business-blueprint':
    case 'business-replication':
      return commercialTable(scene).rows.map((row) => row.cells);
    case 'organization-map':
    case 'system-reconciliation':
      return organizationPresentation(scene).rows.map((row) => row.cells);
    case 'operating-cost':
    case 'scale-economics':
    case 'value-capture':
      return projectFinancialReadingCards(economicsReadingCards(scene)).rows.map(
        (row) => row.cells,
      );
    case 'market-dependency':
      return marketsRows(scene).map((row) => [row.label, row.state, row.text]);
    case 'procurement-commitment': {
      const actorLabel = (role: 'requester' | 'delegate' | 'approver' | 'payee'): string =>
        scene.actors.find((actor) => actor.id === scene.roles[role].actorId)?.label ?? 'Unknown';
      return marketsRows(scene)
        .filter(
          (row) =>
            row.id !== 'identities' ||
            !scene.actors.every((actor) =>
              Object.values(scene.roles).some((assignment) => assignment.actorId === actor.id),
            ),
        )
        .map((row) => {
          const role = (['requester', 'delegate', 'approver', 'payee'] as const).find(
            (entry) => row.id === `role-${entry}`,
          );
          if (role) {
            const actorId = scene.roles[role].actorId;
            return [
              role,
              actorId === null ? 'unknown' : 'source-stated',
              scene.actors.find((actor) => actor.id === actorId)?.label ?? 'Unknown',
            ];
          }
          const money =
            row.id === 'quote' ? scene.quote : row.id === 'payment' ? scene.payment : undefined;
          const text = money
            ? `${row.id === 'quote' ? `${actorLabel('payee')}→${actorLabel('requester')}` : `${actorLabel('requester')}→${actorLabel('payee')}`} ${money.identity.label}: ${money.amount ? formatMoney(money.amount) : 'Amount unknown'}; ${money.basis ? `${money.amount?.currency === money.basis.unit ? '' : `${money.basis.unit} `}per ${money.basis.denominator ?? 'unknown'} ${money.basis.population}; ${money.basis.period}` : 'Basis unknown'}`
            : row.id === 'request' && scene.request.state === 'requested'
              ? `${actorLabel('requester')}→${actorLabel('delegate')}`
              : row.id === 'authority' && scene.authority.state === 'granted'
                ? `${actorLabel('approver')}→${actorLabel('delegate')}`
                : row.id === 'acceptance' && scene.acceptance.state === 'accepted'
                  ? `${actorLabel('requester')}→${scene.quote.identity.label}`
                  : row.text;
          return [row.label, row.state, text];
        });
    }
    case 'fund-lifecycle':
    case 'distribution-waterfall':
    case 'fund-liquidity':
      return fundsRows(scene).map((row) => {
        const amounts = fundsAmounts(scene);
        const basis = amounts[0] ? fundsBasisText(amounts[0]) : undefined;
        const shared =
          basis &&
          amounts.every(
            (amount) =>
              amount.basis.subjectId === amounts[0].basis.subjectId &&
              fundsBasisText(amount) === basis,
          ) &&
          fundsRows(scene).every(
            (record) => record.cells[2] === basis || record.cells[2] === `${basis}; ${basis}`,
          );
        return shared ? row.cells.slice(0, 2) : [...row.cells];
      });
    case 'economic-rights':
      return projectEconomicRights(scene).rows.map((row) => row.cells);
    case 'capital-structure':
    case 'investment-outcomes':
      return projectFinancialReadingCards(capitalCards(scene)).rows.map((row) => row.cells);
    case 'capacity-map':
    case 'operating-lineage':
      return infrastructureRows(scene).map((row) => [row.label, row.state, row.text]);
    case 'staged-decision':
    case 'measurement-frame':
    case 'uncertainty-album':
      return decisionRows(scene).map((row) => [row.label, row.state, row.text]);
    case 'portfolio-exposure': {
      if (!scene.dependencyLens) throw new Error('No source lens');
      return projectCapitalDependency(scene).rows.map((row) => row.cells);
    }
    case 'possible-futures': {
      if (!scene.businessAlternatives) throw new Error('No source snapshot');
      return projectBusinessAlternatives(scene).rows.map((row) => row.cells);
    }
    case 'agent-workflow':
      return [
        ['Source task', scene.subject],
        ['Tool', scene.toolLabel],
        ['Result check', 'Passed'],
        ['Human approval', 'Granted'],
        ['Task completion', scene.outcome],
      ];
  }
}

describe('Step26 pure authored business diagram projection (not native media proof)', () => {
  it('real fixture index covers all 80 recipes, 29 scoped kinds and every authored preset/mode', () => {
    expect(sources).toHaveLength(152);
    expect(new Set(sources.map((source) => source.id)).size).toBe(80);
    expect([...new Set(sources.map((source) => native(source).kind))].sort()).toEqual(
      [...BUSINESS_EXPLANATION_KINDS].sort(),
    );
  });
  it.each(
    sources,
  )('$fixtureId: complete native facts, quantities, bases, conditions and immutable deterministic projection', (source) => {
    const scene = native(source);
    const before = JSON.stringify(scene);
    freeze(scene);
    const result = businessPanelProjection(scene);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.value.title).toBe(scene.label);
    expect(result.value.rows.map((row) => row.cells)).toEqual(rows(scene));
    if (
      scene.kind === 'operating-cost' ||
      scene.kind === 'scale-economics' ||
      scene.kind === 'value-capture'
    ) {
      const cards = economicsReadingCards(scene);
      expect(reconstructFinancialReadingCards(projectFinancialReadingCards(cards))).toEqual(cards);
    }
    if (
      scene.kind === 'economic-rights' ||
      scene.kind === 'capital-structure' ||
      scene.kind === 'investment-outcomes'
    ) {
      const cards = capitalCards(scene);
      expect(reconstructFinancialReadingCards(projectFinancialReadingCards(cards))).toEqual(
        cards.map((card) => ({
          id: card.id,
          title: card.title,
          lines: card.lines.map((line) => line.text),
        })),
      );
    }
    if (
      scene.kind === 'fund-lifecycle' ||
      scene.kind === 'distribution-waterfall' ||
      scene.kind === 'fund-liquidity'
    ) {
      for (const [index, original] of fundsRows(scene).entries()) {
        expect(result.value.rows[index].cells.slice(0, 2)).toEqual(original.cells.slice(0, 2));
        if (result.value.rows[index].cells[2] !== undefined)
          expect(result.value.rows[index].cells[2]).toBe(original.cells[2]);
        else {
          const basis = result.value.notes
            .find((note) => note.startsWith('Shared basis: '))
            ?.slice('Shared basis: '.length);
          expect(basis).toBeDefined();
          expect([basis, `${basis}; ${basis}`]).toContain(original.cells[2]);
        }
      }
    }
    expect(result.value.notes).toContain(`Outcome: ${scene.outcome}`);
    if (scene.condition) expect(result.value.notes).toContain(`Condition: ${scene.condition}`);
    expect(new Set(result.value.identities.map((entry) => entry.id)).size).toBe(
      result.value.identities.length,
    );
    expect(result.value.identities.length).toBeLessThanOrEqual(8);
    if (scene.kind !== 'agent-workflow') {
      const expected = businessExplanationIdentities(scene).map((entry) => ({
        id: entry.identity.id,
        label: entry.identity.label,
        roles: entry.roles,
        source: entry.identity.source,
        ...(entry.version === undefined ? {} : { version: entry.version }),
      }));
      expect(result.value.identities.filter((entry) => entry.source)).toEqual(expected);
    }
    expect(result.value.resources).toEqual({
      identities: result.value.identities.length,
      textElements:
        1 +
        result.value.headings.length +
        result.value.notes.length +
        result.value.rows.reduce((total, row) => total + row.cells.length, 0),
      diagramEdges: 0,
      modelMeshes: 0,
      layoutRequired: true,
    });
    expect(result.value.resources.textElements).toBeLessThanOrEqual(48);
    expect(businessPanelProjection(scene)).toEqual(result);
    expect(JSON.stringify(scene)).toBe(before);
    for (const entry of result.value.identities)
      if (entry.source) {
        const text = source.words
          .slice(entry.source.fromWord, entry.source.toWord + 1)
          .map((word) => word.text)
          .join(' ');
        expect(text.toLocaleLowerCase()).toContain(entry.label.toLocaleLowerCase());
      }
  });
  it('diagram/hybrid project exactly the same complete facts, never different probabilities/winners', () => {
    for (const diagram of sources.filter((source) => source.visualMode === 'diagram')) {
      const hybrid = businessSourceFixture(diagram.id, 'hybrid');
      if (!hybrid) continue;
      expect(businessPanelProjection(native(diagram))).toEqual(
        businessPanelProjection(native(hybrid)),
      );
    }
  });
  it('keeps legacy OP10/58/75 meanings out unless the scoped preset and independent opt-in exist', () => {
    const gate = native(sourceById('OP-10'));
    if (gate.kind !== 'agent-workflow') throw new Error('Wrong gate kind');
    expect(businessPanelProjection({ ...gate, preset: 'tool-success' }).ok).toBe(false);
    const dependency = native(sourceById('OP-58'));
    if (dependency.kind !== 'portfolio-exposure') throw new Error('Wrong dependency kind');
    expect(businessPanelProjection({ ...dependency, dependencyLens: undefined }).ok).toBe(false);
    const future = native(sourceById('OP-75'));
    if (future.kind !== 'possible-futures') throw new Error('Wrong future kind');
    expect(businessPanelProjection({ ...future, businessAlternatives: undefined }).ok).toBe(false);
  });
  it('defers fit to the actual storyboard rails while preserving complete text, and fails closed on identity collisions', () => {
    const scene = native(sources[0]);
    const oversized = { ...scene, label: 'W'.repeat(500) };
    const before = JSON.stringify(oversized);
    const result = businessPanelProjection(oversized);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.value.title).toBe(oversized.label);
    expect(result.value.resources.layoutRequired).toBe(true);
    expect(BUSINESS_PANEL_LAYOUT_CONSTRAINTS.panelWidth).toBe(BOARD_LAYOUT.panelWidth);
    expect(BUSINESS_PANEL_LAYOUT_CONSTRAINTS.panelHeight).toBe(BOARD_LAYOUT.panelHeight);
    expect(BUSINESS_PANEL_LAYOUT_CONSTRAINTS.minFontSize).toBe(30);
    expect(JSON.stringify(oversized)).toBe(before);
    if (scene.kind !== 'task-map') throw new Error('Expected task-map');
    const actors = [...scene.actors, { ...scene.actors[0], label: 'Conflicting source identity' }];
    expect(businessPanelProjection({ ...scene, actors }).ok).toBe(false);
  });
});
