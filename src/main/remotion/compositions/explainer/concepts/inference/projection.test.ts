import { createElement, Fragment, isValidElement, type ReactNode } from 'react';
import {
  BoxGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  EXPLANATION_CAMERA,
  EXPLANATION_LABEL_TOP,
  EXPLANATION_OUTCOME_TOP,
} from '../../explanation-layout';
import { projectToStage } from '../../three-helpers';
import { type ExplainerAspect, stageCanvasFor, stageSafeBox } from '../../types';
import { fixtureScene, inferenceFixtures } from './fixtures.test-data';
import { edgeCloudPose, INFERENCE_BUDGETS } from './poses';
import { InferenceSceneView } from './Scene';
import { INFERENCE_LAYOUTS, INFERENCE_LIMITS, type InferenceScene } from './types';

const clock = vi.hoisted(() => ({ t: 0 }));
vi.mock('../../stage', async (original) => {
  const actual = await original<typeof import('../../stage')>();
  return {
    ...actual,
    useStage: () => actual.STAGE,
    // These projections retain the legacy stage; native widescreen has separate coverage.
    useWideStage: () => undefined,
    useSceneTime: () => ({ t: clock.t, frame: clock.t * 30, fps: 30 }),
  };
});
vi.mock('../../hero-kit', () => ({ Clay: () => null }));
vi.mock('../../explanation-kit', async (original) => {
  const actual = await original<typeof import('../../explanation-kit')>();
  // RoundedBoxGeometry fits this exact-size outer box. Preserve the actual view's transforms.
  return {
    ...actual,
    ClayBlock: (props: { size: number[]; position?: number[]; rotation?: number[] }) =>
      createElement(
        'mesh',
        { position: props.position, rotation: props.rotation },
        createElement('boxGeometry', { args: props.size }),
      ),
  };
});
vi.mock('../../mechanisms/MechanismStage', () => ({
  // No WebGL/browser: execute the real view/model/ExplanationStage JSX and its editorial overlay.
  MechanismStage: ({
    children,
    overlay,
  }: {
    children: ReactNode;
    overlay?: (camera: typeof EXPLANATION_CAMERA) => ReactNode;
  }) => createElement(Fragment, null, children, overlay?.(EXPLANATION_CAMERA)),
}));

type Props = Record<string, unknown>;
interface TextBox {
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  text: string;
}
interface GeometrySample {
  points: Vector3[];
  meshes: number;
  labels: TextBox[];
}

function tuple(value: unknown, fallback: [number, number, number]): [number, number, number] {
  if (typeof value === 'number') return [value, value, value];
  if (Array.isArray(value) && value.length === 3 && value.every((v) => typeof v === 'number'))
    return [value[0], value[1], value[2]];
  return fallback;
}
function transform(props: Props): Matrix4 {
  const position = tuple(props.position, [0, 0, 0]);
  const rotation = tuple(props.rotation, [0, 0, 0]);
  const scale = tuple(props.scale, [1, 1, 1]);
  return new Matrix4().compose(
    new Vector3(...position),
    new Quaternion().setFromEuler(new Euler(...rotation)),
    new Vector3(...scale),
  );
}
function content(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(content).join(' ');
  return isValidElement<Props>(node) ? content(node.props.children) : '';
}

