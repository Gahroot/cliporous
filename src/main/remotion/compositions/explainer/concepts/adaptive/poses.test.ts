import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EXPLANATION_CAMERA,
  EXPLANATION_LABEL_TOP,
  EXPLANATION_OUTCOME_TOP,
} from '../../explanation-layout';
import { projectToStage } from '../../three-helpers';
import { type ExplainerAspect, stageCanvasFor, stageSafeBox } from '../../types';
import {
  ADAPTIVE_ENVELOPE,
  ADAPTIVE_GROUND,
  ADAPTIVE_MESH_BUDGETS,
  type AdaptivePoint,
  adaptiveLabelAnchor,
  collectivePatternPose,
  modularMachinePose,
  robotPerceptionPose,
} from './poses';
import { adaptiveFixture, adaptiveFixtures } from './test-fixtures';
import { ADAPTIVE_LAYOUTS, type AdaptiveScene, type CollectivePatternScene } from './types';

function poseAt(scene: AdaptiveScene, t: number) {
  switch (scene.kind) {
    case 'collective-pattern':
      return collectivePatternPose(scene, t);
    case 'robot-perception':
      return robotPerceptionPose(scene, t);
    case 'modular-machine':
      return modularMachinePose(scene, t);
  }
}
function numbers(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(numbers);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(numbers);
  return [];
}
function positionsAt(scene: AdaptiveScene, t: number): AdaptivePoint[] {
  switch (scene.kind) {
    case 'collective-pattern':
      return collectivePatternPose(scene, t).actors.map((actor) => actor.position);
    case 'robot-perception': {
      const pose = robotPerceptionPose(scene, t);
      return [pose.robot, pose.target, pose.distractor];
    }
    case 'modular-machine': {
      const pose = modularMachinePose(scene, t);
      return [pose.current, pose.candidate];
    }
  }
}
const envelope = ADAPTIVE_ENVELOPE.x.flatMap((x) =>
  ADAPTIVE_ENVELOPE.y.flatMap((y) => ADAPTIVE_ENVELOPE.z.map((z): AdaptivePoint => [x, y, z])),
);

