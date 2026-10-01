import { createHash } from 'node:crypto';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import conditionalFixtures from '../../../../../../scripts/explainer-stills/fixtures/software-conditional-regressions.json';
import fixtures from '../../../../../../scripts/explainer-stills/fixtures/technology-software-release.json';
import { makeParseContext } from '../../../../ai/explainer/kind-spec';
import { SOFTWARE_RELEASE_SPEC } from '../../../../ai/explainer/kinds-software-release';
import { Clay } from '../hero-kit';
import { SignalWire } from '../mechanisms/composed-rigs';
import { MechanismStage } from '../mechanisms/MechanismStage';
import { SoftwareReleaseScene as SoftwareReleaseView } from '../SoftwareReleaseScene';
import { STAGE, useSceneTime } from '../stage';
import type { CameraSpec } from '../three-helpers';
import { CheckSeal, ClayPart, StopSeal } from './clay';
import { Outcome, TechText } from './primitives';
import { SOFTWARE_RELEASE_WORKBENCH as bench, softwareReleasePose } from './software-release';
import type { SoftwareReleaseScene } from './types';

const scenes: SoftwareReleaseScene[] = fixtures.map((fixture) => {
  const ctx = makeParseContext(fixture.words, {
    startWord: 0,
    endWord: fixture.words.length - 1,
    startTime: 0,
    endTime: fixture.durationSec,
  });
  const scene = SOFTWARE_RELEASE_SPEC.parse(fixture.raw, ctx);
  if (!scene) throw new Error(`Rejected fixture ${fixture.name}: ${ctx.issues.join('; ')}`);
  return scene;
});

function finiteBounded(value: unknown): void {
  if (typeof value === 'number') {
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(-8);
    expect(value).toBeLessThanOrEqual(1080);
  } else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) finiteBounded(child);
  }
}

