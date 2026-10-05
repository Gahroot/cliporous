import { describe, expect, it } from 'vitest';
import {
  evaluationSourceFixture,
  evidenceSourceFixture,
  INFRASTRUCTURE_ADDITIONAL_SOURCE_FIXTURES,
  INFRASTRUCTURE_NO_NATIVE_SOURCE_FIXTURES,
  INFRASTRUCTURE_SOURCE_FIXTURES,
  type InfrastructureRecipeId,
  type InfrastructureSourceFixture,
  infrastructureSourceContext,
  installedSourceFixture,
  latencySourceFixture,
  provenanceSourceFixture,
  readinessSourceFixture,
  requestSourceFixture,
  resourcesSourceFixture,
  scopeSourceFixture,
  transitionSourceFixture,
} from '../../remotion/compositions/explainer/business/infrastructure/fixtures';
import { infrastructureAssets } from '../../remotion/compositions/explainer/business/infrastructure/poses';
import { infrastructureRows } from '../../remotion/compositions/explainer/business/infrastructure/presentation';
import {
  parseCapacityMapScene,
  parseOperatingLineageScene,
} from './business-infrastructure-contract';
import { isRec, type Rec } from './kind-spec';

const CAPACITY_IDS = ['OP-35', 'OP-65', 'OP-66', 'OP-67', 'OP-68', 'OP-72'];
function parse(fixture: InfrastructureSourceFixture, ...inputs: unknown[]) {
  const raw = inputs.length ? inputs[0] : fixture.raw;
  const ctx = infrastructureSourceContext(fixture);
  const scene = CAPACITY_IDS.includes(fixture.id)
    ? parseCapacityMapScene(raw, ctx)
    : parseOperatingLineageScene(raw, ctx);
  return { scene, ctx };
}
function record(value: unknown): Rec {
  if (!isRec(value)) throw new Error('Expected fixture record');
  return value;
}
function list(value: unknown): Rec[] {
  if (!Array.isArray(value) || !value.every(isRec)) throw new Error('Expected fixture records');
  return value;
}
function path(raw: Rec, keys: (string | number)[]): Rec {
  let value: unknown = raw;
  for (const key of keys) value = typeof key === 'number' ? list(value)[key] : record(value)[key];
  return record(value);
}
function rejected(
  fixture: InfrastructureSourceFixture,
  change: (raw: Rec, fixture: InfrastructureSourceFixture) => void,
) {
  const baseline = parse(fixture);
  expect(baseline.scene, baseline.ctx.issues.join('; ')).not.toBeNull();
  const copy = structuredClone(fixture);
  change(copy.raw, copy);
  const before = Object.getOwnPropertyDescriptors(copy.raw),
    result = parse(copy);
  expect(result.scene).toBeNull();
  expect(result.ctx.issues.length).toBeGreaterThan(0);
  expect(Object.getOwnPropertyDescriptors(copy.raw)).toEqual(before);
}
function sourceReplace(
  fixture: InfrastructureSourceFixture,
  raw: Rec,
  before: string,
  after: string,
) {
  const span = record(raw.source);
  if (typeof span.fromWord !== 'number' || typeof span.toWord !== 'number')
    throw new Error('Missing authored span');
  let replaced = false;
  for (let i = span.fromWord; i <= span.toWord; i++)
    if (fixture.words[i].text.includes(before)) {
      fixture.words[i] = {
        ...fixture.words[i],
        text: fixture.words[i].text.replace(before, after),
      };
      replaced = true;
    }
  if (!replaced) throw new Error(`Missing authored token ${before}`);
}
function primary(id: InfrastructureRecipeId) {
  const fixture = INFRASTRUCTURE_SOURCE_FIXTURES.find((f) => f.id === id);
  if (!fixture) throw new Error(`Missing ${id}`);
  return fixture;
}
const QUANTITIES: { id: InfrastructureRecipeId; keys: (string | number)[] }[] = [
  { id: 'OP-35', keys: ['installed'] },
  { id: 'OP-35', keys: ['used'] },
  { id: 'OP-35', keys: ['reserved'] },
  { id: 'OP-66', keys: ['queued'] },
  { id: 'OP-66', keys: ['capacity'] },
  { id: 'OP-67', keys: ['installed'] },
  { id: 'OP-67', keys: ['idle'] },
  { id: 'OP-67', keys: ['reserved'] },
  { id: 'OP-67', keys: ['burst'] },
  { id: 'OP-71', keys: ['snapshots', 0, 'quantity'] },
  { id: 'OP-72', keys: ['stages', 0, 'quantity'] },
  { id: 'OP-72', keys: ['total'] },
];

