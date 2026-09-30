import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { HERO_PROP_DEFS, LightbulbRig, type LightbulbRigProps } from './HeroProps';
import { HERO_CATALOG } from './hero-catalog';
import { MEDIA_PROPS } from './hero-props/media';
import {
  sampleCameraPose,
  sampleClapperboardPose,
  sampleMicrophonePose,
} from './hero-props/media-poses';
import { TOOLS_PROPS } from './hero-props/tools';
import {
  sampleMetronomePose,
  sampleWateringCanPose,
  sampleWrenchPose,
} from './hero-props/tools-poses';
import { hash01 } from './motion';
import { ramp } from './stage';
import { HERO_PROPS } from './types';

const clock = vi.hoisted(() => ({ t: 0 }));
vi.mock('./stage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./stage')>();
  return { ...actual, useSceneTime: () => ({ t: clock.t, frame: clock.t * 30, fps: 30 }) };
});

describe('complete hero registry', () => {
  it('registers every prop exactly once in the renderer and planner', () => {
    expect(new Set(HERO_PROPS).size).toBe(HERO_PROPS.length);
    expect(Object.keys(HERO_PROP_DEFS).sort()).toEqual([...HERO_PROPS].sort());
    expect(Object.keys(HERO_CATALOG).sort()).toEqual([...HERO_PROPS].sort());
  });

  it.each(HERO_PROPS)('%s has a model, deliberate framing and truthful action metadata', (id) => {
    const def = HERO_PROP_DEFS[id];
    const catalog = HERO_CATALOG[id];
    expect(typeof def.Model).toBe('function');
    expect(Number.isFinite(def.yaw)).toBe(true);
    expect(def.framing.scale).toBeGreaterThan(0);
    expect(Number.isFinite(def.framing.y)).toBe(true);
    expect(catalog.hint.length).toBeGreaterThan(4);
    expect(Number.isFinite(catalog.impactSec)).toBe(true);
    expect(catalog.impactSec).toBeGreaterThanOrEqual(0);
    expect(catalog.impactSec).toBeLessThan(3);
    expect(catalog.downImpactSec === undefined).toBe(catalog.downHint === undefined);
  });

  it('wires all six remaining models to their family definitions, not placeholders', () => {
    for (const [id, definition] of Object.entries({ ...MEDIA_PROPS, ...TOOLS_PROPS })) {
      expect(HERO_PROP_DEFS[id as keyof typeof HERO_PROP_DEFS]).toBe(definition);
    }
  });
});

const REMAINING_POSES = {
  microphone: sampleMicrophonePose,
  camera: sampleCameraPose,
  clapperboard: sampleClapperboardPose,
  metronome: sampleMetronomePose,
  'watering-can': sampleWateringCanPose,
  wrench: sampleWrenchPose,
};
type RemainingProp = keyof typeof REMAINING_POSES;
type PropFixture = {
  name: string;
  covers: { category: string; id: string }[];
  scene: { kind: string; prop: RemainingProp; at: number; tone?: 'down' };
  durationSec: number;
  samples: { name: string; frame: number }[];
};
const fixtures = ['props-media.json', 'props-tools.json'].flatMap(
  (file) =>
    JSON.parse(
      readFileSync(resolve('scripts/explainer-stills/fixtures', file), 'utf8'),
    ) as PropFixture[],
);

describe('remaining prop visual fixtures', () => {
  it('covers all six real silhouettes and only meaningful reverse actions', () => {
    expect([...new Set(fixtures.map((f) => f.scene.prop))].sort()).toEqual(
      Object.keys(REMAINING_POSES).sort(),
    );
    expect(
      fixtures
        .filter((f) => f.scene.tone === 'down')
        .map((f) => f.scene.prop)
        .sort(),
    ).toEqual(['microphone', 'wrench']);
  });

  it.each(fixtures)('$name includes distinct setup/action and a truly settled pose', (fixture) => {
    expect(fixture.scene.kind).toBe('hero');
    expect(fixture.covers).toContainEqual({ category: 'prop', id: fixture.scene.prop });
    const names = fixture.samples.map((sample) => sample.name);
    expect(names).toEqual(expect.arrayContaining(['setup', 'action', 'settled']));
    expect(new Set(names).size).toBe(names.length);
    for (const { frame } of fixture.samples) {
      expect(Number.isInteger(frame)).toBe(true);
      expect(frame).toBeGreaterThanOrEqual(0);
      expect(frame).toBeLessThan(fixture.durationSec * 30);
    }
    const poseAt = (name: string, extraSeconds = 0) => {
      const frame = fixture.samples.find((sample) => sample.name === name)?.frame ?? -1;
      return REMAINING_POSES[fixture.scene.prop](
        frame / 30 - fixture.scene.at + extraSeconds,
        fixture.scene.tone === 'down',
      );
    };
    expect(poseAt('action')).not.toEqual(poseAt('setup'));
    expect(poseAt('settled')).toEqual(poseAt('settled', 1));
    if (fixture.scene.tone === 'down')
      expect(HERO_CATALOG[fixture.scene.prop].downHint).toBeTruthy();
  });
});

describe('lightbulb standalone extraction regression', () => {
  it.each([
    0, 0.4, 2,
  ])('preserves the original mesh rig and exact glow/flicker envelope at=%s', (at) => {
    for (const delta of [-1, 0, 0.25, 0.3, 0.38, 0.38001, 0.4, 0.44999, 0.45, 0.6, 1, 3]) {
      clock.t = at + delta;
      const bulb = HERO_PROP_DEFS.lightbulb.Model({ at }) as ReactElement<LightbulbRigProps>;
      const breath =
        0.5 + 0.5 * Math.sin((clock.t * Math.PI * 2) / 2.6 + hash01('bhero-bulb') * Math.PI * 2);
      const originalOn =
        ramp(clock.t, at + 0.25, 0.35) * (clock.t > at + 0.38 && clock.t < at + 0.45 ? 0.55 : 1);
      expect(bulb.type).toBe(LightbulbRig);
      expect(bulb.props.glow).toBe(originalOn * (0.55 + breath * 0.45));
    }
  });
});
