import { type ComponentType, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ExpansionKitPose, ExpansionKitState } from '../scene-types';
import {
  COMPUTING_ASSET_BUDGETS,
  COMPUTING_KIT_CEILING,
  type ComputingActor,
  ComputingActorClay,
  ComputingActorSvg,
  ComputingKitClay,
  type ComputingKitProps,
  ComputingKitSvg,
  type ComputingRecord,
  ComputingRecordClay,
  ComputingRecordSvg,
  type ComputingRelation,
  computingKitBudget,
  type KitAssetProps,
} from './computing';
import {
  INFRASTRUCTURE_ASSET_BUDGETS,
  INFRASTRUCTURE_KIT_CEILING,
  type InfrastructureCarrier,
  InfrastructureCarrierClay,
  InfrastructureCarrierSvg,
  type InfrastructureContent,
  InfrastructureKitClay,
  type InfrastructureKitProps,
  InfrastructureKitSvg,
  type InfrastructureRelation,
  type InfrastructureStage,
  InfrastructureStageClay,
  InfrastructureStageSvg,
  infrastructureContentText,
  infrastructureKitBudget,
} from './infrastructure';
import {
  PRODUCT_ASSET_BUDGETS,
  PRODUCT_KIT_CEILING,
  ProductKitClay,
  type ProductKitProps,
  ProductKitSvg,
  type ProductRecord,
  ProductRecordClay,
  ProductRecordSvg,
  type ProductSurface,
  ProductSurfaceClay,
  ProductSurfaceSvg,
  productKitBudget,
} from './product';
import {
  SIGNAL_ASSET_BUDGETS,
  SignalInstrumentClay,
  SignalInstrumentSvg,
  SignalTraceClay,
  type SignalTraceProps,
  SignalTraceSvg,
  type SignalWaveParameters,
  sampleSignalWave,
  signalPlotPoints,
  signalWaveValue,
  validateSignalWave,
} from './signals';

const pose: ExpansionKitPose = { reveal: 1, action: 0.5, response: 0.5, check: 0.5, resolve: 1 };
const hidden: ExpansionKitPose = { reveal: 0, action: 0, response: 0, check: 0, resolve: 0 };
const base: KitAssetProps = {
  pose,
  state: 'retained',
  colors: { surface: '#eee', text: '#222', accent: '#857', muted: '#999' },
  position: [0, 0, 0],
};
const source = { kind: 'source', qualifier: 'Stated in the source' } as const;
const illustrative = {
  kind: 'illustrative',
  qualifier: 'Authored illustration, not telemetry',
} as const;
const states: readonly ExpansionKitState[] = [
  'retained',
  'active',
  'excluded',
  'unknown',
  'disputed',
];
const wave: SignalWaveParameters = {
  amplitude: 2,
  frequency: 0.25,
  phase: 0.5,
  domain: [-2, 4],
  samples: 64,
};

