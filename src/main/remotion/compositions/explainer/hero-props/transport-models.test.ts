import { Children, createElement, isValidElement, type ReactNode } from 'react';
import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  type Object3D,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BottleneckScene } from '../BottleneckScene';
import { LeverageScene } from '../LeverageScene';
import { MomentumScene } from '../MomentumScene';
import { leverPose } from '../mechanisms/kinematics';
import { RAIL_CARRIER_SIZE, RailCarrier } from '../mechanisms/rail-hardware';
import { sampleSwitchyard } from '../mechanisms/switchyard-poses';
import { SwitchyardScene } from '../SwitchyardScene';
import type {
  BottleneckScene as BottleneckData,
  LeverageScene as LeverageData,
  MomentumScene as MomentumData,
  SwitchyardScene as SwitchyardData,
} from '../types';
import { FlywheelRig, LeverRig, PulleyRig } from './kinetic';
import { Conveyor, RailSwitchRig } from './transport';
import {
  CableReel,
  Counterweight,
  DriveShoe,
  Parcel,
  PressureFoot,
  PullRing,
} from './transport-models';
import {
  RAIL_HALF_GAUGE,
  sampleRailHeading,
  sampleRailPoint,
  sampleRailTrackPoint,
  sampleRailWheelAngles,
} from './transport-poses';

const clock = vi.hoisted(() => ({ t: 0 }));
// Expand production JSX with only hooks/Canvas removed. Geometry, transforms, keys and child
// components are real; this catches a cube substitution that pure sampler tests cannot see.
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => unknown) => factory(),
  useEffect: () => undefined,
}));
vi.mock('../stage', async (original) => {
  const actual = await original<typeof import('../stage')>();
  return {
    ...actual,
    useStage: () => actual.STAGE,
    useSceneTime: () => ({ t: clock.t, frame: clock.t * 30, fps: 30 }),
  };
});
vi.mock('../mechanisms/MechanismStage', () => ({
  MechanismStage: ({ children }: { children: ReactNode }) => children,
  useCompactMechanism: () => false,
}));

const constructors: Record<string, new (...args: never[]) => BufferGeometry> = {
  boxGeometry: BoxGeometry,
  cylinderGeometry: CylinderGeometry,
  extrudeGeometry: ExtrudeGeometry,
  planeGeometry: PlaneGeometry,
  sphereGeometry: SphereGeometry,
  torusGeometry: TorusGeometry,
};
const owned = new Set<BufferGeometry>();
afterEach(() => {
  for (const geometry of owned) geometry.dispose();
  owned.clear();
});

function hierarchy(element: ReactNode): Group {
  const root = new Group();
  const visit = (children: ReactNode, parent: Object3D): void => {
    Children.forEach(children, (node) => {
      if (!isValidElement<Record<string, unknown>>(node)) return;
      const { type, props } = node;
      if (typeof type === 'function') {
        visit((type as (props: Record<string, unknown>) => ReactNode)(props), parent);
        return;
      }
      if (type === 'group' || type === 'mesh') {
        const object = type === 'mesh' ? new Mesh() : new Group();
        if (object instanceof Mesh) owned.add(object.geometry);
        object.name = typeof props.name === 'string' ? props.name : '';
        object.userData.jsxKey = node.key;
        if (Array.isArray(props.position)) object.position.fromArray(props.position);
        if (Array.isArray(props.rotation))
          object.rotation.set(props.rotation[0], props.rotation[1], props.rotation[2]);
        if (Array.isArray(props.scale)) object.scale.fromArray(props.scale);
        else if (typeof props.scale === 'number') object.scale.setScalar(props.scale);
        parent.add(object);
        visit(props.children as ReactNode, object);
        return;
      }
      const Constructor = typeof type === 'string' ? constructors[type] : undefined;
      const geometry = Constructor
        ? new Constructor(...(props.args as never[]))
        : type === 'primitive' && props.object instanceof BufferGeometry
          ? props.object
          : null;
      if (geometry) {
        if (!(parent instanceof Mesh)) throw new Error('Geometry without its rendered mesh');
        parent.geometry = geometry;
        owned.add(geometry);
      }
      visit(props.children as ReactNode, parent);
    });
  };
  visit(element, root);
  root.updateMatrixWorld(true);
  return root;
}
function named(root: Object3D, name: string): Object3D[] {
  const found: Object3D[] = [];
  root.traverse((node) => {
    if (node.name === name) found.push(node);
  });
  return found;
}
const bounds = (root: Object3D): Box3 => new Box3().setFromObject(root, true);
function meshCount(root: Object3D): number {
  let count = 0;
  root.traverse((node) => {
    if (node instanceof Mesh) count++;
  });
  return count;
}
const color = '#9f75ff';
const bottleneck: BottleneckData = {
  kind: 'bottleneck',
  label: 'Work queues',
  tokenCount: 6,
  feedAt: 0.3,
  queueAt: 1.2,
  openAt: 2.1,
  clearAt: 3.5,
};
const momentum: MomentumData = {
  kind: 'momentum',
  label: 'Build momentum',
  pushAt: 0.3,
  repeatAt: 1.1,
  engageAt: 2.1,
  coastAt: 3.6,
};
const leverage: LeverageData = {
  kind: 'leverage',
  label: 'Move the fulcrum',
  effortAt: 0.3,
  pivotAt: 1.2,
  liftAt: 2,
  holdAt: 3.2,
};
const switchyard: SwitchyardData = {
  kind: 'switchyard',
  label: 'Choose the route',
  route: 'left',
  leftLabel: 'Review',
  rightLabel: 'Publish',
  approachAt: 0.35,
  seatAt: 1.5,
  commitAt: 2.1,
  arriveAt: 3.7,
};

