import { describe, expect, it } from 'vitest';
import {
  channelSourceFixture,
  demandSourceFixture,
  MARKETS_SOURCE_FIXTURES,
  type MarketsSourceFixture,
  marketsSourceContext,
  matchingSourceFixture,
  procurementSourceFixture,
} from '../../remotion/compositions/explainer/business/markets/fixtures';
import {
  MARKETS_RAIL,
  marketsContentFits,
  marketsDetailWindows,
  marketsPresentationFits,
  marketsRows,
  marketsTextWidth,
} from '../../remotion/compositions/explainer/business/markets/presentation';
import type { ProcurementCommitmentScene } from '../../remotion/compositions/explainer/business/markets/types';
import {
  parseMarketDependencyScene,
  parseProcurementCommitmentScene,
} from './business-markets-contract';
import { isRec, type Rec } from './kind-spec';

function record(value: unknown): Rec {
  if (!isRec(value)) throw new Error('Expected authored record');
  return value;
}
function entries(value: unknown): Rec[] {
  if (!Array.isArray(value)) throw new Error('Expected authored array');
  return value.map(record);
}
function evaluate(fixture: MarketsSourceFixture, raw: unknown = fixture.raw) {
  const ctx = marketsSourceContext(fixture);
  const scene =
    fixture.id === 'OP-47'
      ? parseProcurementCommitmentScene(raw, ctx)
      : parseMarketDependencyScene(raw, ctx);
  return { scene, ctx };
}
function rejects(fixture: MarketsSourceFixture, change: (raw: Rec) => void, diagnostic?: RegExp) {
  const raw = structuredClone(fixture.raw);
  change(raw);
  const { scene, ctx } = evaluate(fixture, raw);
  expect(scene).toBeNull();
  expect(ctx.issues.length).toBeGreaterThan(0);
  if (diagnostic) expect(ctx.issues.join(' ')).toMatch(diagnostic);
}
function acceptedProcurement(fixture: MarketsSourceFixture): ProcurementCommitmentScene {
  const { scene, ctx } = evaluate(fixture);
  expect(scene, ctx.issues.join('; ')).not.toBeNull();
  if (!scene || scene.kind !== 'procurement-commitment')
    throw new Error('Missing procurement scene');
  return scene;
}
function primary(id: string): MarketsSourceFixture {
  const found = MARKETS_SOURCE_FIXTURES.find((f) => f.id === id);
  if (!found) throw new Error(`Missing recipe ${id}`);
  return structuredClone(found);
}
function resolve(
  fixture: MarketsSourceFixture,
  text: string,
  state = 'source-stated',
): MarketsSourceFixture {
  const copy = structuredClone(fixture),
    from = Number(copy.raw.resolveWord),
    tokens = text.split(/\s+/u);
  copy.words = [
    ...copy.words.slice(0, from),
    ...tokens.map((word, i) => ({
      text: word,
      start: 10 + (i * 1.35) / tokens.length,
      end: 10 + ((i + 1) * 1.35) / tokens.length,
    })),
  ];
  const label = text.replace(/\.$/u, '');
  copy.raw.endWord = copy.words.length - 1;
  copy.raw.outcome = label;
  copy.raw.factEvidence = {
    state,
    label,
    source: { fromWord: from, toWord: copy.words.length - 1 },
  };
  return copy;
}

