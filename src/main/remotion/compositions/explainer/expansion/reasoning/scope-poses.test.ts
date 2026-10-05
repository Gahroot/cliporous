import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expansionFixtureSpeech } from '../../../../../ai/explainer/expansion-fixture-words';
import {
  parseExpansionSameFacts,
  parseExpansionScopedStatements,
} from '../../../../../ai/explainer/expansion-reasoning-scope-contract';
import {
  type TemporalFixtureSeed,
  temporalSourceFixtures,
} from '../../../../../ai/explainer/expansion-temporal-fixtures';
import type { Rec } from '../../../../../ai/explainer/kind-spec';
import { makeParseContext } from '../../../../../ai/explainer/kind-spec';
import { scopeDetails, scopePose } from './scope-poses';

export function maximumScopeScene(mixedStatuses = false) {
  const raw = structuredClone(packet.stories[0].proposal);
  const names = Array.from({ length: 12 }, (_, i) => `Statement${String(i + 1).padStart(2, '0')}`);
  const actors = ['Library', ...Array.from({ length: 7 }, (_, i) => `${'A'.repeat(27)}${i}`)];
  const condition = `If ${'Q'.repeat(93)}`;
  const claim = `not ${'W'.repeat(92)}`;
  const clauses = [`Library scoped statements keep ${actors.slice(1).join(' and ')} attributed.`];
  const statements = names.map((label, i) => {
    const s = {
      label,
      actor: actors[i % 8],
      source: actors[(i + 1) % 8],
      version: 'V'.repeat(32),
      period: 'P'.repeat(32),
      scope: `${'S'.repeat(38)}${String(i).padStart(2, '0')}`,
      claim,
      status: mixedStatuses ? (['reported', 'disputed', 'unresolved'] as const)[i % 3] : 'disputed',
      ...(i === 0 ? { condition } : {}),
    };
    clauses.push(
      `${i === 0 ? `${condition}, ` : ''}${s.source} reports ${label} by ${s.actor} in version ${s.version} during ${s.period} for ${s.scope} as ${s.status}: ${claim}.`,
    );
    return s;
  });
  const pairs: [number, number][] = [];
  for (let a = 0; a < 12 && pairs.length < 16; a++)
    for (let b = a + 1; b < 12 && pairs.length < 16; b++) pairs.push([a, b]);
  const relations = pairs.map(([a, b], i) => {
    const status = mixedStatuses && i % 2 === 0 ? 'unresolved' : 'disputed';
    clauses.push(`${names[a]} and ${names[b]} differ in scope and remain ${status}.`);
    return {
      fromLabel: names[a],
      toLabel: names[b],
      role: 'scope-distinction',
      dimension: 'scope',
      status,
    };
  });
  clauses.push(
    `${names.slice(0, -1).join(', ')} and ${names[11]} remain disputed after checking their scopes.`,
  );
  const speech = expansionFixtureSpeech(clauses, 12);
  speech.spans.forEach((span, i) => {
    const start =
      i === 0
        ? 0.25
        : i <= 6
          ? 0.9 + (i - 1) * 0.35
          : i <= 12
            ? 3 + (i - 7) * 0.4
            : i < 29
              ? 5.5 + (i - 13) * 0.32
              : 10.8;
    const end = i === 0 ? 0.65 : i === 29 ? 11.65 : start + 0.3;
    for (let w = span.fromWord; w <= span.toWord; w++) {
      const n = span.toWord - span.fromWord + 1;
      speech.words[w].start = start + ((end - start) * (w - span.fromWord)) / n;
      speech.words[w].end = start + ((end - start) * (w - span.fromWord + 1)) / n;
    }
  });
  raw.actors = actors.map((label) => ({ label, evidence: speech.spans[0] }));
  raw.statements = statements.map((s, i) => ({ ...s, evidence: speech.spans[i + 1] }));
  raw.relations = relations.map((r, i) => ({ ...r, evidence: speech.spans[13 + i] }));
  raw.result = { status: 'disputed', evidence: speech.spans[29] };
  raw.condition = condition;
  Object.assign(raw, {
    startWord: 0,
    endWord: speech.words.length - 1,
    setupWord: 0,
    actionWord: speech.spans[1].fromWord,
    responseWord: speech.spans[7].fromWord,
    checkWord: speech.spans[13].fromWord,
    resolveWord: speech.spans[29].fromWord,
  });
  const ctx = makeParseContext(speech.words, speech.window);
  const scene = parseExpansionScopedStatements(raw as Rec, ctx);
  if (!scene) throw new Error(JSON.stringify(ctx.issues));
  return scene;
}