describe('Pack F deterministic seekable poses', () => {
  it.each(
    adaptiveFixtures,
  )('$name is bounded, continuous, immutable and seek-independent at every frame', ({
    scene,
    durationSec,
  }) => {
    const original = structuredClone(scene);
    const snapshots = Array.from({ length: Math.ceil(durationSec * 30) }, (_, frame) =>
      poseAt(scene, frame / 30),
    );
    for (let frame = snapshots.length - 1; frame >= 0; frame--) {
      const pose = poseAt(scene, frame / 30);
      expect(pose).toEqual(snapshots[frame]);
      expect(numbers(pose).every(Number.isFinite)).toBe(true);
      const points = positionsAt(scene, frame / 30);
      for (const point of points) {
        expect(point[0]).toBeGreaterThan(-3);
        expect(point[0]).toBeLessThan(3);
        expect(point[1]).toBeGreaterThanOrEqual(ADAPTIVE_GROUND);
        expect(Math.abs(point[2])).toBeLessThan(1.6);
      }
      if (frame > 0) {
        const previous = positionsAt(scene, (frame - 1) / 30);
        for (const [index, point] of points.entries())
          expect(
            Math.hypot(...point.map((value, axis) => value - previous[index][axis])),
          ).toBeLessThan(0.23);
      }
    }
    expect(scene).toEqual(original);
    expect(poseAt(scene, scene.resolveAt)).toEqual(poseAt(scene, durationSec));
    expect(poseAt(scene, durationSec)).toEqual(poseAt(scene, durationSec + 100));
    expect(ADAPTIVE_MESH_BUDGETS[scene.preset]).toBeLessThanOrEqual(150);
  });

  it('uncertain recognition never selects, drives, crosses the boundary or acts—even after the window', () => {
    const { scene } = adaptiveFixture('uncertain-target');
    if (scene.kind !== 'robot-perception') throw new Error('Wrong fixture kind');
    const initial = robotPerceptionPose(scene, -1);
    for (let frame = -30; frame <= 900; frame++) {
      const pose = robotPerceptionPose(scene, frame / 30);
      expect(pose.robot).toEqual(initial.robot);
      expect(pose.move).toBe(0);
      expect(pose.wheelTurn).toBe(0);
      expect(pose.recognized).toBe(0);
      expect(pose.targetBracket).toBe(pose.distractorBracket);
      expect(pose.robot[0] + 0.48).toBeLessThan(pose.boundaryX);
    }
    expect(robotPerceptionPose(scene, scene.resolveAt).deferred).toBe(1);
  });

  it('recognized motion begins only after the observation/recognition checks and stops before the boundary', () => {
    const { scene } = adaptiveFixture('recognized-target');
    if (scene.kind !== 'robot-perception') throw new Error('Wrong fixture kind');
    for (let frame = 0; frame < 600; frame++) {
      const t = frame / 30;
      const pose = robotPerceptionPose(scene, t);
      if (t <= scene.checkAt) expect(pose.move).toBe(0);
      if (pose.move > 0) expect(pose.recognized).toBe(1);
      expect(pose.robot[0] + 0.48).toBeLessThan(pose.boundaryX);
    }
    const final = robotPerceptionPose(scene, scene.resolveAt);
    expect(final.targetBracket).toBe(1);
    expect(final.distractorBracket).toBe(0);
  });

  it('incompatible modules stay physically separated, unseated and inactive at every frame', () => {
    const { scene } = adaptiveFixture('incompatible-module');
    if (scene.kind !== 'modular-machine') throw new Error('Wrong fixture kind');
    for (let frame = -30; frame <= 900; frame++) {
      const pose = modularMachinePose(scene, frame / 30);
      expect(pose.seated).toBe(false);
      expect(pose.active).toBe(false);
      expect(pose.toolTurn).toBe(0);
      expect(pose.work).toBe(0);
      // Candidate body extends 0.325 left; socket rim is 0.265 right of x=0.
      expect(pose.candidate[0] - 0.325 - 0.265).toBeGreaterThan(0.6);
      expect(pose.current[0]).toBeLessThanOrEqual(0);
    }
    const final = modularMachinePose(scene, scene.resolveAt);
    expect(final.current).toEqual([0, -0.02, 0.2]);
    expect(final.candidate).toEqual([2.1, -0.18, 0.2]);
    expect(final.rejected).toBe(true);
  });

  it('compatible operation requires seating and a retained old tool before its finite work stroke', () => {
    const { scene } = adaptiveFixture('reconfigure');
    if (scene.kind !== 'modular-machine') throw new Error('Wrong fixture kind');
    for (let frame = 0; frame <= 600; frame++) {
      const t = frame / 30;
      const pose = modularMachinePose(scene, t);
      if (t < scene.checkAt) {
        expect(pose.active).toBe(false);
        expect(pose.work).toBe(0);
      }
      if (pose.active) {
        expect(pose.seated).toBe(true);
        expect(pose.candidate).toEqual([0, -0.02, 0.2]);
        expect(pose.current).toEqual([-2.1, -0.18, 0.2]);
      }
    }
    expect(modularMachinePose(scene, scene.resolveAt).work).toBeCloseTo(0, 10);
  });

  it.each(
    adaptiveFixtures.filter((fixture) => fixture.scene.kind === 'collective-pattern'),
  )('$name only activates its source-backed local edges; never grows actors', ({
    scene,
    durationSec,
  }) => {
    if (scene.kind !== 'collective-pattern') throw new Error('Wrong fixture kind');
    for (let frame = 0; frame <= durationSec * 30; frame++) {
      const t = frame / 30;
      const pose = collectivePatternPose(scene, t);
      expect(pose.actors.map((actor) => actor.id)).toEqual(scene.actors.map((actor) => actor.id));
      expect(pose.links).toHaveLength(scene.relationships.length);
      for (const [index, link] of pose.links.entries()) {
        const source = scene.relationships[index];
        expect([link.fromId, link.toId]).toEqual([source.fromId, source.toId]);
        if (t <= source.at) expect(link.progress).toBe(0);
      }
      if (scene.preset === 'adoption-wave') {
        for (const edge of scene.relationships) {
          const target = pose.actors.find((actor) => actor.id === edge.toId);
          if (t <= edge.at + 0.35) expect(target?.adopted).toBe(0);
          if (target && target.adopted > 0)
            expect(pose.links.find((link) => link.toId === target.id)?.progress).toBe(1);
        }
      }
    }
  });

  it('retains bounded independent positions for six participants, including uneven clusters', () => {
    const fixture = adaptiveFixture('network-clusters');
    if (fixture.scene.kind !== 'collective-pattern') throw new Error('Wrong fixture kind');
    const base = fixture.scene;
    const scene: CollectivePatternScene = {
      ...base,
      actors: Array.from({ length: 6 }, (_, index) => ({
        id: `actor-${index}`,
        label: `Participant ${index}`,
      })),
      relationships: [
        [0, 1],
        [1, 2],
        [2, 3],
        [4, 5],
      ].map(([from, to], index) => ({
        ...base.relationships[0],
        fromId: `actor-${from}`,
        toId: `actor-${to}`,
        at: fixture.scene.actionAt + index * 0.6,
      })),
    };
    const pose = collectivePatternPose(scene, scene.resolveAt);
    expect(new Set(pose.actors.map((actor) => JSON.stringify(actor.position))).size).toBe(6);
    for (const [index, actor] of pose.actors.entries()) {
      for (const other of pose.actors.slice(index + 1))
        expect(
          Math.hypot(...actor.position.map((value, axis) => value - other.position[axis])),
        ).toBeGreaterThan(0.85);
    }
    for (const actor of pose.actors) expect(Math.abs(actor.position[0])).toBeLessThan(2.8);
  });

  it('has no wall clocks, random actors, free-running physics or external models', () => {
    for (const file of ['poses.ts', 'models.tsx', 'Scene.tsx']) {
      const source = readFileSync(
        `src/main/remotion/compositions/explainer/concepts/adaptive/${file}`,
        'utf8',
      );
      expect(source).not.toMatch(
        /\b(?:useFrame|Date\.now|Math\.random|setInterval|useGLTF|useTexture)\s*\(/,
      );
    }
  });
});

describe('Pack F shared-camera projected bounds (including 16:9 over)', () => {
  it('reserves the existing title, label and outcome regions for the full authored mesh envelope', () => {
    for (const point of envelope) {
      const projected = projectToStage(EXPLANATION_CAMERA, point);
      expect(projected.x).toBeGreaterThan(60);
      expect(projected.x).toBeLessThan(1020);
      expect(projected.y).toBeGreaterThan(210);
      expect(projected.y).toBeLessThan(EXPLANATION_LABEL_TOP - 8);
    }
    expect(EXPLANATION_LABEL_TOP + 2 * 30 * 1.15).toBeLessThan(EXPLANATION_OUTCOME_TOP);
    expect(EXPLANATION_OUTCOME_TOP + 2 * 36 * 1.1).toBeLessThan(960);
  });
  for (const fixture of adaptiveFixtures) {
    it.each(
      ADAPTIVE_LAYOUTS,
    )(`${fixture.scene.preset} fits %s safe boxes and preserves projected identity labels`, (layout) => {
      const aspect: ExplainerAspect = layout === 'over' || layout === 'takeover' ? '16:9' : '9:16';
      const safe = stageSafeBox(layout, aspect);
      const canvas = stageCanvasFor(layout, aspect);
      const scale = Math.min(safe.width / 1080, safe.height / 960);
      const left = safe.x + (safe.width - 1080 * scale) / 2;
      const top = safe.y + (safe.height - 960 * scale) / 2;
      for (const point of envelope) {
        const projected = projectToStage(EXPLANATION_CAMERA, point);
        const x = left + projected.x * scale;
        const y = top + projected.y * scale;
        expect(x).toBeGreaterThan(safe.x);
        expect(x).toBeLessThan(safe.x + safe.width);
        expect(y).toBeGreaterThan(safe.y);
        expect(y).toBeLessThan(safe.y + safe.height);
        expect(x).toBeLessThan(canvas.width);
        expect(y).toBeLessThan(canvas.height);
      }
      for (let frame = 0; frame < fixture.durationSec * 30; frame += 3) {
        for (const position of positionsAt(fixture.scene, frame / 30)) {
          const anchor = adaptiveLabelAnchor(position);
          expect(anchor.x).toBeGreaterThan(60);
          expect(anchor.x + 144).toBeLessThan(1020);
          expect(anchor.y).toBeGreaterThan(180);
          expect(anchor.y + 3 * 23 * 1.16).toBeLessThan(EXPLANATION_LABEL_TOP - 8);
        }
      }
    });
  }
});
