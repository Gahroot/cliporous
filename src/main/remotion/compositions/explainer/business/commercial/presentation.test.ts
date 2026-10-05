import { createElement, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  parseBusinessBlueprint,
  parseBusinessReplication,
} from '../../../../../ai/explainer/business-commercial-contract';
import { makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import { labelLines } from '../../diagrams/layout';
import { deriveExplainerPalette } from '../../palette';
import { BUSINESS_RECIPES } from '../catalog';
import {
  COMMERCIAL_RAW_FIXTURES,
  type CommercialSourceFixture,
  makeCommercialSourceFixture,
} from './fixtures';
import { commercialIdentities, sampleCommercial } from './poses';
import {
  commercialContentFits,
  commercialPresentationFits,
  commercialTable,
  layoutCommercialTable,
} from './presentation';
import { CommercialDiagramParts, CommercialSceneView } from './Scene';
import type { CommercialScene, ReplicationUnit } from './types';

vi.mock('../../stage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../stage')>()),
  useStage: () => ({ ...deriveExplainerPalette(), font: 'Inter' }),
  useSceneTime: () => ({ t: 20 }),
}));

function parse(fixture: CommercialSourceFixture, raw: Rec = fixture.raw): CommercialScene {
  const ctx = makeParseContext(fixture.words, fixture.window);
  const scene =
    raw.kind === 'business-replication'
      ? parseBusinessReplication(raw, ctx)
      : parseBusinessBlueprint(raw, ctx);
  expect(ctx.issues).toEqual([]);
  if (!scene) throw new Error(`${fixture.id}: missing parsed RAW scene`);
  return scene;
}
function compact(text: string): string {
  return text
    .replace(/<[^>]*>/gu, '')
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&#x27;/gu, "'")
    .replace(/&quot;/gu, '"')
    .replace(/\s/gu, '');
}
/** Independent factual oracle, not derived from the table it checks. */
function statedFacts(scene: CommercialScene): string[] {
  const result = commercialIdentities(scene).map((identity) => identity.label);
  if (scene.kind === 'business-replication') {
    for (const unit of scene.units)
      result.push(unit.standardUse.state, unit.localDifference.label, unit.localDifference.state);
  } else if (scene.preset === 'back-office') {
    result.push(...scene.tasks.map((entry) => entry.state));
  } else if (scene.preset === 'service-slots') {
    for (const quantity of [scene.reserved, scene.used, scene.available]) {
      if (!quantity) {
        result.push('Not stated');
        continue;
      }
      result.push(quantity.state);
      if (quantity.count !== null) result.push(String(quantity.count));
      if (quantity.basis) {
        const basis = quantity.basis;
        const subject = commercialIdentities(scene).find(
          (identity) => identity.id === basis.subjectId,
        );
        if (!subject) throw new Error('Quantity subject must be a declared source identity');
        result.push(
          subject.label,
          basis.unit,
          basis.population,
          basis.period,
          `denominator ${basis.denominator ?? 'not stated'}`,
        );
      }
    }
  } else if (scene.preset === 'service-lifecycle') {
    result.push(scene.lead.state, scene.booking.state, scene.delivery.state);
  } else if (scene.preset === 'owner-dependency') {
    result.push(scene.dependency.state);
  } else {
    result.push(...scene.compatibility.map((entry) => entry.state));
    if (scene.repeatedOffering) result.push(`Repeated offering: ${scene.repeatedOffering.state}`);
  }
  return result;
}