/** Real SSR expands ClayBlock, Clay, diagram text and all hidden parts; no asset mocks. */
function markup<P extends object>(component: ComponentType<P>, props: P, planar = false): string {
  const element = createElement(component, props);
  return renderToStaticMarkup(planar ? createElement('svg', null, element) : element);
}
function meshes(html: string): number {
  return (html.match(/<mesh(?:\s|>)/g) ?? []).length;
}
function svgElements(html: string): number {
  return (
    html.match(/<(?:g|path|rect|circle|ellipse|line|polyline|polygon|text|tspan)(?:\s|>)/g) ?? []
  ).length;
}
function assertNoStage(html: string): void {
  expect(html).not.toMatch(/<(?:canvas|instancedMesh|skinnedMesh|primitive)(?:\s|>)/i);
}
function assertPair<P extends object>(
  svg: ComponentType<P>,
  clay: ComponentType<P>,
  props: P,
  budget: { readonly meshes: number; readonly svgElements: number },
  exactSvg = true,
): void {
  const planar = markup(svg, props, true),
    physical = markup(clay, props);
  expect(meshes(planar)).toBe(0);
  expect(meshes(physical)).toBe(budget.meshes);
  if (exactSvg) expect(svgElements(planar)).toBe(budget.svgElements);
  else expect(svgElements(planar)).toBeLessThanOrEqual(budget.svgElements);
  assertNoStage(planar);
  assertNoStage(physical);
}
function relations(fromId: string, toId: string): readonly ComputingRelation[] {
  return Array.from({ length: 16 }, (_, i) => ({
    id: `link-${i}`,
    fromId,
    toId,
    role: 'attempt' as const,
    from: [0, 0, 0] as const,
    to: [100, 100, 0] as const,
    state: 'unknown' as const,
  }));
}
function computing(): ComputingKitProps {
  const actors: ComputingActor[] = Array.from({ length: 8 }, (_, i) => ({
    id: `actor-${i}`,
    label: 'Cache',
    kind: 'cache',
    state: 'unknown',
    position: [i, 0, 0],
  }));
  const records: ComputingRecord[] = Array.from({ length: 12 }, (_, i) => ({
    id: `packet-${i}`,
    label: 'Packet',
    kind: 'packet',
    state: 'unknown',
    position: [i, 1, 0],
    version: 'v0',
    attemptId: `attempt-${i}`,
  }));
  return { ...base, actors, records, relations: relations('actor-0', 'packet-0') };
}
function product(): ProductKitProps {
  const surfaces: ProductSurface[] = Array.from({ length: 8 }, (_, i) => ({
    id: `surface-${i}`,
    label: 'Task sheet',
    kind: 'task',
    state: 'unknown',
    position: [i, 0, 0],
  }));
  const records: ProductRecord[] = Array.from({ length: 12 }, (_, i) => ({
    id: `record-${i}`,
    label: 'Result',
    surfaceId: 'surface-0',
    state: 'unknown',
    position: [i, 1, 0],
  }));
  return { ...base, surfaces, records, relations: relations('surface-0', 'record-0') };
}
function infrastructure(): InfrastructureKitProps {
  const stages: InfrastructureStage[] = Array.from({ length: 8 }, (_, i) => ({
    id: `stage-${i}`,
    label: 'Filter',
    kind: 'filter',
    state: 'unknown',
    content: { kind: 'unknown', qualifier: 'Not measured' },
    provenance: source,
    position: [i, 0, 0],
  }));
  const carriers: InfrastructureCarrier[] = Array.from({ length: 12 }, (_, i) => ({
    id: `carrier-${i}`,
    label: 'Parcel',
    kind: 'supply-parcel',
    state: 'retained',
    content: { kind: 'known', exact: '0 items' },
    provenance: source,
    position: [i, 1, 0],
  }));
  const links: InfrastructureRelation[] = Array.from({ length: 16 }, (_, i) => ({
    id: `flow-${i}`,
    fromId: 'stage-0',
    toId: 'carrier-0',
    from: [0, 0, 0],
    to: [100, 100, 0],
    state: 'unknown',
    transfer: { kind: 'unknown', qualifier: 'Not measured' },
    provenance: source,
  }));
  return { ...base, stages, carriers, relations: links };
}
const trace: SignalTraceProps = {
  ...base,
  id: 'signal-0',
  label: 'Authored sine',
  wave,
  provenance: illustrative,
};

