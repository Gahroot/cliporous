import type React from 'react';
import { useEffect, useMemo } from 'react';
import { CylinderGeometry, ExtrudeGeometry, Shape, ShapeGeometry } from 'three';
import { Clay, lathe } from '../hero-kit';
import { CableReel } from '../hero-props/transport-models';
import {
  RAIL_CARRIER_LENGTH,
  RAIL_CARRIER_WIDTH,
  RAIL_HALF_GAUGE,
  RAIL_STOP_SIZE,
  RAIL_WHEEL_RADIUS,
  sampleRailPoint,
} from '../hero-props/transport-poses';
import { useStage } from '../stage';
import { Shaft } from './primitives';

export const RAIL_BED_SIZE = {
  halfWidth: 0.24,
  frontZ: -0.035,
  depth: 0.1,
  receiverExtension: 0.14,
  cornerRadius: 0.04,
  bevel: 0.004,
} as const;

/** Full local envelope includes wheels, hubs and contained bevels. Forward is +Y. */
export const RAIL_CARRIER_SIZE = {
  halfWidth: RAIL_CARRIER_WIDTH / 2,
  halfLength: RAIL_CARRIER_LENGTH / 2,
  bodyBottomZ: -0.04,
  bodyTopZ: 0.048,
  deckTopZ: 0.054,
  topZ: 0.134,
  reelRadius: 0.04,
  reelLength: 0.14,
  bodyBevel: 0.003,
  wheelRadius: RAIL_WHEEL_RADIUS,
  wheelX: RAIL_HALF_GAUGE,
  wheelY: 0.026,
  wheelZ: -0.077,
  wheelWidth: 0.024,
  flangeRadius: 0.042,
  // Inboard flange stays beside (not inside) the round rail head.
  flangeInnerZ: -0.024,
  flangeOuterZ: -0.02,
  axleRadius: 0.01,
  hubRadius: 0.028,
  hubDepth: 0.002,
} as const;

/** Boundary of the union of the incoming strip and two quadratic branch strips. */
function branchBedShape(): Shape {
  const B = RAIL_BED_SIZE;
  const [, entryY] = sampleRailPoint(0, 'right');
  const [tipX, tipY] = sampleRailPoint(1, 'right');
  const valleyB = Math.sqrt(B.halfWidth / tipX);
  const [, valleyY] = sampleRailPoint(0.45 + 0.55 * valleyB, 'right');
  const outerX = tipX + B.halfWidth;
  const innerX = tipX - B.halfWidth;
  const endY = tipY + B.receiverExtension;
  const r = B.cornerRadius;
  const shape = new Shape();
  shape.moveTo(-B.halfWidth + r, entryY);
  shape.lineTo(B.halfWidth - r, entryY);
  shape.quadraticCurveTo(B.halfWidth, entryY, B.halfWidth, entryY + r);
  shape.lineTo(B.halfWidth, 0);
  // Exactly x = 0.8*b² + halfWidth, y = 0.9*b; no spline overshoot.
  shape.quadraticCurveTo(B.halfWidth, tipY / 2, outerX, tipY);
  shape.lineTo(outerX, endY - r);
  shape.quadraticCurveTo(outerX, endY, outerX - r, endY);
  shape.lineTo(innerX + r, endY);
  shape.quadraticCurveTo(innerX, endY, innerX, endY - r);
  shape.lineTo(innerX, tipY);
  // Trim the two inner curves at their first meeting, not below it: a simple Y outline.
  const innerControlX = tipX * valleyB - B.halfWidth;
  const innerControlY = (tipY + valleyY) / 2;
  shape.quadraticCurveTo(innerControlX, innerControlY, 0, valleyY);
  shape.quadraticCurveTo(-innerControlX, innerControlY, -innerX, tipY);
  shape.lineTo(-innerX, endY - r);
  shape.quadraticCurveTo(-innerX, endY, -innerX - r, endY);
  shape.lineTo(-outerX + r, endY);
  shape.quadraticCurveTo(-outerX, endY, -outerX, endY - r);
  shape.lineTo(-outerX, tipY);
  shape.quadraticCurveTo(-B.halfWidth, tipY / 2, -B.halfWidth, 0);
  shape.lineTo(-B.halfWidth, entryY + r);
  shape.quadraticCurveTo(-B.halfWidth, entryY, -B.halfWidth + r, entryY);
  shape.closePath();
  return shape;
}