describe('softwareReleasePose', () => {
  it.each(
    scenes,
  )('$preset is bounded, causal and deterministic at every frame and boundary', (scene) => {
    const times = Array.from({ length: 301 }, (_, frame) => frame / 30);
    const boundaries = [
      scene.setupAt,
      scene.actionAt,
      scene.responseAt,
      scene.responseAt + 0.2,
      scene.responseAt + 0.3,
      scene.checkAt,
      scene.checkAt + 0.3,
      scene.checkAt + 0.5,
      scene.resolveAt - 0.3,
      scene.resolveAt - 0.2,
      scene.resolveAt,
    ];
    times.push(
      ...boundaries.flatMap((at) => [at - 0.000001, at, at + 0.000001]),
      -100,
      100,
      NaN,
      Infinity,
      -Infinity,
    );
    const poses = times.map((time) => softwareReleasePose(scene, time));
    for (const [index, time] of times.entries()) {
      const pose = poses[index];
      finiteBounded(pose);
      expect(pose.outcomeOpacity).toBeGreaterThanOrEqual(0);
      expect(pose.outcomeOpacity).toBeLessThanOrEqual(1);
      expect(pose.joinOpen).toBeGreaterThanOrEqual(0);
      expect(pose.joinOpen).toBeLessThanOrEqual(1);
      for (const gate of pose.checks) {
        expect(gate.open).toBeGreaterThanOrEqual(0);
        expect(gate.open).toBeLessThanOrEqual(1);
      }
      if (time < scene.actionAt) {
        expect(pose.checks.every((check) => check.status === 'waiting')).toBe(true);
        expect(pose.dockRecoil).toBe(0);
      }
      if (pose.released) {
        expect(
          pose.checks.every((check) => check.status === 'passed' && check.receiptArrived),
        ).toBe(true);
        expect(pose.change).toEqual(bench.release);
        expect(pose.joinReady).toBe(true);
      }
      if (pose.outcomeOpacity > 0) expect(pose.released || pose.restored).toBe(true);
      if (scene.preset === 'regression-rollback') {
        expect(pose.released).toBe(false);
        expect(pose.joinOpen).toBe(0);
        expect(pose.checks.every((check) => check.open === 0 && !check.receiptVisible)).toBe(true);
      }
      expect(softwareReleasePose(scene, time)).toEqual(pose);
    }
    // Deliberately non-monotonic seeks, not a replay from an integrated previous state.
    const shuffled = times
      .map((_, index) => index)
      .sort((a, b) => ((a * 97) % 347) - ((b * 97) % 347));
    for (const index of shuffled)
      expect(softwareReleasePose(scene, times[index])).toEqual(poses[index]);
  });

  it.each(scenes)('$preset contacts the test dock before its receiver reacts', (scene) => {
    const at = softwareReleasePose(scene, scene.actionAt);
    expect(at.change).toEqual(bench.testDock);
    expect(at.dockRecoil).toBe(0);
    expect(at.checks.every((check) => check.status === 'active')).toBe(true);
    expect(softwareReleasePose(scene, scene.actionAt + 0.1).dockRecoil).not.toBe(0);
    expect(
      softwareReleasePose(scene, scene.actionAt - 0.000001).checks.every(
        (check) => check.status === 'waiting',
      ),
    ).toBe(true);
  });

  it.each(scenes)('$preset has an exact static final hold of at least 0.8 seconds', (scene) => {
    const final = softwareReleasePose(scene, scene.resolveAt);
    expect(final.outcomeOpacity).toBe(1);
    for (let frame = 0; frame <= 60; frame++) {
      expect(softwareReleasePose(scene, scene.resolveAt + frame / 30)).toEqual(final);
    }
    expect(softwareReleasePose(scene, 10000)).toEqual(final);
  });

  it('keeps the change held on one parallel pass; only both seated receipts open the join', () => {
    const scene = scenes.find((item) => item.preset === 'parallel-release');
    if (!scene) throw new Error('Missing parallel fixture');
    const one = softwareReleasePose(scene, scene.responseAt + 0.4);
    expect(one.checks.map((check) => check.status)).toEqual(['passed', 'active']);
    expect(one.checks.map((check) => check.receiptArrived)).toEqual([true, false]);
    expect(one.joinReady).toBe(false);
    expect(one.joinOpen).toBe(0);
    expect(one.change).toEqual(bench.testDock);
    expect(one.released).toBe(false);
    const bothPassing = softwareReleasePose(scene, scene.checkAt);
    expect(bothPassing.checks.map((check) => check.status)).toEqual(['passed', 'passed']);
    expect(bothPassing.joinReady).toBe(false);
    const contact = scene.checkAt + 0.3;
    expect(softwareReleasePose(scene, contact - 0.000001).joinReady).toBe(false);
    const joined = softwareReleasePose(scene, contact);
    expect(joined.checks.every((check) => check.receiptArrived)).toBe(true);
    expect(joined.joinReady).toBe(true);
    expect(joined.joinOpen).toBe(0);
    expect(joined.joinRecoil).toBe(0);
    expect(softwareReleasePose(scene, contact + 0.1).joinOpen).toBeGreaterThan(0);
    expect(softwareReleasePose(scene, contact + 0.1).joinRecoil).not.toBe(0);
  });

  it('fails closed and visibly restores the prior identity, never releasing the failed change', () => {
    const scene = scenes.find((item) => item.preset === 'regression-rollback');
    if (!scene) throw new Error('Missing rollback fixture');
    expect(scene.previousVersion).toBe('v1');
    expect(softwareReleasePose(scene, scene.setupAt).previousVersion).toEqual(bench.prior);
    const failed = softwareReleasePose(scene, scene.responseAt);
    expect(failed.blocked).toBe(true);
    expect(failed.changeStatus).toBe('blocked');
    expect(failed.checks[0].status).toBe('blocked');
    expect(failed.restored).toBe(false);
    const final = softwareReleasePose(scene, scene.resolveAt);
    expect(final.change).toEqual(bench.testDock);
    expect(final.previousVersion).toEqual(bench.release);
    expect(final.restored).toBe(true);
    expect(final.released).toBe(false);
  });

  it.each(scenes)('$preset also settles within the minimum legal beat gaps', (scene) => {
    const compact = {
      ...scene,
      setupAt: 0.3,
      actionAt: 0.9,
      responseAt: 1.9,
      checkAt: 2.9,
      resolveAt: 3.9,
    };
    const final = softwareReleasePose(compact, 3.9);
    for (let frame = 0; frame <= 24; frame++)
      expect(softwareReleasePose(compact, 3.9 + frame / 30)).toEqual(final);
  });
});

vi.mock('../stage', async (original) => {
  const actual = await original<typeof import('../stage')>();
  return { ...actual, useStage: () => actual.STAGE, useSceneTime: vi.fn() };
});

type ElementProps = { children?: ReactNode; [key: string]: unknown };

// Inspect the real scene's JSX decisions, without mounting React, Canvas or a native render.
function softwareElements(scene: SoftwareReleaseScene, t: number) {
  vi.mocked(useSceneTime).mockReturnValue({ t, frame: t * 30, fps: 30 });
  const elements: ReactElement<ElementProps>[] = [];
  const text: string[] = [];
  const leaves = new Set<unknown>([
    Clay,
    ClayPart,
    CheckSeal,
    StopSeal,
    SignalWire,
    TechText,
    Outcome,
  ]);
  function visit(node: ReactNode): void {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node === 'string' || typeof node === 'number') {
      text.push(String(node));
      return;
    }
    if (!isValidElement<ElementProps>(node)) return;
    if (node.type === MechanismStage) {
      elements.push(node);
      visit(
        (node.props.overlay as (camera: CameraSpec) => ReactNode)(node.props.camera as CameraSpec),
      );
    } else if (typeof node.type === 'function' && !leaves.has(node.type)) {
      visit((node.type as (props: ElementProps) => ReactNode)(node.props));
      return;
    } else {
      elements.push(node);
    }
    visit(node.props.children);
  }
  visit(SoftwareReleaseView({ scene }));
  return { elements, text };
}