describe('semantic cargo: actual JSX and geometry', () => {
  it('renders a six-mesh taped carton with its unchanged flat support face', () => {
    const root = hierarchy(createElement(Parcel, { size: 0.24, color }));
    expect(meshCount(root)).toBe(6);
    for (const name of ['carton', 'lid-seam', 'packing-tape', 'shipping-label'])
      expect(named(root, name)).toHaveLength(1);
    expect(named(root, 'tape-end')).toHaveLength(2);
    const box = bounds(root);
    expect(box.min.y).toBeCloseTo(-0.12, 7);
    expect(box.max.y).toBeCloseTo(0.24 * 0.501, 7);
    expect(box.min.x).toBeCloseTo(-0.12, 7);
    expect(box.max.x).toBeCloseTo(0.12, 7);
    expect(box.getSize(new Vector3()).z).toBeLessThan(0.24);
  });

  it('renders a grooved cable winding between two reel cheeks, in three meshes', () => {
    const root = hierarchy(createElement(CableReel, { radius: 0.04, length: 0.14, color }));
    expect(meshCount(root)).toBe(3);
    expect(named(root, 'reel-cheek')).toHaveLength(2);
    const cable = named(root, 'wound-cable')[0] as Mesh;
    expect(cable.geometry.type).toBe('LatheGeometry');
    const radii = new Set(
      (cable.geometry as import('three').LatheGeometry).parameters.points.map((point) => point.x),
    );
    expect([...radii].sort()).toEqual([0, 0.76, 0.82]);
    const box = bounds(root);
    expect(box.min.x).toBeCloseTo(-0.07, 7);
    expect(box.max.x).toBeCloseTo(0.07, 7);
    expect(box.min.y).toBeCloseTo(-0.04, 7);
    expect(box.max.y).toBeCloseTo(0.04, 7);
  });

  it('keeps identifiable parcels and stable cargo identities in every conveyor caller', () => {
    for (const t of [4.5, 0, 2.8, 1.3, 4.5]) {
      clock.t = t;
      for (const [element, count, floor] of [
        [createElement(Conveyor, { at: 0.4 }), 3, 0.25],
        [createElement(BottleneckScene, { scene: bottleneck }), 6, -0.1],
        [createElement(MomentumScene, { scene: momentum }), 1, 0.25],
      ] as const) {
        const root = hierarchy(element);
        expect(named(root, 'parcel')).toHaveLength(count);
        for (let id = 0; id < count; id++) {
          const cargo = named(root, `cargo-${id}`)[0];
          expect(cargo).toBeDefined();
          expect(named(cargo, 'packing-tape')).toHaveLength(1);
          // Cargo's local support plane, before the enclosing system layout transform.
          expect(cargo.position.y - 0.5 * cargo.children[0].scale.y).toBeCloseTo(floor, 10);
        }
      }
    }
    const bridge = named(
      hierarchy(createElement(BottleneckScene, { scene: bottleneck })),
      'transfer-plate',
    )[0];
    expect(bounds(bridge).max.y).toBeCloseTo(-0.1, 7);
  });
});