/** Bounds come from actual JSX dimensions, mesh transforms and moving pose positions, not hand-copied envelopes. */
function geometryAt(scene: InferenceScene, t: number): GeometrySample {
  clock.t = t;
  const sample: GeometrySample = { points: [], meshes: 0, labels: [] };
  function walk(node: unknown, parent = new Matrix4()): void {
    if (Array.isArray(node)) {
      node.forEach((child) => {
        walk(child, parent);
      });
      return;
    }
    if (!isValidElement<Props>(node)) return;
    if (typeof node.type === 'function') {
      walk(Reflect.apply(node.type, undefined, [node.props]), parent);
      return;
    }
    const matrix = parent.clone().multiply(transform(node.props));
    const args = Array.isArray(node.props.args) ? node.props.args.map(Number) : [];
    const geometry =
      node.type === 'boxGeometry'
        ? new BoxGeometry(args[0], args[1], args[2])
        : node.type === 'cylinderGeometry'
          ? new CylinderGeometry(args[0], args[1], args[2], args[3])
          : node.type === 'sphereGeometry'
            ? new SphereGeometry(args[0], args[1], args[2])
            : null;
    if (geometry) {
      geometry.computeBoundingBox();
      const box = geometry.boundingBox;
      if (!box) throw new Error('missing geometry bounds');
      for (const x of [box.min.x, box.max.x])
        for (const y of [box.min.y, box.max.y])
          for (const z of [box.min.z, box.max.z])
            sample.points.push(new Vector3(x, y, z).applyMatrix4(matrix));
      sample.meshes++;
      geometry.dispose();
    }
    if (node.type === 'div' && node.props.style && typeof node.props.style === 'object') {
      const style = node.props.style;
      if (
        'left' in style &&
        'top' in style &&
        'width' in style &&
        'fontSize' in style &&
        typeof style.left === 'number' &&
        typeof style.top === 'number' &&
        typeof style.width === 'number' &&
        typeof style.fontSize === 'number' &&
        (!('opacity' in style) || Number(style.opacity) > 0)
      ) {
        // Conservative two-line overlay box, not a claim about actual browser font rasterization.
        sample.labels.push({
          left: style.left,
          top: style.top,
          width: style.width,
          height: style.fontSize * 1.16 * 2,
          fontSize: style.fontSize,
          text: content(node.props.children),
        });
      }
    }
    walk(node.props.children, matrix);
  }
  walk(createElement(InferenceSceneView, { scene }));
  return sample;
}

type Bounds = Pick<TextBox, 'left' | 'top' | 'width' | 'height'>;
function separated(a: Bounds, b: Bounds, gap = 12): boolean {
  return (
    a.left + a.width + gap <= b.left ||
    b.left + b.width + gap <= a.left ||
    a.top + a.height + gap <= b.top ||
    b.top + b.height + gap <= a.top
  );
}

