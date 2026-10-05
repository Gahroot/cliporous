import { readFileSync } from 'node:fs';
import { createElement, Fragment, isValidElement, type ReactNode } from 'react';
import * as THREE from 'three';
import { Box3, BufferGeometry, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { parseLongformSceneSpec } from '../../../ai/explainer-scenes';
import { sampleCommercial } from '../explainer/business/commercial/poses';
import { CommercialModelParts } from '../explainer/business/commercial/Scene';
import {
  type BusinessSourceFixture,
  businessSourceFixture,
  businessSourceFixtures,
} from '../explainer/business/source-fixtures';
import { sampleWorkScene } from '../explainer/business/work/poses';
import { WorkModelParts } from '../explainer/business/work/Scene';
import { deriveExplainerPalette } from '../explainer/palette';
import {
  BUSINESS_MODEL_FRAMING,
  businessPanelClock,
  businessPanelNativePose,
  businessPanelPlacement,
  businessPanelResources,
  visibleBusinessPanels,
} from './business-panel-state';
import { BoardBusinessModels, BusinessPanelNativeModels } from './business-panels';
import type { BoardBusinessPanel } from './business-types';
import { worldToScreen } from './camera';
import { pixelCameraDistance } from './prop-state';

// Execute the REAL authored components/geometry. Only React's render-context hooks are
// replaced for this CPU tree audit; no native scene/model/pose/parser is mocked.
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (f: () => unknown) => f(),
  useEffect: () => undefined,
}));
vi.mock('../explainer/stage', async (original) => {
  const actual = await original<typeof import('../explainer/stage')>();
  const { deriveExplainerPalette: derive } = await import('../explainer/palette');
  return {
    ...actual,
    useStage: () => ({
      ...derive({ background: '#23100c', foreground: '#f6ecd9', accent: '#d67542' }),
      font: actual.UI_FONT,
      serif: actual.SERIF_FONT,
      done: '#74b99b',
    }),
  };
});

type Props = Record<string, unknown> & {
  children?: ReactNode;
  name?: string;
  userData?: Record<string, unknown>;
};
const MODEL_NAMES = new Set([
  'CommercialStorefront',
  'ServiceStation',
  'BranchPod',
  'OperatingDesk',
  'PermissionCard',
  'ApprovalRail',
  'PlaybookBinder',
  'ExceptionTrolley',
  'CommitmentFolio',
  'DistributionTierTrays',
  'MaturityLadder',
  'EconomicRightsLayers',
  'DataCenterRack',
  'PowerReadinessSubstation',
  'CoolingLoop',
  'ProviderConnectorPanel',
  'FoldedDocument',
  'WorkDesk',
  'PaperTray',
  'OwnershipTray',
  'Occupant',
  'TaskFolder',
]);

function vector(value: unknown, fallback: [number, number, number]): Vector3 {
  return Array.isArray(value)
    ? new Vector3(...(value as [number, number, number]))
    : typeof value === 'number'
      ? new Vector3(value, value, value)
      : new Vector3(...fallback);
}
function auditModels(node: unknown) {
  const result = {
    meshes: 0,
    modelInstances: 0,
    groups: [] as { name?: string; data?: Record<string, unknown> }[],
    colors: [] as string[],
    bounds: new Box3(),
    topology: [] as string[],
  };
  function walk(value: unknown, parent: Matrix4, insideModel = false): void {
    if (value === null || value === undefined || typeof value === 'boolean') return;
    if (Array.isArray(value)) {
      for (const child of value) walk(child, parent, insideModel);
      return;
    }
    if (!isValidElement<Props>(value)) throw new Error('Unexpected model node');
    if (value.type === Fragment) {
      walk(value.props.children, parent, insideModel);
      return;
    }
    if (typeof value.type === 'function') {
      const name = value.type.name;
      expect(name).not.toMatch(/Canvas|Stage|SceneBody/);
      const model = MODEL_NAMES.has(name);
      if (model && !insideModel) {
        result.modelInstances++;
        result.topology.push(name);
      }
      walk((value.type as (props: Props) => ReactNode)(value.props), parent, insideModel || model);
      return;
    }
    if (typeof value.type !== 'string') throw new Error('Unknown component');
    const { props } = value;
    if (value.type.endsWith('Material')) {
      result.colors.push(String(props.color));
      return;
    }
    if (value.type.endsWith('Geometry')) return;
    if (value.type !== 'group' && value.type !== 'mesh')
      throw new Error(`Not a model intrinsic: ${value.type}`);
    const matrix = parent
      .clone()
      .multiply(
        new Matrix4().compose(
          vector(props.position, [0, 0, 0]),
          new Quaternion().setFromEuler(
            new Euler(...(vector(props.rotation, [0, 0, 0]).toArray() as [number, number, number])),
          ),
          vector(props.scale, [1, 1, 1]),
        ),
      );
    if (value.type === 'group') result.groups.push({ name: props.name, data: props.userData });
    else {
      result.meshes++;
      let geometry = props.geometry as BufferGeometry | undefined;
      if (!geometry) {
        const children = Array.isArray(props.children) ? props.children : [props.children];
        const geom = children.find(
          (child) =>
            isValidElement(child) &&
            typeof child.type === 'string' &&
            child.type.endsWith('Geometry'),
        );
        if (!isValidElement<{ args: unknown[] }>(geom) || typeof geom.type !== 'string')
          throw new Error('Unaccounted geometry');
        const name = geom.type[0].toUpperCase() + geom.type.slice(1);
        const ctor = (
          THREE as unknown as Record<string, new (...args: unknown[]) => BufferGeometry>
        )[name];
        if (!ctor) throw new Error(`Unaccounted geometry ${name}`);
        geometry = new ctor(...geom.props.args);
      }
      expect(geometry).toBeInstanceOf(BufferGeometry);
      geometry.computeBoundingBox();
      if (!geometry.boundingBox) throw new Error('Missing authored geometry bounds');
      result.bounds.union(geometry.boundingBox.clone().applyMatrix4(matrix));
      geometry.dispose();
    }
    walk(props.children, matrix, insideModel);
  }
  walk(node, new Matrix4());
  return result;
}

