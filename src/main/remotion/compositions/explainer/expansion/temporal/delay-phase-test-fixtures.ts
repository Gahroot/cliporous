import { readFileSync } from 'node:fs';
import {
  parseExpansionDelayThroughput,
  parseExpansionPeriodicPhase,
} from '../../../../../ai/explainer/expansion-temporal-delay-phase-contract';
import {
  type TemporalFixtureSeed,
  temporalSourceFixtures,
} from '../../../../../ai/explainer/expansion-temporal-fixtures';
import { isRec, makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import { conceptFixtureWords } from '../../concepts/fixture-words';
import type { ExpansionDelayPhaseScene, PeriodicSignalTemplate } from './delay-phase-types';

export const delayPhasePacket = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/temporal/delay-phase.source.json',
    'utf8',
  ),
) as { stories: TemporalFixtureSeed[] };
export const delayPhaseRaw = temporalSourceFixtures(delayPhasePacket.stories);
export function parseDelayPhase(
  seed: TemporalFixtureSeed,
  visualMode: 'diagram' | 'hybrid' = 'diagram',
): ExpansionDelayPhaseScene {
  const ctx = makeParseContext(seed.words, seed.window);
  const raw = { ...seed.proposal, visualMode };
  const scene =
    seed.id === '45'
      ? parseExpansionDelayThroughput(raw, ctx)
      : parseExpansionPeriodicPhase(raw, ctx);
  if (!scene || ctx.issues.length) throw new Error(JSON.stringify(ctx.issues));
  return scene;
}
const states = [
  'known',
  'conditional',
  'illustrative',
  'simulated',
  'missing',
  'unknown',
  'disputed',
] as const;
export const delayPhaseCondition = `if ${'W'.repeat(93)}`;
/** Entire clauses and word evidence are authored here, not injected after parsing. */
export function delayPhaseStressSeed(
  id: '45' | '46',
  template: PeriodicSignalTemplate = 'cycle-dial',
  phaseValue = -360,
  direction: 'clockwise' | 'counterclockwise' = 'counterclockwise',
): TemporalFixtureSeed {
  const names = Array.from(
    { length: 8 },
    (_, i) => `${String.fromCharCode(65 + i)}${'W'.repeat(27)}`,
  );
  const period = 'P'.repeat(32),
    population = 'G'.repeat(40),
    subject = id === '45' ? 'Delay board' : 'Cycle board';
  const clauses = [`${subject} lists ${names.join(' and ')} during ${period} among ${population}.`];
  const records: Rec[] = [],
    signals: Rec[] = [],
    relations: Rec[] = [];
  const span = (i: number): Rec => ({ clause: i });
  const rational = (n: number): Rec => ({
    kind: 'rational',
    value: { numerator: n, denominator: 1 },
  });
  const basis = (unit: string): Rec => ({
    unit,
    period,
    population,
    denominator: { numerator: 1000000000, denominator: 1 },
  });
  for (let i = 0; i < 12; i++) {
    const actor = names[i % 8];
    const dimension = id === '45' ? (i < 8 ? 'latency' : 'throughput') : i < 8 ? 'period' : 'phase';
    const reference = names[(i + 1) % 8];
    const claim = dimension === 'phase' ? `phase relative to ${reference}` : dimension;
    const state = i === 8 ? 'known' : states[i % states.length];
    const value =
      dimension === 'latency'
        ? i === 0
          ? 0
          : 86400
        : dimension === 'throughput'
          ? 1000000
          : dimension === 'phase'
            ? phaseValue
            : 60;
    const unit =
      dimension === 'latency' || dimension === 'period'
        ? 'second'
        : dimension === 'throughput'
          ? 'item/second'
          : 'degree';
    const notation =
      unit === 'item/second' ? 'items per second' : unit === 'degree' ? 'degrees' : 'seconds';
    const amountText =
      state === 'missing' || state === 'unknown'
        ? state
        : state === 'disputed'
          ? `disputed between ${value} and ${dimension === 'period' ? 1 : 0}`
          : String(value);
    const qualifier =
      state === 'illustrative' ? 'teaching example' : state === 'simulated' ? 'simulation' : state;
    const prefix =
      state === 'conditional'
        ? `${delayPhaseCondition}, `
        : state === 'illustrative' || state === 'simulated'
          ? `In this ${qualifier}, `
          : '';
    const evidence = span(clauses.length);
    clauses.push(
      `${prefix}${actor} ${claim} is ${amountText} ${notation} during ${period} among ${population} with denominator 1000000000.`,
    );
    const quantity: Rec = { actor, claim, state, basis: basis(unit), evidence };
    if (state === 'disputed')
      quantity.alternatives = [rational(value), rational(dimension === 'period' ? 1 : 0)];
    else if (state !== 'missing' && state !== 'unknown') quantity.amount = rational(value);
    if (state === 'conditional') quantity.condition = delayPhaseCondition;
    else if (state !== 'known') quantity.qualifier = qualifier;
    records.push({ actor, dimension, quantity, ...(dimension === 'phase' ? { reference } : {}) });
  }
  if (id === '46')
    for (const actor of names) {
      const evidence = span(clauses.length);
      clauses.push(
        template === 'cycle-dial'
          ? `${actor} cycles ${direction} during ${period} among ${population}.`
          : `In this teaching example, ${actor} is a ${template} signal cycling ${direction} during ${period} among ${population}.`,
      );
      signals.push({
        actor,
        template,
        direction,
        state: template === 'cycle-dial' ? 'known' : 'illustrative',
        ...(template === 'cycle-dial' ? {} : { qualifier: 'teaching example' }),
        evidence,
      });
    }
  const checkClause = clauses.length;
  const pairs = Array.from({ length: 16 }, (_, i) => [
    i % 8,
    ((i % 8) + 1 + Math.floor(i / 8)) % 8,
  ]);
  for (const [from, to] of pairs) {
    const evidence = span(clauses.length);
    if (id === '45') {
      clauses.push(
        `In this qualitative comparison, latency comparison from ${names[from]} to ${names[to]} is unknown in seconds during ${period} among ${population} with denominator 1000000000.`,
      );
      relations.push({
        from: names[from],
        to: names[to],
        dimension: 'latency',
        comparisonLabel: 'qualitative comparison',
        basis: basis('second'),
        state: 'unknown',
        qualifier: 'unknown',
        evidence,
      });
    } else {
      clauses.push(
        `${names[from]} phase relationship to ${names[to]} is unknown during ${period} among ${population}.`,
      );
      relations.push({
        from: names[from],
        to: names[to],
        state: 'unknown',
        qualifier: 'unknown',
        evidence,
      });
    }
  }
  const resolveClause = clauses.length;
  clauses.push(
    id === '45'
      ? `${subject} keeps latency separate from throughput.`
      : `${subject} preserves supplied periods and phases.`,
  );
  const sourceText = clauses.join(' ');
  const words = conceptFixtureWords(sourceText, 12);
  let cursor = 0;
  const spans = clauses.map((clause) => {
    const count = clause.split(/\s+/).length;
    const result = { fromWord: cursor, toWord: cursor + count - 1 };
    cursor += count;
    return result;
  });
  const speech = {
    sourceText,
    words,
    spans,
    window: { startWord: 0, endWord: words.length - 1, startTime: 0, endTime: 12 },
  };
  // Retain authored five-beat gaps while fitting bounded source clauses between them.
  for (let i = 0; i < speech.spans.length; i++) {
    const start =
      i === 0
        ? 0.25
        : i === 1
          ? 2.25
          : i === 2
            ? 4.25
            : i === resolveClause
              ? 10.25
              : i >= checkClause
                ? 8.25 + (i - checkClause) * 0.11
                : 5.25 + (i - 3) * (2.5 / (checkClause - 3));
    const duration =
      i === 0
        ? 1
        : i === 1 || i === 2
          ? 0.6
          : i === resolveClause
            ? 1.4
            : i >= checkClause
              ? 0.1
              : 2.4 / (checkClause - 3);
    const s = speech.spans[i],
      count = s.toWord - s.fromWord + 1;
    for (let j = 0; j < count; j++) {
      speech.words[s.fromWord + j].start = start + (duration * j) / count;
      speech.words[s.fromWord + j].end = start + (duration * (j + 1)) / count;
    }
  }
  const rebase = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(rebase);
    if (!isRec(v)) return v;
    if (typeof v.clause === 'number') return speech.spans[v.clause];
    return Object.fromEntries(Object.entries(v).map(([k, entry]) => [k, rebase(entry)]));
  };
  const data = rebase({ records, signals, relations });
  if (!isRec(data)) throw new Error('Malformed authored seed');
  return {
    id,
    ...speech,
    proposal: {
      kind: id === '45' ? 'temporal-structure' : 'synchronization',
      preset: id === '45' ? 'delay-throughput' : 'periodic-phase',
      visualMode: 'diagram',
      template: id === '45' ? 'separate-dimensions' : 'bounded-cycles',
      evidence: 'illustrative',
      label: subject,
      subject,
      outcome: id === '45' ? 'latency separate from throughput' : 'supplied periods',
      condition: delayPhaseCondition,
      period,
      population,
      entities: names.map((label) => ({ label, evidence: speech.spans[0] })),
      records: data.records,
      relations: data.relations,
      ...(id === '46' ? { signals: data.signals } : {}),
      setupWord: speech.spans[0].fromWord,
      actionWord: speech.spans[1].fromWord,
      responseWord: speech.spans[2].fromWord,
      checkWord: speech.spans[checkClause].fromWord,
      resolveWord: speech.spans[resolveClause].fromWord,
    },
  };
}
function fixtureRecord(value: unknown): Rec {
  if (!isRec(value)) throw new Error('Expected source fixture record');
  return value;
}
export function delayPhaseNumericSeed(
  value: { numerator: number; denominator: number },
  upper: { numerator: number; denominator: number },
): TemporalFixtureSeed {
  const original = delayPhasePacket.stories.find((s) => s.id === '45');
  if (!original) throw new Error('Missing source story 45');
  const seed = structuredClone(original);
  if (!Array.isArray(seed.proposal.records)) throw new Error('Malformed numerical source');
  const records = seed.proposal.records.map(fixtureRecord).filter((r) => r.dimension === 'latency');
  const replacements = new Map<number, string>();
  for (const [i, amount] of [value, upper].entries()) {
    const record = records[i];
    if (!record) throw new Error('Missing source latency record');
    const q = fixtureRecord(record.quantity),
      evidence = fixtureRecord(q.evidence);
    const at = seed.words.findIndex(
      (w, j) =>
        j >= Number(evidence.fromWord) &&
        j <= Number(evidence.toWord) &&
        w.text === (i === 0 ? '2' : '4'),
    );
    if (at < 0) throw new Error('Missing local source amount');
    replacements.set(
      at,
      amount.denominator === 1
        ? String(amount.numerator)
        : `${amount.numerator}/${amount.denominator}`,
    );
    fixtureRecord(q.amount).value = amount;
  }
  const words = seed.words.map((w, i) => ({ ...w, text: replacements.get(i) ?? w.text }));
  return { ...seed, words, sourceText: words.map((w) => w.text).join(' ') };
}
/** Independent authored signed phase/direction variants keep the complete local assertion. */
export function delayPhaseSignedSeed(
  phase: number,
  unit: 'degree' | 'radian',
  direction: 'clockwise' | 'counterclockwise',
): TemporalFixtureSeed {
  const original = delayPhasePacket.stories.find((s) => s.id === '46');
  if (!original) throw new Error('Missing source story 46');
  const seed = structuredClone(original);
  const relationship = phase < 0 ? 'lags' : phase > 0 ? 'leads' : 'aligned';
  let words = seed.words.map((w) => ({
    ...w,
    text:
      w.text === '90'
        ? String(phase)
        : w.text === 'degrees'
          ? unit === 'degree'
            ? 'degrees'
            : 'radians'
          : w.text === 'clockwise'
            ? direction
            : w.text === 'leads'
              ? relationship === 'aligned'
                ? 'is in phase with'
                : relationship === 'lags'
                  ? 'lags behind'
                  : 'leads'
              : w.text,
  }));
  // Re-author the complete predicate rather than leave a multiword PlannerWord.
  if (relationship !== 'leads') {
    const predicate =
      relationship === 'aligned' ? ['is', 'in', 'phase', 'with'] : ['lags', 'behind'];
    words = words.flatMap((w) =>
      w.text === predicate.join(' ')
        ? predicate.map((text, i) => ({
            text,
            start: w.start + ((w.end - w.start) * i) / predicate.length,
            end: w.start + ((w.end - w.start) * (i + 1)) / predicate.length,
          }))
        : [w],
    );
    const check = Number(seed.proposal.checkWord);
    const threshold = original.words.findIndex((w, i) => i >= check && w.text === 'leads');
    const rebase = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(rebase);
      if (!isRec(v)) return v;
      return Object.fromEntries(
        Object.entries(v).map(([k, e]) => [
          k,
          (k === 'fromWord' || k === 'toWord' || k.endsWith('Word')) &&
          typeof e === 'number' &&
          e > threshold
            ? e + predicate.length - 1
            : rebase(e),
        ]),
      );
    };
    Object.assign(seed.proposal, fixtureRecord(rebase(seed.proposal)));
  }
  const sourceText = words.map((w) => w.text).join(' ');
  if (
    !Array.isArray(seed.proposal.records) ||
    !Array.isArray(seed.proposal.signals) ||
    !Array.isArray(seed.proposal.relations)
  )
    throw new Error('Malformed periodic source');
  for (const raw of seed.proposal.records) {
    const r = fixtureRecord(raw);
    if (r.dimension !== 'phase') continue;
    const q = fixtureRecord(r.quantity);
    fixtureRecord(fixtureRecord(q.amount).value).numerator = phase;
    fixtureRecord(q.basis).unit = unit;
  }
  for (const s of seed.proposal.signals) fixtureRecord(s).direction = direction;
  for (const r of seed.proposal.relations) fixtureRecord(r).relationship = relationship;
  return { ...seed, words, sourceText, window: { ...seed.window, endWord: words.length - 1 } };
}
export function delayPhaseCases(): ExpansionDelayPhaseScene[] {
  return [
    ...delayPhaseRaw.flatMap((s) => [parseDelayPhase(s, 'diagram'), parseDelayPhase(s, 'hybrid')]),
    ...(['diagram', 'hybrid'] as const).flatMap((mode) => [
      parseDelayPhase(
        delayPhaseNumericSeed({ numerator: 1, denominator: 4 }, { numerator: 1, denominator: 1 }),
        mode,
      ),
      parseDelayPhase(
        delayPhaseNumericSeed(
          { numerator: 0, denominator: 1 },
          { numerator: 86400, denominator: 1 },
        ),
        mode,
      ),
      parseDelayPhase(
        delayPhaseNumericSeed(
          { numerator: 1, denominator: 1000000000 },
          { numerator: 86400, denominator: 1 },
        ),
        mode,
      ),
      parseDelayPhase(
        delayPhaseNumericSeed(
          { numerator: 863999999, denominator: 10000 },
          { numerator: 86400, denominator: 1 },
        ),
        mode,
      ),
      parseDelayPhase(delayPhaseSignedSeed(-90, 'degree', 'clockwise'), mode),
      parseDelayPhase(delayPhaseSignedSeed(90, 'degree', 'counterclockwise'), mode),
      parseDelayPhase(delayPhaseSignedSeed(-8, 'radian', 'counterclockwise'), mode),
      parseDelayPhase(delayPhaseSignedSeed(0, 'degree', 'clockwise'), mode),
    ]),
    ...(['45', '46'] as const).flatMap((id) =>
      (id === '45'
        ? (['cycle-dial'] as const)
        : (['cycle-dial', 'sine', 'pulse'] as const)
      ).flatMap((template) => [
        parseDelayPhase(delayPhaseStressSeed(id, template)),
        parseDelayPhase(delayPhaseStressSeed(id, template), 'hybrid'),
      ]),
    ),
  ];
}