export function maximumFactsScene(unknownLastFact = false, mixedStates = false) {
  const raw = structuredClone(packet.stories[1].proposal);
  if (mixedStates) {
    raw.evidence = 'illustrative';
    raw.condition = `If ${'Q'.repeat(93)}`;
  }
  const actors = ['Clinic', ...Array.from({ length: 7 }, (_, i) => `${'A'.repeat(27)}${i}`)];
  const labels = Array.from({ length: 12 }, (_, i) => `Fact${String(i + 1).padStart(2, '0')}`);
  const basis = {
    unit: 'count',
    period: 'P'.repeat(32),
    population: 'W'.repeat(40),
    denominator: { numerator: 1000000000, denominator: 1 },
  };
  const clauses = [
    `Clinic framing comparison keeps Whole and Reviewed tied to identical quantities from ${actors.join(' and ')}.`,
  ];
  const facts = labels.map((label, i) => {
    const claim = `${label} ${'W'.repeat(89)}`;
    const actor = actors[i % 8];
    const state = mixedStates
      ? (
          [
            'known',
            'known',
            'missing',
            'unknown',
            'disputed',
            'illustrative',
            'simulated',
            'conditional',
          ] as const
        )[i % 8]
      : unknownLastFact && i === 11
        ? 'unknown'
        : 'known';
    const amount = { kind: 'rational', value: { numerator: 1000000000 - i, denominator: 1 } };
    const condition = `If ${'Q'.repeat(93)}`;
    const notation =
      state === 'unknown' || state === 'missing'
        ? state
        : state === 'disputed'
          ? `disputed between ${1000000000 - i}.000 and ${999999999 - i}.000`
          : `${1000000000 - i}.000`;
    const prefix =
      state === 'conditional'
        ? `${condition}, `
        : state === 'illustrative' || state === 'simulated'
          ? `In this ${state}, `
          : '';
    clauses.push(
      `${prefix}${actor} ${claim} is ${notation} count during ${basis.period} among ${basis.population} with denominator 1000000000.`,
    );
    return {
      actor,
      label,
      quantity: {
        actor,
        claim,
        basis,
        state,
        ...(state === 'unknown' || state === 'missing'
          ? { qualifier: state }
          : state === 'disputed'
            ? {
                qualifier: state,
                alternatives: [
                  amount,
                  { kind: 'rational', value: { numerator: 999999999 - i, denominator: 1 } },
                ],
              }
            : {
                amount,
                ...(state === 'conditional'
                  ? { condition }
                  : state === 'known'
                    ? {}
                    : { qualifier: state }),
              }),
      },
    };
  });
  clauses.push(
    `Whole and Reviewed retain the same ${labels.slice(0, -1).join(', ')} and ${labels[11]} and change the reference from ${labels[0]} to ${labels[1]}.`,
  );
  clauses.push(
    `Whole and Reviewed keep ${labels.slice(0, -1).join(', ')} and ${labels[11]} unchanged after the reference switch.`,
  );
  const speech = expansionFixtureSpeech(clauses, 12);
  speech.spans.forEach((span, i) => {
    const start =
      i === 0
        ? 0.25
        : i <= 6
          ? 0.9 + (i - 1) * 0.35
          : i <= 12
            ? 3 + (i - 7) * 0.4
            : i === 13
              ? 6
              : 10.8;
    const end = i === 0 ? 0.65 : i === 14 ? 11.65 : start + 0.3;
    for (let w = span.fromWord; w <= span.toWord; w++) {
      const n = span.toWord - span.fromWord + 1;
      speech.words[w].start = start + ((end - start) * (w - span.fromWord)) / n;
      speech.words[w].end = start + ((end - start) * (w - span.fromWord + 1)) / n;
    }
  });
  raw.actors = actors.map((label) => ({ label, evidence: speech.spans[0] }));
  raw.facts = facts.map((f, i) => ({
    ...f,
    quantity: { ...f.quantity, evidence: speech.spans[i + 1] },
  }));
  raw.frames = ['Whole', 'Reviewed'].map((label, i) => ({
    label,
    factIndexes: labels.map((_, index) => index),
    referenceFactIndex: i,
    evidence: speech.spans[13],
  }));
  raw.relations = [
    {
      fromLabel: 'Whole',
      toLabel: 'Reviewed',
      role: 'reference-change',
      evidence: speech.spans[13],
    },
  ];
  raw.result = { status: 'unchanged', evidence: speech.spans[14] };
  Object.assign(raw, {
    startWord: 0,
    endWord: speech.words.length - 1,
    setupWord: 0,
    actionWord: speech.spans[1].fromWord,
    responseWord: speech.spans[7].fromWord,
    checkWord: speech.spans[13].fromWord,
    resolveWord: speech.spans[14].fromWord,
  });
  const ctx = makeParseContext(speech.words, speech.window);
  const scene = parseExpansionSameFacts(raw, ctx);
  if (!scene) throw new Error(JSON.stringify(ctx.issues));
  return scene;
}