function panelFrom(f: BusinessSourceFixture): BoardBusinessPanel {
  const parsed = parseLongformSceneSpec(f.raw, f.words, { clipStart: 0, clipEnd: 90 });
  if (!parsed) throw new Error(`Source fixture rejected: ${f.fixtureId}`);
  const scene = parsed.scene as BoardBusinessPanel['scene'];
  return {
    id: f.fixtureId,
    recipe: f.id as BoardBusinessPanel['recipe'],
    scene,
    x: 0,
    y: 0,
    width: 1600,
    height: 900,
    startAt: scene.setupAt,
    endAt: scene.resolveAt + 2,
    identityLinks: [],
  };
}
function panel(id: `OP-${string}`, mode: 'diagram' | 'hybrid' = 'hybrid') {
  const source = businessSourceFixture(id, mode);
  if (!source) throw new Error('Missing source fixture');
  return panelFrom(source);
}

describe('business shared-canvas concrete gates', () => {
  it('OP17 executes actual commercial geometry with source IDs and existing palette', () => {
    const p = panel('OP-17');
    if (p.scene.kind !== 'business-blueprint') throw new Error('wrong source');
    const t = p.scene.resolveAt;
    const actual = auditModels(createElement(BusinessPanelNativeModels, { panel: p, seconds: t }));
    const native = auditModels(createElement(CommercialModelParts, { scene: p.scene, seconds: t }));
    expect(actual.meshes).toBe(native.meshes);
    expect(actual.modelInstances).toBe(native.modelInstances);
    expect(actual.groups.slice(1)).toEqual(native.groups);
    expect(actual.groups[0]).toMatchObject({
      name: `business-panel:${p.id}`,
      data: { sourceScene: p.scene },
    });
    expect(actual).toMatchObject({ meshes: 48, modelInstances: 4 });
    expect(actual.colors).toEqual(native.colors);
    expect(actual.colors).toContain(
      deriveExplainerPalette({ background: '#23100c', foreground: '#f6ecd9', accent: '#d67542' })
        .accent,
    );
    expect(businessPanelNativePose(p, t)).toMatchObject({ pose: sampleCommercial(p.scene, t) });
    console.info('OP17', {
      meshes: actual.meshes,
      models: actual.modelInstances,
      min: actual.bounds.min.toArray(),
      max: actual.bounds.max.toArray(),
      topology: actual.topology,
    });
  });
  it('OP01 holds the native timeline and retains native task identities and roles', () => {
    const p = panel('OP-01');
    if (p.scene.kind !== 'task-map') throw new Error('wrong source');
    const before = structuredClone(p);
    const actual = auditModels(
      createElement(BusinessPanelNativeModels, { panel: p, seconds: 1000 }),
    );
    const native = auditModels(
      createElement(WorkModelParts, {
        scene: p.scene,
        pose: sampleWorkScene(p.scene, p.scene.resolveAt),
      }),
    );
    expect(actual.meshes).toBe(native.meshes);
    expect(actual).toMatchObject({ meshes: 41, modelInstances: 4 });
    expect(actual.groups.slice(1)).toEqual(native.groups);
    expect(actual.groups.filter((g) => g.name?.startsWith('task:')).length).toBeGreaterThan(0);
    expect(businessPanelClock(p, 1000)).toBe(p.scene.resolveAt);
    for (const t of [p.startAt, p.scene.actionAt, p.scene.resolveAt, 1000, p.scene.actionAt]) {
      expect(businessPanelNativePose(p, t)).toMatchObject({
        pose: sampleWorkScene(p.scene, Math.min(t, p.scene.resolveAt)),
      });
    }
    expect(p).toEqual(before);
    console.info('OP01', {
      meshes: actual.meshes,
      models: actual.modelInstances,
      min: actual.bounds.min.toArray(),
      max: actual.bounds.max.toArray(),
      topology: actual.topology,
    });
  });
  it('OP01 rejects unsupported unknown roles at the real source parser instead of inventing actors', () => {
    const source = businessSourceFixture('OP-01', 'hybrid');
    if (!source) throw new Error('Missing source');
    const f = structuredClone(source);
    const roles = f.raw.ownership as Record<string, unknown>[];
    for (const role of roles) {
      role.performerId = null;
      role.approverId = null;
      role.accountableOwnerId = null;
    }
    // OP01's frozen native contract requires performers/accountable owners. Null
    // approver means explicit no approval, not an unknown role. Do not broaden it.
    expect(parseLongformSceneSpec(f.raw, f.words, { clipStart: 0, clipEnd: 90 })).toBeNull();
    expect(
      parseLongformSceneSpec(source.raw, source.words, { clipStart: 0, clipEnd: 90 }),
    ).not.toBeNull();
  });
  it('pure diagram returns null and mounts zero groups/meshes', () => {
    const p = panel('OP-17', 'diagram');
    expect(BusinessPanelNativeModels({ panel: p, seconds: 1000 })).toBeNull();
    expect(
      auditModels(createElement(BusinessPanelNativeModels, { panel: p, seconds: 1000 })),
    ).toMatchObject({ meshes: 0, modelInstances: 0, groups: [] });
  });
  it('owned adapter has no canvas/runtime stage or frame-clock wrappers', () => {
    const source = readFileSync(
      'src/main/remotion/compositions/storyboard/business-panels.tsx',
      'utf8',
    );
    expect(source).not.toMatch(
      /<(?:Canvas|ThreeCanvas|HybridStage|ExplanationStage|SceneBody|Freeze)\b|useCurrentFrame|useVideoConfig|Math\.random/,
    );
  });
});

