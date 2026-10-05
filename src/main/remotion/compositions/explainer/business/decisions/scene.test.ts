import { createElement, Fragment, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  parseMeasurementFrameScene,
  parseStagedDecisionScene,
  parseUncertaintyAlbumScene,
} from '../../../../../ai/explainer/business-decisions-contract';
import { isRec, type Rec } from '../../../../../ai/explainer/kind-spec';
import { DiagramStage } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { diagramPose } from '../../diagrams/motion';
import { EXPLANATION_CAMERA } from '../../explanation-layout';
import { Stage3D } from '../../Stage3D';
import { businessTextWidth } from '../text-width';
import {
  DECISIONS_ACCEPTED_VARIANTS,
  DECISIONS_SOURCE_FIXTURES,
  type DecisionsSourceFixture,
  decisionsSourceContext,
  decisionsSourceWindow,
} from './fixtures';
import { DecisionsDiagram, DecisionsNativeParts } from './parts';
import {
  decisionAlbumHeaders,
  decisionDetailWindows,
  decisionLines,
  decisionPages,
  decisionReadingStart,
  decisionRows,
  DECISIONS_ALBUM_HEADER as H,
  DECISIONS_RAIL as R,
} from './presentation';
import { DecisionsSceneView } from './Scene';
import type { DecisionsScene } from './types';