describe('markets strict source contracts', () => {
  it.each(
    MARKETS_SOURCE_FIXTURES,
  )('rejects raw render directives and nonfinite fields: $id', (fixture) => {
    rejects(
      fixture,
      (r) => {
        r.graph = { nodes: [] };
      },
      /unexpected|allow|field/i,
    );
    rejects(fixture, (r) => {
      r.setupWord = NaN;
    });
    rejects(fixture, (r) => {
      r.resolveWord = Infinity;
    });
    rejects(fixture, (r) => {
      r.startWord = -1;
    });
    rejects(fixture, (r) => {
      r.endWord = Number(r.endWord) - 1;
    });
    rejects(fixture, (r) => {
      r.layout = { arbitrary: true };
    });
    rejects(fixture, (r) => {
      r.visualMode = '3d';
    });
    rejects(fixture, (r) => {
      r.actionWord = r.setupWord;
    });
  });
  it.each([
    null,
    [],
    true,
    'not JSON',
    42,
  ])('rejects a non-object input %j with diagnostics', (raw) => {
    for (const fixture of [primary('OP-24'), procurementSourceFixture()]) {
      const { scene, ctx } = evaluate(fixture, raw);
      expect(scene).toBeNull();
      expect(ctx.issues.length).toBeGreaterThan(0);
    }
  });
  it('rejects deep, byte-heavy, cyclic and non-plain objects before walking source fields', () => {
    const fixture = primary('OP-24');
    rejects(fixture, (r) => {
      r.payload = 'x'.repeat(40_000);
    });
    rejects(fixture, (r) => {
      let child: Rec = {};
      r.payload = child;
      for (let i = 0; i < 20; i++) {
        const next: Rec = {};
        child.value = next;
        child = next;
      }
    });
    rejects(fixture, (r) => {
      r.cycle = r;
    });
    rejects(fixture, (r) => {
      r.payload = new Date();
    });
    rejects(fixture, (r) => {
      r.payload = 1n;
    });
  });
  it('rejects malformed nested fields, identity IDs, source arrays and oversized channel arrays without truncation', () => {
    const fixture = channelSourceFixture();
    rejects(fixture, (r) => {
      entries(r.channels)[0].render = 'arbitrary';
    });
    rejects(fixture, (r) => {
      record(entries(r.channels)[0].dependency).text = 'pretend source text';
    });
    rejects(fixture, (r) => {
      record(entries(r.channels)[0].identity).id = '../portal';
    });
    rejects(fixture, (r) => {
      record(entries(r.channels)[1].identity).id = 'portal';
    });
    rejects(fixture, (r) => {
      record(entries(r.channels)[0].dependency).source = [];
    });
    rejects(fixture, (r) => {
      record(record(entries(r.channels)[0].dependency).source).fromWord = -1;
    });
    rejects(fixture, (r) => {
      record(record(entries(r.channels)[0].volume).basis).denominator = 0;
    });
    rejects(fixture, (r) => {
      r.channels = Array.from({ length: 5 }, () => entries(r.channels)[0]);
    });
    rejects(fixture, (r) => {
      r.customerGroups = [entries(r.customerGroups)[0]];
    });
    rejects(fixture, (r) => {
      r.channels = [null, null];
    });
  });
  it('retains distinct channel/customer facts and unknown volume is null, never an invented zero', () => {
    const { scene } = evaluate(channelSourceFixture(true));
    if (!scene || scene.preset !== 'channel-concentration') throw new Error('Missing channels');
    expect(scene.channels.map((c) => c.customerGroupId)).toEqual(['local', 'remote']);
    expect(scene.channels[0].volume.count).toBe(6);
    expect(scene.channels[1].volume).toMatchObject({ state: 'unknown', count: null, basis: null });
    expect(scene.channels[1].volume.text).toContain('Direct to Remote is unknown');
  });
  it.each([
    'period',
    'denominator',
  ] as const)('rejects genuinely stated but incompatible distribution %s bases', (field) => {
    const fixture = channelSourceFixture(),
      volume = record(entries(fixture.raw.channels)[1].volume),
      basis = record(volume.basis),
      source = record(volume.source);
    const from = Number(source.fromWord),
      to = Number(source.toWord);
    const old = field === 'period' ? 'June' : '10',
      replacement = field === 'period' ? 'July' : '20';
    for (let i = from; i <= to; i++)
      if (fixture.words[i].text === old) fixture.words[i].text = replacement;
    basis[field] = field === 'period' ? 'July' : 20;
    const { scene, ctx } = evaluate(fixture);
    expect(scene).toBeNull();
    expect(ctx.issues.join(' ')).toMatch(/identical subject|quantities require/i);
  });
  it('does not treat a role roster or participation as matched, accepted or paid', () => {
    const { scene } = evaluate(matchingSourceFixture());
    if (!scene || scene.preset !== 'participation-matching') throw new Error('Missing matching');
    expect(scene.participants.map((p) => [p.identity.id, p.side])).toEqual([
      ['iris', 'buyer'],
      ['theo', 'seller'],
    ]);
    expect(scene.participations.map((p) => p.state)).toEqual(['participating', 'participating']);
    expect(scene.matches[0]).toMatchObject({ state: 'pending', acceptance: { state: 'pending' } });
    expect(marketsRows(scene).some((r) => r.state === 'paid')).toBe(false);
    rejects(matchingSourceFixture(), (r) => {
      const p = entries(r.participants);
      p[0].role = p[1].role;
    });
    rejects(matchingSourceFixture(), (r) => {
      const m = entries(r.matches)[0];
      [m.leftId, m.rightId] = [m.rightId, m.leftId];
    });
  });
  it('never crops complete conditional, negated, pending or unknown core clauses', () => {
    for (const fixture of [
      demandSourceFixture(),
      demandSourceFixture('conditional'),
      procurementSourceFixture(),
      primary('OP-43'),
    ]) {
      rejects(fixture, (r) => {
        const target =
          fixture.id === 'OP-41'
            ? record(r.production)
            : fixture.id === 'OP-47'
              ? record(r.authority)
              : entries(r.matches)[0];
        record(target.source).fromWord = Number(record(target.source).fromWord) + 1;
      });
    }
    const { scene } = evaluate(demandSourceFixture('conditional'));
    if (!scene || scene.preset !== 'demand-access')
      throw new Error('Missing conditional production');
    expect(scene.condition).toBe('If tools arrive');
    expect(scene.production.text).toBe('If tools arrive, Lumen may produce Repair.');
  });
  it('requires both displayed resolve fields to preserve the entire local clause', () => {
    rejects(primary('OP-41'), (r) => {
      r.outcome = 'remain distinct';
    });
    rejects(primary('OP-41'), (r) => {
      record(r.factEvidence).label = 'remain distinct';
    });
    const negated = resolve(primary('OP-41'), 'Not paid yet.');
    rejects(negated, (r) => {
      r.outcome = 'paid yet';
      record(r.factEvidence).label = 'paid yet';
    });
    const conditional = resolve(primary('OP-41'), 'If signed, winner declared.', 'scenario');
    rejects(conditional, (r) => {
      r.condition = 'If signed';
      r.outcome = 'winner declared';
      record(r.factEvidence).label = 'winner declared';
    });
  });
  it.each([
    'Profit doubled.',
    'Winner declared.',
    'Payment settled.',
    'Network value grew.',
  ])('refuses a resolve promotion unsupported by validated core facts: %s', (text) => {
    const fixture = resolve(primary('OP-45'), text);
    const { scene, ctx } = evaluate(fixture);
    expect(scene).toBeNull();
    expect(ctx.issues.length).toBeGreaterThan(0);
  });
  it('rejects insufficient real time/final hold and fixed-font widest-token overflow', () => {
    const fixture = procurementSourceFixture(),
      response = Number(fixture.raw.responseWord),
      check = Number(fixture.raw.checkWord);
    fixture.raw.visualMode = 'hybrid';
    for (let i = response; i < check; i++) {
      fixture.words[i].start = 5.4 + ((i - response) * 2.1) / (check - response);
      fixture.words[i].end = 5.4 + ((i + 1 - response) * 2.1) / (check - response);
    }
    const density = evaluate(fixture);
    expect(density.scene).toBeNull();
    expect(density.ctx.issues.join(' ')).toMatch(/1\.5s/);
    const late = primary('OP-41'),
      start = Number(late.raw.resolveWord);
    for (let i = start; i < late.words.length; i++) {
      late.words[i].start = 11.1 + ((i - start) * 0.25) / (late.words.length - start);
      late.words[i].end = 11.1 + ((i + 1 - start) * 0.25) / (late.words.length - start);
    }
    expect(evaluate(late).scene).toBeNull();
    const wide = demandSourceFixture('conditional');
    for (const word of wide.words) if (word.text === 'tools') word.text = 'W'.repeat(40);
    wide.raw.condition = `If ${'W'.repeat(40)} arrive`;
    expect(marketsTextWidth('W'.repeat(40))).toBeGreaterThan(MARKETS_RAIL.width - 48);
    expect(evaluate(wide).scene).toBeNull();
  });
});