describe('source-fixture routes', () => {
  const sources = businessSourceFixtures();
  it('covers all29 kinds / 80 recipes / 152 source modes', () => {
    expect(new Set(sources.map((f) => panelFrom(f).scene.kind)).size).toBe(29);
    expect(new Set(sources.map((f) => f.id)).size).toBe(80);
    expect(sources).toHaveLength(152);
  });
  it.each(sources)('$fixtureId: exact topology, held seeks and authored bounds', (f) => {
    const p = panelFrom(f);
    const before = structuredClone(p);
    const samples = [
      p.startAt,
      p.scene.actionAt,
      p.scene.responseAt,
      p.scene.checkAt,
      p.scene.resolveAt,
      p.endAt + 100,
      p.scene.actionAt,
    ];
    for (const seconds of samples) {
      const resources = businessPanelResources(p, seconds);
      const actual = auditModels(createElement(BusinessPanelNativeModels, { panel: p, seconds }));
      const pose = businessPanelNativePose(p, seconds);
      expect(pose.scene).toBe(p.scene);
      expect(businessPanelNativePose(p, seconds)).toEqual(pose);
      if (seconds >= p.scene.resolveAt)
        expect(pose).toEqual(businessPanelNativePose(p, p.scene.resolveAt));
      expect(actual.meshes, f.fixtureId).toBe(resources.meshes);
      expect(actual.modelInstances, `${f.fixtureId}: ${actual.topology.join(', ')}`).toBe(
        resources.modelInstances,
      );
      expect(actual.meshes).toBeLessThanOrEqual(resources.ceiling.meshes);
      expect(actual.modelInstances).toBeLessThanOrEqual(resources.ceiling.modelInstances);
      if (f.visualMode === 'diagram') expect(actual.meshes).toBe(0);
      else {
        for (let axis = 0; axis < 3; axis++)
          if (actual.meshes) {
            expect(actual.bounds.min.getComponent(axis), f.fixtureId).toBeGreaterThanOrEqual(
              BUSINESS_MODEL_FRAMING.bounds.min[axis],
            );
            expect(actual.bounds.max.getComponent(axis), f.fixtureId).toBeLessThanOrEqual(
              BUSINESS_MODEL_FRAMING.bounds.max[axis],
            );
          }
        expect(actual.meshes, f.fixtureId).toBeLessThanOrEqual(180);
      }
    }
    expect(p).toEqual(before);
  });
});