for (const fixture of inferenceFixtures) {
  const scene = fixtureScene(fixture);
  const times = [
    scene.setupAt,
    scene.actionAt,
    (scene.actionAt + scene.responseAt) / 2,
    scene.responseAt,
    (scene.responseAt + scene.checkAt) / 2,
    scene.checkAt,
    (scene.checkAt + scene.resolveAt) / 2,
    scene.resolveAt,
    fixture.durationSec - 1 / 30,
  ];
  describe(`${fixture.name} actual authored geometry`, () => {
    if (scene.kind === 'edge-cloud') {
      for (const device of ['phone', 'camera'] as const) {
        it(`${device}: capped work/result labels clear actual meshes and other text throughout processing`, () => {
          // Keep the deliberate cap-filler endings, including WID/WOR; never shorten fixtures.
          const stress = {
            ...scene,
            device,
            localWork: 'photo WIDE WORDS WIDEW',
            localResult: 'crop WIDE WORDS WIDE W',
            remote: scene.remote && {
              ...scene.remote,
              work: 'photo WIDE WORDS WIDEW',
              result: 'matches WIDE WORDS WID',
            },
          };
          const journeyTimes = [
            ...times,
            ...[0.125, 0.375, 0.5, 0.625, 0.875].map(
              (p) => scene.checkAt + p * (scene.resolveAt - scene.checkAt),
            ),
          ];
          for (const t of journeyTimes) {
            const sample = geometryAt(stress, t);
            const pose = edgeCloudPose(stress, t);
            const labels = sample.labels
              .filter((label) => label.top < EXPLANATION_LABEL_TOP)
              // Reserve three full lines at the unchanged font size. This is a conservative
              // layout envelope for 22-character labels, not browser font-raster evidence.
              .map((label) => ({ ...label, height: label.fontSize * 1.16 * 3 }));
            const expected = [stress.localWork];
            if (pose.localResult.visible) expected.push(stress.localResult);
            if (stress.remote && pose.outbound.visible) expected.push(stress.remote.work);
            if (stress.remote && pose.inbound.visible) expected.push(stress.remote.result);
            expect(labels.map((label) => label.text).sort()).toEqual(expected.sort());

            const meshes: Bounds[] = [];
            // geometryAt records each real mesh's eight transformed bounding-box corners.
            for (let i = 0; i < sample.points.length; i += 8) {
              const projected = sample.points
                .slice(i, i + 8)
                .map((p) => projectToStage(EXPLANATION_CAMERA, [p.x, p.y, p.z]));
              const left = Math.min(...projected.map((p) => p.x));
              const top = Math.min(...projected.map((p) => p.y));
              meshes.push({
                left,
                top,
                width: Math.max(...projected.map((p) => p.x)) - left,
                height: Math.max(...projected.map((p) => p.y)) - top,
              });
            }
            for (const [i, label] of labels.entries()) {
              const context = `${label.text} at ${t}`;
              for (const mesh of meshes) expect(separated(label, mesh), context).toBe(true);
              for (const other of labels.slice(i + 1))
                expect(separated(label, other), context).toBe(true);
              expect(label.text.length).toBe(INFERENCE_LIMITS.actor);
              expect(label.fontSize).toBeGreaterThanOrEqual(
                i < (pose.localResult.visible ? 2 : 1) ? 26 : 24,
              );
              expect(label.width).toBeGreaterThanOrEqual(280);
              expect(label.left).toBeGreaterThanOrEqual(60);
              expect(label.left + label.width).toBeLessThanOrEqual(1020);
              expect(label.top).toBeGreaterThan(220);
              expect(label.top + label.height).toBeLessThan(EXPLANATION_LABEL_TOP - 12);
            }
          }
        });
      }
    }
    it('has semantic meshes, obeys mesh ceilings, and remains outside title/editorial rails', () => {
      for (const t of times) {
        const sample = geometryAt(scene, t);
        expect(sample.meshes).toBeGreaterThan(5);
        expect(sample.meshes).toBeLessThanOrEqual(INFERENCE_BUDGETS[scene.preset].meshes);
        for (const point of sample.points) {
          const p = projectToStage(EXPLANATION_CAMERA, [point.x, point.y, point.z]);
          expect(p.x).toBeGreaterThan(60);
          expect(p.x).toBeLessThan(1020);
          expect(p.y).toBeGreaterThan(200);
          expect(p.y).toBeLessThan(EXPLANATION_LABEL_TOP - 8);
        }
        for (const label of sample.labels) {
          expect(label.left, label.text).toBeGreaterThanOrEqual(60);
          expect(label.left + label.width, label.text).toBeLessThanOrEqual(1020);
          expect(label.top, label.text).toBeGreaterThan(190);
          expect(label.top + label.height, label.text).toBeLessThanOrEqual(
            label.top >= EXPLANATION_OUTCOME_TOP
              ? 960
              : label.top >= EXPLANATION_LABEL_TOP
                ? EXPLANATION_OUTCOME_TOP - 8
                : EXPLANATION_LABEL_TOP - 8,
          );
        }
      }
    });
    for (const layout of INFERENCE_LAYOUTS) {
      for (const aspect of ['9:16', '16:9'] satisfies ExplainerAspect[]) {
        it(`${layout}/${aspect}: projected meshes and labels fit the real SceneFrame safe-box transform`, () => {
          const canvas = stageCanvasFor(layout, aspect);
          const safe = stageSafeBox(layout, aspect);
          const scale = Math.min(safe.width / 1080, safe.height / 960);
          const left = safe.x + (safe.width - 1080 * scale) / 2;
          const top = safe.y + (safe.height - 960 * scale) / 2;
          const sample = geometryAt(scene, scene.resolveAt);
          const points = sample.points.map((point) =>
            projectToStage(EXPLANATION_CAMERA, [point.x, point.y, point.z]),
          );
          for (const label of sample.labels)
            points.push(
              { x: label.left, y: label.top },
              { x: label.left + label.width, y: label.top + label.height },
            );
          for (const p of points) {
            const x = left + p.x * scale,
              y = top + p.y * scale;
            expect(x).toBeGreaterThanOrEqual(Math.max(0, safe.x));
            expect(x).toBeLessThanOrEqual(Math.min(canvas.width, safe.x + safe.width));
            expect(y).toBeGreaterThanOrEqual(Math.max(0, safe.y));
            expect(y).toBeLessThanOrEqual(Math.min(canvas.height, safe.y + safe.height));
          }
        });
      }
    }
    it('final-hold geometry and local labels do not drift', () => {
      expect(geometryAt(scene, scene.resolveAt)).toEqual(
        geometryAt(scene, fixture.durationSec - 1 / 30),
      );
    });
  });
}