describe('physical expansion assets: real SSR/source ceilings, not stage or GPU costs', () => {
  for (const [name, factory, svg, clay, budget, ceiling] of [
    [
      'computing',
      computing,
      ComputingKitSvg,
      ComputingKitClay,
      computingKitBudget,
      COMPUTING_KIT_CEILING,
    ],
    ['product', product, ProductKitSvg, ProductKitClay, productKitBudget, PRODUCT_KIT_CEILING],
    [
      'infrastructure',
      infrastructure,
      InfrastructureKitSvg,
      InfrastructureKitClay,
      infrastructureKitBudget,
      INFRASTRUCTURE_KIT_CEILING,
    ],
  ] as const) {
    it(`${name}: maximum actors/records/relations and hidden meshes equal authored ceilings`, () => {
      // Each tuple is a matched component/props family; the casts avoid union-call inference only.
      const props = factory();
      const computed = (budget as (p: typeof props) => typeof ceiling)(props);
      expect(computed).toEqual(ceiling);
      for (const p of [props, { ...props, pose: hidden }]) {
        assertPair(
          svg as ComponentType<typeof props>,
          clay as ComponentType<typeof props>,
          p,
          computed,
        );
      }
    });
  }
  it('counts each computing actor kind and each record kind, including excluded/hidden parts', () => {
    for (const kind of ['server', 'replica', 'cache', 'buffer'] as const) {
      const actor: ComputingActor = { ...computing().actors[0], kind };
      assertPair(
        ComputingActorSvg,
        ComputingActorClay,
        { ...base, pose: hidden, state: 'excluded', actor },
        COMPUTING_ASSET_BUDGETS[kind],
      );
    }
    for (const kind of ['packet', 'version', 'effect'] as const) {
      const record: ComputingRecord = { ...computing().records[0], kind };
      assertPair(
        ComputingRecordSvg,
        ComputingRecordClay,
        { ...base, pose: hidden, record },
        COMPUTING_ASSET_BUDGETS.record,
      );
    }
  });
  it('counts all original product shapes and neutral record fields', () => {
    for (const kind of ['form', 'table', 'result', 'invoice', 'task'] as const) {
      const surface: ProductSurface = { ...product().surfaces[0], kind };
      assertPair(
        ProductSurfaceSvg,
        ProductSurfaceClay,
        { ...base, pose: hidden, surface },
        PRODUCT_ASSET_BUDGETS[kind],
      );
      expect(markup(ProductSurfaceSvg, { ...base, surface }, true)).not.toMatch(
        /<(?:input|button|textarea|select|foreignObject|iframe|script|div|code)\b/i,
      );
    }
    const record = product().records[0];
    assertPair(
      ProductRecordSvg,
      ProductRecordClay,
      { ...base, record },
      PRODUCT_ASSET_BUDGETS.record,
    );
  });
  it('counts every infrastructure semantic stage and carrier, including unknown/hidden parts', () => {
    for (const kind of ['supply-module', 'inventory-tray', 'reservoir', 'filter'] as const) {
      const stage: InfrastructureStage = { ...infrastructure().stages[0], kind };
      assertPair(
        InfrastructureStageSvg,
        InfrastructureStageClay,
        { ...base, pose: hidden, stage },
        INFRASTRUCTURE_ASSET_BUDGETS[kind],
      );
    }
    for (const kind of ['supply-parcel', 'energy-carrier'] as const) {
      const carrier: InfrastructureCarrier = { ...infrastructure().carriers[0], kind };
      assertPair(
        InfrastructureCarrierSvg,
        InfrastructureCarrierClay,
        { ...base, pose: hidden, carrier },
        INFRASTRUCTURE_ASSET_BUDGETS[kind],
      );
    }
  });
  it('counts signal models and all 64 polyline points, without numerical clay geometry', () => {
    assertPair(SignalTraceSvg, SignalTraceClay, trace, SIGNAL_ASSET_BUDGETS.trace);
    const html = markup(SignalTraceSvg, trace, true);
    expect(html.match(/<polyline\b/g)).toHaveLength(1);
    expect(html.match(/points="([^"]+)"/)?.[1].split(' ')).toHaveLength(64);
    expect(markup(SignalTraceClay, trace)).not.toMatch(
      /<polyline|Amplitude:|Frequency:|Phase:|Domain:/,
    );
    for (const state of states)
      assertPair(
        SignalTraceSvg,
        SignalTraceClay,
        { ...trace, state, pose: hidden },
        SIGNAL_ASSET_BUDGETS.trace,
        false,
      );
    const instrument = {
      ...base,
      id: 'meter-0',
      label: 'Instrument',
      provenance: source,
      exact: '0.000 USD',
    };
    assertPair(
      SignalInstrumentSvg,
      SignalInstrumentClay,
      instrument,
      SIGNAL_ASSET_BUDGETS.instrument,
    );
    expect(markup(SignalInstrumentClay, instrument)).not.toContain('0.000 USD');
  });
});

