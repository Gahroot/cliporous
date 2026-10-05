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
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { parseBusinessAlternatives } from '../../../../../ai/explainer/business-futures-contract';
import { parsePossibleFutures } from '../../../../../ai/explainer/kinds-concept-perspective';
import { DiagramChrome } from '../../diagrams/DiagramStage';
import { HybridStage } from '../../diagrams/HybridStage';
import { EXPLANATION_CAMERA } from '../../explanation-layout';
import { Stage3D } from '../../Stage3D';
import { businessTextWidth } from '../text-width';
import {
  businessAlternativeFixture,
  businessAlternativeFixtureContext,
} from './alternative-fixtures';
import {
  BusinessAlternativeDiagramParts,
  BusinessAlternativeModelParts,
  BusinessAlternativeNativeLabelParts,
} from './alternative-parts';
import { sampleBusinessAlternative } from './alternative-poses';
import {
  businessAlternativeFacts,
  businessAlternativeNativeLabels,
  businessAlternativePages,
  businessAlternativeSemanticIds,
  BUSINESS_ALTERNATIVE_READING as R,
} from './alternative-presentation';
import { BusinessAlternativeSceneView } from './alternative-Scene';

// Actual allocated position buffers and real physical materials; no opacity replacement as proof.
const harness = vi.hoisted(() => ({
  time: 0,
  cleanup: [] as (() => void)[],
  geometries: new Map<string, import('three').BufferGeometry>(),
  memo: new WeakMap<object, unknown>(),
}));
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
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return {
    ...actual,
    useMemo: (factory: () => unknown, deps: readonly unknown[]) => {
      // Reuse the authored constant batch dependency, not opaque geometry or a substitute box.
      const key =
        deps.length === 1 && deps[0] !== null && typeof deps[0] === 'object' ? deps[0] : null;
      if (!key) return factory();
      if (!harness.memo.has(key)) harness.memo.set(key, factory());
      return harness.memo.get(key);
    },
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
interface Props {
  children?: ReactNode;
  args?: number[];
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
  geometry?: BufferGeometry;
  userData?: unknown;
  name?: string;
  color?: string;
  opacity?: number;
  roughness?: number;
  metalness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
}
function cached(
  type: string,
  args: readonly (number | undefined)[],
  factory: () => BufferGeometry,
): BufferGeometry {
  if (!args.every((v) => v === undefined || Number.isFinite(v)))
    throw new Error('Non-finite geometry arguments');
  const key = `${type}:${JSON.stringify(args)}`;
  let geometry = harness.geometries.get(key);
  if (!geometry) {
    geometry = factory();
    harness.geometries.set(key, geometry);
  }
  return geometry;
}
function intrinsic(type: string, args: number[]): BufferGeometry {
  if (type === 'boxGeometry') return new BoxGeometry(...args);
  if (type === 'cylinderGeometry') return new CylinderGeometry(...args);
  if (type === 'sphereGeometry') return new SphereGeometry(...args);
  if (type === 'capsuleGeometry') return new CapsuleGeometry(...args);
  if (type === 'torusGeometry') return new TorusGeometry(...args);
  if (type === 'planeGeometry') return new PlaneGeometry(...args);
  throw new Error(`Unknown/opaque geometry ${type}`);
}
function inspector() {
  const owned = new Set<BufferGeometry>(),
    corners = new Map<BufferGeometry, Vector3[]>();
  const materials = new Map<string, MeshPhysicalMaterial>();
  const cameras = [1080 / 960, 952 / 478].map((aspect) => {
    const camera = new PerspectiveCamera(EXPLANATION_CAMERA.fov, aspect, 0.1, 100);
    camera.position.set(...EXPLANATION_CAMERA.position);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    return camera;
  });
  function local(geometry: BufferGeometry): Vector3[] {
    if (!(geometry instanceof BufferGeometry))
      throw new Error('Opaque geometry is not an authored position buffer');
    owned.add(geometry);
    const previous = corners.get(geometry);
    if (previous) return previous;
    const position = geometry.getAttribute('position');
    if (!position || position.itemSize !== 3 || position.count === 0)
      throw new Error('Opaque geometry without position buffer');
    if (!Array.from(position.array).every(Number.isFinite))
      throw new Error('Non-finite actual position buffer');
    const index = geometry.getIndex();
    if (
      index &&
      !Array.from(index.array).every((v) => Number.isInteger(v) && v >= 0 && v < position.count)
    )
      throw new Error('Invalid geometry index');
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    if (
      !bounds ||
      bounds.isEmpty() ||
      ![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)
    )
      throw new Error('Missing finite actual geometry bounds');
    const result = [bounds.min.x, bounds.max.x].flatMap((x) =>
      [bounds.min.y, bounds.max.y].flatMap((y) =>
        [bounds.min.z, bounds.max.z].map((z) => new Vector3(x, y, z)),
      ),
    );
    corners.set(geometry, result);
    return result;
  }
  function inspect(root: ReactNode, turnAngle: number) {
    const box = new Box3(),
      turn = new Matrix4().makeRotationY(turnAngle);
    const facts: unknown[] = [],
      names: string[] = [],
      types: string[] = [],
      assetMeshes = new Map<string, number>();
    let meshes = 0,
      materialCount = 0,
      instances = 0,
      projectedX = 0,
      projectedY = 0,
      allocated = 0;
    function include(geometry: BufferGeometry, matrix: Matrix4) {
      instances++;
      for (const corner of local(geometry)) {
        const world = corner.clone().applyMatrix4(matrix).applyMatrix4(turn);
        if (!world.toArray().every(Number.isFinite)) throw new Error('Non-finite world geometry');
        box.expandByPoint(world);
        for (const camera of cameras) {
          const p = world.clone().project(camera);
          if (!p.toArray().every(Number.isFinite)) throw new Error('Non-finite projection');
          projectedX = Math.max(projectedX, Math.abs(p.x));
          projectedY = Math.max(projectedY, Math.abs(p.y));
        }
      }
    }
    function walk(node: ReactNode, parent: Matrix4) {
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
        types.push(node.type.name);
        walk(Reflect.apply(node.type, undefined, [node.props]) as ReactNode, parent);
        return;
      }
      const type = String(node.type),
        props = node.props;
      types.push(type);
      if (props.name) names.push(props.name);
      if (props.userData) facts.push(props.userData);
      if (type === 'mesh' || type === 'group') {
        const position = props.position ?? [0, 0, 0],
          rotation = props.rotation ?? [0, 0, 0];
        const scale =
          typeof props.scale === 'number'
            ? [props.scale, props.scale, props.scale]
            : (props.scale ?? [1, 1, 1]);
        if (![...position, ...rotation, ...scale].every(Number.isFinite))
          throw new Error('Non-finite transform');
        const world = parent
          .clone()
          .multiply(
            new Matrix4().compose(
              new Vector3(...position),
              new Quaternion().setFromEuler(new Euler(...rotation)),
              new Vector3(...scale),
            ),
          );
        const before = instances,
          beforeMeshes = meshes;
        if (type === 'mesh') meshes++;
        if (props.geometry) {
          allocated++;
          include(props.geometry, world);
        }
        walk(props.children, world);
        if (type === 'mesh' && instances - before !== 1)
          throw new Error('Each mesh needs exactly one accounted real geometry');
        if (
          props.name?.startsWith('asset:') ||
          props.name?.startsWith('business-alternatives:A-03:')
        )
          assetMeshes.set(props.name, meshes - beforeMeshes);
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
      if (type === 'meshPhysicalMaterial') {
        const key = JSON.stringify(props);
        let material = materials.get(key);
        if (!material) {
          material = new MeshPhysicalMaterial({
            color: props.color,
            opacity: props.opacity,
            roughness: props.roughness,
            metalness: props.metalness,
            clearcoat: props.clearcoat,
            clearcoatRoughness: props.clearcoatRoughness,
          });
          materials.set(key, material);
          if (
            ![
              material.opacity,
              material.roughness,
              material.metalness,
              material.clearcoat,
              material.clearcoatRoughness,
              material.color.r,
              material.color.g,
              material.color.b,
            ].every(Number.isFinite)
          )
            throw new Error('Non-finite actual material');
        }
        materialCount++;
        return;
      }
      throw new Error(`Unaccounted authored node ${type}`);
    }
    walk(root, new Matrix4());
    expect(projectedX).toBeLessThanOrEqual(1);
    expect(projectedY).toBeLessThanOrEqual(1);
    return { box, meshes, materials: materialCount, facts, names, types, assetMeshes, allocated };
  }
  function dispose() {
    try {
      harness.cleanup.splice(0).forEach((cleanup) => {
        cleanup();
      });
    } finally {
      new Set([...owned, ...harness.geometries.values()]).forEach((g) => {
        g.dispose();
      });
      materials.forEach((m) => {
        m.dispose();
      });
      owned.clear();
      corners.clear();
      materials.clear();
      harness.geometries.clear();
      harness.memo = new WeakMap();
    }
  }
  return { inspect, dispose };
}

function parsed(options: Parameters<typeof businessAlternativeFixture>[0] = {}) {
  const fixture = businessAlternativeFixture(options);
  const { visualMode: _mode, businessAlternatives: _lens, ...raw } = fixture.raw;
  const ctx = businessAlternativeFixtureContext(fixture);
  const scene = parsePossibleFutures(raw, ctx);
  if (!scene) throw new Error(ctx.issues.join('; '));
  const lens = parseBusinessAlternatives(fixture.raw, ctx, scene);
  if (!lens) throw new Error(ctx.issues.join('; '));
  return { fixture, scene, lens };
}
function boundaries(node: ReactNode): number {
  if (Array.isArray(node)) return node.reduce((sum, child) => sum + boundaries(child), 0);
  if (!isValidElement<{ children?: ReactNode }>(node)) return 0;
  return (node.type === Stage3D ? 1 : 0) + boundaries(node.props.children);
}
function children(node: ReactNode): ReactNode[] {
  return Array.isArray(node) ? node.flatMap(children) : node == null ? [] : [node];
}
function tree(node: ReactNode): ReactNode[] {
  return children(node).flatMap((child) =>
    isValidElement<{ children?: ReactNode }>(child)
      ? [child, ...tree(child.props.children)]
      : [child],
  );
}
const cases = [
  { count: 3 as const, mode: 'hybrid' as const },
  { count: 2 as const, mode: 'hybrid' as const, maxLabels: true },
  { count: 2 as const, mode: 'diagram' as const, native: false },
];
describe('OP-75 actual native buffers, full fixed-font source pages and additive canvas boundaries', () => {
  it.each(
    cases,
  )('$mode/$count/max=$maxLabels: all 30fps + critical + handoff + reverse buffers stay inside locked XYZ', (options) => {
    const { scene, lens } = parsed(options);
    const check = inspector();
    try {
      const pages = businessAlternativePages(scene, lens);
      const critical = [
        scene.setupAt,
        scene.actionAt,
        scene.responseAt,
        scene.checkAt,
        scene.resolveAt,
        ...pages.flatMap((page) => [page.start, page.end]),
      ].flatMap((t) => [t - 1 / 30, t, t + 1 / 30]);
      const times = [...Array.from({ length: 361 }, (_, frame) => frame / 30), ...critical];
      let meshCount = -1;
      for (const t of [...times, ...times.slice().reverse()]) {
        const pose = sampleBusinessAlternative(scene, lens, t);
        const result = check.inspect(
          createElement(BusinessAlternativeModelParts, { scene, lens, pose }),
          pose.modelTurn,
        );
        expect(result.meshes).toBeLessThanOrEqual(180);
        if (meshCount === -1) meshCount = result.meshes;
        expect(result.meshes).toBe(meshCount);
        expect(result.types).not.toContain('Stage3D');
        expect(result.types).not.toContain('Canvas');
        if (lens.visualMode === 'diagram') {
          expect(result.meshes).toBe(0);
          continue;
        }
        expect(result.meshes).toBeGreaterThan(0);
        expect(result.materials).toBe(result.meshes);
        expect(result.box.min.x).toBeGreaterThanOrEqual(-3.4);
        expect(result.box.max.x).toBeLessThanOrEqual(3.4);
        expect(result.box.min.y).toBeGreaterThanOrEqual(-1.4);
        expect(result.box.max.y).toBeLessThanOrEqual(2.7);
        expect(result.box.min.z).toBeGreaterThanOrEqual(-2.6);
        expect(result.box.max.z).toBeLessThanOrEqual(1.8);
        expect(result.assetMeshes.size).toBe(lens.records.length);
        expect(new Set(result.assetMeshes.values()).size).toBe(1);
        expect(
          result.names.filter((name) => name.startsWith('business-alternatives:A-03:')),
        ).toEqual(lens.records.map((record) => `business-alternatives:A-03:${record.identity.id}`));
        expect(result.facts).toContainEqual(
          expect.objectContaining({
            sourceFacts: businessAlternativeFacts(scene, lens),
            semanticIds: businessAlternativeSemanticIds(scene, lens),
            modelSource: lens.native?.source,
          }),
        );
      }
    } finally {
      check.dispose();
    }
  });
  it('unknown/opaque geometry and unaccounted meshes fail closed', () => {
    const check = inspector();
    try {
      expect(() =>
        check.inspect(createElement('mesh', null, createElement('arbitraryGeometry')), 0),
      ).toThrow('Unknown/opaque geometry');
      expect(() =>
        check.inspect(createElement('mesh', { geometry: new BufferGeometry() }), 0),
      ).toThrow('position buffer');
      expect(() => check.inspect(createElement('mesh'), 0)).toThrow('exactly one');
    } finally {
      check.dispose();
    }
  });
  it.each(
    cases,
  )('$mode/$count: full page/native caption source-renderer parity at fixed 24px, including max labels', (options) => {
    const { fixture, scene, lens } = parsed(options);
    const pages = businessAlternativePages(scene, lens);
    for (const page of pages) {
      const pose = sampleBusinessAlternative(scene, lens, page.start + 0.75);
      const jsx = BusinessAlternativeDiagramParts({ scene, lens, pose });
      const markup = renderToStaticMarkup(createElement('svg', null, jsx));
      expect(markup).toContain('font-size="24"');
      expect(markup).not.toContain('…');
      expect(page.end - page.start).toBeGreaterThanOrEqual(1.5);
      for (const card of page.cards) {
        const nodes = tree(jsx).filter(
          (node) =>
            isValidElement<Record<string, unknown>>(node) &&
            node.props['data-fact-id'] === card.fact.id,
        );
        expect(nodes).toHaveLength(1);
        const texts = tree(nodes[0]).filter(
          (node) => isValidElement<Record<string, unknown>>(node) && node.props['data-line-id'],
        );
        expect(
          texts.map((node) =>
            isValidElement<{ children: string }>(node) ? node.props.children : '',
          ),
        ).toEqual(card.lines.map((line) => line.text));
        expect(card.lines.map((line) => line.text).join(' ')).toBe(card.fact.text);
        if (card.fact.source && ['baseline', 'evidence', 'native'].includes(card.fact.kind)) {
          expect(
            fixture.words
              .slice(card.fact.source.fromWord, card.fact.source.toWord + 1)
              .map((word) => word.text)
              .join(' '),
          ).toBe(card.fact.text);
        }
      }
    }
    if (!lens.native) return;
    const labels = businessAlternativeNativeLabels(scene, lens);
    const pose = sampleBusinessAlternative(scene, lens, scene.responseAt);
    const caption = BusinessAlternativeNativeLabelParts({ scene, lens, pose });
    const spans = tree(caption).filter(
      (node) => isValidElement<{ children: string }>(node) && node.type === 'tspan',
    );
    expect(
      spans.map((node) => (isValidElement<{ children: string }>(node) ? node.props.children : '')),
    ).toEqual([...labels.header, ...labels.records.flatMap((record) => record.lines)]);
    expect(R.padding + labels.header.length * R.lineHeight).toBeLessThanOrEqual(150);
    labels.header.forEach((line) => {
      expect(businessTextWidth(line, 24)).toBeLessThanOrEqual(R.rail);
    });
    labels.records.forEach((record, slot) => {
      expect(record.y + record.lines.length * R.lineHeight).toBeLessThanOrEqual(
        R.height - R.padding,
      );
      record.lines.forEach((line) => {
        expect(businessTextWidth(line, 24)).toBeLessThanOrEqual(record.width - 2 * R.padding);
      });
      const source = lens.records[slot].source;
      const evidence = fixture.words
        .slice(source.fromWord, source.toWord + 1)
        .map((word) => word.text)
        .join(' ');
      expect(evidence).toContain(lens.records[slot].identity.label);
      expect(evidence).toContain(scene.alternatives[slot].qualifier);
      expect(record.lines.join(' ')).toContain(scene.alternatives[slot].qualifier);
    });
  });
  it.each([
    'diagram',
    'hybrid',
  ] as const)('%s view owns zero/one existing stage, settled final outcome, unchanged condition/clocks', (mode) => {
    const { scene, lens } = parsed({ mode, condition: true });
    harness.time = scene.resolveAt;
    const view = BusinessAlternativeSceneView({ scene, lens });
    const wrapper = tree(view).find((node) => isValidElement(node) && node.type === HybridStage);
    if (!isValidElement<Parameters<typeof HybridStage>[0]>(wrapper))
      throw new Error('Missing stage wrapper');
    expect(wrapper.props.settledOutcome).toBe(true);
    expect(wrapper.props.scene.resolveAt).toBe(scene.resolveAt);
    expect(wrapper.props.scene.outcome).toBe(scene.outcome);
    expect(wrapper.props.scene.condition).toBe(scene.condition);
    expect(boundaries(HybridStage(wrapper.props))).toBe(mode === 'diagram' ? 0 : 1);
    const markup = renderToStaticMarkup(
      createElement(DiagramChrome, { scene: wrapper.props.scene, settledOutcome: true }),
    );
    // Native chrome wraps complete source text into divs; inspect reading text, not tag adjacency.
    const readingText = markup
      .replace(/<[^>]+>/gu, ' ')
      .replace(/\s+/gu, ' ')
      .trim();
    expect(readingText).toContain(scene.outcome);
    expect(readingText).toContain(scene.condition);
    expect(markup).toContain('opacity:1');
  });
});