const packet = JSON.parse(
  readFileSync('scripts/explainer-stills/fixtures/expansion/reasoning/scope.source.json', 'utf8'),
) as { stories: TemporalFixtureSeed[] };
export const scopeTestScenes = temporalSourceFixtures(packet.stories).map((f) => {
  const ctx = makeParseContext(f.words, f.window);
  const scene =
    f.id === '07'
      ? parseExpansionScopedStatements(f.proposal, ctx)
      : parseExpansionSameFacts(f.proposal, ctx);
  if (!scene) throw new Error(JSON.stringify(ctx.issues));
  return scene;
});
describe('scope source lenses', () => {
  it('accepts the real parser caps with reused named actors and more than five clauses', () => {
    const statements = maximumScopeScene();
    expect(statements.actors).toHaveLength(8);
    expect(statements.statements).toHaveLength(12);
    expect(statements.relations).toHaveLength(16);
    expect(new Set(statements.statements.map((s) => s.id)).size).toBe(12);
    for (const facts of [
      maximumFactsScene(),
      maximumFactsScene(true),
      maximumFactsScene(false, true),
    ]) {
      expect(facts.actors).toHaveLength(8);
      expect(facts.facts).toHaveLength(12);
      expect(facts.frames).toHaveLength(2);
      expect(facts.relations).toHaveLength(1);
      expect(new Set(facts.facts.map((f) => f.id)).size).toBe(12);
    }
    expect(new Set(maximumFactsScene(false, true).facts.map((f) => f.quantity.state))).toEqual(
      new Set([
        'known',
        'missing',
        'unknown',
        'disputed',
        'illustrative',
        'simulated',
        'conditional',
      ]),
    );
  });
  for (const scene of [
    ...scopeTestScenes,
    maximumScopeScene(),
    maximumScopeScene(true),
    maximumFactsScene(),
    maximumFactsScene(true),
    maximumFactsScene(false, true),
  ])
    it(`${scene.storyId}: all frames, seeks, detail identities and final hold`, () => {
      const original = JSON.stringify(scene);
      const frames = Array.from({ length: 361 }, (_, i) => scopePose(scene, i / 30));
      for (const i of [
        360,
        0,
        88,
        19,
        215,
        88,
        ...Array.from({ length: 361 }, (_, k) => 360 - k),
      ]) {
        const pose = scopePose(scene, i / 30);
        expect(pose).toEqual(frames[i]);
        for (const key of ['reveal', 'action', 'response', 'check', 'resolve'] as const) {
          expect(pose[key]).toBeGreaterThanOrEqual(0);
          expect(pose[key]).toBeLessThanOrEqual(1);
        }
        expect(pose.page).toBeGreaterThanOrEqual(0);
        expect(pose.page).toBeLessThan(pose.pages.length);
        expect(Number.isFinite(pose.modelTurn)).toBe(true);
      }
      const ids =
        scene.storyId === '07' ? scene.statements.map((s) => s.id) : scene.facts.map((f) => f.id);
      const selected = new Set(frames.filter((p) => p.action > 0).map((p) => p.pages[p.page].id));
      // Every section, not merely each record's first section, occurs at a real 30fps frame.
      const sections = new Set(frames.filter((p) => p.action > 0).map((p) => p.page));
      scopeDetails(scene).forEach((_, index) => {
        expect(sections.has(index), `section ${index}`).toBe(true);
      });
      ids.forEach((id) => {
        expect(selected.has(id)).toBe(true);
      });
      expect(scopePose(scene, scene.resolveAt + 0.3)).toEqual(scopePose(scene, 100));
      expect(scopePose(scene, Number.NaN)).toEqual(scopePose(scene, scene.setupAt));
      expect(JSON.stringify(scene)).toBe(original);
      const text = scopeDetails(scene)
        .flatMap((p) => p.lines)
        .join(' ');
      const recordText = (id: string) =>
        scopeDetails(scene)
          .filter((p) => p.id === id)
          .flatMap((p) => p.lines)
          .join('');
      if (scene.storyId === '07')
        scene.statements.forEach((s) => {
          expect(text.replace(/\s/g, '')).toContain(s.claim.replace(/\s/g, ''));
          const detail = recordText(s.id);
          for (const field of [s.label, s.version, s.period, s.scope, s.claim, s.condition ?? ''])
            expect(detail).toContain(field);
          for (const id of [s.actorId, s.sourceId])
            expect(detail).toContain(`${id}: ${scene.actors.find((a) => a.id === id)?.label}`);
          expect(
            scopeDetails(scene)
              .filter((p) => p.id === s.id)
              .every((p) => p.marker.endsWith(s.status)),
          ).toBe(true);
        });
      else {
        expect(scene.frames[0].factIds).toEqual(scene.frames[1].factIds);
        scene.facts.forEach((f) => {
          const detail = recordText(f.id);
          const q = f.quantity;
          for (const field of [
            f.label,
            q.claim,
            q.actor,
            q.basis.unit,
            q.basis.period,
            q.basis.population,
          ])
            expect(detail).toContain(field);
          expect(
            scopeDetails(scene)
              .filter((p) => p.id === f.id)
              .every((p) => p.marker.endsWith(q.state)),
          ).toBe(true);
          if ('condition' in q) expect(detail).toContain(q.condition);
          if ('qualifier' in q) expect(detail).toContain(q.qualifier);
          if (q.state === 'disputed') {
            for (const alternative of q.alternatives)
              expect(detail).toContain(alternative.notation);
            expect(q).not.toHaveProperty('amount');
          }
          if (q.state === 'missing' || q.state === 'unknown') {
            expect(detail).toContain(`Amount: ${q.state}`);
            expect(q).not.toHaveProperty('amount');
            expect(detail).not.toMatch(/Amount: 0|derived/i);
          }
          if ('amount' in f.quantity)
            expect(text.replace(/\s/g, '')).toContain(f.quantity.amount.notation);
          else if (f.quantity.state === 'unknown') {
            expect(f.quantity).not.toHaveProperty('amount');
            const detail = scopeDetails(scene)
              .filter((p) => p.id === f.id)
              .flatMap((p) => p.lines)
              .join('')
              .replace(/\s/g, '');
            expect(detail).toContain('Amount:unknown');
            expect(detail).toContain(f.quantity.qualifier.replace(/\s/g, ''));
            expect(detail).not.toMatch(/Amount:0|false|derived/i);
          }
        });
        expect(text).not.toMatch(/derived|50%/);
        expect(scene).not.toHaveProperty('ratio');
        expect(scene).not.toHaveProperty('derived');
      }
    });
});