// Same actual-buffer inspection pattern as funds/capital; this is CPU evidence, not GPU proof.
const harness = vi.hoisted(() => ({
  time: 0,
  cleanup: [] as (() => void)[],
  geometries: new Map<string, import('three').BufferGeometry>(),
}));
vi.mock('remotion', async (original) => {
  const actual = await original<typeof import('remotion')>();
  return {
    ...actual,
    useCurrentFrame: () => harness.time * 30,
    useVideoConfig: () => ({ fps: 30 }),
  };
});
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return {
    ...actual,
    useMemo: (factory: () => unknown) => factory(),
    useEffect: (effect: () => (() => void) | undefined) => {
      const cleanup = effect();
      if (cleanup) harness.cleanup.push(cleanup);
    },
  };
});
vi.mock('../../stage', async (original) => {
  const actual = await original<typeof import('../../stage')>();
  return { ...actual, useStage: () => actual.STAGE, useSceneTime: () => ({ t: harness.time }) };
});
vi.mock('three/examples/jsm/geometries/RoundedBoxGeometry.js', async (original) => {
  const actual =
    await original<typeof import('three/examples/jsm/geometries/RoundedBoxGeometry.js')>();
  return {
    ...actual,
    RoundedBoxGeometry: function RoundedBoxGeometry(
      ...args: ConstructorParameters<typeof actual.RoundedBoxGeometry>
    ) {
      return cached('RoundedBoxGeometry', args, () => new actual.RoundedBoxGeometry(...args));
    },
  };
});
interface Props {
  children?: ReactNode;
  args?: number[];
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
  geometry?: BufferGeometry;
  name?: string;
}
function cached(
  type: string,
  args: readonly (number | undefined)[],
  factory: () => BufferGeometry,
): BufferGeometry {
  if (!args.every((value) => value === undefined || Number.isFinite(value)))
    throw new Error('Nonfinite geometry');
  const key = `${type}:${JSON.stringify(args)}`;
  let geometry = harness.geometries.get(key);
  if (!geometry) {
    geometry = factory();
    harness.geometries.set(key, geometry);
  }
  return geometry;
}
function intrinsic(type: string, args: number[]): BufferGeometry {
  switch (type) {
    case 'boxGeometry':
      return new BoxGeometry(...args);
    case 'cylinderGeometry':
      return new CylinderGeometry(...args);
    case 'sphereGeometry':
      return new SphereGeometry(...args);
    case 'capsuleGeometry':
      return new CapsuleGeometry(...args);
    case 'torusGeometry':
      return new TorusGeometry(...args);
    case 'planeGeometry':
      return new PlaneGeometry(...args);
    default:
      throw new Error(`Unknown/opaque geometry ${type}`);
  }
}
function inspector(): {
  inspect: (root: ReactNode, turn: number) => { box: Box3; meshes: number; names: string[] };
  dispose: () => void;
} {
  const owned = new Set<BufferGeometry>();
  const corners = new Map<BufferGeometry, Vector3[]>();
  const cameras = [1080 / 960, 952 / 478].map((aspect) => {
    const camera = new PerspectiveCamera(EXPLANATION_CAMERA.fov, aspect, 0.1, 100);
    camera.position.set(...EXPLANATION_CAMERA.position);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    return camera;
  });
  function local(geometry: BufferGeometry): Vector3[] {
    if (!(geometry instanceof BufferGeometry)) throw new Error('Opaque position buffer');
    owned.add(geometry);
    const previous = corners.get(geometry);
    if (previous) return previous;
    const position = geometry.getAttribute('position');
    if (
      !position ||
      position.itemSize !== 3 ||
      !position.count ||
      !Array.from(position.array).every(Number.isFinite)
    )
      throw new Error('Invalid actual positions');
    const index = geometry.getIndex();
    if (
      index &&
      !Array.from(index.array).every(
        (value) => Number.isInteger(value) && value >= 0 && value < position.count,
      )
    )
      throw new Error('Invalid geometry index');
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (
      !box ||
      box.isEmpty() ||
      ![...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite)
    )
      throw new Error('Missing finite geometry bounds');
    const result = [box.min.x, box.max.x].flatMap((x) =>
      [box.min.y, box.max.y].flatMap((y) =>
        [box.min.z, box.max.z].map((z) => new Vector3(x, y, z)),
      ),
    );
    corners.set(geometry, result);
    return result;
  }
  function inspect(root: ReactNode, angle: number): { box: Box3; meshes: number; names: string[] } {
    const box = new Box3();
    const turn = new Matrix4().makeRotationY(angle);
    const names: string[] = [];
    let meshes = 0,
      buffers = 0,
      projectedX = 0,
      projectedY = 0;
    function include(geometry: BufferGeometry, world: Matrix4): void {
      buffers++;
      for (const corner of local(geometry)) {
        const point = corner.clone().applyMatrix4(world).applyMatrix4(turn);
        if (!point.toArray().every(Number.isFinite)) throw new Error('Nonfinite world geometry');
        box.expandByPoint(point);
        for (const camera of cameras) {
          const projected = point.clone().project(camera);
          if (!projected.toArray().every(Number.isFinite)) throw new Error('Nonfinite projection');
          projectedX = Math.max(projectedX, Math.abs(projected.x));
          projectedY = Math.max(projectedY, Math.abs(projected.y));
        }
      }
    }
    function walk(node: ReactNode, parent: Matrix4): void {
      if (Array.isArray(node)) {
        node.forEach((child) => {
          walk(child, parent);
        });
        return;
      }
      if (!isValidElement<Props>(node)) return;
      if (node.type === Fragment) {
        walk(node.props.children, parent);
        return;
      }
      if (typeof node.type === 'function') {
        walk(Reflect.apply(node.type, undefined, [node.props]) as ReactNode, parent);
        return;
      }
      const type = String(node.type),
        props = node.props;
      if (props.name) names.push(props.name);
      if (type === 'mesh' || type === 'group') {
        const p = props.position ?? [0, 0, 0],
          r = props.rotation ?? [0, 0, 0];
        const s =
          typeof props.scale === 'number'
            ? [props.scale, props.scale, props.scale]
            : (props.scale ?? [1, 1, 1]);
        if (![...p, ...r, ...s].every(Number.isFinite)) throw new Error('Nonfinite transform');
        const world = parent
          .clone()
          .multiply(
            new Matrix4().compose(
              new Vector3(...p),
              new Quaternion().setFromEuler(new Euler(...r)),
              new Vector3(...s),
            ),
          );
        const before = buffers;
        if (type === 'mesh') meshes++;
        if (props.geometry) include(props.geometry, world);
        walk(props.children, world);
        if (type === 'mesh' && buffers - before !== 1)
          throw new Error('Mesh must have exactly one accounted real buffer');
        return;
      }
      if (type.endsWith('Geometry')) {
        const args = props.args ?? [];
        include(
          cached(type, args, () => intrinsic(type, args)),
          parent,
        );
        return;
      }
      if (type === 'meshPhysicalMaterial') return;
      throw new Error(`Unaccounted authored node ${type}`);
    }
    walk(root, new Matrix4());
    expect(projectedX).toBeLessThanOrEqual(1);
    expect(projectedY).toBeLessThanOrEqual(1);
    return { box, meshes, names };
  }
  function dispose(): void {
    try {
      harness.cleanup.splice(0).forEach((cleanup) => {
        cleanup();
      });
    } finally {
      new Set([...owned, ...harness.geometries.values()]).forEach((geometry) => {
        geometry.dispose();
      });
      owned.clear();
      corners.clear();
      harness.geometries.clear();
    }
  }
  return { inspect, dispose };
}
function parse(fixture: DecisionsSourceFixture, mode: 'diagram' | 'hybrid'): DecisionsScene {
  const raw: Rec = { ...fixture.raw, visualMode: mode },
    ctx = decisionsSourceContext(fixture);
  const parser =
    raw.kind === 'staged-decision'
      ? parseStagedDecisionScene
      : raw.kind === 'measurement-frame'
        ? parseMeasurementFrameScene
        : parseUncertaintyAlbumScene;
  const scene = parser(raw, ctx);
  if (!scene) throw new Error(ctx.issues.join('; '));
  return scene;
}
function wideOwnerFixture(fixture: DecisionsSourceFixture): DecisionsSourceFixture {
  const label = 'WWWWWWWWWWWWWWWWWWWWWWWW';
  function replace(value: unknown): unknown {
    if (typeof value === 'string') return value.replace(/\bOwner\b/gu, label);
    if (Array.isArray(value)) return value.map(replace);
    if (isRec(value))
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, replace(child)]));
    return value;
  }
  const raw = replace(fixture.raw);
  if (!isRec(raw)) throw new Error('Invalid authored maximum-label source');
  return {
    ...fixture,
    fixtureId: `${fixture.fixtureId}:maximum-owner`,
    raw,
    words: fixture.words.map((word) => ({
      ...word,
      text: word.text.replace(/\bOwner\b/gu, label),
    })),
  };
}
const fixtures = [
  ...DECISIONS_SOURCE_FIXTURES,
  ...DECISIONS_ACCEPTED_VARIANTS,
  ...DECISIONS_SOURCE_FIXTURES.map(wideOwnerFixture),
];
const cases = fixtures.flatMap((fixture) =>
  (fixture.raw.modelSource === null
    ? (['diagram'] as const)
    : (['diagram', 'hybrid'] as const)
  ).map((mode) => ({ fixture, mode, name: `${fixture.fixtureId}:${mode}` })),
);
function boundaries(node: ReactNode): number {
  if (Array.isArray(node)) return node.reduce((sum, child) => sum + boundaries(child), 0);
  if (!isValidElement<{ children?: ReactNode }>(node)) return 0;
  return (node.type === Stage3D ? 1 : 0) + boundaries(node.props.children);
}
function text(markup: string): string {
  return markup
    .replace(/<[^>]+>/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

describe('decisions native geometry, full source pages and explicit observations', () => {
  it.each(
    cases,
  )('$name: actual buffers at all30fps/beat/handoff/reverse samples within locked budgets', ({
    fixture,
    mode,
  }) => {
    const scene = parse(fixture, mode),
      end = decisionsSourceWindow(fixture).endTime;
    const times = [
      ...Array.from({ length: Math.ceil(end * 30) + 1 }, (_, index) => index / 30),
      ...[
        scene.setupAt,
        scene.actionAt,
        scene.responseAt,
        scene.checkAt,
        scene.resolveAt,
        decisionReadingStart(scene),
      ].flatMap((beat) => [beat - 1 / 3000, beat, beat + 1 / 3000]),
    ];
    const check = inspector();
    try {
      for (const time of [...times, ...[...times].reverse()]) {
        harness.time = time;
        const result = check.inspect(
          createElement(DecisionsNativeParts, { scene }),
          diagramPose(time, scene).modelTurn,
        );
        expect(result.meshes).toBeLessThanOrEqual(180);
        if (mode === 'diagram') {
          expect(result.meshes).toBe(0);
          continue;
        }
        expect(result.meshes).toBeGreaterThan(0);
        expect(result.box.min.x).toBeGreaterThanOrEqual(-3.4);
        expect(result.box.max.x).toBeLessThanOrEqual(3.4);
        expect(result.box.min.y).toBeGreaterThanOrEqual(-1.4);
        expect(result.box.max.y).toBeLessThanOrEqual(2.7);
        expect(result.box.min.z).toBeGreaterThanOrEqual(-2.6);
        expect(result.box.max.z).toBeLessThanOrEqual(1.8);
      }
      harness.time = scene.resolveAt;
      expect(
        check.inspect(
          createElement(DecisionsNativeParts, { scene: { ...scene, modelSource: null } }),
          0,
        ).meshes,
      ).toBe(0);
      if (scene.preset !== 'firms-functions-workers') {
        const swapped: DecisionsScene = {
          ...scene,
          modelSource:
            scene.modelSource?.map((entry) => ({ ...entry, identityId: 'unsupported-owner' })) ??
            null,
        };
        expect(
          check.inspect(createElement(DecisionsNativeParts, { scene: swapped }), 0).meshes,
        ).toBe(0);
      }
    } finally {
      check.dispose();
    }
  });
  it('unaccounted or opaque buffers fail closed', () => {
    const check = inspector();
    try {
      expect(() =>
        check.inspect(createElement('mesh', { geometry: new BufferGeometry() }), 0),
      ).toThrow('Invalid actual positions');
      expect(() =>
        check.inspect(createElement('mesh', null, createElement('unknownGeometry')), 0),
      ).toThrow('Unknown/opaque');
      expect(() => check.inspect(createElement('mesh'), 0)).toThrow('exactly one');
    } finally {
      check.dispose();
    }
  });
  it.each(cases)('$name: every complete 24px page is visible >=1.5s after the real handoff', ({
    fixture,
    mode,
  }) => {
    const scene = parse(fixture, mode),
      pages = decisionPages(scene),
      windows = decisionDetailWindows(scene);
    expect(windows).toHaveLength(pages.length);
    expect(pages.flatMap((page) => page.rows)).toEqual(decisionRows(scene));
    for (const window of windows) {
      expect(window.end - window.start).toBeGreaterThanOrEqual(1.5);
      expect(window.start).toBeGreaterThanOrEqual(decisionReadingStart(scene));
      expect(window.page.lines).toBeLessThanOrEqual(R.bodyLines);
      harness.time = (window.start + window.end) / 2;
      expect(
        mode === 'diagram' ? 1 : diagramPose(window.start, scene).diagramOpacity,
      ).toBeGreaterThanOrEqual(0.999);
      const markup = renderToStaticMarkup(
        createElement('svg', null, createElement(DecisionsDiagram, { scene })),
      );
      const reading = text(markup);
      for (const row of window.page.rows) {
        expect(reading).toContain(row.label);
        expect(reading).toContain(row.state);
        expect(reading).toContain(row.text);
        for (const line of [
          ...decisionLines(`${row.label} · ${row.state}`),
          ...decisionLines(row.text),
        ])
          expect(businessTextWidth(line, R.fontSize)).toBeLessThanOrEqual(R.width - 2 * R.padding);
      }
      expect(markup).not.toMatch(/font-size="(?:1\d|2[0-3])"/u);
      if (scene.preset === 'alternatives-or-source-distribution') {
        for (const header of decisionAlbumHeaders(scene)) {
          expect(reading).toContain(header.text);
          expect(header.lines.length).toBeLessThanOrEqual(H.maxLines);
          header.lines.forEach((line) => {
            expect(businessTextWidth(line, H.fontSize)).toBeLessThanOrEqual(
              header.width - 2 * H.padding,
            );
          });
        }
        expect(markup.includes('data-source-probability')).toBe(scene.setMode === 'distribution');
      }
      if (scene.preset === 'planned-observed')
        expect(markup).toContain(`data-observation-state="${scene.observed.state}"`);
    }
    const view = DecisionsSceneView({ scene });
    expect(view.type).toBe(mode === 'diagram' ? DiagramStage : HybridStage);
    const stage =
      isValidElement<Parameters<typeof DiagramStage>[0]>(view) && view.type === DiagramStage
        ? DiagramStage(view.props)
        : isValidElement<Parameters<typeof HybridStage>[0]>(view)
          ? HybridStage(view.props)
          : null;
    expect(boundaries(stage)).toBe(mode === 'diagram' ? 0 : 1);
    expect(
      isValidElement<{ scene: DecisionsScene; settledOutcome?: boolean }>(view) && view.props.scene,
    ).toBe(scene);
    expect(isValidElement<{ settledOutcome?: boolean }>(view) && view.props.settledOutcome).toBe(
      true,
    );
  });
});