function sampleTimes(scene: SoftwareReleaseScene, durationSec: number): number[] {
  const boundaries = [
    scene.setupAt,
    scene.actionAt,
    scene.responseAt,
    scene.responseAt + 0.2,
    scene.responseAt + 0.3,
    scene.checkAt,
    scene.checkAt + 0.2,
    scene.checkAt + 0.3,
    scene.checkAt + 0.5,
    scene.resolveAt - 0.3,
    scene.resolveAt - 0.2,
    scene.resolveAt,
  ];
  return [
    ...Array.from({ length: durationSec * 30 + 1 }, (_, frame) => frame / 30),
    ...boundaries.flatMap((at) => [at - 0.000001, at, at + 0.000001]),
    -100,
    10000,
    NaN,
    Infinity,
    -Infinity,
  ];
}

const conditionalScenes = conditionalFixtures.map((fixture) => {
  const ctx = makeParseContext(fixture.words, {
    startWord: fixture.raw.startWord,
    endWord: fixture.raw.endWord,
    startTime: 0,
    endTime: fixture.durationSec,
  });
  const scene = SOFTWARE_RELEASE_SPEC.parse(fixture.raw, ctx);
  if (!scene) throw new Error(`Rejected fixture ${fixture.name}: ${ctx.issues.join('; ')}`);
  return { ...fixture, scene };
});

