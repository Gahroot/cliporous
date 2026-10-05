import { readFileSync } from 'node:fs';
import { expansionFixtureSpeech } from '../../../../../ai/explainer/expansion-fixture-words';
import {
  parseExpansionAlignedStateComparison,
  parseExpansionHysteresis,
} from '../../../../../ai/explainer/expansion-temporal-history-twin-contract';
import {
  isRec,
  makeParseContext,
  type PlannerWord,
  type Rec,
  type SceneWindow,
} from '../../../../../ai/explainer/kind-spec';
import type { ExpansionEvidenceSpan } from '../value-types';
import type { ExpansionHistoryTwinScene } from './history-twin-types';

type Edit = { path: (string | number)[]; value?: unknown; remove?: boolean };
type Negative = { name: string; edits: Edit[]; clauses?: Record<string, string> };
type RawSource = { id: '47' | '48'; clauses: string[]; proposal: Rec; negatives: Negative[] };
type Fixture = RawSource & {
  words: PlannerWord[];
  window: SceneWindow;
  sourceText: string;
  spans: ExpansionEvidenceSpan[];
};
const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/temporal/history-twin.source.json',
    'utf8',
  ),
) as {
  version: number;
  pack: string;
  negativeFormat: string;
  timing: {
    durationSec: number;
    clauseStarts: number[];
    interClausePauseSec: number;
    leadInSec: number;
    tailSec: number;
  };
  stories: RawSource[];
  paraphrases: RawSource[];
};
const WORDS = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'] as const;
function rec(value: unknown): Rec {
  if (!isRec(value)) throw new Error('Expected an actual source object');
  return value;
}
function rows(value: unknown): Rec[] {
  if (!Array.isArray(value) || !value.every(isRec))
    throw new Error('Expected actual source records');
  return value;
}
/** Test-only hydration. Text and proposal facts are authored in JSON, never filled by a parser. */
function speech(clauses: readonly string[], starts = packet.timing.clauseStarts) {
  const spoken = expansionFixtureSpeech(clauses, packet.timing.durationSec);
  if (starts.length !== clauses.length)
    throw new Error('Every clause needs an explicit authored start');
  for (const [i, span] of spoken.spans.entries()) {
    const start = starts[i];
    const end =
      i === clauses.length - 1
        ? packet.timing.durationSec - packet.timing.tailSec
        : starts[i + 1] - packet.timing.interClausePauseSec;
    const count = span.toWord - span.fromWord + 1;
    if (!(end > start)) throw new Error('Authored clause pause cannot eat its speech');
    for (let j = 0; j < count; j++) {
      spoken.words[span.fromWord + j].start = Number(
        (start + (j * (end - start)) / count).toFixed(9),
      );
      spoken.words[span.fromWord + j].end = Number(
        (start + ((j + 1) * (end - start)) / count).toFixed(9),
      );
    }
  }
  return { ...spoken, spans: spoken.spans.map((s) => ({ ...s })) };
}
function hydrate(raw: RawSource): Fixture {
  return { ...structuredClone(raw), ...speech(raw.clauses) };
}
export const historyTwinFixtures = [...packet.stories, ...packet.paraphrases].map(hydrate);
export function canonical(id: '47' | '48'): Fixture {
  const f = historyTwinFixtures.find((s) => s.id === id);
  if (!f) throw new Error(`Missing canonical ${id}`);
  return structuredClone(f);
}
function parse(f: Fixture, proposal = f.proposal) {
  const ctx = makeParseContext(f.words, f.window);
  const scene =
    f.id === '47'
      ? parseExpansionHysteresis(proposal, ctx)
      : parseExpansionAlignedStateComparison(proposal, ctx);
  return { scene, ctx };
}
export function rewrite(
  f: Fixture,
  clauses: string[],
  change: (p: Rec, spans: ExpansionEvidenceSpan[]) => void = () => {},
  starts = f.spans.map((s) => f.words[s.fromWord].start),
  mapping = f.spans.map((_, i) => i),
): Fixture {
  const next = speech(clauses, starts);
  function remap(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(remap);
    if (!isRec(value)) return value;
    if (Object.keys(value).length === 2 && 'fromWord' in value && 'toWord' in value) {
      const oldIndex = f.spans.findIndex(
        (s) => s.fromWord === value.fromWord && s.toWord === value.toWord,
      );
      const span = next.spans[mapping[oldIndex]];
      if (!span) throw new Error('Only complete clause evidence can be reauthored');
      return { ...span };
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remap(v)]));
  }
  const proposal = rec(remap(f.proposal));
  for (const field of WORDS) {
    const oldIndex = f.spans.findIndex((s) => s.fromWord === f.proposal[field]);
    const span = next.spans[mapping[oldIndex]];
    if (!span) throw new Error('Missing authored beat');
    proposal[field] = span.fromWord;
  }
  proposal.startWord = 0;
  proposal.endWord = next.window.endWord;
  change(proposal, next.spans);
  return { ...f, clauses, ...next, proposal };
}
function exactQuantity(
  actor: string,
  claim: string,
  population: string,
  period: string,
  evidence: ExpansionEvidenceSpan,
  value = 3,
): Rec {
  return {
    actor,
    claim,
    state: 'known',
    basis: { unit: 'second', population, period },
    amount: { kind: 'rational', value: { numerator: value, denominator: 1 } },
    evidence,
  };
}
export function quantities47(): Fixture {
  const f = canonical('47');
  return rewrite(
    f,
    [
      f.clauses[0],
      'If duration exceeds enter threshold, Fan enters On from Off for chamber during shift A.',
      'Fan enter threshold is 3 seconds during shift A for chamber.',
      'If duration falls below leave threshold, Fan leaves On for Off for chamber during shift A.',
      'Fan leave threshold is unknown seconds during shift A for chamber.',
      f.clauses[3],
      f.clauses[4],
    ],
    (p, spans) => {
      const rules = rows(p.rules);
      rules[0].condition = 'If duration exceeds enter threshold';
      rules[0].threshold = 'enter threshold';
      rules[1].condition = 'If duration falls below leave threshold';
      rules[1].threshold = 'leave threshold';
      p.thresholds = [
        {
          role: 'enter',
          quantity: exactQuantity('Fan', 'enter threshold', 'chamber', 'shift A', spans[2]),
        },
        {
          role: 'leave',
          quantity: {
            actor: 'Fan',
            claim: 'leave threshold',
            state: 'unknown',
            qualifier: 'unknown',
            basis: { unit: 'second', population: 'chamber', period: 'shift A' },
            evidence: spans[4],
          },
        },
      ];
    },
    [0.25, 1.8, 3, 4.3, 5.5, 7, 9.2],
    [0, 1, 3, 5, 6],
  );
}
export function quantities48(): Fixture {
  const f = canonical('48');
  return rewrite(
    f,
    [
      f.clauses[0],
      f.clauses[1].replace('locked valve', 'wait limit'),
      'Pump wait limit is 3 seconds during run A for bench.',
      f.clauses[2].replace('locked valve', 'wait limit'),
      'Pump wait limit is missing seconds during run A for bench.',
      f.clauses[3],
      f.clauses[4],
    ],
    (p, spans) => {
      for (const s of rows(p.snapshots)) s.controls = ['wait limit'];
      p.quantities = [
        {
          view: 'Reference',
          quantity: exactQuantity('Pump', 'wait limit', 'bench', 'run A', spans[2]),
        },
        {
          view: 'Model',
          quantity: {
            actor: 'Pump',
            claim: 'wait limit',
            state: 'missing',
            qualifier: 'missing',
            basis: { unit: 'second', population: 'bench', period: 'run A' },
            evidence: spans[4],
          },
        },
      ];
    },
    [0.25, 1.8, 3, 4.3, 5.5, 7, 9.2],
    [0, 1, 3, 5, 6],
  );
}