describe('bounded analytic waves: source facts, repeat/shuffled seeks, no history', () => {
  it('retains inclusive endpoints and exact finite sine values for every 2–64 sample count', () => {
    for (let samples = 2; samples <= 64; samples++) {
      const params = { ...wave, samples },
        points = sampleSignalWave(params);
      expect(points).toHaveLength(samples);
      expect(points[0].time).toBe(wave.domain[0]);
      expect(points.at(-1)?.time).toBe(wave.domain[1]);
      for (const point of points) {
        expect(Number.isFinite(point.time) && Number.isFinite(point.value)).toBe(true);
        expect(point.value).toBe(
          wave.amplitude * Math.sin(2 * Math.PI * wave.frequency * point.time + wave.phase),
        );
      }
      expect(signalPlotPoints(params).split(' ')).toHaveLength(samples);
    }
  });
  it('repeated and shuffled time/pose evaluation is identical and does not mutate authored values', () => {
    const params = Object.freeze({ ...wave, domain: Object.freeze([-2, 4] as const) });
    const baseline = sampleSignalWave(params);
    for (const index of [63, 0, 32, 7, 50, 32, 0, 63])
      expect(signalWaveValue(params, baseline[index].time)).toBe(baseline[index].value);
    expect(sampleSignalWave(params)).toEqual(baseline);
    const poses = [hidden, pose, { ...pose, action: 1, check: 0 }, { ...pose, reveal: 0.4 }];
    const expected = poses.map((p) => markup(SignalTraceSvg, { ...trace, pose: p }, true));
    for (const index of [3, 0, 2, 1, 3, 1, 0])
      expect(markup(SignalTraceSvg, { ...trace, pose: poses[index] }, true)).toBe(expected[index]);
  });
  it('bounds parameters, domain, phase, evaluation time and sample capacity', () => {
    for (const samples of [0, 1, 65, 1000, 2.5, NaN, Infinity])
      expect(() => validateSignalWave({ ...wave, samples })).toThrow();
    for (const key of ['amplitude', 'frequency', 'phase'] as const) {
      for (const value of [NaN, Infinity, -Infinity, 100000000])
        expect(() => validateSignalWave({ ...wave, [key]: value })).toThrow();
    }
    for (const domain of [
      [0, 0],
      [1, -1],
      [NaN, 1],
      [-10000, 10000],
      [0, Infinity],
    ] as const)
      expect(() => validateSignalWave({ ...wave, domain })).toThrow();
    for (const time of [-3, 5, NaN, Infinity]) expect(() => signalWaveValue(wave, time)).toThrow();
    expect(sampleSignalWave({ ...wave, amplitude: 0 }).every((p) => p.value === 0)).toBe(true);
    expect(() => validateSignalWave({ ...wave, frequency: 0, phase: -2 * Math.PI })).not.toThrow();
  });
  it('requires provenance and labels unknown/disputed without manufacturing measured zero', () => {
    for (const provenance of [source, illustrative]) {
      const html = markup(SignalTraceSvg, { ...trace, provenance }, true);
      expect(html).toContain(provenance.qualifier);
      expect(html).toContain(provenance.kind);
    }
    for (const qualifier of ['', ' ', 'x'.repeat(97)])
      expect(() =>
        markup(SignalTraceSvg, { ...trace, provenance: { kind: 'source', qualifier } }, true),
      ).toThrow();
    for (const state of ['unknown', 'disputed'] as const) {
      const html = markup(SignalTraceSvg, { ...trace, state }, true);
      expect(html).not.toContain('<polyline');
      expect(html).toContain(`Amplitude: ${state}`);
      const meter = markup(
        SignalInstrumentSvg,
        { ...base, state, id: 'meter', label: 'Meter', provenance: source, exact: '0' },
        true,
      );
      expect(meter).toContain(state);
      expect(meter).not.toMatch(/>0<\/tspan>/);
    }
    const meter = { ...base, id: 'meter', label: 'Meter', provenance: source };
    expect(markup(SignalInstrumentSvg, meter, true)).toContain('Not stated');
    expect(markup(SignalInstrumentSvg, { ...meter, exact: '0' }, true)).toMatch(/>0<\/tspan>/);
  });
});

