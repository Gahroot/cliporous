import { describe, expect, it } from 'vitest';
import { compare } from '../value-logic';
import {
  informationLossAmount,
  informationLossLenses,
  informationLossPages,
  informationLossPose,
} from './information-loss-poses';
import {
  acceptedInformationLoss,
  informationLossCases,
  informationLossPacket,
  maximumInformationLossFixture,
  parseInformationLoss,
} from './information-loss-test-fixtures';

describe('information loss supplied facts and seekable five beats', () => {
  it('accepts real persisted positives/paraphrases in both modes and preserves immutable proposals', () => {
    for (const fixture of informationLossPacket.stories.flatMap((f) => [
      f,
      ...(f.paraphrases ?? []),
    ])) {
      const before = JSON.stringify(fixture);
      const scene = acceptedInformationLoss(fixture);
      expect(acceptedInformationLoss(fixture, 'hybrid')).toEqual({
        ...scene,
        visualMode: 'hybrid',
      });
      expect(JSON.stringify(fixture)).toBe(before);
    }
  });
  it('accepts all maximum grounded states/quantities/labels at real parser caps', () => {
    for (const id of ['51', '52'] as const)
      for (const state of [
        'known',
        'conditional',
        'simulated',
        'unknown',
        'missing',
        'disputed',
      ] as const)
        for (const cap of ['quantities', 'relations'] as const) {
          const fixture = maximumInformationLossFixture(id, state, cap);
          expect(
            fixture.words.filter(
              (w, i) =>
                !Number.isFinite(w.start) ||
                w.end <= w.start ||
                w.start < 0 ||
                w.end > 12 ||
                (i > 0 && w.start < fixture.words[i - 1].end - 1e-7),
            ),
          ).toEqual([]);
          const parsed = parseInformationLoss(fixture);
          expect(parsed.issues, `${id}/${state}`).toEqual([]);
          expect(parsed.scene, `${id}/${state}`).not.toBeNull();
          if (!parsed.scene) throw new Error('Maximum rejected');
          expect([
            parsed.scene.records.length,
            parsed.scene.quantities.length,
            parsed.scene.relations.length,
          ]).toEqual(cap === 'quantities' ? [3, 8, 6] : [11, 0, 16]);
        }
  });
  for (const [index, scene] of informationLossCases().entries()) {
    it(`source case ${index}: repeats shuffled frames, nonfinite input and source tail without mutation or nonfinite pose components`, () => {
      const snapshot = JSON.stringify(scene),
        visited = new Set<number>();
      const baseline = Array.from({ length: 361 }, (_, frame) =>
        informationLossPose(scene, frame / 30),
      );
      for (let i = 0; i <= 360; i++) {
        const frame = (i * 137) % 361,
          pose = informationLossPose(scene, frame / 30);
        expect(pose).toEqual(baseline[frame]);
        visited.add(pose.page);
        for (const key of ['reveal', 'action', 'response', 'check', 'resolve'] as const) {
          expect(Number.isFinite(pose[key])).toBe(true);
          expect(pose[key]).toBeGreaterThanOrEqual(0);
          expect(pose[key]).toBeLessThanOrEqual(1);
        }
      }
      expect(visited.size).toBe(informationLossPages(scene).length);
      for (const t of [NaN, Infinity, -Infinity])
        expect(informationLossPose(scene, t)).toEqual(informationLossPose(scene, scene.setupAt));
      expect(informationLossPose(scene, 100).page).toBe(baseline[360].pages.length - 1);
      expect(JSON.stringify(scene)).toBe(snapshot);
    });
  }
  it('enumerates every field in full without omitted text, invented recovery or precision', () => {
    for (const scene of informationLossCases()) {
      const pages = informationLossPages(scene);
      for (const lens of informationLossLenses(scene))
        expect(
          pages
            .filter((p) => p.id === lens.id)
            .flatMap((p) => p.lines)
            .join(''),
        ).toBe(lens.fields.join(''));
      expect(pages.flatMap((p) => p.lineIds).length).toBe(
        new Set(pages.flatMap((p) => p.lineIds)).size,
      );
      for (const value of scene.quantities)
        if ('amount' in value.quantity)
          expect(
            pages
              .filter((p) => p.id === value.id)
              .flatMap((p) => p.lines)
              .join(''),
          ).toContain(informationLossAmount(value.quantity.amount));
    }
    expect(
      compare({ numerator: 1, denominator: 1000000000 }, { numerator: 0, denominator: 1 }),
    ).toEqual({ ok: true, value: 1 });
    expect(
      informationLossAmount({ kind: 'rational', value: { numerator: 1, denominator: 1000000000 } }),
    ).toBe('1/1000000000');
  });
});