export function parseHistoryTwin(
  f: Fixture,
  visualMode: 'diagram' | 'hybrid' = 'diagram',
): ExpansionHistoryTwinScene {
  const { scene, ctx } = parse(f, { ...f.proposal, visualMode });
  if (!scene || ctx.issues.length) throw new Error(JSON.stringify(ctx.issues));
  return scene;
}
export function historyTwinStressFixtures(): Fixture[] {
  const states = [
    'known',
    'conditional',
    'simulated',
    'illustrative',
    'unknown',
    'missing',
    'disputed',
  ];
  const times = states.map((_, i) => `${String.fromCharCode(65 + i)}${'W'.repeat(31)}`);
  const f = quantities47();
  const historyClauses = states.map((state, i) => {
    const predicate = ['unknown', 'missing', 'disputed'].includes(state)
      ? `is ${state}`
      : 'records Off';
    const body = `Fan history at ${times[i]} ${predicate} and is retained for chamber during shift A`;
    return `${state === 'conditional' ? 'If demand is high, ' : state === 'simulated' || state === 'illustrative' ? `In this ${state}, ` : ''}${body}.`;
  });
  const clauses = [
    ...f.clauses.slice(0, 5),
    ...historyClauses,
    `Fan current state remains unknown and retains ${times.slice(0, -1).join(', ')}, and ${times[6]} history for chamber during shift A.`,
  ];
  const maxHistory = rewrite(
    f,
    clauses,
    (p, spans) => {
      p.evidence = 'illustrative';
      p.history = states.map((state, i) => ({
        actor: 'Fan',
        dataTime: times[i],
        state,
        evidence: spans[5 + i],
        ...(['unknown', 'missing', 'disputed'].includes(state)
          ? { qualification: state }
          : {
              value: 'Off',
              ...(state === 'conditional'
                ? { condition: 'If demand is high' }
                : state === 'known'
                  ? {}
                  : { qualification: state }),
            }),
      }));
    },
    [0.25, 1.3, 2.1, 3.0, 3.8, 4.7, 5.3, 5.9, 6.5, 7.1, 7.7, 8.3, 9.2],
    [0, 1, 2, 3, 4, 5, 12],
  );
  const twins = states
    .filter((s) => s !== 'known')
    .map((state) => {
      const twin = canonical('48');
      const controls = ['A', 'B', 'C', 'D'].map((c) => `${c}${'W'.repeat(27)}`);
      const joined = `${controls.slice(0, -1).join(', ')}, and ${controls[3]}`;
      const predicate = ['unknown', 'missing', 'disputed'].includes(state)
        ? `is ${state}`
        : 'is Idle';
      const prefix = state === 'simulated' || state === 'illustrative' ? `in this ${state}, ` : '';
      const c = twin.clauses.map((clause, i) =>
        i === 1 || i === 2
          ? `If supply is steady, ${prefix}Pump ${i === 1 ? 'Reference' : 'Model'} operating state ${predicate} at sample A under ${joined} for bench during run A.`
          : clause,
      );
      return rewrite(twin, c, (p) => {
        p.evidence =
          state === 'simulated' || state === 'illustrative' ? 'illustrative' : 'source-stated';
        for (const s of rows(p.snapshots)) {
          s.state = state;
          s.controls = controls;
          if (state !== 'conditional') s.qualification = state;
          else delete s.qualification;
          if (['unknown', 'missing', 'disputed'].includes(state)) delete s.value;
          else s.value = 'Idle';
        }
      });
    });
  const knownResult = rewrite(
    canonical('47'),
    [
      ...canonical('47').clauses.slice(0, 4),
      'Fan current state is On and retains sample A history for chamber during shift A.',
    ],
    (p) => {
      p.outcome = 'is On';
      const r = rec(p.result);
      r.state = 'known';
      r.value = 'On';
      delete r.qualification;
    },
  );
  const maxLabels = (source: Fixture): Fixture => {
    const replacements =
      source.id === '47'
        ? [
            ['Fan', 'F'.repeat(28)],
            ['Off', 'O'.repeat(28)],
            ['On', 'N'.repeat(28)],
          ]
        : [
            ['Pump', 'P'.repeat(28)],
            ['Reference', 'R'.repeat(28)],
            ['Model', 'M'.repeat(28)],
          ];
    replacements.push(
      ['chamber', 'G'.repeat(40)],
      ['bench', 'G'.repeat(40)],
      ['shift A', 'T'.repeat(32)],
      ['run A', 'T'.repeat(32)],
    );
    replacements.push(
      ['If demand is high', `If ${'H'.repeat(93)}`],
      ['If demand is low', `If ${'L'.repeat(93)}`],
      ['If supply is steady', `If ${'S'.repeat(93)}`],
    );
    const replace = (text: string): string =>
      replacements.reduce((s, [a, b]) => s.replaceAll(a, b), text);
    const changed = rewrite(source, source.clauses.map(replace));
    const transform = (value: unknown): unknown => {
      if (typeof value === 'string') return replace(value);
      if (Array.isArray(value)) return value.map(transform);
      if (isRec(value))
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, transform(v)]));
      return value;
    };
    changed.proposal = rec(transform(changed.proposal));
    return changed;
  };
  const qualifiedResults = twins.map((f) => {
    const s = rows(f.proposal.snapshots)[0],
      state = String(s.state);
    const absent = ['unknown', 'missing', 'disputed'].includes(state);
    const outcome = absent ? `remains ${state}` : 'is different';
    const prefix =
      state === 'conditional'
        ? 'If supply is steady, '
        : state === 'simulated' || state === 'illustrative'
          ? `In this ${state}, `
          : '';
    return rewrite(
      f,
      [
        ...f.clauses.slice(0, 4),
        `${prefix}Pump state comparison ${outcome} and retains qualified states for bench during run A.`,
      ],
      (p) => {
        p.outcome = outcome;
        p.result = {
          actor: 'Pump',
          claim: 'state comparison',
          state,
          evidence: rec(p.result).evidence,
          ...(absent
            ? { qualification: state }
            : {
                result: 'different',
                ...(state === 'conditional'
                  ? { condition: 'If supply is steady' }
                  : { qualification: state }),
              }),
        };
      },
    );
  });
  const signed = quantities47();
  const signedThresholds = rewrite(
    signed,
    signed.clauses.map((c, i) =>
      i === 2
        ? 'Fan enter threshold is -1000000000 seconds during shift A for chamber.'
        : i === 4
          ? 'Fan leave threshold is 1000000000 seconds during shift A for chamber.'
          : c,
    ),
    (p, spans) => {
      p.thresholds = [
        {
          role: 'enter',
          quantity: exactQuantity(
            'Fan',
            'enter threshold',
            'chamber',
            'shift A',
            spans[2],
            -1000000000,
          ),
        },
        {
          role: 'leave',
          quantity: exactQuantity(
            'Fan',
            'leave threshold',
            'chamber',
            'shift A',
            spans[4],
            1000000000,
          ),
        },
      ];
    },
  );
  const controlLabels = ['A', 'B', 'C', 'D'].map((c) => `${c}${'W'.repeat(27)}`);
  const controlText = `${controlLabels.slice(0, -1).join(', ')}, and ${controlLabels[3]}`;
  const twin = canonical('48');
  const controlClauses = [
    twin.clauses[0],
    twin.clauses[1].replace('locked valve', controlText),
    ...controlLabels.map((c) => `Pump ${c} is 1000000000 seconds during run A for bench.`),
    twin.clauses[2].replace('locked valve', controlText),
    ...controlLabels.map((c) => `Pump ${c} is missing seconds during run A for bench.`),
    twin.clauses[3],
    twin.clauses[4],
  ];
  const maxControls = rewrite(
    twin,
    controlClauses,
    (p, spans) => {
      for (const s of rows(p.snapshots)) s.controls = controlLabels;
      p.quantities = controlLabels.flatMap((claim, i) => [
        {
          view: 'Reference',
          quantity: exactQuantity('Pump', claim, 'bench', 'run A', spans[2 + i], 1000000000),
        },
        {
          view: 'Model',
          quantity: {
            actor: 'Pump',
            claim,
            state: 'missing',
            qualifier: 'missing',
            basis: { unit: 'second', population: 'bench', period: 'run A' },
            evidence: spans[7 + i],
          },
        },
      ]);
    },
    [0.25, 1.5, 2.1, 2.6, 3.1, 3.6, 4.4, 5, 5.5, 6, 6.5, 7.5, 9.2],
    [0, 1, 6, 11, 12],
  );
  return [
    maxLabels(maxHistory),
    ...twins.map(maxLabels),
    knownResult,
    ...qualifiedResults,
    signedThresholds,
    maxLabels(maxControls),
  ];
}
export function historyTwinCases(): ExpansionHistoryTwinScene[] {
  return [
    ...historyTwinFixtures,
    quantities47(),
    quantities48(),
    ...historyTwinStressFixtures(),
  ].map((f) => parseHistoryTwin(f));
}