describe('procurement independent actions and exact proposed/actual money', () => {
  it('keeps a quoted amount independent from pending authority, acceptance and unpaid payment', () => {
    const scene = acceptedProcurement(procurementSourceFixture());
    expect(scene.quote).toMatchObject({
      state: 'quoted',
      amount: { minorUnits: 1200, currency: 'USD' },
    });
    expect(scene.authority.state).toBe('pending');
    expect(scene.acceptance.state).toBe('pending');
    expect(scene.payment).toMatchObject({ state: 'pending', amount: null, basis: null });
    expect(marketsContentFits(scene)).toBe(true);
    expect(marketsPresentationFits(scene, 11.7)).toBe(true);
  });
  it('supports source-paid facts without inferring authorization from payment', () => {
    const scene = acceptedProcurement(procurementSourceFixture('paid-pending-authority'));
    expect(scene.payment).toMatchObject({
      state: 'paid',
      amount: { minorUnits: 1200, currency: 'USD' },
    });
    expect(scene.authority.state).toBe('pending');
    expect(scene.acceptance.state).toBe('accepted');
  });
  it('accepts literal paid, unpaid, shared-role and unknown-approver facts only as actually stated', () => {
    expect(acceptedProcurement(procurementSourceFixture('paid')).authority.state).toBe('granted');
    expect(acceptedProcurement(procurementSourceFixture('unpaid')).payment.state).toBe('negative');
    const unknown = acceptedProcurement(procurementSourceFixture('unknown-approver'));
    expect(unknown.roles.approver.actorId).toBeNull();
    expect(unknown.actors.some((a) => a.label === 'Fran')).toBe(false);
    const shared = acceptedProcurement(procurementSourceFixture('shared-requester-delegate'));
    expect(shared.roles.delegate.actorId).toBe(shared.roles.requester.actorId);
    rejects(procurementSourceFixture(), (r) => {
      record(record(r.roles).delegate).actorId = 'mira';
    });
  });
  it('counts unknown roles AND amounts: adding a fifth unresolved fact rejects, never drops it', () => {
    const fixture = resolve(
      procurementSourceFixture('unknown-approver'),
      'Status remains unknown.',
      'unknown',
    );
    const { scene, ctx } = evaluate(fixture);
    expect(scene).toBeNull();
    expect(ctx.issues.join(' ')).toMatch(/four holds/);
  });
  it.each([
    'pending-amount',
    'conditional-quote',
    'conditional-payment',
  ] as const)('preserves known %s values and source qualifications instead of relabeling cash/unknown', (variant) => {
    const fixture = procurementSourceFixture(variant),
      scene = acceptedProcurement(fixture);
    const fact = variant === 'conditional-quote' ? scene.quote : scene.payment;
    expect(fact.state).toBe(variant === 'pending-amount' ? 'pending' : 'conditional');
    expect(fact.amount).toEqual({ minorUnits: 1200, currency: 'USD' });
    if (variant !== 'pending-amount') {
      expect(scene.condition).toBe('If purchasing clears');
      expect(fact.text).toContain('If purchasing clears,');
      expect(fact.text).toContain('may');
      if (!fact.basis) throw new Error('Missing proposed basis');
      expect(fact.basis.source.fromWord).toBe(fact.source.fromWord + 3);
      expect(fact.basis.source.toWord).toBe(fact.source.toWord);
    }
    const snapshot = structuredClone(fact);
    for (const t of [
      11.7,
      0,
      scene.resolveAt,
      scene.checkAt,
      ...marketsDetailWindows(scene).map((w) => w.start),
      scene.responseAt,
    ]) {
      marketsRows(scene);
      expect(fact).toEqual(snapshot);
      expect(Number.isFinite(t)).toBe(true);
    }
  });
  it('allows basis containment ONLY as the complete body of that supported conditional source fact', () => {
    for (const variant of ['conditional-quote', 'conditional-payment'] as const) {
      const fixture = procurementSourceFixture(variant),
        key = variant === 'conditional-quote' ? 'quote' : 'payment';
      rejects(fixture, (r) => {
        record(record(r[key]).basis).source = record(r[key]).source;
      });
      rejects(fixture, (r) => {
        const span = record(record(record(r[key]).basis).source);
        span.fromWord = Number(span.fromWord) + 1;
      });
      rejects(fixture, (r) => {
        const span = record(record(record(r[key]).basis).source);
        span.toWord = Number(span.toWord) - 1;
      });
      rejects(fixture, (r) => {
        record(record(r[key]).basis).subjectId = variant === 'conditional-quote' ? 'mira' : 'pike';
      });
      rejects(fixture, (r) => {
        r.condition = 'If unrelated';
      });
      rejects(fixture, (r) => {
        record(r[key]).state = variant === 'conditional-quote' ? 'quoted' : 'paid';
      });
    }
    rejects(procurementSourceFixture('paid'), (r) => {
      const span = record(record(record(r.payment).basis).source);
      span.fromWord = Number(span.fromWord) + 1;
    });
  });
  it.each([
    NaN,
    Infinity,
    -Infinity,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER,
    100_000_000_001,
  ])('rejects unsafe/nonfinite minor units %s', (value) => {
    rejects(procurementSourceFixture('paid'), (r) => {
      record(record(r.payment).amount).minorUnits = value;
    });
  });
  it('requires local actual paid fact, currency, amount and distinct quote/payment/task/item/actor IDs', () => {
    const fixture = procurementSourceFixture('paid');
    rejects(fixture, (r) => {
      record(record(r.payment).amount).currency = 'JPY';
    });
    rejects(fixture, (r) => {
      record(record(r.payment).amount).currency = 'EUR';
    });
    rejects(fixture, (r) => {
      record(record(r.payment).basis).population = 'customers';
    });
    rejects(fixture, (r) => {
      record(record(r.payment).basis).subjectId = 'pike';
    });
    rejects(fixture, (r) => {
      record(r.payment).amount = null;
      record(r.payment).basis = null;
    });
    rejects(fixture, (r) => {
      record(record(r.payment).identity).id = 'estimate';
    });
    rejects(fixture, (r) => {
      record(r.item).id = 'acquire';
    });
    rejects(fixture, (r) => {
      record(r.request).source = record(r.authority).source;
    });
    rejects(fixture, (r) => {
      r.actors = [...entries(r.actors), entries(r.actors)[0]];
    });
    rejects(fixture, (r) => {
      record(record(r.roles).approver).extra = true;
    });
  });
  it('retains independently stated currencies without inventing an exchange or assuming quote is paid', () => {
    const fixture = procurementSourceFixture('paid'),
      quote = record(fixture.raw.quote),
      source = record(quote.source);
    for (let i = Number(source.fromWord); i <= Number(source.toWord); i++)
      if (fixture.words[i].text === 'USD') fixture.words[i].text = 'EUR';
    record(quote.amount).currency = 'EUR';
    record(quote.basis).unit = 'EUR';
    const scene = acceptedProcurement(fixture);
    expect(scene.quote.amount?.currency).toBe('EUR');
    expect(scene.payment.amount?.currency).toBe('USD');
  });
});