describe('rail cart footprint, rolling and support', () => {
  it.each([
    'left',
    'right',
  ] as const)('retains the %s cart envelope and seats a real reel on its deck', (route) => {
    const C = RAIL_CARRIER_SIZE;
    for (const progress of [1, 0, 0.7, 0.45, 0.95]) {
      const root = hierarchy(
        createElement(RailCarrier, { color, wheelAngles: sampleRailWheelAngles(progress, route) }),
      );
      expect(meshCount(root)).toBe(20);
      expect(named(root, 'rail-cart')).toHaveLength(1);
      expect(named(root, 'flanged-wheel')).toHaveLength(4);
      expect(named(root, 'wheel-spokes')).toHaveLength(4);
      expect(named(root, 'cable-reel')).toHaveLength(1);
      const box = bounds(root);
      expect(box.min.x).toBeGreaterThanOrEqual(-C.halfWidth);
      expect(box.max.x).toBeLessThanOrEqual(C.halfWidth);
      expect(box.min.y).toBeGreaterThanOrEqual(-C.halfLength - 1e-7);
      expect(box.max.y).toBeCloseTo(C.halfLength, 7); // nose still reaches the receiver
      expect(box.max.z).toBeCloseTo(C.topZ, 7);
      expect(bounds(named(root, 'cable-reel')[0]).min.z).toBeCloseTo(C.deckTopZ, 7);
      expect(bounds(named(root, 'cart-deck')[0]).max.z).toBeCloseTo(C.deckTopZ, 7);

      for (const wheel of named(root, 'flanged-wheel') as Mesh[]) {
        expect(wheel.geometry.type).toBe('LatheGeometry');
        const center = wheel.getWorldPosition(new Vector3());
        expect(Math.abs(center.x)).toBeCloseTo(RAIL_HALF_GAUGE, 10);
        expect(Math.abs(center.y)).toBeCloseTo(C.wheelY, 10);
        expect(center.z + 0.15 - C.wheelRadius).toBeCloseTo(0.035, 10);
        // At the nearest inboard flange face the round rail head is lower than the flange.
        const railHead = Math.sqrt(0.035 ** 2 - C.flangeOuterZ ** 2);
        expect(center.z + 0.15 - C.flangeRadius).toBeGreaterThan(railHead);
        const profile = (wheel.geometry as import('three').LatheGeometry).parameters.points;
        expect(profile.some((p) => p.x === C.flangeRadius && p.y === C.flangeInnerZ)).toBe(true);
        expect(profile.some((p) => p.x === C.wheelRadius && p.y === C.wheelWidth / 2)).toBe(true);
      }
    }
  });

  it('rebuilds identical vertices and transforms after out-of-order scene seeks', () => {
    const signature = (t: number) => {
      clock.t = t;
      const root = hierarchy(createElement(SwitchyardScene, { scene: switchyard }));
      const result: { name: string; transform: number[]; vertices: number[] }[] = [];
      root.traverse((node) =>
        result.push({
          name: node.name,
          transform: [...node.matrixWorld.elements],
          vertices:
            node instanceof Mesh ? Array.from(node.geometry.getAttribute('position').array) : [],
        }),
      );
      return result;
    };
    const expected = signature(3.2);
    for (const t of [5, 0, 1.5]) signature(t);
    expect(signature(3.2)).toEqual(expected);
  });

  it('both hosts render carts with the sampled heading and stable identities, not cube tokens', () => {
    for (const route of ['left', 'right'] as const) {
      for (const t of [5, 0, 3, 1.5, 5]) {
        clock.t = t;
        const scene = { ...switchyard, route };
        const pose = sampleSwitchyard(t, scene);
        const root = hierarchy(createElement(SwitchyardScene, { scene }));
        expect(named(root, 'rail-cart')).toHaveLength(3);
        expect(named(root, 'cable-reel')).toHaveLength(3);
        for (const token of pose.tokens) {
          const carrier = named(root, `rail-car-${token.id}`)[0];
          expect(carrier.userData.jsxKey).toBe(String(token.id));
          expect(carrier.position.toArray()).toEqual([...token.position]);
          expect(carrier.rotation.z).toBe(token.heading);
          const spokes = named(carrier, 'wheel-spokes');
          for (const [index, spoke] of spokes.entries()) {
            expect(spoke.parent?.rotation.z).toBe(
              (index % 2 === 0 ? -1 : 1) * token.wheelAngles[index % 2],
            );
          }
        }
      }
      const progress = 0.76;
      const root = hierarchy(
        createElement(RailSwitchRig, { route, seat: 1, tokenProgress: progress }),
      );
      const carrier = named(root, 'rail-car-0')[0];
      expect(named(root, 'rail-cart')).toHaveLength(1);
      expect(named(root, 'cable-reel')).toHaveLength(1);
      expect(carrier.position.toArray()).toEqual([...sampleRailPoint(progress, route)]);
      expect(carrier.rotation.z).toBe(sampleRailHeading(progress, route));
      // Midpoints of each short axle-pair follow the same normal-offset rails as the track.
      const wheels = named(carrier, 'flanged-wheel');
      for (const side of [0, 1]) {
        const midpoint = wheels[side]
          .getWorldPosition(new Vector3())
          .add(wheels[side + 2].getWorldPosition(new Vector3()))
          .multiplyScalar(0.5);
        const rail = sampleRailTrackPoint(progress, route, (side === 0 ? -1 : 1) * RAIL_HALF_GAUGE);
        expect(midpoint.x).toBeCloseTo(rail[0], 10);
        expect(midpoint.y).toBeCloseTo(rail[1], 10);
      }
    }
  });
});