describe('infrastructure strict clause-local quantity and state contracts', () => {
  it.each([
    ...INFRASTRUCTURE_SOURCE_FIXTURES,
    ...INFRASTRUCTURE_ADDITIONAL_SOURCE_FIXTURES,
  ])('$fixtureId preserves the complete source facts without mutating inputs or turning dates into clocks', (fixture) => {
    const before = structuredClone(fixture),
      { scene, ctx } = parse(fixture);
    if (!scene) throw new Error(ctx.issues.join('; '));
    expect(ctx.issues).toEqual([]);
    expect(fixture).toEqual(before);
    expect(scene.period).toBe('June');
    if (scene.preset === 'evaluation-periods')
      expect(scene.snapshots.map((s) => [s.version, s.date])).toEqual([
        ['v1', '2026-06-01'],
        ['v2', '2026-06-08'],
      ]);
    for (const row of infrastructureRows(scene)) expect(row.label.length).toBeGreaterThan(0);
  });
  it.each(
    QUANTITIES,
  )('$id/$keys refuses swapped value, actor, period, unit, denominator, cohort and body spans', ({
    id,
    keys,
  }) => {
    const changes: ((raw: Rec) => void)[] = [
      (raw) => {
        path(raw, keys).value = 99;
      },
      (raw) => {
        path(raw, keys).state = 'conditional';
      },
      (raw) => {
        path(raw, keys).unit = 'seats';
      },
      (raw) => {
        path(raw, keys).period = 'July';
      },
      (raw) => {
        path(path(raw, keys), ['basis']).subjectId = 'foreign';
      },
      (raw) => {
        path(path(raw, keys), ['basis']).population = 'other-cohort';
      },
      (raw) => {
        path(path(raw, keys), ['basis']).denominator = 9;
      },
      (raw) => {
        path(path(raw, keys), ['basis']).denominator = null;
      },
      (raw) => {
        delete path(path(raw, keys), ['basis']).period;
      },
      (raw) => {
        delete path(path(raw, keys), ['basis']).unit;
      },
      (raw) => {
        path(raw, keys).source = structuredClone(record(raw.factEvidence).source);
      },
      (raw) => {
        const source = path(path(raw, keys), ['basis', 'source']);
        source.fromWord = Number(source.fromWord) + 1;
      },
      (raw) => {
        const source = path(path(raw, keys), ['source']);
        source.toWord = Number(source.toWord) - 1;
      },
    ];
    for (const change of changes) rejected(primary(id), change);
  });
  it.each([
    'unknown',
    'pending',
    'negative',
  ] as const)('%s quantity is null, never a calibrated zero/share', (state) => {
    const fixture = installedSourceFixture(state),
      result = parse(fixture).scene;
    if (!result || result.preset !== 'installed-used-reserved')
      throw new Error('Missing installed fixture');
    expect(result.used.value).toBeNull();
    expect(result.used.basis).toBeNull();
    expect(result.used.unit).toBe('jobs');
    rejected(fixture, (raw) => {
      record(raw.used).value = 0;
    });
    rejected(fixture, (raw) => {
      record(raw.used).basis = structuredClone(record(raw.installed).basis);
    });
    rejected(fixture, (raw) => {
      record(raw.used).state = 'source-stated';
    });
  });
  it('known conditional capacity retains its amount/full condition/body basis, never observed', () => {
    const fixture = installedSourceFixture('conditional'),
      result = parse(fixture).scene;
    if (!result || result.preset !== 'installed-used-reserved')
      throw new Error('Missing conditional capacity');
    expect(result.used.state).toBe('conditional');
    expect(result.used.value).toBe(4);
    expect(result.used.text).toContain('If power arrives, Rack may report');
    expect(result.condition).toBe('If power arrives');
    expect(result.used.basis?.source.fromWord).toBe(result.used.source.fromWord + 3);
    rejected(fixture, (raw) => {
      delete raw.condition;
    });
    rejected(fixture, (raw) => {
      raw.condition = 'If demand arrives';
    });
    rejected(fixture, (raw) => {
      record(raw.used).state = 'source-stated';
    });
    rejected(fixture, (raw) => {
      const source = record(record(raw.used).source);
      source.fromWord = Number(source.fromWord) + 3;
    });
  });
  it.each([
    'used',
    'reserved',
  ])('OP35 observed %s cannot exceed installed/nonoverlap even with correct local evidence', (key) => {
    rejected(installedSourceFixture(), (raw, fixture) => {
      const quantity = record(raw[key]);
      sourceReplace(fixture, quantity, String(quantity.value), '9');
      quantity.value = 9;
    });
  });
  it('OP35 already-observed allocation cannot exceed installed just because the other allocation is unknown', () => {
    rejected(installedSourceFixture('unknown'), (raw, fixture) => {
      const quantity = record(raw.reserved);
      sourceReplace(fixture, quantity, '2', '11');
      quantity.value = 11;
    });
  });
  it.each([
    'idle',
    'reserved',
    'burst',
  ])('OP67 %s must remain disjoint within installed capacity', (key) => {
    rejected(resourcesSourceFixture(), (raw, fixture) => {
      const quantity = record(raw[key]);
      sourceReplace(fixture, quantity, String(quantity.value), '8');
      quantity.value = 8;
    });
  });
  it('OP67 known idle/reserved still cannot exceed installed when burst is conditional', () => {
    rejected(resourcesSourceFixture('conditional'), (raw, fixture) => {
      const quantity = record(raw.idle);
      sourceReplace(fixture, quantity, '3', '9');
      quantity.value = 9;
    });
  });
  it.each([
    'OP-35',
    'OP-67',
  ] as const)('%s requires full explicit partition evidence, not adjacent facts', (id) => {
    rejected(primary(id), (raw) => {
      record(raw.partition).source = structuredClone(record(raw.installed).source);
    });
    rejected(primary(id), (raw) => {
      const source = record(record(raw.partition).source);
      source.fromWord = Number(source.fromWord) + 1;
    });
    rejected(primary(id), (raw) => {
      record(raw.partition).overlap = false;
    });
  });
  it('OP66 load/capacity are not interchangeable requests/seats/tokens even if each value is separately sourced', () => {
    for (const unit of ['seats', 'tokens'])
      rejected(requestSourceFixture(), (raw, fixture) => {
        const quantity = record(raw.capacity),
          basis = record(quantity.basis);
        sourceReplace(fixture, quantity, 'requests', unit);
        quantity.unit = unit;
        basis.unit = unit;
        basis.population = unit;
      });
    rejected(requestSourceFixture(), (raw) => {
      record(raw.queued).source = structuredClone(record(raw.capacity).source);
    });
  });
  it('money-ready never replaces independent power/cooling readiness or commissions a rack', () => {
    const scene = parse(readinessSourceFixture()).scene;
    if (!scene || scene.preset !== 'physical-readiness') throw new Error('Missing readiness');
    expect([scene.moneyReady.state, scene.powerReady.state, scene.coolingReady.state]).toEqual([
      'source-stated',
      'negative',
      'pending',
    ]);
    for (const key of ['powerReady', 'coolingReady']) {
      rejected(readinessSourceFixture(), (raw) => {
        record(raw[key]).source = structuredClone(record(raw.moneyReady).source);
        record(raw[key]).state = 'source-stated';
      });
      rejected(readinessSourceFixture(), (raw) => {
        record(raw[key]).state = 'ready';
      });
      rejected(readinessSourceFixture(), (raw) => {
        record(raw[key]).configured = true;
      });
    }
    rejected(readinessSourceFixture(), (raw) => {
      raw.commissioned = true;
    });
  });
  it.each([
    'OP-65',
    'OP-68',
    'OP-69',
    'OP-70',
  ] as const)('%s conditional source cannot be cropped/promoted to an observed state', (id) => {
    const fixture =
      id === 'OP-65'
        ? readinessSourceFixture('conditional')
        : id === 'OP-68'
          ? scopeSourceFixture()
          : id === 'OP-69'
            ? transitionSourceFixture('conditional')
            : provenanceSourceFixture('conditional');
    const keys: (string | number)[] =
      id === 'OP-65'
        ? ['powerReady']
        : id === 'OP-68'
          ? ['processing']
          : id === 'OP-69'
            ? ['transition']
            : ['edges', 0];
    rejected(fixture, (raw) => {
      path(raw, keys).state = id === 'OP-69' ? 'completed' : 'source-stated';
    });
    rejected(fixture, (raw) => {
      const source = path(path(raw, keys), ['source']);
      source.fromWord = Number(source.fromWord) + 3;
      delete raw.condition;
    });
  });
  it('processing boundary is a full named clause, not a map, legal claim, certification or live monitoring', () => {
    rejected(scopeSourceFixture(), (raw) => {
      record(raw.boundary).label = 'Records';
    });
    rejected(scopeSourceFixture('negative'), (raw) => {
      record(raw.processing).state = 'source-stated';
    });
    for (const key of ['compliance', 'certified', 'monitoring', 'latitude', 'coordinates', 'url'])
      rejected(scopeSourceFixture(), (raw) => {
        record(raw.processing)[key] = true;
      });
    rejected(scopeSourceFixture(), (raw) => {
      const source = record(record(raw.processing).source);
      source.toWord = Number(source.toWord) + 6;
    });
  });
  it.each([
    'pending',
    'blocked',
    'unknown',
  ] as const)('provider %s requires its own exact explicit status/dependency/direction, not connection by time', (state) => {
    const fixture = transitionSourceFixture(state),
      scene = parse(fixture).scene;
    if (!scene || scene.preset !== 'provider-transition') throw new Error('Missing transition');
    expect(scene.transition.state).toBe(state);
    rejected(fixture, (raw) => {
      record(raw.transition).state = 'completed';
    });
    rejected(fixture, (raw) => {
      [raw.fromProvider, raw.toProvider] = [raw.toProvider, raw.fromProvider];
    });
    rejected(fixture, (raw) => {
      record(raw.dependency).label = 'Old';
    });
    rejected(fixture, (raw) => {
      record(raw.transition).connected = true;
    });
  });
  it('OP63 missing evidence retains exact version/date/status and is never diligence approval', () => {
    const fixture = evidenceSourceFixture();
    rejected(fixture, (raw) => {
      record(list(raw.items)[1].entry).version = 'v1';
    });
    rejected(fixture, (raw) => {
      list(raw.items)[1].date = '2026-06-01';
    });
    rejected(fixture, (raw) => {
      record(list(raw.items)[1].fact).state = 'source-stated';
    });
    rejected(fixture, (raw) => {
      record(list(raw.items)[1].entry).source = structuredClone(
        record(list(raw.items)[0].entry).source,
      );
    });
    rejected(fixture, (raw) => {
      raw.approved = true;
    });
    rejected(fixture, (raw) => {
      list(raw.items)[0].date = '2026-02-30';
    });
  });
  it('OP70 binds every declared edge to exact local actor, endpoint versions and direction', () => {
    const fixture = provenanceSourceFixture();
    rejected(fixture, (raw) => {
      list(raw.entries)[0].version = 'v2';
    });
    rejected(fixture, (raw) => {
      list(raw.edges)[0].fromId = 'table';
      list(raw.edges)[0].toId = 'data';
    });
    rejected(fixture, (raw) => {
      list(raw.edges)[0].toId = 'absent';
    });
    rejected(fixture, (raw) => {
      list(raw.edges).push(structuredClone(list(raw.edges)[0]));
    });
    rejected(fixture, (raw) => {
      list(raw.edges)[0].source = structuredClone(list(raw.entries)[0].source);
    });
    rejected(provenanceSourceFixture('negative'), (raw) => {
      list(raw.edges)[0].state = 'source-stated';
    });
    for (const key of ['approval', 'training', 'live', 'program'])
      rejected(fixture, (raw) => {
        list(raw.edges)[0][key] = true;
      });
  });
  it('OP71 is diagram-only, comparable task/cohort/unit/reporting-period/denominator snapshots, not live drift', () => {
    const fixture = evaluationSourceFixture();
    rejected(fixture, (raw) => {
      raw.visualMode = 'hybrid';
    });
    rejected(fixture, (raw) => {
      list(raw.snapshots)[1].version = 'v1';
    });
    rejected(fixture, (raw) => {
      list(raw.snapshots)[1].date = '2026-06-01';
    });
    rejected(fixture, (raw) => {
      record(raw.task).label = 'Model';
    });
    rejected(fixture, (raw, source) => {
      const q = record(list(raw.snapshots)[1].quantity),
        b = record(q.basis);
      sourceReplace(source, q, 'cases', 'users');
      b.population = 'users';
    });
    rejected(fixture, (raw, source) => {
      const q = record(list(raw.snapshots)[1].quantity),
        b = record(q.basis);
      sourceReplace(source, q, '10', '9');
      b.denominator = 9;
    });
    rejected(evaluationSourceFixture(true), (raw) => {
      record(list(raw.snapshots)[1].quantity).value = 0;
    });
    for (const key of ['drift', 'improvement', 'live', 'telemetry'])
      rejected(fixture, (raw) => {
        raw[key] = true;
      });
  });
  it('OP72 exact supplied sequential latency conserves once, never concurrent sums or duplicated stages', () => {
    const fixture = latencySourceFixture();
    rejected(fixture, (raw, source) => {
      const q = record(raw.total);
      sourceReplace(source, q, '5', '6');
      q.value = 6;
    });
    rejected(fixture, (raw) => {
      list(raw.stages).push(structuredClone(list(raw.stages)[0]));
    });
    rejected(fixture, (raw) => {
      list(raw.stages).reverse();
    });
    rejected(fixture, (raw) => {
      record(raw.aggregation).state = 'parallel';
    });
    rejected(fixture, (raw, source) => {
      sourceReplace(source, record(raw.aggregation), 'sequential', 'parallel');
    });
    rejected(fixture, (raw) => {
      record(raw.aggregation).source = structuredClone(record(raw.total).source);
    });
    rejected(fixture, (raw) => {
      record(raw.aggregation).overlap = false;
    });
    const scene = parse(latencySourceFixture(true)).scene;
    if (!scene || scene.preset !== 'end-to-end-periods') throw new Error('Missing unknown latency');
    expect(scene.aggregation.state).toBe('unknown');
    expect(scene.total.value).toBeNull();
    expect(scene.stages.every((stage) => stage.quantity.value === null)).toBe(true);
  });
  it.each(
    INFRASTRUCTURE_SOURCE_FIXTURES,
  )('$id rejects unknown keys, actor swaps, cropped resolves and malformed source/beat/window metadata', (fixture) => {
    rejected(fixture, (raw) => {
      raw.arbitraryGraph = [];
    });
    rejected(fixture, (raw) => {
      record(raw.factEvidence).label = 'separate';
      raw.outcome = 'separate';
    });
    rejected(fixture, (raw) => {
      const source = record(record(raw.factEvidence).source);
      source.fromWord = Number(source.fromWord) + 1;
    });
    rejected(fixture, (raw) => {
      raw.actionWord = raw.setupWord;
    });
    rejected(fixture, (raw) => {
      raw.startWord = 1;
    });
    rejected(fixture, (raw) => {
      raw.layout = 'world-map';
    });
    rejected(fixture, (raw) => {
      const identity = record(raw.resource ?? raw.owner);
      identity.id = 'foreign';
      identity.label = 'Facts';
    });
  });
});

