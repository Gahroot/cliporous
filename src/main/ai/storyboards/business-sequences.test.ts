import { createElement as h, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { STORYBOARD_LIMITS, storyboardSourceInputBudget } from '../../../shared/storyboards';
import { BoardProps3D } from '../../remotion/compositions/storyboard/BoardProps3D';
import {
  businessPanelResources,
  businessPanelVisualMode,
} from '../../remotion/compositions/storyboard/business-panel-state';
import { assertModelBudget } from '../../remotion/compositions/storyboard/model-resources';
import { parseBusinessExplanationSource } from './business-adapters';
import { businessPanelProjection, isBusinessStoryboardScene } from './business-diagrams';
import { businessReadingWords } from './business-reading';
import { BUSINESS_SEQUENCE_FIXTURES } from './business-sequences';
import { compileStoryboardSpec } from './compiler';

vi.mock('remotion', async (original) => ({
  ...(await original<typeof import('remotion')>()),
  useCurrentFrame: () => 450,
  useVideoConfig: () => ({
    fps: 30,
    width: 1920,
    height: 1080,
    durationInFrames: 5400,
    id: 'sequence-unit',
  }),
  Freeze: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@remotion/three', () => ({
  ThreeCanvas: ({ children }: { children: ReactNode }) =>
    h('section', { 'data-board-canvas': 'true' }, children),
}));
vi.mock('@react-three/fiber', () => ({
  useThree: (select: (state: { camera: object }) => unknown) => select({ camera: {} }),
}));
vi.mock('../../remotion/compositions/explainer/StudioEnvironment', () => ({
  StudioEnvironment: () => null,
}));

function nativePanels(fixture: (typeof BUSINESS_SEQUENCE_FIXTURES)[number]) {
  return fixture.spec.panels.map((panel) => {
    if (panel.kind !== 'explanation') throw Error('Expected real native panel');
    const native = parseBusinessExplanationSource(panel.explanation, fixture.words, {
      clipStart: 0,
      clipEnd: fixture.duration,
    });
    if (!native.ok) throw Error(JSON.stringify(native.diagnostics));
    const scene = native.value.planned.scene;
    if (!isBusinessStoryboardScene(scene)) throw Error('Expected native business grammar');
    return { panel, native: native.value, scene };
  });
}

describe('authored advanced business sequences', () => {
  it.each(
    BUSINESS_SEQUENCE_FIXTURES,
  )('$id keeps every identity locally source-backed and every five-beat native window intact', (fixture) => {
    const natives = nativePanels(fixture);
    const shared = new Map<string, { label: string; role: string; count: number }>();
    for (const { panel, native, scene } of natives) {
      const source = panel.explanation.sourceChoices;
      for (const key of [
        'startWord',
        'endWord',
        'setupWord',
        'actionWord',
        'responseWord',
        'checkWord',
        'resolveWord',
      ])
        expect(source[key]).toEqual(expect.any(Number));
      const beats = [
        scene.setupAt,
        scene.actionAt,
        scene.responseAt,
        scene.checkAt,
        scene.resolveAt,
      ];
      for (let index = 1; index < beats.length; index++)
        expect(beats[index]).toBeGreaterThan(beats[index - 1]);
      expect(native.planned.endTime - native.planned.startTime).toBeLessThanOrEqual(12);
      expect(native.planned.endTime).toBeGreaterThan(scene.resolveAt);
      expect(panel.explanation.identityLinks).toHaveLength(native.identities.length);
      for (const link of panel.explanation.identityLinks) {
        const entry = native.identities.find((identity) => identity.identity.id === link.localId);
        if (!entry) throw Error(`Missing real local ID ${link.localId}`);
        expect(entry.roles).toContain(link.role);
        expect(link.startWord).toBe(entry.identity.source.fromWord);
        expect(link.endWord).toBe(entry.identity.source.toWord);
        expect(
          fixture.words
            .slice(link.startWord, link.endWord + 1)
            .map((word) => word.text)
            .join(' '),
        ).toContain(entry.identity.label);
        const previous = shared.get(link.sharedId);
        if (previous) {
          expect(previous.label).toBe(entry.identity.label);
          expect(previous.role).toBe(link.role);
          previous.count++;
        } else
          shared.set(link.sharedId, { label: entry.identity.label, role: link.role, count: 1 });
      }
    }
    if (natives.length > 1)
      expect([...shared.values()].some((entry) => entry.count > 1)).toBe(true);
  });

  it('S-02 preserves request, authority, acceptance and pending payment as different states from comparable costs', () => {
    const [procurement, costs] = nativePanels(BUSINESS_SEQUENCE_FIXTURES[1]).map(
      (entry) => entry.scene,
    );
    if (
      procurement.kind !== 'procurement-commitment' ||
      costs.kind !== 'operating-cost' ||
      costs.preset !== 'per-outcome'
    )
      throw Error('Wrong transaction grammars');
    expect(procurement.request.state).toBe('requested');
    expect(procurement.authority.state).toBe('granted');
    expect(procurement.acceptance.state).toBe('accepted');
    expect(procurement.payment.state).toBe('pending');
    expect(procurement.quote.amount).toEqual({ minorUnits: 1200, currency: 'USD' });
    expect(procurement.payment.amount).toEqual(procurement.quote.amount);
    expect(costs.total.money).toEqual({ minorUnits: 200, currency: 'USD' });
    expect(costs.resolved.count).toBe(1);
    expect(costs.perOutcome.money).toEqual(costs.total.money);
    for (const basis of [
      procurement.quote.basis,
      procurement.payment.basis,
      costs.total.basis,
      costs.resolved.basis,
      costs.perOutcome.basis,
    ]) {
      if (!basis) throw Error('Missing actual quantity basis');
      expect(basis.period).toBe('June');
      expect(basis.population).toBe('kits');
      expect(basis.denominator).toBe(1);
    }
    expect(procurement.task.label).toBe(costs.activity.label);
    expect(procurement.quote.amount).not.toEqual(costs.total.money);
  });

  it('S-06 keeps the earlier pending review, exact approved version and later use without asserting retraining', () => {
    const [review, use] = nativePanels(BUSINESS_SEQUENCE_FIXTURES[5]).map((entry) => entry.scene);
    if (
      review.kind !== 'authority-handoff' ||
      review.preset !== 'exception-review' ||
      use.kind !== 'work-redesign' ||
      use.preset !== 'expertise-transfer'
    )
      throw Error('Wrong learning grammars');
    expect(review.review.state).toBe('pending');
    expect(use.capture.state).toBe('observed');
    expect(use.approval.state).toBe('approved');
    expect(use.use.state).toBe('observed');
    expect(use.approval.version).toBe('v2');
    expect(use.use.version).toBe(use.approval.version);
    expect(use.playbook.version).toBe(use.approval.version);
    expect(review.action.label).toBe(use.task.label);
    expect(use.receiver.label).toBe('Dee');
    expect(use.approver.label).toBe('Fran');
    expect(BUSINESS_SEQUENCE_FIXTURES[5].words.map((word) => word.text).join(' ')).toContain(
      'Guidance is not model retraining.',
    );
  });

  it('S-07 keeps the same actual baseline and two qualitative unresolved conditional alternatives', () => {
    const { scene } = nativePanels(BUSINESS_SEQUENCE_FIXTURES[6])[0];
    if (scene.kind !== 'possible-futures' || !scene.businessAlternatives)
      throw Error('Missing operating alternatives');
    expect(scene.condition).toBe('If supplies arrive');
    expect(scene.uncertainty).toBe('unresolved');
    expect(scene.businessAlternatives.baseline.identity.label).toBe('Current');
    expect(scene.alternatives).toHaveLength(2);
    expect(scene.businessAlternatives.records).toHaveLength(2);
    for (const record of scene.businessAlternatives.records) {
      expect(record.baselineId).toBe(scene.businessAlternatives.baseline.identity.id);
      expect(record.subjectId).toBe(scene.businessAlternatives.baseline.subject.id);
      expect(record.period).toBe('autumn');
      expect(record.revision).toBe('alpha');
    }
    expect(scene.alternatives.map((alternative) => alternative.qualifier)).toEqual([
      'could have lower capacity',
      'may have steady capacity',
    ]);
    expect(BUSINESS_SEQUENCE_FIXTURES[6].words.map((word) => word.text).join(' ')).toContain(
      'no stated probability or winner',
    );
  });

  it('S-08 retains share denominators, supported priority, negative control and unknown payout/liquidity', () => {
    const [rights, claims] = nativePanels(BUSINESS_SEQUENCE_FIXTURES[7]).map(
      (entry) => entry.scene,
    );
    if (
      rights.kind !== 'economic-rights' ||
      rights.preset !== 'ownership-versus-claims' ||
      claims.kind !== 'economic-rights' ||
      claims.preset !== 'claim-asset-distinction'
    )
      throw Error('Wrong rights grammars');
    expect(rights.company.label).toBe(claims.company.label);
    expect(rights.claim.label).toBe(claims.claim.label);
    expect(rights.holder.label).toBe(claims.holder.label);
    expect(rights.ownership.shares).toBe(40);
    expect(rights.ownership.total).toBe(100);
    expect(rights.ownership.percent).toBe(40);
    expect(rights.ownership.basis.denominator).toBe(100);
    expect(rights.ownership.basis.unit).toBe('shares');
    expect(rights.control.state).toBe('negative');
    expect(rights.priority.state).toBe('source-stated');
    expect(rights.payout.state).toBe('unknown');
    expect(rights.payout.money).toBeNull();
    expect(claims.transfer.state).toBe('conditional');
    expect(claims.transfer.label).toBe(
      'If Atlas consents, Ada may transfer Pref on Atlas during July',
    );
    expect(claims.liquidity.state).toBe('unknown');
  });

  it('S-04 conserves distinct contribution and proceeds ledgers, with exact money and bases', () => {
    const [life, waterfall] = nativePanels(BUSINESS_SEQUENCE_FIXTURES[3]).map(
      (entry) => entry.scene,
    );
    if (
      life.kind !== 'fund-lifecycle' ||
      life.preset !== 'capital-states' ||
      waterfall.kind !== 'distribution-waterfall' ||
      waterfall.preset !== 'stated-priority-tiers'
    )
      throw Error('Wrong financial grammars');
    expect(life.fund.label).toBe(waterfall.fund.label);
    expect(life.committed.amount?.minorUnits).toBe(12000);
    expect(life.called.amount?.minorUnits).toBe(8000);
    expect(life.contributed.amount?.minorUnits).toBe(7000);
    expect(life.deployed.amount?.minorUnits).toBe(5000);
    expect(life.retained.amount?.minorUnits).toBe(2000);
    expect(life.contributed.amount?.minorUnits).toBe(
      (life.deployed.amount?.minorUnits ?? NaN) + (life.retained.amount?.minorUnits ?? NaN),
    );
    expect(waterfall.proceeds.amount?.minorUnits).toBe(9000);
    expect(waterfall.tiers.map((tier) => tier.priority)).toEqual([1, 2]);
    expect(waterfall.tiers.map((tier) => tier.allocation.amount?.minorUnits)).toEqual([3000, 4000]);
    expect(waterfall.proceeds.amount?.minorUnits).toBe(
      waterfall.tiers.reduce((sum, tier) => sum + (tier.allocation.amount?.minorUnits ?? NaN), 0) +
        (waterfall.retained.amount?.minorUnits ?? NaN),
    );
    for (const fact of [
      life.committed,
      life.called,
      life.contributed,
      life.deployed,
      life.retained,
      waterfall.proceeds,
      waterfall.retained,
      ...waterfall.tiers.flatMap((tier) => [tier.ceiling, tier.allocation]),
    ]) {
      expect(fact.state).toBe('source-stated');
      expect(fact.amount?.currency).toBe('USD');
      expect(fact.basis.period).toBe('August');
      expect(fact.basis.unit).toBe('USD');
      expect(fact.basis.denominator).toBe(1);
    }
    expect(life.committed.amount).not.toEqual(life.contributed.amount);
    expect(life.contributed.amount).not.toEqual(waterfall.proceeds.amount);
  });

  it('S-05 retains two distinct firms and holdings without inferred correlation', () => {
    const { scene } = nativePanels(BUSINESS_SEQUENCE_FIXTURES[4])[0];
    if (scene.kind !== 'portfolio-exposure' || !scene.dependencyLens)
      throw Error('Missing shared-driver source lens');
    expect(scene.dependencyLens.firms.map((firm) => firm.identity.label).sort()).toEqual([
      'Acorn',
      'Rowan',
    ]);
    expect(new Set(scene.dependencyLens.firms.map((firm) => firm.identity.id)).size).toBe(2);
    expect(new Set(scene.dependencyLens.firms.map((firm) => firm.fundId)).size).toBe(2);
    expect(scene.exposure.label).toBe('Demand');
    const fixture = BUSINESS_SEQUENCE_FIXTURES[4];
    const holdingClauses = scene.dependencyLens.firms.map((firm) => {
      const fund = scene.funds.find((fund) => fund.id === firm.fundId);
      if (!fund) throw Error('Missing portfolio for source-backed firm holding');
      const clause = fixture.words
        .slice(firm.holdingSource.fromWord, firm.holdingSource.toWord + 1)
        .map((word) => word.text)
        .join(' ');
      expect(clause).toBe(`${fund.label} holds ${firm.identity.label}.`);
      return clause;
    });
    expect(new Set(holdingClauses).size).toBe(2);
    expect(
      scene.dependencyLens.firms.every(
        (firm) => firm.holdingSource.fromWord !== firm.driverSource.fromWord,
      ),
    ).toBe(true);
  });

  it('S-01 mounts a real hybrid cutaway in at most one shared board canvas', () => {
    const fixture = BUSINESS_SEQUENCE_FIXTURES[0];
    const result = compileStoryboardSpec(fixture.spec, fixture.words, {
      clipStart: 0,
      clipEnd: fixture.duration,
    });
    if (!result.ok) throw Error(JSON.stringify(result.diagnostics));
    const board = result.value.board;
    const [cutaway, responsibility] = board.businessPanels ?? [];
    if (!cutaway || !responsibility) throw Error('Missing native panels');
    expect(businessPanelVisualMode(cutaway)).toBe('hybrid');
    expect(businessPanelVisualMode(responsibility)).toBe('diagram');
    expect(() => assertModelBudget(board.props, board.businessPanels)).not.toThrow();
    const resources = board.businessPanels?.map(businessPanelResources) ?? [];
    expect(
      resources.reduce((sum, resource) => sum + resource.ceiling.modelInstances, 0),
    ).toBeLessThanOrEqual(6);
    expect(
      resources.reduce((sum, resource) => sum + resource.ceiling.meshes, 0),
    ).toBeLessThanOrEqual(180);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const markup = renderToStaticMarkup(
        h(BoardProps3D, {
          props: board.props,
          elements: board.elements,
          businessPanels: board.businessPanels,
          cam: board.shots[0],
          t: 15,
          width: 1920,
          height: 1080,
        }),
      );
      expect(markup.match(/data-board-canvas="true"/gu)).toHaveLength(1);
      expect(markup).toContain('mesh');
    } finally {
      error.mockRestore();
    }
  });
  it('covers all eight approved sequences', () => {
    expect(BUSINESS_SEQUENCE_FIXTURES.map((fixture) => fixture.id)).toEqual([
      'S-01',
      'S-02',
      'S-03',
      'S-04',
      'S-05',
      'S-06',
      'S-07',
      'S-08',
    ]);
  });
  it.each(
    BUSINESS_SEQUENCE_FIXTURES,
  )('$id reconstructs its native facts within unchanged whole-board budgets', (fixture) => {
    expect(storyboardSourceInputBudget(fixture.spec)).toBe(true);
    expect(fixture.words.at(-1)?.end).toBe(fixture.duration);
    expect(fixture.duration).toBeGreaterThan(STORYBOARD_LIMITS.longSourceSec);
    const narration = fixture.words.map((word) => word.text).join(' ');
    for (const fact of fixture.expectedFacts) expect(narration).toContain(fact);
    const result = compileStoryboardSpec(fixture.spec, fixture.words, {
      clipStart: 0,
      clipEnd: fixture.duration,
    });
    const projections = fixture.spec.panels.map((panel) => {
      if (panel.kind !== 'explanation') return null;
      const native = parseBusinessExplanationSource(panel.explanation, fixture.words, {
        clipStart: 0,
        clipEnd: fixture.duration,
      });
      if (!native.ok || !isBusinessStoryboardScene(native.value.planned.scene)) return native;
      const projection = businessPanelProjection(native.value.planned.scene);
      if (!projection.ok) return projection;
      const content = projection.value;
      const readWords = [
        content.title,
        ...content.headings,
        ...content.notes,
        ...content.rows.flatMap((row) => row.cells),
      ].reduce((sum, text) => sum + businessReadingWords(text), 0);
      return {
        recipe: panel.explanation.recipe,
        readWords,
        minimumReadHold: readWords / 3.5 + 0.8,
        headingslength: content.headings.length,
        rows: content.rows.length,
        cellchars: content.rows.map((row) => row.cells.map((cell) => cell.length)),
        noteschars: content.notes.map((note) => note.length),
      };
    });
    expect(result.ok, JSON.stringify({ result, projections })).toBe(true);
    if (!result.ok) return;
    expect(result.value.endTime - result.value.startTime).toBeLessThanOrEqual(
      STORYBOARD_LIMITS.maxDurationSec,
    );
    expect((result.value.endTime - result.value.startTime) / fixture.duration).toBeLessThanOrEqual(
      STORYBOARD_LIMITS.maxCoverage,
    );
    expect(result.value.board.elements.length).toBeLessThanOrEqual(STORYBOARD_LIMITS.maxElements);
    expect(result.value.cues.length).toBeLessThanOrEqual(STORYBOARD_LIMITS.maxCues);
    expect(result.value.board.businessPanels).toHaveLength(fixture.spec.panels.length);
    expect(result.value.board.props.length).toBeLessThanOrEqual(STORYBOARD_LIMITS.maxProps);
    expect(
      compileStoryboardSpec(JSON.parse(JSON.stringify(fixture.spec)), fixture.words, {
        clipStart: 0,
        clipEnd: fixture.duration,
      }),
    ).toEqual(result);
  });
});