describe('mechanical contacts remain attached to their existing poses', () => {
  it('renders a lifting eye and a flat weight base, not a load cube', () => {
    const root = hierarchy(createElement(Counterweight, { width: 0.32, height: 0.32, color }));
    expect(meshCount(root)).toBe(2);
    expect((named(root, 'weight-body')[0] as Mesh).geometry.type).toBe('LatheGeometry');
    expect((named(root, 'lifting-eye')[0] as Mesh).geometry.type).toBe('TorusGeometry');
    expect(bounds(root).min.y).toBeCloseTo(-0.16, 7);
    expect(bounds(root).max.y).toBeCloseTo(0.16, 7);
    expect(
      bounds(hierarchy(createElement(PressureFoot, { width: 0.2, height: 0.2, color }))).min.y,
    ).toBeCloseTo(-0.1, 7);
    expect(bounds(hierarchy(createElement(PullRing, { radius: 0.085, color }))).max.y).toBeCloseTo(
      0,
      7,
    );
  });

  it('keeps both lever contacts on the rigid beam through fulcrum movement', () => {
    for (const [pivotX, angle] of [
      [0, -0.12],
      [0.55, -0.12],
      [0.55, 0.22],
    ]) {
      const root = hierarchy(createElement(LeverRig, { pivotX, angle }));
      const pose = leverPose(pivotX, angle);
      for (const [name, contact, height] of [
        ['cast-counterweight', pose.load, 0.32],
        ['pressure-foot', pose.effort, 0.2],
      ] as const) {
        const model = named(root, name)[0];
        const foot = model.localToWorld(new Vector3(0, -0.5, 0));
        expect(foot.x).toBeCloseTo(contact[0] - Math.sin(angle) * 0.06, 7);
        expect(foot.y).toBeCloseTo(contact[1] + Math.cos(angle) * 0.06, 7);
        expect(model.scale.y).toBe(height);
      }
    }
    expect(
      named(hierarchy(createElement(LeverageScene, { scene: leverage })), 'cast-counterweight'),
    ).toHaveLength(1);
  });

  it('meets both cable ends with eyes and retains the drive shoe contact/budget', () => {
    for (const travel of [0.72, 0, 0.35, 0.72]) {
      const root = hierarchy(createElement(PulleyRig, { travel }));
      expect(bounds(named(root, 'lifting-eye')[0]).max.y).toBeCloseTo(-0.95 + travel, 7);
      expect(bounds(named(root, 'cable-pull-ring')[0]).max.y).toBeCloseTo(-0.2 - travel, 7);
    }
    const shoe = hierarchy(createElement(DriveShoe, { color }));
    expect(meshCount(shoe)).toBe(3);
    expect(bounds(named(shoe, 'friction-pad')[0]).max.y).toBeCloseTo(0.5, 7);
    for (const push of [0, 0.5, 1]) {
      const root = hierarchy(createElement(FlywheelRig, { angle: 1.2, push }));
      expect(named(root, 'drive-shoe')).toHaveLength(1);
      expect(bounds(named(root, 'friction-pad')[0]).max.y).toBeCloseTo(-0.725, 7);
    }
  });
});
