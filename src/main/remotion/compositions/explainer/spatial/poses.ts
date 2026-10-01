import type { SpatialScene } from './types';

/** React-free, scene-relative samples. No history, simulation, or advancing clock. */
export type SpatialPoint = [number, number, number];
export const ACCESS_KEY_SOCKET: SpatialPoint = [-0.39, -0.56, 0.82];
export const FURNITURE_RADIUS = 1.13;

export type SpatialPose =
  | {
      kind: 'house-cutaway';
      roofLift: number;
      frontOpen: number;
      utilityReveal: number;
    }
  | {
      kind: 'house-build';
      build: number;
      partitionOffset: number;
      roofLift: number;
      frontOpen: number;
      planReveal: number;
    }
  | {
      kind: 'house-renovation';
      finish: number;
      frontOpen: number;
      roofLift: number;
      roller: SpatialPoint;
      rollerTurn: number;
      oldBeam: SpatialPoint;
      newBeam: SpatialPoint;
      replacementVisible: boolean;
    }
  | {
      kind: 'property-access';
      key: SpatialPoint;
      keyTurn: number;
      allowedOpen: number;
      restrictedOpen: number;
      revoked: number;
    }
  | {
      kind: 'neighborhood';
      houseScale: number;
      copies: number[];
      park: number;
      street: number;
    }
  | {
      kind: 'floorplan-fit';
      furniture: { position: SpatialPoint; yaw: number }[];
    }
  | {
      kind: 'house-options';
      separation: number;
      leftOpen: number;
      rightOpen: number;
      leftRoof: number;
      rightRoof: number;
    }
  | {
      kind: 'property-lifecycle';
      doorOpen: number;
      outgoing: SpatialPoint;
      incoming: SpatialPoint;
      serviceOpen: number;
      wrenchTurn: number;
      wrench: SpatialPoint;
      income: SpatialPoint;
      expense: SpatialPoint;
    };

export function bounded(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : value === Infinity ? 1 : 0;
}

function phase(t: number, start: number, end: number): number {
  const p = bounded((t - start) / Math.max(0.0001, end - start));
  return p * p * (3 - 2 * p);
}

function mix(a: number, b: number, p: number): number {
  // Preserve exact authored contact/endpoints, not a rounded approximation.
  return p <= 0 ? a : p >= 1 ? b : a + (b - a) * p;
}

function point(a: SpatialPoint, b: SpatialPoint, p: number): SpatialPoint {
  return [mix(a[0], b[0], p), mix(a[1], b[1], p), mix(a[2], b[2], p)];
}

