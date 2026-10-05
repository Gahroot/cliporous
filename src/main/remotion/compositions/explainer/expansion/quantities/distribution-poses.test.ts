import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  type ExpansionSourceFixture,
  expansionFixtureSpeech,
} from '../../../../../ai/explainer/expansion-fixture-words';
import {
  parseExpansionHistogram,
  parseExpansionSubgroupReversal,
} from '../../../../../ai/explainer/expansion-quantities-distribution-contract';
import { isRec, makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import {
  distributionDomain,
  distributionFields,
  distributionHistogram,
  distributionPages,
  distributionPose,
  distributionTable,
} from './distribution-poses';
import type { ExpansionDistributionScene } from './distribution-types';

const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/quantities/distribution.source.json',
    'utf8',
  ),
) as { stories: ExpansionSourceFixture[] };
const beats = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'];
function object(v: unknown): Rec {
  if (!isRec(v)) throw new Error('Expected object');
  return v;
}
function clauses(story: ExpansionSourceFixture) {
  let fromWord = 0;
  const spans: { fromWord: number; toWord: number }[] = [];
  story.words.forEach((w, i) => {
    if (/[.!?;][”"’')\]]*$/.test(w.text)) {
      spans.push({ fromWord, toWord: i });
      fromWord = i + 1;
    }
  });
  return {
    spans,
    text: spans.map((s) =>
      story.words
        .slice(s.fromWord, s.toWord + 1)
        .map((w) => w.text)
        .join(' '),
    ),
  };
}
function rewrite(
  story: ExpansionSourceFixture,
  text: string[],
  replacements: Record<string, string> = {},
): ExpansionSourceFixture {
  const old = clauses(story),
    speech = expansionFixtureSpeech(text, 12);
  function remap(v: unknown): unknown {
    if (typeof v === 'string')
      return Object.entries(replacements).reduce((t, [a, b]) => t.split(a).join(b), v);
    if (Array.isArray(v)) return v.map(remap);
    if (!isRec(v)) return v;
    if (Object.keys(v).length === 2 && 'fromWord' in v && 'toWord' in v) {
      const i = old.spans.findIndex((s) => s.fromWord === v.fromWord && s.toWord === v.toWord);
      if (!speech.spans[i]) throw new Error('Unmapped span');
      return speech.spans[i];
    }
    return Object.fromEntries(Object.entries(v).map(([k, e]) => [k, remap(e)]));
  }
  const proposal = object(remap(story.proposal));
  beats.forEach((b) => {
    const i = old.spans.findIndex((s) => s.fromWord === story.proposal[b]);
    proposal[b] = speech.spans[i].fromWord;
  });
  proposal.startWord = 0;
  proposal.endWord = speech.window.endWord;
  return { ...story, ...speech, proposal };
}
export function parseDistribution(story: ExpansionSourceFixture): ExpansionDistributionScene {
  const ctx = makeParseContext(story.words, story.window);
  const scene =
    story.id === '17'
      ? parseExpansionHistogram(story.proposal, ctx)
      : parseExpansionSubgroupReversal(story.proposal, ctx);
  expect(ctx.issues, JSON.stringify(story.proposal)).toEqual([]);
  if (!scene) throw new Error('Rejected source case');
  return scene;
}
const amount = (numerator: number, denominator = 1) => ({
  kind: 'rational',
  value: { numerator, denominator },
});
function maximumHistogram(
  bins: boolean,
  state: 'known' | 'disputed' | 'unknown' | 'missing' = 'known',
  close = false,
): ExpansionSourceFixture {
  const actor = `A${'W'.repeat(27)}`,
    metric = `T${'M'.repeat(27)}`,
    label = `L${'W'.repeat(27)}`,
    period = `P${'M'.repeat(31)}`,
    population = `${'W'.repeat(38)}ZZ`;
  const text = [
    `${label}: ${actor} reports ${metric} distribution in minute during ${period} among ${population} using supplied ${bins ? 'bins' : 'observations'}.`,
  ];
  const valueText = (i: number) =>
    state === 'disputed'
      ? bins
        ? 'disputed between 999999999 and 1000000000'
        : 'disputed between 999999998/1000000000 and 999999999/1000000000'
      : state !== 'known'
        ? state
        : close
          ? i % 2
            ? '999999998/999999997'
            : '999999999/999999998'
          : bins || i % 2 === 0
            ? '1000000000'
            : '999999999/1000000000';
  for (let i = 0; i < 12; i++) {
    if (bins)
      text.push(
        `${actor} bin ${'M'.repeat(26)}${i} spans ${i * 1000} to ${(i + 1) * 1000} minute, including lower and excluding upper during ${period} among ${population}.`,
        `${actor} ${'M'.repeat(26)}${i} count is ${valueText(i)} count during ${period} among ${population}.`,
      );
    else
      text.push(
        `${actor} ${metric} is ${valueText(i)} minute during ${period} among ${population}.`,
      );
  }
  text.push(
    `${label} retains only supplied ${bins ? 'bins without smoothing' : 'observations without generated samples'}.`,
  );
  const speech = expansionFixtureSpeech(text, 10);
  const proposal: Rec = {
    kind: 'distribution-view',
    preset: 'histogram',
    visualMode: 'diagram',
    layout: 'stack',
    label,
    subject: label,
    outcome: bins
      ? 'supplied bins without smoothing'
      : 'supplied observations without generated samples',
    evidence: 'source-stated',
    startWord: 0,
    endWord: speech.window.endWord,
    entities: [{ label: actor, evidence: speech.spans[0] }],
    actor,
    metric,
    valueUnit: 'minute',
    representation: bins ? 'bins' : 'observations',
    ...Object.fromEntries(
      beats.map((b, i) => [
        b,
        speech.spans[[0, 3, bins ? 7 : 5, bins ? 15 : 9, text.length - 1][i]].fromWord,
      ]),
    ),
    records: Array.from({ length: 12 }, (_, i) => {
      const quantity = {
        actor,
        claim: bins ? `${'M'.repeat(26)}${i} count` : metric,
        state,
        ...(state === 'disputed'
          ? {
              qualifier: 'disputed',
              alternatives: bins
                ? [amount(999999999), amount(1000000000)]
                : [amount(999999998, 1000000000), amount(999999999, 1000000000)],
            }
          : state !== 'known'
            ? { qualifier: state }
            : {
                amount: close
                  ? i % 2
                    ? amount(999999998, 999999997)
                    : amount(999999999, 999999998)
                  : bins || i % 2 === 0
                    ? amount(1000000000)
                    : amount(999999999, 1000000000),
              }),
        basis: { unit: bins ? 'count' : 'minute', period, population },
        evidence: speech.spans[bins ? 2 + i * 2 : i + 1],
      };
      return bins
        ? {
            label: `${'M'.repeat(26)}${i}`,
            lower: amount(i * 1000).value,
            upper: amount((i + 1) * 1000).value,
            rangeEvidence: speech.spans[1 + i * 2],
            count: quantity,
          }
        : { quantity };
    }),
  };
  return {
    id: '17',
    ...speech,
    window: { ...speech.window, endTime: 12 },
    proposal,
    negatives: [],
  };
}
function maximumSubgroups(
  qualified: boolean,
  groupCount = 4,
  extremeRatios = false,
): ExpansionSourceFixture {
  const actors = [`A${'W'.repeat(27)}`, `B${'M'.repeat(27)}`];
  const groups = Array.from(
    { length: groupCount },
    (_, i) => `G${i}${(i % 2 ? 'M' : 'W').repeat(25)}Z`,
  );
  const label = `L${'M'.repeat(27)}`,
    metric = `T${'W'.repeat(31)}`,
    population = `P${'M'.repeat(38)}Z`,
    period = `Y${'W'.repeat(30)}Z`;
  const text = [
    `${label}: ${actors.join(' and ')} compare ${metric} counts across ${groups.join(' and ')} within ${population} during ${period}.`,
  ];
  const pending: {
    actor: string;
    group: string;
    n: number;
    d: number;
    unknown: boolean;
    nClause: number;
    dClause: number;
  }[] = [];
  for (let g = 0; g < groups.length; g++)
    for (let a = 0; a < actors.length; a++) {
      const n = extremeRatios
        ? [
            [499999999, 399999999],
            [39999999, 4999999],
            [4999999, 2499999],
            [5000000, 2499999],
          ][g][a]
        : qualified && g === 0 && a === 0
          ? 1000000000
          : (g === 0 ? (a === 0 ? 9 : 80) : a === 0 ? 20 : 1) * 1000000;
      const d = extremeRatios
        ? [
            [500000000, 400000000],
            [400000000, 50000000],
            [50000000, 25000000],
            [50000000, 25000000],
          ][g][a]
        : qualified && g === 0 && a === 0
          ? 1000000000
          : (g === 0 ? (a === 0 ? 10 : 100) : a === 0 ? 100 : 10) * 1000000;
      const unknown = qualified && g === 0 && a === 1;
      const nClause = text.length;
      text.push(
        `${actors[a]} ${metric} numerator is ${unknown ? 'unknown' : n} count during ${period} among ${groups[g]}${unknown ? '' : ` with denominator ${d}`}.`,
      );
      const dClause = text.length;
      text.push(
        `${actors[a]} ${metric} denominator is ${d} count during ${period} among ${groups[g]}.`,
      );
      pending.push({ actor: actors[a], group: groups[g], n, d, unknown, nClause, dClause });
    }
  const aggregateClause = text.length;
  text.push(
    `${groups.join(' and ')} partition ${population} for ${actors.join(' and ')} during ${period}.`,
  );
  const reversalClause = text.length;
  text.push(
    `${actors[0]} has higher ${metric} ratio than ${actors[1]} within every supplied subgroup, but ${actors[1]} has higher ${metric} ratio than ${actors[0]} within ${population} during ${period}.`,
  );
  const resolveClause = text.length;
  text.push(`${label} retains scope-bound reversal excluding a universal winner.`);
  const speech = expansionFixtureSpeech(text, 10);
  // Keep an authored one-second pause before resolve so even beyond-cap probes reach the group gate.
  speech.words.forEach((word, index) => {
    if (index >= speech.spans[resolveClause].fromWord) {
      word.start += 1;
      word.end += 1;
    }
  });
  const quantity = (r: (typeof pending)[number], numerator: boolean) => ({
    actor: r.actor,
    claim: `${metric} ${numerator ? 'numerator' : 'denominator'}`,
    state: numerator && r.unknown ? 'unknown' : 'known',
    ...(numerator && r.unknown
      ? { qualifier: 'unknown' }
      : { amount: amount(numerator ? r.n : r.d) }),
    basis: {
      unit: 'count',
      period,
      population: r.group,
      ...(numerator && !r.unknown ? { denominator: amount(r.d).value } : {}),
    },
    evidence: speech.spans[numerator ? r.nClause : r.dClause],
  });
  const proposal: Rec = {
    kind: 'distribution-view',
    preset: 'subgroup-reversal',
    visualMode: 'diagram',
    layout: 'stack',
    label,
    subject: label,
    outcome: 'scope-bound reversal excluding a universal winner',
    evidence: 'source-stated',
    startWord: 0,
    endWord: speech.window.endWord,
    entities: [...actors, ...groups].map((name) => ({ label: name, evidence: speech.spans[0] })),
    actors,
    groups,
    metric,
    aggregatePopulation: population,
    aggregateEvidence: speech.spans[aggregateClause],
    reversalEvidence: speech.spans[reversalClause],
    subgroupHigher: actors[0],
    aggregateHigher: actors[1],
    records: pending.map((r) => ({
      actor: r.actor,
      group: r.group,
      numerator: quantity(r, true),
      denominator: quantity(r, false),
    })),
    ...Object.fromEntries(
      beats.map((b, i) => [b, speech.spans[[0, 3, 7, reversalClause, resolveClause][i]].fromWord]),
    ),
  };
  return {
    id: '18',
    ...speech,
    window: { ...speech.window, endTime: 12 },
    proposal,
    negatives: [],
  };
}
export function zeroBinScene(all = false): ExpansionDistributionScene {
  const story = packet.stories.find((s) => s.id === '17');
  if (!story) throw new Error('Missing histogram source');
  let replaced = false;
  const text = clauses(story).text.map((s) => {
    if ((!replaced || all) && /count is \d+ count/.test(s)) {
      replaced = true;
      return s.replace(/count is \d+ count/, 'count is 0 count');
    }
    return s;
  });
  const next = rewrite(story, text);
  (next.proposal.records as unknown[]).forEach((record, i) => {
    if (all || i === 0) object(object(record).count).amount = amount(0);
  });
  return parseDistribution(next);
}
export function distributionCases(): ExpansionDistributionScene[] {
  const cases = packet.stories.map(parseDistribution);
  for (const story of packet.stories) {
    for (const state of [
      'unknown',
      'missing',
      'disputed',
      'conditional',
      'illustrative',
      'simulated',
    ] as const) {
      const text = clauses(story).text,
        index = story.id === '17' ? 2 : 1,
        n = story.id === '17' ? 4 : 9;
      text[index] =
        state === 'unknown' || state === 'missing'
          ? text[index].replace(`${n} count`, `${state} count`)
          : state === 'disputed'
            ? text[index].replace(`${n} count`, `disputed between ${n - 1} and ${n} count`)
            : state === 'conditional'
              ? `If permits are approved, ${text[index]}`
              : `In this ${state === 'illustrative' ? 'teaching example' : 'simulation'}, ${text[index]}`;
      const next = rewrite(story, text),
        first = object((next.proposal.records as unknown[])[0]),
        q = object(story.id === '17' ? first.count : first.numerator);
      q.state = state;
      if (state === 'unknown' || state === 'missing' || state === 'disputed') {
        delete q.amount;
        q.qualifier = state;
      }
      if (state === 'disputed') q.alternatives = [amount(n - 1), amount(n)];
      if (state === 'conditional') {
        q.condition = 'If permits are approved';
        next.proposal.condition = q.condition;
      }
      if (state === 'illustrative' || state === 'simulated') {
        q.qualifier = state === 'illustrative' ? 'teaching example' : 'simulation';
        next.proposal.evidence = 'illustrative';
      }
      cases.push(parseDistribution(next));
    }
    const replacements = Object.fromEntries(
      [
        object(story.proposal).label,
        ...(story.proposal.entities as Rec[])
          .slice(0, story.id === '18' ? 2 : 8)
          .map((e) => e.label),
      ].map((s, i) => [String(s), (i % 2 ? 'M' : 'W').repeat(27) + i]),
    );
    cases.push(
      parseDistribution(
        rewrite(
          story,
          clauses(story).text.map((s) =>
            Object.entries(replacements).reduce((t, [a, b]) => t.split(a).join(b), s),
          ),
          replacements,
        ),
      ),
    );
  }
  cases.push(
    parseDistribution(maximumHistogram(false)),
    parseDistribution(maximumHistogram(true)),
    parseDistribution(maximumSubgroups(false)),
    parseDistribution(maximumSubgroups(true)),
    parseDistribution(maximumSubgroups(false, 4, true)),
    parseDistribution(maximumHistogram(false, 'disputed')),
    parseDistribution(maximumHistogram(true, 'disputed')),
    parseDistribution(maximumHistogram(false, 'unknown')),
    parseDistribution(maximumHistogram(true, 'missing')),
    parseDistribution(maximumHistogram(false, 'known', true)),
    zeroBinScene(),
    zeroBinScene(true),
  );
  return cases;
}

describe('distribution pure source poses', () => {
  it('uses exact comparisons when distinct source rationals collide as Numbers, including typed negative minima', () => {
    const small = { numerator: 999999999, denominator: 999999998 };
    const large = { numerator: 999999998, denominator: 999999997 };
    expect(small.numerator / small.denominator).toBe(large.numerator / large.denominator);
    const scene = parseDistribution(maximumHistogram(false, 'known', true));
    if (scene.storyId !== '17') throw new Error('Expected histogram');
    expect(distributionDomain(scene)?.high).toEqual(large);
    const typed = {
      ...scene,
      records: scene.records.map((r) => {
        if (
          r.role !== 'observation' ||
          r.quantity.state !== 'known' ||
          r.quantity.amount.kind !== 'rational'
        )
          throw new Error('Expected exact known observations');
        const q = r.quantity;
        return {
          ...r,
          quantity: {
            ...q,
            amount: {
              kind: 'rational' as const,
              value: {
                numerator: -r.quantity.amount.value.numerator,
                denominator: r.quantity.amount.value.denominator,
              },
            },
          },
        };
      }),
    };
    expect(distributionDomain(typed)?.low).toEqual({
      numerator: -large.numerator,
      denominator: large.denominator,
    });
    expect(distributionDomain(typed)?.high).toEqual({ numerator: 0, denominator: 1 });
  });
  it('parses twelve disputed observations and twelve disputed bins without sampled membership', () => {
    for (const bins of [false, true]) {
      const scene = parseDistribution(maximumHistogram(bins, 'disputed'));
      expect(scene.records).toHaveLength(12);
      const plots = distributionHistogram(scene);
      expect(plots.map((p) => p.positions.length)).toEqual(Array(12).fill(2));
      expect(plots.reduce((sum, p) => sum + p.positions.length, 0)).toBe(24);
      expect(plots.every((p) => p.state === 'disputed')).toBe(true);
    }
  });
  it('parses the declared maximum of four complete subgroups and rejects a valid-shape fifth group', () => {
    const scene = parseDistribution(maximumSubgroups(false));
    expect(scene.records).toHaveLength(8);
    if (scene.storyId !== '18') throw new Error('Expected subgroup scene');
    expect(scene.groupIds).toHaveLength(4);
    expect(scene.result.state).toBe('derived');
    expect(distributionTable(scene)).toHaveLength(5);
    // Timing and source shape are valid; the fifth group must reach the actual group-count gate.
    const beyondCap = maximumSubgroups(false, 5),
      capCtx = makeParseContext(beyondCap.words, beyondCap.window);
    expect(parseExpansionSubgroupReversal(beyondCap.proposal, capCtx)).toBeNull();
    expect(capCtx.issues, JSON.stringify(capCtx.issues)).toContain(
      'reversal needs two actors and the same two to four complete subgroups',
    );
  });
  it('compares grounded actor rates across the same subgroup and aggregate identities, with no qualified inference', () => {
    let longest = 0;
    for (const scene of distributionCases()) {
      if (scene.storyId === '17') {
        const domain = distributionDomain(scene);
        const hasNumbers = distributionHistogram(scene).some((r) => r.positions.length > 0);
        expect(domain !== null).toBe(hasNumbers);
        for (const row of distributionFields(scene)) {
          expect(row.fields).toContain('Equal slots are ordered categories, not interval widths');
          expect(row.fields.some((v) => v.startsWith('Axis lower exact:'))).toBe(hasNumbers);
          expect(row.fields.some((v) => v.startsWith('Axis upper exact:'))).toBe(hasNumbers);
          if (!hasNumbers) expect(row.fields).toContain('No supplied numeric domain');
        }
        for (const record of distributionHistogram(scene))
          for (const p of record.positions) {
            expect(p).toBeGreaterThanOrEqual(0);
            expect(p).toBeLessThanOrEqual(1);
          }
        continue;
      }
      const rows = distributionTable(scene);
      expect(rows.map((r) => r.scopeId)).toEqual([...scene.groupIds, 'aggregate']);
      for (const row of rows) {
        expect(row.actorIds).toEqual(scene.actorIds);
        if (scene.result.state === 'source-qualified') {
          expect(row.values).toEqual(['No computed rate', 'No computed rate']);
          expect(row.relation).toBe('—');
        } else {
          const high =
            row.scopeId === 'aggregate'
              ? scene.aggregateHigherActorId
              : scene.subgroupHigherActorId;
          expect(row.relation).toBe(high === scene.actorIds[0] ? '>' : '<');
          row.values.forEach((value) => {
            longest = Math.max(longest, value.length);
            expect(value).toMatch(/^\d+\/\d+$/);
          });
        }
      }
    }
    expect(longest).toBe(20); // Nine-digit numerator / ten-digit denominator, rendered on three fixed-size lines.
  });
  it('parses source states and maximum records; retains all strings, values and identities on bounded pages', () => {
    for (const scene of distributionCases()) {
      const before = JSON.stringify(scene),
        pages = distributionPages(scene);
      for (const row of distributionFields(scene)) {
        const emitted = pages
          .filter((p) => p.id === row.id)
          .flatMap((p) => p.lines)
          .join('');
        expect(emitted).toBe(row.fields.join(''));
      }
      expect(new Set(pages.flatMap((p) => p.lineIds)).size).toBe(
        pages.flatMap((p) => p.lines).length,
      );
      const visited = new Set<number>();
      const poses = new Map<number, string>();
      for (let frame = 0; frame <= 420; frame++) {
        const p = distributionPose(scene, frame / 30);
        visited.add(p.page);
        poses.set(frame, JSON.stringify(p));
        expect(p.pages[p.page].lines.length).toBeLessThanOrEqual(14);
        for (const v of [p.reveal, p.action, p.response, p.check, p.resolve]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
      for (let frame = 420; frame >= 0; frame -= 7)
        expect(JSON.stringify(distributionPose(scene, frame / 30))).toBe(poses.get(frame));
      for (const frame of [91, 4, 377, 22, 198, 91])
        expect(JSON.stringify(distributionPose(scene, frame / 30))).toBe(poses.get(frame));
      for (const t of [NaN, Infinity, -Infinity]) expect(distributionPose(scene, t).page).toBe(0);
      for (const [key, at] of [
        ['reveal', scene.setupAt],
        ['action', scene.actionAt],
        ['response', scene.responseAt],
        ['check', scene.checkAt],
        ['resolve', scene.resolveAt],
      ] as const)
        expect(distributionPose(scene, at + 0.7)[key]).toBe(1);
      expect(visited.size).toBe(pages.length);
      expect(distributionPose(scene, scene.resolveAt + 2).page).toBe(pages.length - 1);
      expect(JSON.stringify(scene)).toBe(before);
      if (scene.storyId === '17')
        expect(distributionHistogram(scene).map((r) => r.id)).toEqual(
          scene.records.map((r) => r.id),
        );
    }
  });
});