describe('retained identities, versions, effects, ownership and source-qualified stock', () => {
  it('retains computing identities/version while attempts do not manufacture effects', () => {
    const record = {
      ...computing().records[0],
      version: 'v7',
      attemptId: 'attempt-a',
      effectId: undefined,
    };
    const props = { ...base, record, state: record.state };
    const before = markup(ComputingRecordSvg, props, true);
    expect(before).toContain('data-record-id="packet-0"');
    expect(before).toContain('Version: v7');
    expect(before).toContain('Attempt: attempt-a');
    expect(before).toContain('Effect: not stated');
    expect(before).not.toContain('data-effect-id=');
    const after = markup(
      ComputingRecordSvg,
      { ...props, record: { ...record, label: 'Renamed packet', effectId: 'effect-a' } },
      true,
    );
    expect(after).toContain('data-record-id="packet-0"');
    expect(after).toContain('Effect: effect-a');
    for (const actor of computing().actors)
      expect(markup(ComputingActorSvg, { ...base, actor, state: actor.state }, true)).toContain(
        'Version: not stated',
      );
    expect(
      markup(ComputingRecordSvg, { ...props, record: { ...record, version: undefined } }, true),
    ).toContain('Version: not stated');
    expect(
      markup(ComputingRecordSvg, { ...props, record: { ...record, version: 'unknown' } }, true),
    ).toContain('Version: unknown');
  });
  it('preserves product owner, exact result and attempt/effect identifiers without live UI', () => {
    const record = { ...product().records[0], exact: '0.000 USD', attemptId: 'attempt-a' };
    const html = markup(ProductRecordSvg, { ...base, record }, true);
    expect(html).toContain('data-surface-id="surface-0"');
    expect(html).toContain('data-record-id="record-0"');
    expect(html).toContain('0.000 USD');
    expect(html).toContain('Effect: not stated');
    expect(html).not.toMatch(/<(?:input|button|form|code|foreignObject|iframe|script)\b/i);
    expect(
      markup(
        ProductRecordSvg,
        { ...base, record: { ...record, label: 'Changed', effectId: 'effect-a' } },
        true,
      ),
    ).toContain('data-record-id="record-0"');
  });
  it('distinguishes product value omission, explicit source uncertainty and precise zero', () => {
    const record = { ...product().records[0], state: 'retained' as const };
    const missing = markup(ProductRecordSvg, { ...base, record }, true);
    expect(missing).toContain('Value not stated');
    expect(missing).not.toContain('Value unknown');
    const unknown = markup(
      ProductRecordSvg,
      {
        ...base,
        state: 'unknown',
        record: { ...record, state: 'unknown', exact: 'Unknown: source uncertain' },
      },
      true,
    );
    expect(unknown).toContain('Unknown: source uncertain');
    const zero = markup(
      ProductRecordSvg,
      { ...base, record: { ...record, exact: '0.000 USD' } },
      true,
    );
    expect(zero).toContain('0.000 USD');
    const disputed = markup(
      ProductRecordSvg,
      {
        ...base,
        state: 'disputed',
        record: { ...record, state: 'disputed', exact: '0 or 1 USD; disputed' },
      },
      true,
    );
    expect(disputed).toContain('0 or 1 USD; disputed');
    expect(disputed).toContain('data-state="disputed"');
  });
  it('preserves infrastructure exact zero, missing, unknown and loss-not-stated independently', () => {
    const content: readonly InfrastructureContent[] = [
      { kind: 'known', exact: '0.000 kWh' },
      { kind: 'missing', qualifier: 'Source omits amount' },
      { kind: 'unknown', qualifier: 'Source says unknown' },
    ];
    expect(content.map(infrastructureContentText)).toEqual([
      '0.000 kWh',
      'Not stated: Source omits amount',
      'Unknown: Source says unknown',
    ]);
    for (const value of content) {
      const props = infrastructure();
      const stages = [{ ...props.stages[0], content: value }];
      const carriers = [{ ...props.carriers[0], content: value }];
      const relation = { ...props.relations[0], transfer: value };
      const html = markup(
        InfrastructureKitSvg,
        { ...props, stages, carriers, relations: [relation] },
        true,
      );
      expect(html).toContain(infrastructureContentText(value));
      expect(html).toContain('Loss: not stated');
      expect(html).toContain(source.qualifier);
      for (const loss of content)
        expect(
          markup(
            InfrastructureKitSvg,
            { ...props, stages, carriers, relations: [{ ...relation, loss }] },
            true,
          ),
        ).toContain(`Loss: ${infrastructureContentText(loss)}`);
    }
    const stage = { ...infrastructure().stages[0], provenance: illustrative };
    expect(markup(InfrastructureStageSvg, { ...base, stage }, true)).toContain(
      illustrative.qualifier,
    );
    for (const qualifier of ['', ' ', 'x'.repeat(97)]) {
      const bad = { ...stage, provenance: { kind: 'source' as const, qualifier } };
      expect(() => markup(InfrastructureStageSvg, { ...base, stage: bad }, true)).toThrow();
      expect(() => markup(InfrastructureStageClay, { ...base, stage: bad })).toThrow();
    }
  });
  it('rejects capacity overflow, duplicate identities and dangling endpoints in all bounded kits', () => {
    const c = computing(),
      p = product(),
      i = infrastructure();
    for (const [props, validate, actorKey, recordKey] of [
      [c, computingKitBudget, 'actors', 'records'],
      [p, productKitBudget, 'surfaces', 'records'],
      [i, infrastructureKitBudget, 'stages', 'carriers'],
    ] as const) {
      const check = validate as (value: object) => unknown;
      const groups = props as unknown as Record<string, readonly { id: string }[]>;
      for (const key of [actorKey, recordKey, 'relations']) {
        expect(() =>
          check({ ...props, [key]: [...groups[key], { ...groups[key][0], id: 'overflow' }] }),
        ).toThrow(/capacity/i);
        expect(() => check({ ...props, [key]: [groups[key][0], groups[key][0]] })).toThrow(
          /identit/i,
        );
      }
      expect(() =>
        check({ ...props, relations: [{ ...props.relations[0], toId: 'absent' }] }),
      ).toThrow(/endpoint|identit/i);
      expect(() =>
        check({ ...props, [recordKey]: [{ ...groups[recordKey][0], id: groups[actorKey][0].id }] }),
      ).toThrow(/identit/i);
    }
    expect(() =>
      productKitBudget({ ...p, records: [{ ...p.records[0], surfaceId: 'absent' }] }),
    ).toThrow(/surface/i);
  });
});