/** Foundation only; RailSwitchRig continues to own every rail, sleeper and switch tongue. */
export const RailBranchBed: React.FC = () => {
  const S = useStage();
  const geometry = useMemo(() => {
    const B = RAIL_BED_SIZE;
    const bed = new ExtrudeGeometry(branchBedShape(), {
      depth: B.depth - 2 * B.bevel,
      steps: 1,
      bevelEnabled: true,
      bevelSize: B.bevel,
      bevelOffset: -B.bevel,
      bevelThickness: B.bevel,
      bevelSegments: 2,
      curveSegments: 24,
    });
    // Inward bevels keep the outline within ±1.04; the front still seats at rail bottom.
    bed.translate(0, 0, B.frontZ - B.depth + B.bevel);
    return bed;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh>
      <primitive object={geometry} attach="geometry" dispose={null} />
      <Clay color={S.clay[0]} />
    </mesh>
  );
};

function trolleyShape(): Shape {
  const shape = new Shape();
  shape.moveTo(0, RAIL_CARRIER_SIZE.halfLength);
  shape.bezierCurveTo(0.036, RAIL_CARRIER_SIZE.halfLength, 0.112, 0.044, 0.116, 0.008);
  shape.bezierCurveTo(0.121, -0.042, 0.083, -0.064, 0, -0.064);
  shape.bezierCurveTo(-0.083, -0.064, -0.121, -0.042, -0.116, 0.008);
  shape.bezierCurveTo(
    -0.112,
    0.044,
    -0.036,
    RAIL_CARRIER_SIZE.halfLength,
    0,
    RAIL_CARRIER_SIZE.halfLength,
  );
  shape.closePath();
  return shape;
}

export interface RailCarrierProps {
  color: string;
  /** Per-rail rotation about +X: negative for forward, ordered local -X then +X. */
  wheelAngles: readonly [number, number];
}

/** Cable-reel rail cart: four flanged wheels, differential rolling, original footprint. 20 meshes. */
export const RailCarrier: React.FC<RailCarrierProps> = ({ color, wheelAngles }) => {
  const S = useStage();
  const C = RAIL_CARRIER_SIZE;
  const rolls = wheelAngles.map((angle) => (Number.isFinite(angle) ? angle : 0));
  const geometry = useMemo(() => {
    const hull = new ExtrudeGeometry(trolleyShape(), {
      depth: C.bodyTopZ - C.bodyBottomZ - 2 * C.bodyBevel,
      steps: 1,
      bevelEnabled: true,
      bevelSize: C.bodyBevel,
      bevelOffset: -C.bodyBevel,
      bevelThickness: C.bodyBevel,
      bevelSegments: 2,
      curveSegments: 16,
    });
    hull.translate(0, 0, C.bodyBottomZ + C.bodyBevel);
    const deckShape = new Shape();
    deckShape.absellipse(0, -0.004, 0.087, 0.036, 0, Math.PI * 2, false, 0);
    const deck = new ExtrudeGeometry(deckShape, {
      depth: C.deckTopZ - C.bodyTopZ,
      bevelEnabled: false,
      curveSegments: 16,
    });
    deck.translate(0, 0, C.bodyTopZ);
    const chassisShape = new Shape();
    chassisShape.absellipse(0, -0.001, 0.108, 0.041, 0, Math.PI * 2, false, 0);
    const axleTop = C.wheelZ + C.axleRadius;
    const chassis = new ExtrudeGeometry(chassisShape, {
      depth: C.bodyBottomZ - axleTop,
      bevelEnabled: false,
      curveSegments: 16,
    });
    chassis.translate(0, 0, axleTop);
    // One lathed wheel includes the inboard flange without another draw call.
    const tire = lathe(
      [
        [0, C.flangeInnerZ],
        [C.flangeRadius, C.flangeInnerZ],
        [C.flangeRadius, C.flangeOuterZ],
        [C.wheelRadius, C.flangeOuterZ],
        [C.wheelRadius, C.wheelWidth / 2],
        [0, C.wheelWidth / 2],
      ],
      32,
    );
    tire.rotateX(Math.PI / 2);
    const hub = new CylinderGeometry(C.hubRadius, C.hubRadius, C.hubDepth, 24);
    hub.rotateX(Math.PI / 2);
    // One four-spoke silhouette per wheel, rather than four separate spoke meshes.
    const cross = new Shape();
    const a = 0.004;
    const b = 0.024;
    cross.moveTo(-a, b);
    for (const [x, y] of [
      [a, b],
      [a, a],
      [b, a],
      [b, -a],
      [a, -a],
      [a, -b],
      [-a, -b],
      [-a, -a],
      [-b, -a],
      [-b, a],
      [-a, a],
    ])
      cross.lineTo(x, y);
    cross.closePath();
    return { hull, deck, chassis, tire, hub, spokes: new ShapeGeometry(cross) };
  }, []);
  useEffect(
    () => () => {
      for (const owned of Object.values(geometry)) owned.dispose();
    },
    [geometry],
  );
  return (
    <group name="rail-cart">
      <mesh name="cart-body">
        <primitive object={geometry.hull} attach="geometry" dispose={null} />
        <Clay color={color} />
      </mesh>
      <mesh name="cart-deck">
        <primitive object={geometry.deck} attach="geometry" dispose={null} />
        <Clay color={S.clay[0]} />
      </mesh>
      <mesh>
        <primitive object={geometry.chassis} attach="geometry" dispose={null} />
        <Clay color={S.clay[2]} />
      </mesh>
      <group position={[0, 0, C.deckTopZ + C.reelRadius]} rotation={[Math.PI / 2, 0, 0]}>
        <CableReel radius={C.reelRadius} length={C.reelLength} color={S.clay[0]} />
      </group>
      {[-C.wheelY, C.wheelY].map((y) => (
        <group key={y} position={[0, y, C.wheelZ]}>
          <group rotation={[0, Math.PI / 2, 0]}>
            <Shaft radius={C.axleRadius} length={2 * C.wheelX} color={S.clay[1]} />
          </group>
          {[-1, 1].map((side) => (
            <group
              key={side}
              position={[side * C.wheelX, 0, 0]}
              rotation={[0, (side * Math.PI) / 2, 0]}
            >
              {/* Outward local Z is ±X: flip the local spoke angle on the opposite face. */}
              <group rotation={[0, 0, side * rolls[side === -1 ? 0 : 1]]}>
                <mesh name="flanged-wheel">
                  <primitive object={geometry.tire} attach="geometry" dispose={null} />
                  <Clay color={S.text} />
                </mesh>
                <mesh position={[0, 0, (C.wheelWidth + C.hubDepth) / 2]}>
                  <primitive object={geometry.hub} attach="geometry" dispose={null} />
                  <Clay color={S.clay[1]} />
                </mesh>
                <mesh name="wheel-spokes" position={[0, 0, C.wheelWidth / 2 + C.hubDepth + 0.0005]}>
                  <primitive object={geometry.spokes} attach="geometry" dispose={null} />
                  <Clay color={S.accent2} />
                </mesh>
              </group>
            </group>
          ))}
        </group>
      ))}
    </group>
  );
};

export const RAIL_STOP_HARDWARE = {
  barWidth: RAIL_STOP_SIZE[0],
  barRadius: RAIL_STOP_SIZE[1] / 2,
  footBottomZ: RAIL_BED_SIZE.frontZ - 0.13,
  footRadius: 0.022,
  footHeight: 0.016,
  postX: 0.08,
  postY: -0.02,
  postRadius: 0.013,
  postTopZ: -0.028,
} as const;

/** Round buffer with two attached posts: nothing projects ahead of the y=-0.045 contact. */
export const RailStop: React.FC<{ color: string }> = ({ color }) => {
  const S = useStage();
  const H = RAIL_STOP_HARDWARE;
  const footTop = H.footBottomZ + H.footHeight;
  return (
    <group>
      <group rotation={[0, Math.PI / 2, 0]}>
        <Shaft radius={H.barRadius} length={H.barWidth} color={color} />
      </group>
      {[-H.postX, H.postX].map((x) => (
        <group key={x} position={[x, H.postY, 0]}>
          <group position={[0, 0, (footTop + H.postTopZ) / 2]}>
            <Shaft radius={H.postRadius} length={H.postTopZ - footTop} color={S.clay[2]} />
          </group>
          <group position={[0, 0, H.footBottomZ + H.footHeight / 2]}>
            <Shaft radius={H.footRadius} length={H.footHeight} color={S.clay[1]} />
          </group>
        </group>
      ))}
    </group>
  );
};
