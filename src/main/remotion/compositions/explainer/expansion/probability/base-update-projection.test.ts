import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  type ExpansionSourceFixture,
  expansionFixtureSpeech,
} from '../../../../../ai/explainer/expansion-fixture-words';
import {
  parseExpansionBaseRate,
  parseExpansionBayesUpdate,
} from '../../../../../ai/explainer/expansion-probability-base-update-contract';
import { isRec, makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import { deriveExplainerPalette } from '../../palette';
import { ExplainerProvider } from '../../stage';
import { BaseUpdateFacts } from './base-update-Diagram';
import {
  baseUpdateFocus,
  baseUpdatePageIndex,
  baseUpdatePages,
  baseUpdatePose,
  baseUpdateResultLines,
  baseUpdateRows,
} from './base-update-poses';
import { ProbabilityBaseUpdateView } from './base-update-Scene';

const probe = vi.hoisted(() => ({ frame: 300 }));
vi.mock('remotion', async (original) => ({
  ...(await original<object>()),
  useCurrentFrame: () => probe.frame,
  useVideoConfig: () => ({ fps: 30, width: 1080, height: 1920 }),
}));
// Dedicated ownership marker, NOT a fabricated ThreeCanvas context or native/GPU proof.
vi.mock('../../Stage3D', () => ({
  Stage3D: ({ children }: { children: unknown }) =>
    createElement('stage-marker', null, children as never),
}));
const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/probability/base-update.source.json',
    'utf8',
  ),
) as { stories: ExpansionSourceFixture[] };
function clauses(s: ExpansionSourceFixture) {
  const spans: { fromWord: number; toWord: number }[] = [];
  let start = 0;
  s.words.forEach((w, i) => {
    if (/[.!?;][”"’')\]]*$/.test(w.text)) {
      spans.push({ fromWord: start, toWord: i });
      start = i + 1;
    }
  });
  return {
    spans,
    text: spans.map((v) =>
      s.words
        .slice(v.fromWord, v.toWord + 1)
        .map((w) => w.text)
        .join(' '),
    ),
  };
}
function rewrite(s: ExpansionSourceFixture, text: string[], changes: (r: Rec) => void) {
  const old = clauses(s);
  const speech = expansionFixtureSpeech(text, 10);
  function remap(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(remap);
    if (!isRec(v)) return v;
    if (Object.keys(v).length === 2 && 'fromWord' in v && 'toWord' in v) {
      const i = old.spans.findIndex((p) => p.fromWord === v.fromWord && p.toWord === v.toWord);
      if (i < 0) throw new Error('Full clause evidence required');
      return speech.spans[i];
    }
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, remap(x)]));
  }
  const r = remap(s.proposal) as Rec;
  for (const beat of ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord']) {
    r[beat] = speech.spans[old.spans.findIndex((p) => p.fromWord === s.proposal[beat])].fromWord;
  }
  r.endWord = speech.window.endWord;
  changes(r);
  return { ...s, ...speech, proposal: r };
}
function accepted(s: ExpansionSourceFixture) {
  const ctx = makeParseContext(s.words, s.window);
  const scene =
    s.id === '09'
      ? parseExpansionBaseRate(s.proposal, ctx)
      : parseExpansionBayesUpdate(s.proposal, ctx);
  expect(ctx.issues).toEqual([]);
  if (!scene) throw new Error('Accepted parser-produced input required');
  return scene;
}
const colors = { surface: '#fff', text: '#111', accent: '#999', muted: '#888' };
function variants(s: ExpansionSourceFixture) {
  const result = [s];
  const original = clauses(s);
  const first = (s.proposal.records as { quantity: Rec }[])[0].quantity;
  const basis = first.basis as Rec;
  const amount = first.amount as Rec;
  const value = amount.value as { numerator: number };
  const span = first.evidence as Rec;
  const index = original.spans.findIndex((p) => p.fromWord === span.fromWord);
  for (const state of [
    'unknown',
    'missing',
    'disputed',
    'conditional',
    'illustrative',
    'simulated',
  ]) {
    const text = [...original.text];
    const head = `${first.actor} ${first.claim}`;
    const tail = `${basis.unit} during ${basis.period} among ${basis.population}.`;
    text[index] =
      state === 'unknown' || state === 'missing'
        ? `${head} is ${state} ${tail}`
        : state === 'disputed'
          ? `${head} is disputed between ${value.numerator} and ${value.numerator + 1} ${tail}`
          : state === 'conditional'
            ? `If approval is granted, ${head} is ${value.numerator} ${tail}`
            : `In this ${state === 'illustrative' ? 'illustrative example' : 'simulated case'}, ${head} is ${value.numerator} ${tail}`;
    result.push(
      rewrite(s, text, (r) => {
        const q = (r.records as { quantity: Rec }[])[0].quantity;
        q.state = state;
        if (['unknown', 'missing', 'disputed'].includes(state)) {
          delete q.amount;
          q.qualifier = state;
        }
        if (state === 'disputed')
          q.alternatives = [
            amount,
            { kind: 'rational', value: { numerator: value.numerator + 1, denominator: 1 } },
          ];
        if (state === 'conditional') {
          q.condition = 'If approval is granted';
          r.condition = q.condition;
        }
        if (state === 'illustrative' || state === 'simulated') {
          q.qualifier = state === 'illustrative' ? 'illustrative example' : 'simulated case';
          r.evidence = 'illustrative';
        }
        if (s.id === '10') r.updateMode = 'unresolved';
      }),
    );
  }
  // Maximum actor/period lengths are SOURCE edits, with all references and spans remapped.
  const replacements = (s.proposal.entities as { label: string }[]).map((e, i) => [
    e.label,
    String.fromCharCode(65 + i).repeat(28),
  ]);
  const claims = [
    ...new Set((s.proposal.records as { quantity: Rec }[]).map((r) => String(r.quantity.claim))),
  ]
    .sort((a, b) => b.length - a.length)
    .map((claim, i) => [claim, String.fromCharCode(88 + i).repeat(96)]);
  const convert = (str: string) =>
    [...replacements, ...claims]
      .reduce((v, [a, b]) => v.replaceAll(a, b), str)
      .replaceAll('during April', `during ${'P'.repeat(32)}`);
  const long = rewrite(
    s,
    original.text.map((text) =>
      convert(text).replace(convert(String(s.proposal.label)), String(s.proposal.label)),
    ),
    () => {},
  );
  function labels(v: unknown): unknown {
    if (typeof v === 'string') return v === 'April' ? 'P'.repeat(32) : convert(v);
    if (Array.isArray(v)) return v.map(labels);
    if (isRec(v))
      return Object.fromEntries(
        Object.entries(v).map(([k, x]) => [k, k === 'label' || k === 'subject' ? x : labels(x)]),
      );
    return v;
  }
  long.proposal = labels(long.proposal) as Rec;
  // Entity labels must be updated too; envelope label/subject remain within their own caps.
  long.proposal.entities = (long.proposal.entities as Rec[]).map((e, i) => ({
    ...e,
    label: replacements[i][1],
  }));
  result.push(long);
  if (s.id === '09') {
    const large = [...original.text];
    const values = [1_000_000_000, 200_000_000, 300_000_000, 180_000_000];
    const records = s.proposal.records as { role: string; quantity: Rec }[];
    records.forEach((record, i) => {
      const q = record.quantity;
      const b = q.basis as Rec;
      large[i + 1] =
        `${q.actor} ${q.claim} is ${values[i]} count during ${b.period} among ${b.population}.`;
    });
    result.push(
      rewrite(s, large, (r) => {
        (r.records as { quantity: Rec }[]).forEach((record, i) => {
          record.quantity.amount = {
            kind: 'rational',
            value: { numerator: values[i], denominator: 1 },
          };
        });
      }),
    );
    const rates = [...original.text];
    rates[1] =
      'The population remains an aggregate description rather than individual memberships.';
    for (let i = 1; i < records.length; i++) {
      const q = records[i].quantity;
      const b = q.basis as Rec;
      rates[i + 1] =
        `${q.actor} ${q.claim} is ${i === 3 ? '60.000000' : '0.000001'} percent during ${b.period} among ${b.population} with denominator 1000000000.`;
    }
    const pop = String(s.proposal.population);
    const selection = String(s.proposal.selection);
    const name = (i: number) => `${records[i].quantity.actor} ${records[i].quantity.claim}`;
    rates[rates.length - 2] =
      `${name(1)} is the prevalence within ${pop}, and ${name(2)} is the selection rate within ${pop}, while ${name(3)} is the prevalence within ${selection} during April.`;
    result.push(
      rewrite(s, rates, (r) => {
        r.representation = 'rates';
        r.records = (r.records as { role: string; quantity: Rec }[]).slice(1).map((record, i) => ({
          ...record,
          role: ['prevalence', 'selection-rate', 'selected-prevalence'][i],
          quantity: {
            ...record.quantity,
            basis: {
              ...(record.quantity.basis as Rec),
              unit: 'percent',
              denominator: { numerator: 1_000_000_000, denominator: 1 },
            },
            amount: {
              kind: 'rational',
              value:
                i === 2
                  ? { numerator: 60, denominator: 1 }
                  : { numerator: 1, denominator: 1_000_000 },
            },
          },
        }));
      }),
    );
  } else {
    const text = [...original.text];
    const hypothesis = String(s.proposal.hypothesis);
    const evidence = String(s.proposal.evidenceLabel);
    text[4] = `${hypothesis} posterior chance is 8/17 ratio during April among ${evidence} with denominator 1000000000.`;
    text[text.length - 2] = text[text.length - 2].replace(
      ' during April.',
      `, while ${hypothesis} posterior chance is the source-stated update within ${evidence} during April.`,
    );
    result.push(
      rewrite(s, text, (r) => {
        const speech = expansionFixtureSpeech(text, 10);
        r.updateMode = 'source-stated';
        (r.records as unknown[]).push({
          role: 'posterior',
          quantity: {
            actor: hypothesis,
            claim: 'posterior chance',
            state: 'known',
            basis: {
              unit: 'ratio',
              period: 'April',
              population: evidence,
              denominator: { numerator: 1_000_000_000, denominator: 1 },
            },
            evidence: speech.spans[4],
            amount: { kind: 'rational', value: { numerator: 8, denominator: 17 } },
          },
        });
      }),
    );
  }
  return result;
}
describe('base/update actual planar identity and CPU projection', () => {
  it('emits essential source facts at a minimum of 22px without compressed text', () => {
    const scene = accepted(packet.stories[0]);
    const html = renderToStaticMarkup(
      createElement(BaseUpdateFacts, { scene, t: 10, pose: baseUpdatePose(10, scene), colors }),
    );
    for (const match of html.matchAll(/<text\b([^>]*)>/g)) {
      expect(Number(/font-size="([^"]+)"/.exec(match[1])?.[1])).toBeGreaterThanOrEqual(22);
      expect(match[1]).not.toContain('lengthAdjust');
    }
  });
  for (const story of packet.stories)
    it(`${story.id}: real pages retain complete source facts, readable bounds and exact hidden costs`, () => {
      for (const raw of variants(story)) {
        const scene = accepted(raw);
        const before = JSON.stringify(scene);
        const samples = new Map<number, { frame: number; facts: string }>();
        const decode = (v: string) =>
          v.replaceAll('&amp;', '&').replaceAll('&#x27;', "'").replaceAll('&quot;', '"');
        for (let frame = 0; frame <= 300; frame++) {
          const t = frame / 30;
          const pageIndex = baseUpdatePageIndex(t, scene);
          expect(baseUpdatePageIndex(t, { ...scene, visualMode: 'hybrid' })).toBe(pageIndex);
          if (!samples.has(pageIndex))
            samples.set(pageIndex, {
              frame,
              facts: renderToStaticMarkup(
                createElement(BaseUpdateFacts, {
                  scene,
                  t,
                  pose: baseUpdatePose(t, scene),
                  colors,
                }),
              ),
            });
          const pose = baseUpdatePose(t, scene);
          expect(baseUpdatePose(t, scene)).toEqual(pose);
          expect(
            Object.values(pose).every(
              (value) => Number.isFinite(value) && value >= 0 && value <= 1,
            ),
          ).toBe(true);
        }
        for (let i = 0; i <= 300; i++) {
          const frame = (i * 137) % 301;
          expect(baseUpdatePageIndex(frame / 30, scene)).toBe(
            baseUpdatePageIndex(frame / 30, scene),
          );
        }
        expect(samples.size).toBe(baseUpdatePages(scene).length);
        for (const t of [NaN, Infinity, -Infinity]) expect(baseUpdatePageIndex(t, scene)).toBe(0);
        for (const t of [scene.resolveAt, 9.2, 10, 1000])
          expect(baseUpdatePageIndex(t, scene)).toBe(baseUpdatePages(scene).length - 1);
        const detail = [...samples.values()]
          .flatMap(({ facts }) =>
            [
              ...(/data-source-detail="">([\s\S]*?)<\/g>/.exec(facts)?.[1] ?? '').matchAll(
                /<text\b[^>]*>(.*?)<\/text>/g,
              ),
            ].map((m) => decode(m[1])),
          )
          .join('');
        for (const row of baseUpdateRows(scene))
          for (const line of row.lines) expect(detail).toContain(line);
        for (const line of baseUpdateResultLines(scene)) expect(detail).toContain(line);
        expect(JSON.stringify(scene)).toBe(before);
        for (const { frame, facts } of samples.values()) {
          const page = baseUpdateFocus(frame / 30, scene);
          for (const tag of facts.matchAll(/<text\b([^>]*)>(.*?)<\/text>/g)) {
            const attr = (name: string) =>
              Number(new RegExp(`${name}="([^"]+)"`).exec(tag[1])?.[1]);
            expect(attr('font-size')).toBe(22);
            expect(tag[1]).not.toMatch(/textLength|lengthAdjust/);
            for (const [width, height] of [
              [952, 478],
              [1320, 760],
            ]) {
              const scale = Math.min(width / 952, height / 478);
              expect(attr('x') * scale).toBeGreaterThanOrEqual(0);
              expect(
                (attr('x') + Array.from(decode(tag[2])).length * 22) * scale,
              ).toBeLessThanOrEqual(width);
              expect((attr('y') - 22) * scale).toBeGreaterThanOrEqual(0);
              expect(attr('y') * scale).toBeLessThanOrEqual(height);
            }
          }
          for (const aspect of ['9:16', '16:9'] as const)
            for (const visualMode of ['diagram', 'hybrid'] as const) {
              probe.frame = frame;
              const html = renderToStaticMarkup(
                createElement(
                  ExplainerProvider,
                  {
                    value: {
                      aspect,
                      nativeStage: true,
                      palette: {
                        ...deriveExplainerPalette(),
                        card: colors.surface,
                        text: colors.text,
                        accent: colors.accent,
                        muted: colors.muted,
                      },
                    },
                  },
                  createElement(ProbabilityBaseUpdateView, {
                    scene: { ...scene, visualMode },
                  }),
                ),
              );
              expect(html).toContain(facts);
              const tags = (tag: string) =>
                [...html.matchAll(new RegExp(`<${tag}(?=[\\s/>])`, 'gi'))].length;
              expect(tags('stage-marker')).toBe(visualMode === 'hybrid' ? 1 : 0);
              expect(tags('canvas')).toBe(0); // ownership marker, not native proof
              expect(tags('mesh')).toBe(
                visualMode === 'hybrid' ? (scene.storyId === '09' ? 105 : 110) : 0,
              );
              expect(tags('svg')).toBe(2);
              expect(tags('circle')).toBe(100);
              const rates = scene.records.filter((r) => r.quantity.basis.unit !== 'count');
              const positions = rates.reduce(
                (sum, r) =>
                  sum +
                  (r.quantity.state === 'disputed'
                    ? 2
                    : ['unknown', 'missing'].includes(r.quantity.state)
                      ? 0
                      : 1),
                0,
              );
              const absent = rates.filter((r) =>
                ['unknown', 'missing'].includes(r.quantity.state),
              ).length;
              expect(tags('rect')).toBe(2 + positions);
              expect(tags('path')).toBe((scene.storyId === '09' ? 1 : 4) + rates.length + absent);
              expect(tags('g')).toBe((scene.storyId === '09' ? 5 : 7) + rates.length);
              expect(tags('text')).toBe(8 + page.lines.length);
              const svg = [...html.matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map((m) => m[0]).join('');
              expect([...svg.matchAll(/<[A-Za-z][\w:-]*(?=[\s/>])/g)].length).toBe(
                (scene.storyId === '09' ? 118 : 123) +
                  page.lines.length +
                  2 * rates.length +
                  positions +
                  absent,
              );
            }
        }
      }
    });
});