describe('shared PixelCamera framing and admission metadata', () => {
  it.each([
    'OP-01',
    'OP-17',
    'OP-49',
    'OP-58',
    'OP-65',
    'OP-75',
  ] as const)('%s: actual mounted transforms remain inside coordinator model rail', (id) => {
    const p = panel(id);
    for (const [railWidth, railHeight, zoom] of [
      [320, 220, 0.7],
      [640, 480, 1],
      [1000, 600, 2],
    ]) {
      const rail = { x: 100, y: 80, width: railWidth, height: railHeight };
      const camera = {
        x: rail.x + rail.width / 2 - 200 / zoom,
        y: rail.y + rail.height / 2 + 100 / zoom,
        zoom,
      };
      const width = 1920,
        height = 1080;
      const d = pixelCameraDistance(height);
      for (const seconds of [
        p.startAt,
        p.scene.actionAt,
        p.scene.checkAt,
        p.scene.resolveAt,
        p.endAt + 10,
      ]) {
        const actual = auditModels(
          createElement(BoardBusinessModels, {
            panels: [p],
            rails: { [p.id]: rail },
            camera,
            seconds,
            width,
            height,
          }),
        );
        expect(actual.meshes).toBe(businessPanelResources(p, seconds).meshes);
        const topLeft = worldToScreen(rail, camera, width, height);
        const bottomRight = worldToScreen(
          { x: rail.x + rail.width, y: rail.y + rail.height },
          camera,
          width,
          height,
        );
        for (const x of [actual.bounds.min.x, actual.bounds.max.x])
          for (const y of [actual.bounds.min.y, actual.bounds.max.y])
            for (const z of [actual.bounds.min.z, actual.bounds.max.z]) {
              expect(z).toBeLessThan(d - 10);
              const screenX = width / 2 + (x * d) / (d - z);
              const screenY = height / 2 - (y * d) / (d - z);
              expect(screenX).toBeGreaterThanOrEqual(topLeft.x);
              expect(screenX).toBeLessThanOrEqual(bottomRight.x);
              expect(screenY).toBeGreaterThanOrEqual(topLeft.y);
              expect(screenY).toBeLessThanOrEqual(bottomRight.y);
            }
      }
    }
  });
  it('seeks backward repeatably, culls before setup/offscreen/nonfinite time, and holds after end', () => {
    const p = panel('OP-17');
    const rail = { x: -320, y: -240, width: 640, height: 480 };
    const camera = { x: 0, y: 0, zoom: 1 };
    const args = [p, rail, camera] as const;
    const action = businessPanelPlacement(...args, p.scene.actionAt, 1920, 1080);
    expect(action.visible).toBe(true);
    const held = businessPanelPlacement(...args, 1000, 1920, 1080);
    expect(held.time).toBe(p.scene.resolveAt);
    expect(businessPanelPlacement(...args, p.scene.actionAt, 1920, 1080)).toEqual(action);
    expect(businessPanelPlacement(...args, p.startAt - 1, 1920, 1080).visible).toBe(false);
    for (const seconds of [NaN, Infinity, -Infinity]) {
      const sample = businessPanelPlacement(...args, seconds, 1920, 1080);
      expect(sample.visible).toBe(false);
      expect(
        [sample.time, sample.unit, sample.radius, ...sample.position].every(Number.isFinite),
      ).toBe(true);
    }
    expect(
      visibleBusinessPanels([p], { [p.id]: rail }, { x: 1e6, y: 1e6, zoom: 1 }, 1000, 1920, 1080),
    ).toEqual([]);
    expect(
      BoardBusinessModels({
        panels: [panel('OP-17', 'diagram')],
        rails: {},
        camera,
        seconds: 1000,
        width: 1920,
        height: 1080,
      }),
    ).toBeNull();
  });
  it('reports over-six source assemblies intact, without thinning native geometry', () => {
    const over = businessSourceFixtures()
      .filter((f) => f.visualMode === 'hybrid')
      .map(panelFrom)
      .filter((p) => businessPanelResources(p).modelInstances > 6);
    expect(over.length).toBeGreaterThan(0);
    for (const p of over) {
      const resources = businessPanelResources(p);
      const actual = auditModels(
        createElement(BusinessPanelNativeModels, { panel: p, seconds: p.scene.resolveAt }),
      );
      expect(actual.modelInstances).toBe(resources.modelInstances);
      expect(actual.meshes).toBe(resources.meshes);
    }
  });
});