describe('conditional software explanations', () => {
  it.each(
    conditionalScenes,
  )('$name preserves the complete source condition and five indexed beats', (fixture) => {
    expect(fixture.scene).toEqual(
      conditionalFixtures.find((item) => item.name === fixture.name)?.scene,
    );
    expect(fixture.sourceText).toBe(fixture.words.map((word) => word.text).join(' '));
    expect(fixture.sourceText).toContain(`${fixture.scene.condition},`);
    for (const [word, at] of [
      ['setupWord', 'setupAt'],
      ['actionWord', 'actionAt'],
      ['responseWord', 'responseAt'],
      ['checkWord', 'checkAt'],
      ['resolveWord', 'resolveAt'],
    ] as const) {
      expect(fixture.scene[at]).toBe(fixture.words[fixture.raw[word]].start);
    }
    expect(fixture.durationSec - fixture.scene.resolveAt).toBeGreaterThanOrEqual(0.8);
  });

  it.each(
    conditionalScenes,
  )('$name progresses without asserting pass, failure, join, release or restoration', ({
    scene,
    durationSec,
  }) => {
    const factual = { ...scene, condition: undefined };
    const possibleStatus = (status: string) =>
      status === 'passed' || status === 'blocked' ? 'possible' : status;
    const times = [scene.resolveAt, ...sampleTimes(scene, durationSec)];
    const poses = times.map((t) => softwareReleasePose(scene, t));
    for (const [index, t] of times.entries()) {
      const pose = poses[index];
      const original = softwareReleasePose(factual, t);
      finiteBounded(pose);
      expect(pose).toEqual({
        ...original,
        changeStatus: possibleStatus(original.changeStatus),
        checks: original.checks.map((check) => ({
          ...check,
          status: possibleStatus(check.status),
        })),
        joinReady: false,
        blocked: false,
        released: false,
        restored: false,
      });
    }
    for (const index of times.map((_, i) => i).reverse()) {
      expect(softwareReleasePose(scene, times[index])).toEqual(poses[index]);
    }
    const final = softwareReleasePose(scene, scene.resolveAt);
    expect(final.outcomeOpacity).toBe(1);
    expect(final.changeStatus).toBe('possible');
    for (let frame = 0; frame <= 60; frame++) {
      expect(softwareReleasePose(scene, scene.resolveAt + frame / 30)).toEqual(final);
    }
  });

  it.each(
    conditionalScenes,
  )('$name never uses factual seals, status wording or success/failure materials', ({
    scene,
    durationSec,
  }) => {
    for (const t of [scene.resolveAt, ...sampleTimes(scene, durationSec)]) {
      const { elements, text } = softwareElements(scene, t);
      expect(text).toContain(scene.condition);
      const stage = elements.find((node) => node.type === MechanismStage);
      expect(stage?.props.title).toBe(`Possible: ${scene.label}`);
      for (const claim of [
        'Passed',
        'Failed',
        'Blocked',
        'Released',
        'Restored',
        'Live',
        'Both passed',
        'Check cleared',
        'Running',
      ]) {
        expect(text).not.toContain(claim);
      }
      expect(elements.filter((node) => node.type === CheckSeal || node.type === StopSeal)).toEqual(
        [],
      );
      expect(
        elements.some(
          (node) => node.props.color === STAGE.positive || node.props.color === STAGE.negative,
        ),
      ).toBe(false);
      const outcome = elements.find((node) => node.type === Outcome);
      expect(outcome?.props.text).toBe(`Possible: ${scene.outcome}`);
      expect(outcome?.props.status).toBe('waiting');
      const receipts = softwareReleasePose(scene, t).checks.filter((check) => check.receiptVisible);
      // Each hypothetical receipt still travels and seats, but carries no verification glyph.
      expect(
        elements.filter((node) => node.type === Clay && node.props.color === STAGE.clay[0]),
      ).toHaveLength(receipts.length);
    }
  });

  it('requires both hypothetical receipts to seat before the parallel path opens, without certifying the join', () => {
    const scene = conditionalScenes.find((item) => item.scene.preset === 'parallel-release')?.scene;
    if (!scene) throw new Error('Missing conditional parallel fixture');
    const one = softwareReleasePose(scene, scene.responseAt + 0.4);
    expect(one.checks.map((check) => check.status)).toEqual(['possible', 'active']);
    expect(one.checks.map((check) => check.receiptArrived)).toEqual([true, false]);
    expect(one.change).toEqual(bench.testDock);
    expect(one.joinOpen).toBe(0);
    const contact = scene.checkAt + 0.3;
    expect(softwareReleasePose(scene, contact - 0.000001).checks[1].receiptArrived).toBe(false);
    const joined = softwareReleasePose(scene, contact);
    expect(joined.checks.every((check) => check.receiptArrived)).toBe(true);
    expect(joined.joinReady).toBe(false);
    expect(joined.joinOpen).toBe(0);
    expect(softwareReleasePose(scene, contact + 0.1).joinOpen).toBeGreaterThan(0);
    expect(softwareElements(scene, contact + 0.1).text).toContain('Possible join');
    expect(softwareReleasePose(scene, scene.resolveAt).change).toEqual(bench.release);
  });

  it('keeps hypothetical rollback closed while returning the prior identity without a failure or restoration claim', () => {
    const scene = conditionalScenes.find(
      (item) => item.scene.preset === 'regression-rollback',
    )?.scene;
    if (!scene) throw new Error('Missing conditional rollback fixture');
    const before = softwareReleasePose(scene, scene.responseAt - 0.000001);
    expect(before.changeStatus).toBe('active');
    const response = softwareReleasePose(scene, scene.responseAt);
    expect(response.changeStatus).toBe('possible');
    expect(response.blocked).toBe(false);
    expect(softwareReleasePose(scene, scene.checkAt + 0.2).previousVersion).toEqual(bench.prior);
    expect(softwareReleasePose(scene, scene.checkAt + 0.3).previousVersion).not.toEqual(
      bench.prior,
    );
    const final = softwareReleasePose(scene, scene.resolveAt);
    expect(final.change).toEqual(bench.testDock);
    expect(final.previousVersion).toEqual(bench.release);
    expect(final.joinOpen).toBe(0);
    expect(final.checks[0].receiptVisible).toBe(false);
    expect(final.restored).toBe(false);
    expect(softwareElements(scene, scene.resolveAt).text).toContain('Possible outcome');
  });
});

it.each(scenes)('$preset unconditional pose and JSX baseline', (scene) => {
  const hash = createHash('sha256');
  for (const t of sampleTimes(scene, 10)) {
    const { elements, text } = softwareElements(scene, t);
    hash.update(
      JSON.stringify({
        pose: softwareReleasePose(scene, t),
        elements: elements.map((node) => ({
          type: typeof node.type === 'function' ? node.type.name : String(node.type),
          props: Object.fromEntries(
            Object.entries(node.props).filter(([key]) => key !== 'children' && key !== 'overlay'),
          ),
        })),
        text,
      }),
    );
  }
  // Captured from the unmodified implementation before the conditional fix.
  const baseline = {
    'fix-pass': 'ada999bf87124639d2d044e4d15b0f822d202560baf1cca22288e555f2dd2a35',
    'regression-rollback': 'acc0280e88488d1ab6c48aae9dc7d25130df8a8f4783aa826f81c3887ce7f066',
    'parallel-release': '2acd93ccc1adf9716c37c5eafb39108bc2ac5bb77e9bc7353a3f5e65f7dcc6a0',
  };
  expect(hash.digest('hex')).toBe(baseline[scene.preset]);
});