describe('infrastructure rejects hostile input before field access (shared bounds unchanged)', () => {
  it.each([
    'OP-35',
    'OP-70',
  ] as const)('%s bounds bytes/nodes/depth/arrays/string/nonfinite/accessors/prototype/cycles before use', (id) => {
    const fixture = primary(id);
    for (const value of [NaN, Infinity, -Infinity])
      rejected(fixture, (raw) => {
        raw.setupWord = value;
      });
    for (const key of ['startWord', 'endWord'])
      rejected(fixture, (raw) => {
        raw[key] = Infinity;
      });
    rejected(fixture, (raw) => {
      raw.extra = 'x'.repeat(513);
    });
    rejected(fixture, (raw) => {
      raw.extra = Array.from({ length: 13 }, () => 0);
    });
    rejected(fixture, (raw) => {
      raw.extra = { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } };
    });
    rejected(fixture, (raw) => {
      raw.extra = Array.from({ length: 12 }, () => 'x'.repeat(512));
      raw.other = Array.from({ length: 12 }, () => 'y'.repeat(512));
      raw.third = Array.from({ length: 12 }, () => 'z'.repeat(512));
    });
    rejected(fixture, (raw) => {
      raw.extra = Array.from({ length: 12 }, () =>
        Array.from({ length: 12 }, () => Array.from({ length: 4 }, () => 0)),
      );
    });
    rejected(fixture, (raw) => {
      raw.loop = raw;
    });
    rejected(fixture, (raw) => {
      Object.setPrototypeOf(raw, { inherited: true });
    });
    rejected(fixture, (raw) => {
      Object.defineProperty(raw, '__proto__', { enumerable: true, value: {} });
    });
    let accesses = 0;
    const raw = structuredClone(fixture.raw);
    Object.defineProperty(raw, 'kind', {
      enumerable: true,
      get: () => {
        accesses++;
        throw new Error('must not invoke getter');
      },
    });
    expect(() => parse(fixture, raw)).not.toThrow();
    expect(accesses).toBe(0);
    expect(parse(fixture, raw).scene).toBeNull();
  });
  it('rejects non-record primitives and arrays without coercion', () => {
    const fixture = primary('OP-35');
    for (const raw of [null, undefined, [], 'capacity-map', 1, true])
      expect(parse(fixture, raw).scene).toBeNull();
  });
  it('preserves shared JSON-tree rejection of repeated object references', () => {
    rejected(installedSourceFixture(), (raw) => {
      record(record(raw.used).basis).source = record(raw.used).source;
    });
  });
});