// CPU string/layout evidence only: no raster, DOM readability or native projection claim.
describe('commercial fixed-font factual presentation', () => {
  it.each(
    COMMERCIAL_RAW_FIXTURES,
  )('$id keeps every fact, basis, state and source condition identical across declared modes', (fixture) => {
    const recipe = BUSINESS_RECIPES.find((entry) => entry.id === fixture.id);
    expect(recipe?.modes).toEqual(['diagram', 'hybrid']);
    const diagram = parse(fixture, { ...fixture.raw, visualMode: 'diagram' });
    const hybrid = parse(fixture, { ...fixture.raw, visualMode: 'hybrid' });
    expect({ ...hybrid, visualMode: 'diagram' }).toEqual(diagram);
    const before = structuredClone(diagram);
    const table = commercialTable(diagram);
    expect(commercialTable(hybrid)).toEqual(table);
    expect(commercialPresentationFits(diagram)).toBe(true);
    expect(commercialPresentationFits(hybrid)).toBe(true);
    const layout = layoutCommercialTable(table);
    expect(layout.fontSize).toBe(24);
    expect(layout.columns).toBe(12);
    expect(layout.cellWidth * table.headings.length).toBe(920);
    expect(layout.height).toBeLessThanOrEqual(478);
    expect(layout.rowY).toHaveLength(table.rows.length);
    expect(layout.noteY).toHaveLength(table.notes.length);
    for (const row of table.rows)
      for (const cell of row.cells) {
        expect(labelLines(cell, layout.columns).join('').replace(/\s/gu, '')).toBe(
          cell.replace(/\s/gu, ''),
        );
      }
    const tableText = compact(
      [...table.rows.flatMap((row) => row.cells), ...table.notes].join(' '),
    );
    for (const fact of statedFacts(diagram)) expect(tableText).toContain(compact(fact));
    const svg = (scene: CommercialScene, seconds: number): string =>
      renderToStaticMarkup(
        createElement('svg', null, createElement(CommercialDiagramParts, { scene, seconds })),
      );
    for (const seconds of [
      fixture.window.startTime,
      diagram.setupAt,
      diagram.actionAt,
      diagram.responseAt,
      diagram.checkAt,
      diagram.resolveAt,
      fixture.window.endTime,
      diagram.actionAt,
    ]) {
      expect(sampleCommercial(hybrid, seconds)).toEqual(sampleCommercial(diagram, seconds));
      expect(svg(hybrid, seconds)).toBe(svg(diagram, seconds));
      const markup = svg(diagram, seconds);
      for (const fact of statedFacts(diagram)) expect(compact(markup)).toContain(compact(fact));
      expect(markup).not.toMatch(/ellipsis|foreignObject|<canvas|<image/u);
      if (diagram.condition) expect(compact(markup)).toContain(compact(diagram.condition));
    }
    for (const scene of [diagram, hybrid]) {
      const view = CommercialSceneView({ scene });
      if (!isValidElement<{ scene: CommercialScene }>(view))
        throw new Error('Missing existing hybrid wrapper');
      // The wrapper's chrome receives the complete validated condition/outcome, never a timed resolution.
      expect(view.props.scene).toBe(scene);
      expect(view.props.scene.condition).toBe(fixture.raw.condition);
      expect(view.props.scene.outcome).toBe(fixture.raw.outcome);
      expect(view.props.scene.factEvidence).toEqual(scene.factEvidence);
    }
    expect(diagram).toEqual(before);
  });

  it('rejects a genuinely sourced overfull local-context table rather than shrinking, truncating or dropping rows', () => {
    const baselineFixture = COMMERCIAL_RAW_FIXTURES.find((fixture) => fixture.id === 'OP-23');
    if (!baselineFixture) throw new Error('Missing replication RAW fixture');
    const baseline = parse(baselineFixture);
    if (baseline.kind !== 'business-replication') throw new Error('Missing replication scene');
    const names = ['North regional service', 'East regional service', 'South regional service'];
    const contexts = [
      'Morning scheduling zone',
      'Evening scheduling zone',
      'Weekend scheduling zone',
    ];
    const standard = 'Atlas uses Guide as its shared standard.';
    const memberships = names.map((name) => `Atlas includes ${name} as a local unit.`);
    const uses = names.map((name) => `${name} uses Guide at Atlas.`);
    const differences = names.map(
      (name, index) => `${name} has ${contexts[index]} as its local context at Atlas.`,
    );
    const units: ReplicationUnit[] = [];
    const pressure = makeCommercialSourceFixture(
      'OP-23',
      [
        `${standard} ${memberships.join(' ')}`,
        uses.join(' '),
        differences.join(' '),
        'Local records are checked.',
        'Local contexts remain distinct.',
      ],
      (source) => {
        for (let index = 0; index < names.length; index++)
          units.push({
            identity: source.identity(`unit-${index}`, names[index], memberships[index]),
            standardUse: { state: 'observed', source: source.span(uses[index]) },
            localDifference: {
              label: contexts[index],
              state: 'source-stated',
              source: source.span(differences[index]),
            },
          });
        return {
          business: source.identity('atlas', 'Atlas', standard),
          standard: source.identity('guide', 'Guide', standard),
          units,
        };
      },
    );
    // This authored presentation probe is not accepted as a parsed scene; the RAW counterpart below must reject.
    const stress = { ...baseline, units };
    expect(commercialContentFits(stress)).toBe(true); // 5 identities, 10 links, zero unresolved holds.
    const table = commercialTable(stress);
    const layout = layoutCommercialTable(table);
    expect(table.rows).toHaveLength(3);
    for (let index = 0; index < units.length; index++)
      expect(table.rows[index].cells).toEqual([
        names[index],
        'observed',
        `${contexts[index]}: source-stated`,
      ]);
    expect(layout.fontSize).toBe(24);
    expect(layout.columns).toBe(12);
    expect(layout.rowY).toHaveLength(3);
    expect(layout.noteY).toHaveLength(table.notes.length);
    expect(layout.height).toBeGreaterThan(478);
    expect(commercialPresentationFits(stress)).toBe(false);
    for (const visualMode of ['diagram', 'hybrid']) {
      const ctx = makeParseContext(pressure.words, pressure.window);
      expect(parseBusinessReplication({ ...pressure.raw, visualMode }, ctx)).toBeNull();
      expect(ctx.issues.join('; ')).toMatch(/fixed-font|478px/u);
    }
  });
});
