/** Shared fixtures for the conditioning-sampling-poses tests and their projection/mesh-budget siblings. */
import { readFileSync } from 'node:fs';
import { expect } from 'vitest';
import {
  type ExpansionSourceFixture,
  expansionFixtureSpeech,
} from '../../../../../ai/explainer/expansion-fixture-words';
import {
  parseExpansionConditioning,
  parseExpansionSelectionBias,
} from '../../../../../ai/explainer/expansion-probability-conditioning-sampling-contract';
import { makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import type { ExpansionConditioningSamplingScene } from './conditioning-sampling-types';

export const fixtures = (
  JSON.parse(
    readFileSync(
      'scripts/explainer-stills/fixtures/expansion/probability/conditioning-sampling.source.json',
      'utf8',
    ),
  ) as { stories: ExpansionSourceFixture[] }
).stories;
export const beats = [
  'setupWord',
  'actionWord',
  'responseWord',
  'checkWord',
  'resolveWord',
] as const;
export function conditioningSamplingFixtures(): ExpansionConditioningSamplingScene[] {
  const scenes: ExpansionConditioningSamplingScene[] = [];
  for (const fixture of fixtures) {
    const clauses = beats.map((key, i) =>
      fixture.words
        .slice(
          Number(fixture.proposal[key]),
          i === 4 ? fixture.window.endWord + 1 : Number(fixture.proposal[beats[i + 1]]),
        )
        .map((word) => word.text)
        .join(' '),
    );
    const variants: { name: string; clauses: string[]; mutate: (raw: Rec) => void }[] = [
      { name: 'base', clauses, mutate: () => {} },
    ];
    if (fixture.id === '11') {
      variants.push({
        name: 'long',
        clauses: clauses.map((clause) =>
          clause.replaceAll('night shift', 'extended nighttime workforce'),
        ),
        mutate: (raw) => {
          const replaced = JSON.parse(
            JSON.stringify(raw).replaceAll('night shift', 'extended nighttime workforce'),
          ) as Rec;
          Object.assign(raw, replaced);
        },
      });
      const zeroSource = [...clauses];
      zeroSource[3] = zeroSource[3].replace('20 count', '0 count');
      variants.push({
        name: 'zero',
        clauses: zeroSource,
        mutate: (raw) => {
          const record = (raw.counts as Record<string, { quantity: Rec; display?: Rec }>).event;
          record.quantity.amount = { kind: 'rational', value: { numerator: 0, denominator: 1 } };
          record.display = { mode: 'individual', marks: 0 };
        },
      });
      for (const state of ['simulated', 'illustrative', 'conditional'] as const) {
        const qualifier =
          state === 'conditional'
            ? 'If permits are approved'
            : state === 'simulated'
              ? 'simulation'
              : 'teaching example';
        const source = [...clauses];
        source[2] = `${state === 'conditional' ? qualifier : `In this ${qualifier}`}, ${source[2]}`;
        variants.push({
          name: state,
          clauses: source,
          mutate: (raw) => {
            delete raw.derive;
            if (state === 'conditional') raw.condition = qualifier;
            else raw.evidence = 'illustrative';
            const record = (raw.counts as Record<string, { quantity: Rec; display?: Rec }>).subset;
            record.quantity.state = state;
            record.quantity[state === 'conditional' ? 'condition' : 'qualifier'] = qualifier;
            delete record.display;
          },
        });
      }
    } else {
      const wideOwner = 'WWMW'.repeat(7),
        wideFrame = 'MMWW'.repeat(7);
      const widen = (text: string) =>
        text.replaceAll('Ada', wideOwner).replaceAll('Survey', wideFrame);
      const wideClauses = clauses.map(widen);
      const extraGroup = 'low net rural phone homes';
      const prefix = `${wideOwner}'s ${wideFrame} excludes ${extraGroup} under rule`;
      const rule = String((fixture.proposal.selection as Rec).rule);
      wideClauses[3] = `${prefix} "${rule}".`;
      expect(wideClauses.map((clause) => clause.split(/\s+/).length)).toEqual(
        clauses.map((clause) => clause.split(/\s+/).length),
      );
      variants.push({
        name: 'max-wide',
        clauses: wideClauses,
        mutate: (raw) => {
          Object.assign(raw, JSON.parse(widen(JSON.stringify(raw))) as Rec);
          // Frozen quantity.actor caps owner/frame together at 28. This valid no-measurement
          // frame instead binds the check beat to an explicit third eligibility clause.
          raw.measurements = [];
          const evidence = { fromWord: raw.checkWord, toWord: Number(raw.resolveWord) - 1 };
          (raw.entities as Rec[]).push({ label: extraGroup, evidence });
          (raw.eligibility as Rec[]).push({
            group: extraGroup,
            status: 'excluded',
            rule,
            evidence,
          });
        },
      });
      for (const state of ['missing', 'disputed', 'cap', 'fractional', 'records-cap'] as const) {
        const source = [...clauses];
        source[3] = ['cap', 'fractional', 'records-cap'].includes(state)
          ? `Ada's Survey member count is ${state === 'fractional' ? 201 : 200} count during March among offline households.`
          : source[3].replace(
              'unknown percent',
              state === 'disputed' ? 'disputed between 40 and 60 percent' : 'missing percent',
            );
        variants.push({
          name: state,
          clauses: source,
          mutate: (raw) => {
            const record = (raw.measurements as { quantity: Rec; display?: Rec }[])[0];
            const q = record.quantity;
            q.state = ['cap', 'fractional', 'records-cap'].includes(state) ? 'known' : state;
            if (['cap', 'fractional', 'records-cap'].includes(state)) {
              q.claim = 'member count';
              delete q.qualifier;
              (q.basis as Rec).unit = 'count';
              q.amount = {
                kind: 'rational',
                value: { numerator: state === 'fractional' ? 201 : 200, denominator: 1 },
              };
              record.display = { mode: 'aggregate', marks: state === 'records-cap' ? 10 : 100 };
              if (state === 'records-cap')
                raw.measurements = Array.from({ length: 10 }, () => structuredClone(record));
            } else {
              q.qualifier = state;
              if (state === 'disputed')
                q.alternatives = [40, 60].map((n) => ({
                  kind: 'rational',
                  value: { numerator: n, denominator: 1 },
                }));
            }
          },
        });
      }
    }
    for (const variant of variants) {
      const speech = expansionFixtureSpeech(variant.clauses, 10);
      function rebase(value: unknown): unknown {
        if (Array.isArray(value)) return value.map(rebase);
        if (value && typeof value === 'object') {
          const record = value as Rec;
          if (Object.keys(record).length === 2 && 'fromWord' in record && 'toWord' in record) {
            const i = beats.findIndex(
              (key, index) =>
                Number(fixture.proposal[key]) === record.fromWord &&
                (index === 4
                  ? fixture.window.endWord
                  : Number(fixture.proposal[beats[index + 1]]) - 1) === record.toWord,
            );
            if (i < 0) throw new Error('Unrecognized source span');
            return { ...speech.spans[i] };
          }
          return Object.fromEntries(
            Object.entries(record).map(([key, entry]) => [key, rebase(entry)]),
          );
        }
        return value;
      }
      for (const mode of ['diagram', 'hybrid']) {
        const raw = rebase(fixture.proposal) as Rec;
        raw.startWord = speech.window.startWord;
        raw.endWord = speech.window.endWord;
        raw.visualMode = mode;
        beats.forEach((key, i) => {
          raw[key] = speech.spans[i].fromWord;
        });
        variant.mutate(raw);
        const ctx = makeParseContext(speech.words, speech.window);
        const scene =
          fixture.id === '11'
            ? parseExpansionConditioning(raw, ctx)
            : parseExpansionSelectionBias(raw, ctx);
        expect(ctx.issues, `${fixture.id}/${variant.name}/${mode}`).toEqual([]);
        if (!scene) throw new Error(`Rejected ${variant.name}`);
        if (variant.name === 'max-wide') {
          expect(scene.entities.find((entity) => entity.id === scene.ownerId)?.label).toHaveLength(
            28,
          );
          expect(scene.storyId).toBe('12');
          if (scene.storyId === '12')
            expect(
              scene.entities.find((entity) => entity.id === scene.frameId)?.label,
            ).toHaveLength(28);
        }
        scenes.push(scene);
      }
    }
  }
  return scenes;
}

export const conditioningSamplingScenes = conditioningSamplingFixtures();
