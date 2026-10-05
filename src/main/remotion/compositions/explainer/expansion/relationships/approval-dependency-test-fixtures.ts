import { readFileSync } from 'node:fs';
import { expansionFixtureSpeech } from '../../../../../ai/explainer/expansion-fixture-words';
import {
  parseExpansionApprovalHandoff,
  parseExpansionDependency,
} from '../../../../../ai/explainer/expansion-relationships-approval-dependency-contract';
import type { TemporalFixtureSeed } from '../../../../../ai/explainer/expansion-temporal-fixtures';
import { makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import type { ExpansionApprovalDependencyScene } from './approval-dependency-types';

export const approvalDependencyPacket = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/relationships/approval-dependency.source.json',
    'utf8',
  ),
) as { stories: TemporalFixtureSeed[] };
export const approvalDependencyStates = [
  'known',
  'conditional',
  'illustrative',
  'simulated',
  'unknown',
  'missing',
  'disputed',
] as const;
export function parseApprovalDependency(
  seed: TemporalFixtureSeed,
  visualMode: 'diagram' | 'hybrid' = 'diagram',
): ExpansionApprovalDependencyScene {
  const ctx = makeParseContext(seed.words, seed.window);
  const raw = { ...seed.proposal, visualMode };
  const scene =
    seed.id === '35' ? parseExpansionApprovalHandoff(raw, ctx) : parseExpansionDependency(raw, ctx);
  if (!scene || ctx.issues.length) throw new Error(JSON.stringify(ctx.issues));
  return scene;
}
/** Maximum accepted source inputs, not post-parser fabricated scene facts. */
export function approvalDependencyStressSeed(
  id: '35' | '36',
  state: (typeof approvalDependencyStates)[number],
  maximumLinks = false,
  relationshipState = 'conditional',
  quotedLabels = false,
): TemporalFixtureSeed {
  const labels = Array.from({ length: id === '35' ? 3 : 8 }, (_, i) =>
    quotedLabels ? `"${i}${'W'.repeat(25)}"` : `${i}${'W'.repeat(27)}`,
  );
  const actor = labels[0],
    scope = 'G'.repeat(40),
    period = 'P'.repeat(32),
    title = 'Review';
  const condition = `if ${'C'.repeat(93)}`;
  const clauses: string[] = [],
    phases: number[] = [];
  const add = (text: string, phase: number): number => {
    phases.push(phase);
    clauses.push(`${text}.`);
    return clauses.length - 1;
  };
  const suffix = `for ${scope} during ${period}`;
  add(
    id === '35'
      ? `${title} lists ${labels[0]} as owner and ${labels[1]} as approver of ${labels[2]} ${suffix}`
      : `${title} lists ${labels.slice(1, -1).join(', ')}, and ${labels[7]} for ${actor} ${suffix}`,
    0,
  );
  const records: Rec[] = [],
    relations: Rec[] = [],
    valueRecords: Rec[] = [];
  const recordClauses: number[] = [],
    relationClauses: number[] = [],
    valueClauses: number[] = [];
  const beatClauses = [0, 1, 2, 3, 4];
  if (id === '35') {
    const count = maximumLinks ? 11 : 3;
    for (let i = 0; i < count; i++) {
      const type = i === 0 ? 'request' : i === 1 ? 'authorization' : 'handoff';
      const rs =
        type === 'authorization' || !['allowed', 'denied'].includes(relationshipState)
          ? relationshipState
          : 'known';
      const known = rs === 'known' || rs === 'conditional';
      const body =
        type === 'request'
          ? known
            ? `${actor} requests authorization from ${labels[1]} for ${labels[2]}`
            : `${actor}'s authorization request to ${labels[1]} for ${labels[2]} is ${rs}`
          : type === 'handoff'
            ? known
              ? `${actor} hands ${labels[2]} to ${labels[1]} for review`
              : `${actor}'s review handoff of ${labels[2]} to ${labels[1]} is ${rs}`
            : `${labels[1]}'s authorization for ${actor} on ${labels[2]} is ${rs}`;
      const phase = i === 0 ? 1 : i === 1 ? 2 : 3;
      const n = add(`${body} ${suffix}${rs === 'conditional' ? ` ${condition}` : ''}`, phase);
      if (i < 3) beatClauses[i + 1] = n;
      recordClauses.push(n);
      records.push({
        type,
        actor: type === 'authorization' ? labels[1] : actor,
        target: type === 'authorization' ? actor : labels[1],
        item: labels[2],
        claim: type === 'handoff' ? 'review' : 'authorization',
        state: rs,
        scope,
        period,
        ...(rs === 'conditional' ? { condition } : {}),
      });
    }
  } else {
    const count = maximumLinks ? 16 : 7;
    for (let i = 0; i < count; i++) {
      const type =
        i === 0 ? 'dependency' : i % 3 === 0 ? 'flow' : i % 3 === 1 ? 'transfer' : 'order';
      const from = labels[1 + (i % 7)],
        to = labels[1 + ((i + 1) % 7)];
      const rs = relationshipState === 'pending' ? 'missing' : relationshipState;
      const known = rs === 'known' || rs === 'conditional';
      const claim =
        type === 'dependency'
          ? known
            ? 'requires'
            : 'dependency'
          : type === 'order'
            ? known
              ? 'precedes'
              : 'order'
            : `${i}${'Q'.repeat(96 - String(i).length)}`;
      const body = !known
        ? `${type}${type === 'transfer' || type === 'flow' ? ` of ${claim}` : ''} from ${from} to ${to} is ${rs}`
        : type === 'dependency' || type === 'order'
          ? `${from} ${claim} ${to}`
          : `${from} ${type === 'transfer' ? 'transfers' : 'routes'} ${claim} to ${to}`;
      const phase = i === 0 ? 1 : i === 1 ? 2 : 3;
      const n = add(
        `${actor} states ${body} ${suffix}${rs === 'conditional' ? ` ${condition}` : ''}`,
        phase,
      );
      if (i < 3) beatClauses[i + 1] = n;
      relationClauses.push(n);
      relations.push({
        type,
        actor,
        from,
        to,
        claim,
        state: rs,
        scope,
        period,
        ...(rs === 'conditional' ? { condition } : {}),
      });
    }
  }
  const valueCount = maximumLinks ? (id === '35' ? 0 : 11) : id === '35' ? 8 : 11;
  for (let i = 0; i < valueCount; i++) {
    const entity = labels[id === '35' ? 2 : 1 + (i % 7)],
      claim = `${i}${'V'.repeat(54 - String(i).length)}`;
    const qualifier =
      state === 'illustrative' || state === 'simulated'
        ? `${state} ${'X'.repeat(95 - state.length)}`
        : state;
    const amount =
      state === 'unknown' || state === 'missing'
        ? state
        : state === 'disputed'
          ? 'disputed between 0 and 1/1000000000'
          : '0';
    let body = `${actor} ${entity} ${claim} is ${amount} hour during ${period} among ${scope} with denominator 1000000000`;
    if (state === 'conditional') body += ` ${condition}`;
    if (state === 'illustrative' || state === 'simulated') body = `in this ${qualifier}, ${body}`;
    valueClauses.push(add(body, 3));
    const q: Rec = {
      actor,
      claim: `${entity} ${claim}`,
      basis: {
        unit: 'hour',
        population: scope,
        period,
        denominator: { numerator: 1000000000, denominator: 1 },
      },
      state,
    };
    const zero = { kind: 'rational', value: { numerator: 0, denominator: 1 } };
    if (state === 'disputed')
      q.alternatives = [
        zero,
        { kind: 'rational', value: { numerator: 1, denominator: 1000000000 } },
      ];
    else if (state !== 'unknown' && state !== 'missing') q.amount = zero;
    if (state === 'conditional') q.condition = condition;
    else if (state !== 'known') q.qualifier = qualifier;
    valueRecords.push({ actor, entity, claim, quantity: q });
  }
  const resultSubject = id === '35' ? labels[2] : title;
  beatClauses[4] = add(
    `${actor}'s result for ${resultSubject} remains conditional ${suffix} ${condition}`,
    4,
  );
  const speech = expansionFixtureSpeech(clauses, 12);
  const times = [0.25, 1.5, 4.2, 6.8, 10.6, 11.65];
  for (let phase = 0; phase < 5; phase++) {
    const indexes = phases.flatMap((p, i) => (p === phase ? [i] : []));
    const first = speech.spans[indexes[0]].fromWord,
      last = speech.spans[indexes[indexes.length - 1]].toWord;
    const step = (times[phase + 1] - times[phase]) / (last - first + 1);
    for (let i = first; i <= last; i++) {
      speech.words[i].start = times[phase] + (i - first) * step;
      speech.words[i].end = times[phase] + (i - first + 1) * step;
    }
  }
  records.forEach((r, i) => {
    r.evidence = speech.spans[recordClauses[i]];
  });
  relations.forEach((r, i) => {
    r.evidence = speech.spans[relationClauses[i]];
  });
  valueRecords.forEach((v, i) => {
    (v.quantity as Rec).evidence = speech.spans[valueClauses[i]];
  });
  const proposal: Rec = {
    kind: id === '35' ? 'agent-team' : 'relation-structure',
    preset: id === '35' ? 'approval-handoff' : 'dependency',
    template: id === '35' ? 'approval-stations' : 'typed-links',
    route: 'source-only',
    visualMode: 'diagram',
    evidence: 'source-stated',
    label: title,
    subject: id === '35' ? labels[2] : actor,
    outcome: 'conditional',
    scope,
    period,
    entities: labels.map((label) => ({ label, evidence: speech.spans[0] })),
    values: valueRecords,
    result: {
      actor,
      subject: resultSubject,
      claim: 'result',
      scope,
      period,
      state: 'conditional',
      condition,
      evidence: speech.spans[beatClauses[4]],
    },
    startWord: 0,
    endWord: speech.words.length - 1,
    layout: 'stack',
    ...(id === '35'
      ? { owner: actor, approver: labels[1], workItem: labels[2], records }
      : { actor, relations }),
  };
  ['setup', 'action', 'response', 'check', 'resolve'].forEach((beat, i) => {
    proposal[`${beat}Word`] = speech.spans[beatClauses[i]].fromWord;
  });
  return {
    id,
    words: speech.words,
    window: { startWord: 0, endWord: speech.words.length - 1, startTime: 0, endTime: 12 },
    sourceText: clauses.join(' '),
    proposal,
  };
}
export function approvalDependencyCases(): ExpansionApprovalDependencyScene[] {
  return [
    ...approvalDependencyPacket.stories.map((s) => parseApprovalDependency(s)),
    ...(['35', '36'] as const).flatMap((id) =>
      approvalDependencyStates.map((state) =>
        parseApprovalDependency(approvalDependencyStressSeed(id, state)),
      ),
    ),
    ...(['35', '36'] as const).map((id) =>
      parseApprovalDependency(approvalDependencyStressSeed(id, 'known', true)),
    ),
    ...['allowed', 'denied', 'pending', 'unknown', 'missing', 'disputed'].map((state) =>
      parseApprovalDependency(approvalDependencyStressSeed('35', 'known', true, state)),
    ),
    ...['known', 'unknown', 'missing', 'disputed'].map((state) =>
      parseApprovalDependency(approvalDependencyStressSeed('36', 'known', true, state)),
    ),
    ...(['35', '36'] as const).map((id) =>
      parseApprovalDependency(
        approvalDependencyStressSeed(id, 'conditional', true, 'conditional', true),
      ),
    ),
  ];
}
