import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RETRIEVAL_GROUNDING_GEOMETRY as G, retrievalGroundingPose } from './retrieval-grounding';
import type { RetrievalGroundingScene } from './types';

const fixtures: { name: string; scene: RetrievalGroundingScene; durationSec: number }[] =
  JSON.parse(
    readFileSync(
      resolve('scripts/explainer-stills/fixtures/technology-retrieval-grounding.json'),
      'utf8',
    ),
  );

function finite(value: unknown): void {
  if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
  else if (Array.isArray(value)) value.forEach(finite);
  else if (value && typeof value === 'object') Object.values(value).forEach(finite);
}

describe.each(fixtures)('$name pure pose', ({ scene, durationSec }) => {
  it('is finite, bounded and identity-preserving on every 30fps frame', () => {
    const original = JSON.stringify(scene);
    for (let frame = 0; frame <= Math.ceil(durationSec * 30); frame++) {
      const pose = retrievalGroundingPose(scene, frame / 30);
      finite(pose);
      expect(pose.question.x).toBeGreaterThanOrEqual(G.questionFrom.x);
      expect(pose.question.x).toBeLessThanOrEqual(G.questionTo.x);
      expect(pose.question.y).toBeGreaterThanOrEqual(G.questionFrom.y);
      expect(pose.question.y).toBeLessThanOrEqual(G.questionTo.y);
      for (const value of [
        pose.question.opacity,
        pose.searchProgress,
        pose.referenceEmphasis,
        pose.outcomeOpacity,
      ]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      expect(Math.abs(pose.workspaceOffset)).toBeLessThanOrEqual(3);
      expect(pose.slips.length).toBe(scene.sources.length);
      expect(
        pose.slips.filter((slip) => slip.progress > 0 && slip.progress < 1).length,
      ).toBeLessThanOrEqual(1);
      for (const [index, slip] of pose.slips.entries()) {
        expect(slip.id).toBe(
          `${index + 1}:${scene.sources[index].label}:${scene.sources[index].excerpt}`,
        );
        expect(slip.label).toBe(scene.sources[index].label);
        expect(slip.excerpt).toBe(scene.sources[index].excerpt);
        expect(slip.reference).toBe(index + 1);
        expect(slip.x).toBeGreaterThanOrEqual(G.libraryX);
        expect(slip.x).toBeLessThanOrEqual(G.answerX);
        expect(slip.x + G.slipWidth).toBeLessThanOrEqual(1016);
        expect(slip.y).toBe(G.rows[index]);
        expect(slip.y + G.slipHeight + Math.abs(pose.workspaceOffset)).toBeLessThanOrEqual(790);
        expect(slip.progress).toBeGreaterThanOrEqual(0);
        expect(slip.progress).toBeLessThanOrEqual(1);
        if (slip.progress > 0) expect(slip.selected).toBe(true);
        if (slip.inAnswer) expect(slip.progress).toBe(1);
      }
      if (frame / 30 < scene.resolveAt) expect(pose.outcomeOpacity).toBe(0);
    }
    expect(JSON.stringify(scene)).toBe(original);
  });

  it('is deterministic under repeated, reversed and shuffled seeks, including all boundaries', () => {
    const boundaries = [
      scene.setupAt,
      scene.setupAt + 0.25,
      scene.actionAt,
      scene.responseAt,
      (scene.responseAt + scene.checkAt) / 2,
      scene.checkAt,
      scene.checkAt + 0.3,
      scene.checkAt + 0.5,
      scene.resolveAt,
      durationSec,
    ];
    const times = [
      ...Array.from({ length: Math.ceil(durationSec * 30) + 1 }, (_, frame) => frame / 30),
      ...boundaries.flatMap((time) => [
        time - 1 / 30,
        time - 1e-7,
        time,
        time + 1e-7,
        time + 1 / 30,
      ]),
      -10,
      1000,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ];
    const poses = times.map((time) => retrievalGroundingPose(scene, time));
    const indices = times.map((_, index) => index);
    // Deterministic Fisher-Yates, no global random or mutable sampler state.
    for (let index = indices.length - 1; index > 0; index--) {
      const swap = (index * 73 + 19) % (index + 1);
      [indices[index], indices[swap]] = [indices[swap], indices[index]];
    }
    for (const index of [...indices, ...[...indices].reverse()]) {
      const sampled = retrievalGroundingPose(scene, times[index]);
      finite(sampled);
      expect(sampled).toEqual(poses[index]);
    }
  });

  it('contacts before response, shows only selected evidence, and holds statically from resolveAt', () => {
    const queryContact = retrievalGroundingPose(scene, scene.actionAt);
    expect(queryContact.question).toMatchObject(G.questionTo);
    expect(queryContact.searchProgress).toBe(0);
    expect(retrievalGroundingPose(scene, scene.responseAt).searchProgress).toBe(1);
    expect(retrievalGroundingPose(scene, scene.checkAt - 1e-7).workspaceOffset).toBe(0);
    const before = retrievalGroundingPose(scene, scene.responseAt - 1e-7);
    expect(before.noMatch).toBe(false);
    for (const slip of before.slips)
      expect(slip).toMatchObject({ x: G.libraryX, selected: false, inAnswer: false });
    const final = retrievalGroundingPose(scene, scene.resolveAt);
    expect(final.outcomeOpacity).toBe(1);
    expect(final.workspaceOffset).toBe(0);
    expect(durationSec - scene.resolveAt).toBeGreaterThanOrEqual(0.8);
    for (const t of [
      scene.resolveAt + 0.01,
      scene.resolveAt + 0.25,
      scene.resolveAt + 0.8,
      durationSec,
      999,
    ]) {
      expect(retrievalGroundingPose(scene, t)).toEqual(final);
    }
    if (scene.preset === 'no-evidence') {
      expect(final.slips).toEqual([]);
      expect(final.noMatch).toBe(true);
      expect(final.referenceEmphasis).toBe(0);
      expect(retrievalGroundingPose(scene, scene.responseAt).noMatch).toBe(true);
    } else {
      expect(final.noMatch).toBe(false);
      expect(final.referenceEmphasis).toBe(1);
      for (const slip of final.slips)
        expect(slip).toMatchObject({ x: G.answerX, inAnswer: true, selected: true });
      for (const slip of retrievalGroundingPose(scene, scene.checkAt).slips)
        expect(slip.inAnswer).toBe(true);
    }
  });

  it('rebases by translating time, not by changing the causal sequence', () => {
    const shifted = {
      ...scene,
      setupAt: scene.setupAt + 17,
      actionAt: scene.actionAt + 17,
      responseAt: scene.responseAt + 17,
      checkAt: scene.checkAt + 17,
      resolveAt: scene.resolveAt + 17,
    };
    expect(retrievalGroundingPose(shifted, shifted.resolveAt)).toEqual(
      retrievalGroundingPose(scene, scene.resolveAt),
    );
  });
});

it('lands the first source before the second moves, retaining both distinct references', () => {
  const scene = fixtures[2].scene;
  const join = (scene.responseAt + scene.checkAt) / 2;
  const pose = retrievalGroundingPose(scene, join);
  expect(pose.slips[0]).toMatchObject({ inAnswer: true, progress: 1, reference: 1, x: G.answerX });
  expect(pose.slips[1]).toMatchObject({
    inAnswer: false,
    progress: 0,
    reference: 2,
    x: G.libraryX,
  });
  expect(pose.slips[0].id).not.toBe(pose.slips[1].id);
});