const nativeFixtures = INFRASTRUCTURE_SOURCE_FIXTURES.filter((fixture) => fixture.id !== 'OP-71');
function withNativeClause(id: InfrastructureRecipeId, clause: string): InfrastructureSourceFixture {
  const fixture = (() => {
    switch (id) {
      case 'OP-35':
        return installedSourceFixture('source-stated', clause);
      case 'OP-63':
        return evidenceSourceFixture('unknown', 2, clause);
      case 'OP-65':
        return readinessSourceFixture('negative', clause);
      case 'OP-66':
        return requestSourceFixture('source-stated', clause);
      case 'OP-67':
        return resourcesSourceFixture('source-stated', clause);
      case 'OP-68':
        return scopeSourceFixture('conditional', 'Zone', clause);
      case 'OP-69':
        return transitionSourceFixture('pending', clause);
      case 'OP-70':
        return provenanceSourceFixture('source-stated', clause);
      case 'OP-72':
        return latencySourceFixture(false, 2, clause);
      case 'OP-71':
        throw new Error('Evaluation has no native meaning');
    }
  })();
  // Preserve the actual source qualifier so rejection is about the model, not an omitted condition.
  if (clause.startsWith('If ')) fixture.raw.condition = clause.split(',')[0];
  return fixture;
}
function nativeSentence(fixture: InfrastructureSourceFixture): string {
  const span = record(fixture.raw.modelSource);
  return fixture.words
    .slice(Number(span.fromWord), Number(span.toWord) + 1)
    .map((word) => word.text)
    .join(' ');
}
function rejectsDeclaredModel(fixture: InfrastructureSourceFixture, raw: Rec = fixture.raw): void {
  const before = structuredClone(fixture);
  const core = parse(fixture, { ...raw, visualMode: 'diagram', modelSource: null });
  expect(core.scene, core.ctx.issues.join('; ')).not.toBeNull();
  expect(core.ctx.issues).toEqual([]);
  for (const visualMode of ['diagram', 'hybrid'] as const) {
    const result = parse(fixture, { ...raw, visualMode });
    expect(result.scene).toBeNull();
    expect(result.ctx.issues.length).toBeGreaterThan(0);
  }
  expect(fixture).toEqual(before);
}

