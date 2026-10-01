import { describe, expect, it } from 'vitest';
import { fixtureScene, inferenceFixtures } from './fixtures.test-data';
import {
  edgeCloudPose,
  expertSelectionPose,
  INFERENCE_BUDGETS,
  inferencePose,
  TOKEN_SOCKET,
  tokenChoicePose,
} from './poses';
import type { InferenceScene } from './types';

function numbers(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(numbers);
  if (value && typeof value === 'object') return Object.values(value).flatMap(numbers);
  return [];
}
function freeze(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
}
function shifted(scene: InferenceScene, delta: number): InferenceScene {
  return {
    ...scene,
    setupAt: scene.setupAt + delta,
    actionAt: scene.actionAt + delta,
    responseAt: scene.responseAt + delta,
    checkAt: scene.checkAt + delta,
    resolveAt: scene.resolveAt + delta,
  };
}

describe('inference deterministic semantic poses', () => {
  for (const fixture of inferenceFixtures) {
    const scene = fixtureScene(fixture);
    it(`${fixture.name}: repeated and out-of-order seeks have no history or mutation`, () => {
      const original = structuredClone(scene);
      freeze(scene);
      const seeks = [
        scene.resolveAt,
        scene.actionAt + 0.2,
        scene.checkAt,
        0,
        scene.responseAt + 0.4,
      ];
      const expected = seeks.map((t) => inferencePose(scene, t));
      for (const index of [4, 1, 3, 0, 2, 4, 0, 1])
        expect(inferencePose(scene, seeks[index])).toEqual(expected[index]);
      expect(scene).toEqual(original);
    });
    it(`${fixture.name}: setup and final holds are exact, including nonfinite seeks`, () => {
      expect(inferencePose(scene, Number.NaN)).toEqual(inferencePose(scene, scene.setupAt));
      expect(inferencePose(scene, -Infinity)).toEqual(inferencePose(scene, scene.setupAt));
      expect(inferencePose(scene, 0)).toEqual(inferencePose(scene, scene.actionAt));
      for (const t of [scene.resolveAt + 0.2, fixture.durationSec, 1e6, Infinity])
        expect(inferencePose(scene, t)).toEqual(inferencePose(scene, scene.resolveAt));
    });
    it(`${fixture.name}: every 30fps frame is finite, bounded and continuous at beat boundaries`, () => {
      for (let frame = 0; frame < Math.ceil(fixture.durationSec * 30); frame++) {
        const values = numbers(inferencePose(scene, frame / 30));
        expect(values.length).toBeGreaterThan(10);
        expect(values.every((value) => Number.isFinite(value) && Math.abs(value) <= 4)).toBe(true);
      }
      for (const at of [scene.actionAt, scene.responseAt, scene.checkAt, scene.resolveAt]) {
        const before = numbers(inferencePose(scene, at - 0.00001));
        const after = numbers(inferencePose(scene, at + 0.00001));
        expect(before.length).toBe(after.length);
        expect(
          Math.max(...before.map((value, index) => Math.abs(value - after[index]))),
        ).toBeLessThan(0.0001);
      }
    });
    it(`${fixture.name}: absolute beat rebasing does not change the story`, () => {
      const rebased = shifted(scene, 1200);
      for (const t of [
        0,
        scene.actionAt + 0.5,
        scene.responseAt + 0.5,
        scene.checkAt + 0.5,
        scene.resolveAt,
      ]) {
        const a = numbers(inferencePose(scene, t));
        const b = numbers(inferencePose(rebased, t + 1200));
        a.forEach((value, index) => {
          expect(b[index]).toBeCloseTo(value, 9);
        });
      }
    });
    it(`${fixture.name}: bounded authored object and mesh budgets`, () => {
      expect(INFERENCE_BUDGETS[scene.preset].carriers).toBeLessThanOrEqual(12);
      expect(INFERENCE_BUDGETS[scene.preset].meshes).toBeLessThanOrEqual(120);
    });
    if (scene.kind === 'token-choice') {
      it(`${fixture.name}: only the selected word moves; alternatives remain and next choices wait`, () => {
        const setup = tokenChoicePose(scene, scene.setupAt);
        const before = tokenChoicePose(scene, scene.responseAt);
        const joined = tokenChoicePose(scene, scene.checkAt);
        const final = tokenChoicePose(scene, scene.resolveAt);
        expect(before.candidates.every((candidate) => !candidate.selected)).toBe(true);
        expect(
          joined.candidates.find((candidate) => candidate.id === scene.selectedId)?.position,
        ).toEqual(TOKEN_SOCKET);
        expect(final.candidates.filter((candidate) => candidate.selected)).toHaveLength(1);
        for (const candidate of final.candidates) {
          expect(candidate.reveal).toBe(1);
          expect(candidate.retained).toBe(true);
          if (!candidate.selected)
            expect(candidate.position).toEqual(
              setup.candidates.find((item) => item.id === candidate.id)?.position,
            );
        }
        expect(joined.next.every((candidate) => candidate.reveal === 0)).toBe(true);
        expect(final.next.every((candidate) => candidate.reveal === 1)).toBe(true);
        expect(final.uncertain).toBe(scene.preset === 'uncertain-choice');
        expect(
          new Set([...final.candidates, ...final.next].map((candidate) => candidate.id)).size,
        ).toBe(scene.candidates.length + scene.nextCandidates.length);
      });
    } else if (scene.kind === 'expert-selection') {
      it(`${fixture.name}: inactive experts never move or contribute; selected results return to the same task`, () => {
        const setup = expertSelectionPose(scene, scene.setupAt);
        const final = expertSelectionPose(scene, scene.resolveAt);
        expect(final.task).toEqual(setup.task);
        expect(final.experts.filter((expert) => expert.active)).toHaveLength(
          scene.preset === 'specialist-team' ? 2 : 1,
        );
        for (const [index, expert] of scene.experts.entries()) {
          for (const t of [scene.actionAt, scene.responseAt, scene.checkAt, scene.resolveAt]) {
            const pose = expertSelectionPose(scene, t).experts[index];
            if (!expert.selected) expect(pose).toEqual(setup.experts[index]);
            if (t <= scene.responseAt) expect(pose.contribution.visible).toBe(false);
          }
          if (expert.selected) {
            expect(final.experts[index].request.visible).toBe(false);
            expect(final.experts[index].contribution.visible).toBe(true);
            expect(final.experts[index].contribution.returned).toBe(1);
            expect(
              Math.abs(final.experts[index].contribution.position[0] - final.task[0]),
            ).toBeLessThan(0.8);
            expect(final.experts[index].contribution.position[2]).toBeGreaterThan(final.task[2]);
          }
        }
      });
    } else {
      it(`${fixture.name}: local result stays on-device; only the stated split sends and returns`, () => {
        const before = edgeCloudPose(scene, scene.actionAt);
        const processed = edgeCloudPose(scene, scene.checkAt);
        const final = edgeCloudPose(scene, scene.resolveAt);
        expect(before.localResult.visible).toBe(false);
        expect(processed.localResult.visible).toBe(true);
        expect(processed.localResult.position).toEqual(final.localResult.position);
        expect(final.localResult.position[0]).toBe(final.device[0]);
        expect(final.localInput.visible).toBe(false);
        if (scene.remote) {
          const contactAt = (scene.checkAt + scene.resolveAt) / 2;
          const contact = edgeCloudPose(scene, contactAt);
          expect(edgeCloudPose(scene, scene.checkAt - 0.001).outbound.visible).toBe(false);
          expect(contact.outbound.position).toEqual(contact.cloud);
          expect(contact.outbound.progress).toBe(1);
          expect(contact.inbound.visible).toBe(false);
          expect(final.inbound.visible).toBe(true);
          expect(final.inbound.progress).toBe(1);
          expect(final.outbound.visible).toBe(false);
          expect(Math.abs(final.inbound.position[0] - final.device[0])).toBeLessThan(0.8);
        } else {
          for (const t of [0, scene.responseAt, scene.checkAt, scene.resolveAt]) {
            const pose = edgeCloudPose(scene, t);
            expect(pose.outbound.visible || pose.inbound.visible).toBe(false);
            expect(pose.outbound.progress + pose.inbound.progress).toBe(0);
          }
        }
      });
    }
  }
});
