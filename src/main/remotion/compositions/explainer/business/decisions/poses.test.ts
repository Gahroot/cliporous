import { describe, expect, it } from 'vitest';
import {
  parseMeasurementFrameScene,
  parseStagedDecisionScene,
  parseUncertaintyAlbumScene,
} from '../../../../../ai/explainer/business-decisions-contract';
import type { Rec } from '../../../../../ai/explainer/kind-spec';
import {
  DECISIONS_ACCEPTED_VARIANTS,
  DECISIONS_SOURCE_FIXTURES,
  decisionsSourceContext,
  decisionsSourceWindow,
} from './fixtures';
import { decisionQuantityRatio, decisionsPose } from './poses';
import { decisionReadingStart } from './presentation';

const fixtures = [...DECISIONS_SOURCE_FIXTURES, ...DECISIONS_ACCEPTED_VARIANTS];
const cases = fixtures.flatMap((fixture) =>
  (fixture.raw.modelSource === null
    ? (['diagram'] as const)
    : (['diagram', 'hybrid'] as const)
  ).map((mode) => ({
    fixture,
    mode,
    name: `${fixture.fixtureId}:${mode}`,
  })),
);
function assertFinite(value: unknown): void {
  if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
  else if (value !== null && typeof value === 'object') Object.values(value).forEach(assertFinite);
}

describe('source-preserving decisions poses (CPU, not native proof)', () => {
  it.each(
    cases,
  )('$name: all source frames/boundaries/reverse/shuffled seeks, immutable and held', ({
    fixture,
    mode,
  }) => {
    const raw: Rec = { ...fixture.raw, visualMode: mode };
    const ctx = decisionsSourceContext(fixture);
    const parser =
      raw.kind === 'staged-decision'
        ? parseStagedDecisionScene
        : raw.kind === 'measurement-frame'
          ? parseMeasurementFrameScene
          : parseUncertaintyAlbumScene;
    const scene = parser(raw, ctx);
    if (!scene) throw new Error(ctx.issues.join('; '));
    const before = structuredClone(scene);
    const rawBefore = structuredClone(raw);
    const end = decisionsSourceWindow(fixture).endTime;
    const beats = [scene.setupAt, scene.actionAt, scene.responseAt, scene.checkAt, scene.resolveAt];
    const times = [
      ...Array.from({ length: Math.ceil(end * 30) + 1 }, (_, index) => index / 30),
      ...beats.flatMap((beat) => [beat - 1 / 3000, beat, beat + 1 / 3000]),
      decisionReadingStart(scene),
      end + 100,
    ];
    const final = decisionsPose(scene, scene.resolveAt * 30, 30);
    const shuffled = times
      .filter((_, index) => index % 3 === 0)
      .concat(times.filter((_, index) => index % 3 !== 0));
    for (const seconds of [...times, ...[...times].reverse(), ...shuffled]) {
      const pose = decisionsPose(scene, seconds * 30, 30);
      assertFinite(pose);
      expect(pose).toEqual(decisionsPose(scene, seconds * 60, 60));
      expect(pose).toEqual(decisionsPose(scene, seconds * 30, 30));
      expect(pose.handshake.accepted).toBe(0);
      expect(pose.clamp.gate).toBe(0);
      expect(pose.contributed).toBe(false);
      expect(pose.deskPending).toBe(false);
      expect(pose.native).toEqual(
        mode === 'diagram'
          ? []
          : (scene.modelSource ?? []).map(({ asset, identityId }) => ({ asset, identityId })),
      );
      if (pose.alternatives.length) {
        expect(new Set(pose.alternatives.map((entry) => entry.area)).size).toBe(1);
        expect(new Set(pose.alternatives.map((entry) => entry.opacity)).size).toBe(1);
        expect(pose.alternatives.map((entry) => entry.id)).toEqual(
          scene.preset === 'alternatives-or-source-distribution'
            ? scene.alternatives.map((entry) => entry.entry.identity.id)
            : [],
        );
      }
      if (seconds >= scene.resolveAt) expect(pose).toEqual(final);
    }
    for (const frame of [Number.NaN, Infinity, -Infinity, -100])
      assertFinite(decisionsPose(scene, frame, 30));
    for (const fps of [0, -30, Infinity, Number.NaN]) assertFinite(decisionsPose(scene, 30, fps));
    expect(Object.isFrozen(final)).toBe(true);
    expect(Object.isFrozen(final.phase)).toBe(true);
    expect(() => Object.assign(final.phase, { setup: 99 })).toThrow(TypeError);
    expect(scene).toEqual(before);
    expect(raw).toEqual(rawBefore);
  });

  it('unknown/pending/negative/conditional quantities are not zero measurements', () => {
    for (const fixture of fixtures.filter((entry) => entry.id === 'OP-76')) {
      const ctx = decisionsSourceContext(fixture);
      const scene = parseMeasurementFrameScene(fixture.raw, ctx);
      if (!scene || scene.preset !== 'planned-observed') throw new Error(ctx.issues.join('; '));
      expect(decisionQuantityRatio(scene.planned)).toBeNull();
      expect(decisionQuantityRatio(scene.observed)).toBe(
        scene.observed.state === 'observed' ? 0.6 : null,
      );
      expect(decisionQuantityRatio({ ...scene.observed, state: 'observed', value: 0 })).toBe(0);
      expect(decisionQuantityRatio({ ...scene.observed, state: 'observed', value: 11 })).toBeNull();
      expect(decisionQuantityRatio({ ...scene.observed, value: Infinity })).toBeNull();
      expect(
        decisionQuantityRatio({
          ...scene.observed,
          basis: { ...scene.observed.basis, denominator: null },
        }),
      ).toBeNull();
    }
  });
});
