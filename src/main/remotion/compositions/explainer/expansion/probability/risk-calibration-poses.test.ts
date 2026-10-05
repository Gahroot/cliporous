import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ExpansionSourceFixture } from '../../../../../ai/explainer/expansion-fixture-words';
import {
  parseExpansionCalibration,
  parseExpansionRiskMatrix,
} from '../../../../../ai/explainer/expansion-probability-risk-calibration-contract';
import { makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import { conceptFixtureWords } from '../../concepts/fixture-words';
import {
  riskCalibrationFields,
  riskCalibrationPages,
  riskCalibrationPose,
  riskQuantityPositions,
} from './risk-calibration-poses';
import type { ExpansionRiskCalibrationScene } from './risk-calibration-types';

const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/probability/risk-calibration.source.json',
    'utf8',
  ),
) as { stories: ExpansionSourceFixture[] };
const beatKeys = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'] as const;
function parse(story: ExpansionSourceFixture): ExpansionRiskCalibrationScene {
  const ctx = makeParseContext(story.words, story.window);
  const scene =
    story.id === '15'
      ? parseExpansionRiskMatrix(story.proposal, ctx)
      : parseExpansionCalibration(story.proposal, ctx);
  expect(ctx.issues).toEqual([]);
  if (!scene) throw new Error('Real parser rejected authored source');
  return scene;
}
export const riskCalibrationTestScenes = packet.stories.map(parse);
/** 27 source clauses, not five clauses: all 12 distinct period records accepted by the real parser. */
export function maximumRiskCalibration(
  id: '15' | '16',
  numeric = false,
): ExpansionRiskCalibrationScene {
  const original = packet.stories.find((s) => s.id === id);
  if (!original) throw new Error('Missing fixture');
  const raw = structuredClone(original.proposal);
  delete raw.condition;
  const clauses = beatKeys.map((key, i) =>
    original.words
      .slice(Number(raw[key]), i === 4 ? original.words.length : Number(raw[beatKeys[i + 1]]))
      .map((w) => w.text)
      .join(' '),
  );
  if (id === '15')
    clauses[1] = 'Clinic outage likelihood is unlikely during July among clinic visits.';
  if (id === '15' && numeric) {
    clauses[1] = 'Clinic outage likelihood is 25.00 percent during July among clinic visits.';
    clauses[2] = 'Clinic outage impact is 10000000.00 USD during July among clinic visits.';
  }
  if (id === '16') {
    clauses[1] = clauses[1]
      .replace('80.00', '800000000.00')
      .replace('denominator 100', 'denominator 1000000000');
    clauses[2] = clauses[2]
      .replace('75.00', '750000000.00')
      .replace('denominator 100', 'denominator 1000000000');
    const record = (raw.records as Rec[])[0];
    for (const [key, numerator] of [
      ['prediction', 800000000],
      ['observation', 750000000],
    ] as const) {
      const q = record[key] as Rec;
      ((q.amount as Rec).value as Rec).numerator = numerator;
      ((q.basis as Rec).denominator as Rec).numerator = 1000000000;
    }
  }
  const pieces = [clauses[0]];
  for (let i = 0; i < 12; i++) {
    const period = `P${i}${'x'.repeat(31 - String(i).length)}`;
    pieces.push(clauses[1].replaceAll('July', period), clauses[2].replaceAll('July', period));
  }
  const name = id === '15' ? 'Clinic outage' : 'Clinic calibration bin';
  // Use the actual source record label, not an assumed calibration name.
  const baseRecord = (raw.records as Rec[])[0];
  const fullName = id === '15' ? name : `Clinic ${String(baseRecord.label)}`;
  const names = Array.from({ length: 12 }, () => fullName);
  const all = `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
  pieces.push(id === '15' ? `${all} keep separate likelihood and impact dimensions.` : clauses[3]);
  pieces.push(
    id === '15'
      ? `The assessment for ${all} stays within the stated period and population.`
      : `The comparison for ${all} remains limited to the supplied records.`,
  );
  const text = pieces.join(' ');
  const words = conceptFixtureWords(text, 12);
  let cursor = 0;
  const spans = pieces.map((piece) => {
    const fromWord = cursor;
    cursor += piece.split(/\s+/).length;
    return { fromWord, toWord: cursor - 1 };
  });
  const oldSpans = beatKeys.map((key, i) => ({
    fromWord: Number(raw[key]),
    toWord: i === 4 ? original.words.length - 1 : Number(raw[beatKeys[i + 1]]) - 1,
  }));
  const rebase = (value: unknown, index: number): unknown => {
    if (Array.isArray(value)) return value.map((v) => rebase(v, index));
    if (!value || typeof value !== 'object')
      return value === 'July' ? `P${index}${'x'.repeat(31 - String(index).length)}` : value;
    const r = value as Rec;
    if ('fromWord' in r && 'toWord' in r) {
      const b = oldSpans.findIndex((s) => s.fromWord === r.fromWord && s.toWord === r.toWord);
      if (b < 0) throw new Error('Unexpected fixture evidence');
      return spans[
        b === 0 ? 0 : b === 1 ? 1 + index * 2 : b === 2 ? 2 + index * 2 : b === 3 ? 25 : 26
      ];
    }
    return Object.fromEntries(
      Object.entries(r)
        .filter(([key]) => !(id === '15' && key === 'condition'))
        .map(([key, v]) => [key, rebase(v, index)]),
    );
  };
  const proposal = rebase(raw, 0) as Rec;
  proposal.records = Array.from({ length: 12 }, (_, i) => {
    const record = rebase(baseRecord, i) as Rec;
    if (id === '15' && numeric) {
      record.likelihood = {
        state: 'quantity',
        quantity: {
          actor: 'Clinic',
          claim: 'outage likelihood',
          basis: {
            unit: 'percent',
            period: `P${i}${'x'.repeat(31 - String(i).length)}`,
            population: 'clinic visits',
          },
          state: 'known',
          amount: { kind: 'rational', value: { numerator: 25, denominator: 1 } },
          evidence: spans[1 + i * 2],
        },
      };
      record.impact = {
        state: 'quantity',
        quantity: {
          actor: 'Clinic',
          claim: 'outage impact',
          basis: {
            unit: 'USD',
            period: `P${i}${'x'.repeat(31 - String(i).length)}`,
            population: 'clinic visits',
          },
          state: 'known',
          amount: { kind: 'money', value: { currency: 'USD', minorUnits: 1000000000 } },
          evidence: spans[2 + i * 2],
        },
      };
    }
    return record;
  });
  proposal.startWord = 0;
  proposal.endWord = words.length - 1;
  [0, 3, 13, id === '15' ? 25 : 23, 26].forEach((piece, i) => {
    proposal[beatKeys[i]] = spans[piece].fromWord;
  });
  const replacements = [
    ['Clinic', 'W'.repeat(28)],
    ['outage', 'E'.repeat(28)],
    ['Trial', 'T'.repeat(48)],
    ['clinic visits', `clinic ${'v'.repeat(33)}`],
    ['patient visits', `patient ${'v'.repeat(32)}`],
  ];
  const rename = (s: string) =>
    replacements.reduce((value, [from, to]) => value.replaceAll(from, to), s);
  const renamedText = rename(text);
  const renameValue = (v: unknown): unknown =>
    typeof v === 'string'
      ? rename(v)
      : Array.isArray(v)
        ? v.map(renameValue)
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).map(([k, entry]) => [k, renameValue(entry)]))
          : v;
  return parse({
    ...original,
    proposal: renameValue(proposal) as Rec,
    words: conceptFixtureWords(renamedText, 12),
    sourceText: renamedText,
    window: { startWord: 0, endWord: words.length - 1, startTime: 0, endTime: 12 },
  });
}
export function acceptedCalibrationStates(
  largeDenominator = false,
): ExpansionRiskCalibrationScene[] {
  const original = packet.stories[1];
  return ['unknown', 'missing', 'disputed', 'conditional', 'simulated', 'illustrative'].map(
    (state) => {
      const raw = structuredClone(original.proposal);
      const clauses = beatKeys.map((key, i) =>
        original.words
          .slice(Number(raw[key]), i === 4 ? original.words.length : Number(raw[beatKeys[i + 1]]))
          .map((w) => w.text)
          .join(' '),
      );
      const record = (raw.records as Rec[])[0];
      const observed = ['unknown', 'missing', 'disputed'].includes(state);
      const q = (observed ? record.observation : record.prediction) as Rec;
      q.state = state;
      if (observed) {
        clauses[2] = `Clinic Trial observation is ${state === 'disputed' ? 'disputed between 70.00 and 75.00' : state} count during July among patient visits with denominator 100.`;
        clauses[3] = `Clinic Trial observation remains ${state} and its prediction is not compared.`;
        delete q.amount;
        q.qualifier = state;
        if (state === 'disputed')
          q.alternatives = [70, 75].map((numerator) => ({
            kind: 'rational',
            value: { numerator, denominator: 1 },
          }));
      } else {
        clauses[1] =
          state === 'conditional'
            ? `If audit approval is granted, ${clauses[1]}`
            : `In this ${state === 'simulated' ? 'simulation' : 'teaching example'}, ${clauses[1]}`;
        clauses[3] = `Clinic Trial prediction remains ${state} and its observation is not compared.`;
        record.deriveRatios = false;
        if (state === 'conditional') q.condition = raw.condition = 'If audit approval is granted';
        else {
          q.qualifier = state === 'simulated' ? 'simulation' : 'teaching example';
          raw.evidence = 'illustrative';
        }
      }
      if (largeDenominator) {
        record.deriveRatios = false;
        for (const key of ['prediction', 'observation']) {
          const quantity = record[key] as Rec;
          (quantity.basis as Rec).denominator = { numerator: 1000000000, denominator: 999999999 };
          const amounts =
            quantity.state === 'disputed'
              ? (quantity.alternatives as Rec[])
              : quantity.amount
                ? [quantity.amount as Rec]
                : [];
          for (const amount of amounts) (amount.value as Rec).denominator = 100;
        }
        for (let i = 0; i < clauses.length; i++)
          clauses[i] = clauses[i]
            .replaceAll('80.00', '0.80')
            .replaceAll('75.00', '0.75')
            .replaceAll('70.00', '0.70')
            .replaceAll('denominator 100.', 'denominator 1000000000/999999999.');
      }
      record.comparison = { ...(record.comparison as Rec), state: 'uncompared' };
      delete (record.comparison as Rec).relation;
      let cursor = 0;
      const spans = clauses.map((c) => {
        const fromWord = cursor;
        cursor += c.split(/\s+/).length;
        return { fromWord, toWord: cursor - 1 };
      });
      const rebase = (v: unknown): unknown => {
        if (Array.isArray(v)) return v.map(rebase);
        if (!v || typeof v !== 'object') return v;
        const r = v as Rec;
        if ('fromWord' in r) {
          const i = beatKeys.findIndex((key) => original.proposal[key] === r.fromWord);
          if (i < 0) throw new Error('Unexpected span');
          return spans[i];
        }
        return Object.fromEntries(Object.entries(r).map(([k, entry]) => [k, rebase(entry)]));
      };
      const proposal = rebase(raw) as Rec;
      const text = clauses.join(' ');
      const words = conceptFixtureWords(text, 10);
      beatKeys.forEach((key, i) => {
        proposal[key] = spans[i].fromWord;
      });
      proposal.endWord = words.length - 1;
      return parse({
        ...original,
        proposal,
        words,
        sourceText: text,
        window: { startWord: 0, endWord: words.length - 1, startTime: 0, endTime: 10 },
      });
    },
  );
}
export function riskUnknownScene(): ExpansionRiskCalibrationScene {
  const original = packet.stories[0];
  const proposal = structuredClone(original.proposal);
  const impact = (proposal.records as Rec[])[0].impact as Rec;
  impact.state = 'unknown';
  impact.qualifier = 'unknown';
  delete impact.label;
  const sourceText = original.sourceText.replace('impact is severe', 'impact is unknown');
  return parse({ ...original, proposal, sourceText, words: conceptFixtureWords(sourceText, 10) });
}
export function acceptedRateScenes(): ExpansionRiskCalibrationScene[] {
  const original = packet.stories[1];
  return (['percent', 'ratio'] as const).map((unit) => {
    const proposal = structuredClone(original.proposal);
    const record = (proposal.records as Rec[])[0];
    record.deriveRatios = false;
    for (const key of ['prediction', 'observation'])
      ((record[key] as Rec).basis as Rec).unit = unit;
    let sourceText = original.sourceText.replaceAll(' count ', ` ${unit} `);
    if (unit === 'ratio') {
      sourceText = sourceText.replace('80.00', '0.80').replace('75.00', '0.75');
      ((record.prediction as Rec).amount as Rec).value = { numerator: 4, denominator: 5 };
      ((record.observation as Rec).amount as Rec).value = { numerator: 3, denominator: 4 };
    }
    return parse({ ...original, proposal, sourceText, words: conceptFixtureWords(sourceText, 10) });
  });
}
export function largeCountCalibration(): ExpansionRiskCalibrationScene {
  const original = packet.stories[1];
  const proposal = structuredClone(original.proposal);
  const record = (proposal.records as Rec[])[0];
  record.deriveRatios = false;
  for (const key of ['prediction', 'observation']) {
    const q = record[key] as Rec;
    (q.basis as Rec).denominator = { numerator: 1000000000, denominator: 999999999 };
    (q.amount as Rec).value =
      key === 'prediction' ? { numerator: 4, denominator: 5 } : { numerator: 3, denominator: 4 };
  }
  const sourceText = original.sourceText
    .replace('80.00', '0.80')
    .replace('75.00', '0.75')
    .replaceAll('denominator 100.', 'denominator 1000000000/999999999.');
  return parse({ ...original, proposal, sourceText, words: conceptFixtureWords(sourceText, 10) });
}
export function riskCalibrationCases(): ExpansionRiskCalibrationScene[] {
  return [
    ...riskCalibrationTestScenes,
    riskUnknownScene(),
    maximumRiskCalibration('15'),
    maximumRiskCalibration('15', true),
    maximumRiskCalibration('16'),
    ...acceptedCalibrationStates(),
    ...acceptedRateScenes(),
    largeCountCalibration(),
    ...acceptedCalibrationStates(true).filter(
      (scene) => scene.storyId === '16' && scene.records[0].observation.state === 'disputed',
    ),
  ];
}

describe('risk/calibration pure source lenses', () => {
  it('accepts canonical and maximum records with long periods through actual contracts', () => {
    expect(maximumRiskCalibration('15').records).toHaveLength(12);
    expect(maximumRiskCalibration('16').records).toHaveLength(12);
    expect(largeCountCalibration()).toHaveProperty('records.0.prediction.basis.denominator', {
      numerator: 1000000000,
      denominator: 999999999,
    });
  });
  it('retains every source character across bounded pages without altering claims', () => {
    for (const scene of riskCalibrationCases()) {
      const pages = riskCalibrationPages(scene);
      for (let record = 0; record < scene.records.length; record++)
        expect(
          pages
            .filter((p) => p.record === record)
            .flatMap((p) => p.lines)
            .join(''),
        ).toBe(riskCalibrationFields(scene, record).join(''));
      expect(
        pages.every(
          (p) => p.lines.length <= 13 && p.lines.every((l) => Array.from(l).length <= 20),
        ),
      ).toBe(true);
    }
  });
  it('is finite, bounded and equal across every repeated/shuffled frame, with five beats and final hold', () => {
    for (const scene of riskCalibrationCases()) {
      const before = JSON.stringify(scene);
      const frames = Array.from({ length: 361 }, (_, i) => i / 30);
      const expected = frames.map((t) => riskCalibrationPose(scene, t));
      for (let i = 360; i >= 0; i--) {
        const pose = riskCalibrationPose(scene, frames[i]);
        expect(pose).toEqual(expected[i]);
        for (const key of ['reveal', 'action', 'response', 'check', 'resolve'] as const) {
          expect(pose[key]).toBeGreaterThanOrEqual(0);
          expect(pose[key]).toBeLessThanOrEqual(1);
        }
      }
      for (const i of frames.map((_, i) => (i * 37) % 361))
        expect(riskCalibrationPose(scene, frames[i])).toEqual(expected[i]);
      for (const t of [NaN, Infinity, -Infinity])
        expect(riskCalibrationPose(scene, t).page).toBe(0);
      expect(riskCalibrationPose(scene, scene.resolveAt + 0.8).resolve).toBe(1);
      expect(riskCalibrationPose(scene, scene.resolveAt + 0.8).page).toBe(expected.at(-1)?.page);
      expect(JSON.stringify(scene)).toBe(before);
    }
  });
  it('projects exact independent numeric axes and never substitutes zero for missing data', () => {
    const scene = maximumRiskCalibration('15', true);
    if (scene.storyId !== '15') throw new Error('Wrong route');
    const r = scene.records[0];
    if (r.likelihood.state !== 'quantity' || r.impact.state !== 'quantity')
      throw new Error('Numeric risk required');
    expect(riskQuantityPositions(r.likelihood.quantity)).toEqual([0.25]);
    expect(riskQuantityPositions(r.impact.quantity)).toEqual([1]);
    expect(r.likelihood.quantity).toHaveProperty('amount.notation', '25.00');
    expect(r.impact.quantity).toHaveProperty('amount.notation', '10000000.00');
    expect(
      riskQuantityPositions({ ...r.likelihood.quantity, state: 'unknown', qualifier: 'unknown' }),
    ).toEqual([]);
  });
});