export function spatialPose<T extends SpatialScene>(
  scene: T,
  time: number,
): Extract<SpatialPose, { kind: T['kind'] }>;
export function spatialPose(scene: SpatialScene, time: number): SpatialPose {
  const { setupAt: s, actionAt: a, responseAt: r, checkAt: c, resolveAt: e } = scene;
  // Parser owns absolute timestamps. The render pipeline rebases all five beats;
  // this function deliberately does not subtract setupAt a second time.
  const t = Math.max(s, Math.min(e, Number.isNaN(time) ? s : time));
  const action = phase(t, a, r);
  const response = phase(t, r, c);
  const check = phase(t, c, e);

  switch (scene.kind) {
    case 'house-cutaway':
      return {
        kind: scene.kind,
        roofLift: action,
        frontOpen: phase(t, a + (r - a) * 0.35, c),
        utilityReveal: scene.preset === 'utilities' ? phase(t, r, e) : 0,
      };
    case 'house-build': {
      const mismatch = scene.preset === 'plan-mismatch';
      return {
        kind: scene.kind,
        build: (phase(t, s, a) + action + response) / 3,
        partitionOffset: mismatch ? response * 0.62 : 0,
        roofLift: mismatch ? check * 0.75 : 0,
        frontOpen: mismatch ? check : 0,
        planReveal: phase(t, s, a),
      };
    }
    case 'house-renovation': {
      const structural = scene.preset === 'structural';
      const withdraw = phase(t, r, r + (c - r) * 0.48);
      const install = phase(t, r + (c - r) * 0.52, e);
      return {
        kind: scene.kind,
        finish: structural ? 0 : response,
        frontOpen: structural ? action : 0,
        roofLift: structural ? action : 0,
        roller: [mix(-1.15, 1.15, response), -0.28 + Math.sin(response * Math.PI * 2) * 0.28, 1.4],
        rollerTurn: response * Math.PI * 2,
        // Beam travels laterally through the opened shell; the replacement waits
        // until the old beam is clear. Removed beam remains on an inspection rest.
        oldBeam: [-3.45 * withdraw, 0.28 - 1.25 * check, 0],
        newBeam: [3.45 * (1 - install), 0.28, 0],
        replacementVisible: structural && t >= r,
      };
    }
    case 'property-access': {
      const revoked = scene.preset === 'revoked-key';
      const turnEnd = r + (c - r) * 0.3;
      const withdrawEnd = r + (c - r) * 0.66;
      const retreat = phase(t, turnEnd, withdrawEnd);
      const approach = point([-0.39, -0.56, 2.15], ACCESS_KEY_SOCKET, action);
      return {
        kind: scene.kind,
        key: point(approach, [-0.39, -0.56, 1.95], retreat),
        keyTurn: revoked ? 0 : phase(t, r, turnEnd) * Math.PI * 0.5,
        allowedOpen: revoked ? 0 : phase(t, withdrawEnd, c),
        restrictedOpen: 0,
        revoked: revoked ? phase(t, r, e) : 0,
      };
    }
    case 'neighborhood':
      return scene.preset === 'replicate'
        ? {
            kind: scene.kind,
            houseScale: mix(0.86, 0.58, action),
            copies: [phase(t, r, c), phase(t, c, e)],
            park: 0,
            street: 1,
          }
        : {
            kind: scene.kind,
            houseScale: 0.7,
            copies: [0, 0],
            park: 1 - response,
            street: response,
          };
    case 'floorplan-fit': {
      const count = Math.max(2, Math.min(3, scene.items.length));
      const rearrange = scene.preset === 'rearrange';
      const turn = rearrange ? phase(t, a, e) * Math.PI * 0.5 : 0;
      return {
        kind: scene.kind,
        furniture: Array.from({ length: count }, (_, i) => {
          const angle = -Math.PI / 6 + (i * Math.PI * 2) / count + turn;
          const lower = phase(t, a + (i * (r - a)) / 4, c + (i * (e - c)) / 4);
          return {
            position: [
              Math.cos(angle) * FURNITURE_RADIUS,
              -1.16 + (rearrange ? 0 : 1.85 * (1 - lower)),
              Math.sin(angle) * FURNITURE_RADIUS,
            ],
            yaw: -angle + Math.PI / 2,
          };
        }),
      };
    }
    case 'house-options': {
      const tradeoff = scene.preset === 'tradeoff';
      return {
        kind: scene.kind,
        separation: mix(1.28, 1.88, action),
        // Both alternatives remain on equal-size plinths; neither is crowned.
        leftOpen: tradeoff ? response : 0,
        rightOpen: tradeoff ? check : 0,
        leftRoof: tradeoff ? response * 0.7 : 0,
        rightRoof: tradeoff ? check * 0.7 : 0,
      };
    }
    case 'property-lifecycle': {
      const occupancy = scene.preset === 'occupancy';
      const maintenance = scene.preset === 'maintenance';
      const earlyExit = phase(t, a, a + (r - a) * 0.5);
      const outgoing = point(
        [0, -1.16, mix(0.72, 2.02, earlyExit)],
        [-2.08, -1.16, 2.02],
        phase(t, a + (r - a) * 0.5, r),
      );
      const incoming = point(
        [mix(2.08, 0, response), -1.16, 2.02],
        [0, -1.16, 0.72],
        phase(t, c, c + (e - c) * 0.72),
      );
      return {
        kind: scene.kind,
        doorOpen: occupancy ? phase(t, s, a) * (1 - phase(t, c + (e - c) * 0.78, e)) : 0,
        outgoing,
        incoming,
        serviceOpen: maintenance ? action * (1 - check) : 0,
        wrenchTurn: maintenance ? Math.sin(response * Math.PI) * 0.8 : 0,
        wrench: [1.89 + 0.8 * (1 - action + check), -0.4, 0.56],
        income: [mix(-3, -1.4, action), -0.85, 1.65],
        expense: [mix(1.4, 3, phase(t, c, e)), -0.85, 1.65],
      };
    }
  }
}