describe('native source boundary contract', () => {
  it.each(
    INFRASTRUCTURE_NO_NATIVE_SOURCE_FIXTURES.filter((fixture) => fixture.id !== 'OP-71'),
  )('$id actual no-native words accept diagram/null with no assets, never hybrid/missing/null', (fixture) => {
    const result = parse(fixture);
    if (!result.scene) throw new Error(result.ctx.issues.join('; '));
    expect(result.ctx.issues).toEqual([]);
    expect(result.scene.modelSource).toBeNull();
    expect(infrastructureAssets(result.scene)).toEqual([]);
    expect(fixture.words.map((word) => word.text).join(' ')).not.toMatch(
      /data-center rack|provider connector panel|playbook binder/iu,
    );
    for (const modelSource of [null, undefined]) {
      expect(
        parse(fixture, { ...fixture.raw, visualMode: 'hybrid', modelSource }).scene,
      ).toBeNull();
    }
    const explicitNull = parse(fixture, {
      ...fixture.raw,
      visualMode: 'diagram',
      modelSource: null,
    });
    expect(explicitNull.scene).toEqual(result.scene);
    expect(explicitNull.ctx.issues).toEqual([]);
    const missing: Rec = { ...fixture.raw, visualMode: 'hybrid' };
    delete missing.modelSource;
    expect(parse(fixture, missing).scene).toBeNull();
    const missingDiagram = parse(fixture, { ...missing, visualMode: 'diagram' });
    expect(missingDiagram.scene).toEqual(result.scene);
    expect(missingDiagram.ctx.issues).toEqual([]);
    const identity = record(fixture.raw.resource ?? fixture.raw.owner);
    rejectsDeclaredModel(fixture, {
      ...fixture.raw,
      modelSource: structuredClone(identity.source),
    });
  });
  it.each(
    nativeFixtures,
  )('$id actual literal/native clauses preserve identical core facts across both modes and nullable diagram', (fixture) => {
    for (const sentence of [
      nativeSentence(fixture),
      nativeSentence(fixture).replace(' illustrates ', ' is '),
    ]) {
      const source = withNativeClause(fixture.id, sentence);
      const diagram = parse(source, { ...source.raw, visualMode: 'diagram' });
      const hybrid = parse(source, { ...source.raw, visualMode: 'hybrid' });
      const nullable = parse(source, { ...source.raw, visualMode: 'diagram', modelSource: null });
      if (!diagram.scene || !hybrid.scene || !nullable.scene)
        throw new Error(
          [...diagram.ctx.issues, ...hybrid.ctx.issues, ...nullable.ctx.issues].join('; '),
        );
      expect(diagram.ctx.issues).toEqual([]);
      expect(hybrid.ctx.issues).toEqual([]);
      expect(nullable.ctx.issues).toEqual([]);
      expect(hybrid.scene.modelSource).toEqual(source.raw.modelSource);
      expect(nativeSentence(source)).toBe(sentence);
      expect({ ...diagram.scene, visualMode: 'hybrid' }).toEqual(hybrid.scene);
      expect({
        ...nullable.scene,
        visualMode: 'hybrid',
        modelSource: hybrid.scene.modelSource,
      }).toEqual(hybrid.scene);
      expect(infrastructureAssets(nullable.scene)).toEqual([]);
    }
  });
  it.each(
    nativeFixtures,
  )('$id rejects model selectors and malformed span keys/types in either declared mode', (fixture) => {
    const span = record(fixture.raw.modelSource);
    for (const modelSource of [
      undefined,
      'A-13',
      { asset: 'A-13' },
      { ...span, asset: 'A-13' },
      { ...span, text: nativeSentence(fixture) },
      { fromWord: '0', toWord: 1 },
      { fromWord: 2, toWord: 1 },
      { fromWord: NaN, toWord: 1 },
    ]) {
      rejectsDeclaredModel(fixture, { ...fixture.raw, modelSource });
    }
  });
  it.each(
    nativeFixtures,
  )('$id rejects wrong actor/period/asset, negative/conditional/adjacent clauses and invented outcomes in both modes', (fixture) => {
    const sentence = nativeSentence(fixture);
    for (const clause of [
      sentence.replace(/^\S+/u, 'Other'),
      sentence.replace('during June.', 'during July.'),
      sentence.replace(
        /data-center rack|provider connector panel|playbook binder/u,
        'unregistered cabinet',
      ),
      sentence.replace(' illustrates ', ' does not illustrate '),
      fixture.raw.condition === undefined
        ? `If allowed, ${sentence}`
        : sentence.replace(' illustrates ', ' may illustrate '),
      `Other illustrates architecture. ${sentence}`,
      `${sentence} Other illustrates architecture.`,
      sentence.replace(' during ', '. During '),
      `${sentence.slice(0, -1)};`,
      ...[
        'grants financial rights',
        'completes the provider switch',
        'measures live telemetry',
        'certifies compliance',
        'approves revisions',
        'retrains the model',
      ].map((claim) => sentence.replace(' during June.', ` and ${claim} during June.`)),
    ])
      rejectsDeclaredModel(withNativeClause(fixture.id, clause));
  });
  it.each(
    nativeFixtures,
  )('$id rejects an unterminated model sentence and the now-cropped following core clause in both modes', (fixture) => {
    const source = withNativeClause(fixture.id, nativeSentence(fixture).slice(0, -1));
    for (const visualMode of ['diagram', 'hybrid'] as const) {
      for (const modelSource of [null, source.raw.modelSource]) {
        const result = parse(source, { ...source.raw, visualMode, modelSource });
        expect(result.scene).toBeNull();
        expect(result.ctx.issues.length).toBeGreaterThan(0);
      }
    }
  });
  it.each(
    nativeFixtures,
  )('$id rejects cropped negation/conditions, cropped periods and replayed identity/fact/multi-sentence spans in both modes', (fixture) => {
    const span = record(fixture.raw.modelSource);
    const identity = record(fixture.raw.resource ?? fixture.raw.owner);
    for (const modelSource of [
      { ...span, fromWord: Number(span.fromWord) + 1 },
      { ...span, toWord: Number(span.toWord) - 1 },
      { fromWord: 0, toWord: span.toWord },
      structuredClone(identity.source),
      structuredClone(record(fixture.raw.factEvidence).source),
    ])
      rejectsDeclaredModel(fixture, { ...fixture.raw, modelSource });
    for (const prefix of [
      'Not ',
      fixture.raw.condition === undefined ? 'If allowed, ' : 'Subject to consent, ',
    ]) {
      const source = withNativeClause(fixture.id, `${prefix}${nativeSentence(fixture)}`);
      const sourceSpan = record(source.raw.modelSource);
      rejectsDeclaredModel(source, {
        ...source.raw,
        modelSource: {
          ...sourceSpan,
          fromWord: Number(sourceSpan.fromWord) + prefix.trim().split(/\s+/u).length,
        },
      });
    }
  });
  it.each([
    ['OP-63', 'Ledger', 'Other'],
    ['OP-63', 'Permit', 'Other'],
    ['OP-63', 'v1', 'v9'],
    ['OP-63', 'v2', 'v9'],
    ['OP-65', 'Power', 'Funding'],
    ['OP-65', 'Cooling', 'Funding'],
    ['OP-67', 'Cooling', 'Other'],
    ['OP-68', 'Zone', 'Elsewhere'],
    ['OP-68', 'Records', 'Other'],
    ['OP-69', 'Old', 'Other'],
    ['OP-69', 'New', 'Other'],
    ['OP-69', 'Export', 'Other'],
    ['OP-70', 'Data', 'Other'],
    ['OP-70', 'Table', 'Other'],
    ['OP-70', 'v1', 'v9'],
    ['OP-70', 'v2', 'v9'],
    ['OP-72', 'Request', 'Other'],
  ] as const)('%s rejects native-only wrong selected identity/version %s -> %s while its core remains true', (id, from, to) => {
    rejectsDeclaredModel(withNativeClause(id, nativeSentence(primary(id)).replaceAll(from, to)));
  });
  it('OP-70 requires its binder AND first-version boundary/provenance connector; OP-63 permits version inspection only', () => {
    const provenance = nativeSentence(primary('OP-70'));
    for (const clause of [
      provenance.replace(
        ' with a provenance connector at the Data version v1 version-record boundary',
        '',
      ),
      provenance.replace(
        'the Data version v1 version-record boundary',
        'the Table version v2 version-record boundary',
      ),
      provenance.replace(
        'Data version v1 version-record boundary',
        'Data version v9 version-record boundary',
      ),
      provenance.replace('version-record boundary', 'provider boundary'),
    ])
      rejectsDeclaredModel(withNativeClause('OP-70', clause));
    const parsed = parse(primary('OP-70'), { ...primary('OP-70').raw, visualMode: 'hybrid' });
    if (!parsed.scene) throw new Error(parsed.ctx.issues.join('; '));
    expect(infrastructureAssets(parsed.scene)).toEqual([
      { id: 'archive', asset: 'A-07' },
      { id: 'data', asset: 'A-16' },
    ]);
    const evidence = nativeSentence(primary('OP-63'));
    for (const clause of [
      evidence.replace('inspecting', 'approving'),
      evidence.replace('inspecting', 'retraining from'),
      evidence.replace('Ledger version v1 and Permit version v2', 'Ledger and Permit'),
      evidence.replace(' and Permit version v2', ''),
    ]) {
      rejectsDeclaredModel(withNativeClause('OP-63', clause));
    }
  });
  it('OP-71 accepts only actual diagram/null snapshots and rejects any native declaration or hybrid source', () => {
    const fixture = evaluationSourceFixture();
    const result = parse(fixture);
    if (!result.scene) throw new Error(result.ctx.issues.join('; '));
    expect(result.ctx.issues).toEqual([]);
    expect(result.scene.modelSource).toBeNull();
    expect(infrastructureAssets(result.scene)).toEqual([]);
    for (const modelSource of [
      null,
      undefined,
      structuredClone(record(fixture.raw.owner).source),
      structuredClone(record(list(fixture.raw.snapshots)[0].quantity).source),
    ]) {
      expect(
        parse(fixture, { ...fixture.raw, visualMode: 'hybrid', modelSource }).scene,
      ).toBeNull();
      if (modelSource != null) rejectsDeclaredModel(fixture, { ...fixture.raw, modelSource });
    }
  });
});
