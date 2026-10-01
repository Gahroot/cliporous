import type { CameraSpec } from '../three-helpers';

type Point = readonly [number, number];
export type RencenSolid = Readonly<{
  id: string;
  x: number;
  z: number;
  bottom: number;
  height: number;
  radius: number;
  sides: number;
  rotation: number;
  floors: number;
  role: 'hotel' | 'office' | 'east' | 'core';
  half?: boolean;
}>;

/** Authored existing seven-tower complex, not the proposed redevelopment or a survey model. */
export const RENCEN_TOWERS = [
  {
    id: 'central',
    role: 'hotel',
    x: 0,
    z: 0,
    radius: 0.54,
    height: 4.2,
    sides: 48,
    rotation: 0,
    floors: 24,
    bottom: 0.12,
  },
  {
    id: 'north-west',
    role: 'office',
    x: -0.94,
    z: -0.94,
    radius: 0.72,
    height: 3.02,
    sides: 8,
    rotation: Math.PI / 8,
    floors: 20,
    bottom: 0.12,
  },
  {
    id: 'north-east',
    role: 'office',
    x: 0.94,
    z: -0.94,
    radius: 0.72,
    height: 3.02,
    sides: 8,
    rotation: Math.PI / 8,
    floors: 20,
    bottom: 0.12,
  },
  {
    id: 'south-west',
    role: 'office',
    x: -0.94,
    z: 0.94,
    radius: 0.72,
    height: 3.02,
    sides: 8,
    rotation: Math.PI / 8,
    floors: 20,
    bottom: 0.12,
  },
  {
    id: 'south-east',
    role: 'office',
    x: 0.94,
    z: 0.94,
    radius: 0.72,
    height: 3.02,
    sides: 8,
    rotation: Math.PI / 8,
    floors: 20,
    bottom: 0.12,
  },
  {
    id: 'east-one',
    role: 'east',
    x: 2.42,
    z: -0.14,
    radius: 0.65,
    height: 1.72,
    sides: 4,
    rotation: Math.PI / 4,
    floors: 12,
    bottom: 0.12,
  },
  {
    id: 'east-two',
    role: 'east',
    x: 3.58,
    z: -0.14,
    radius: 0.65,
    height: 1.72,
    sides: 4,
    rotation: Math.PI / 4,
    floors: 12,
    bottom: 0.12,
  },
] as const satisfies readonly RencenSolid[];

/** Circulation cores are attached architectural parts, not extra landmark towers. */
export const RENCEN_CORES: readonly RencenSolid[] = RENCEN_TOWERS.filter(
  (tower) => tower.role !== 'east',
).map((tower) => ({
  id: `${tower.id}-circulation`,
  role: 'core',
  x: tower.x + (tower.role === 'hotel' ? 0.48 : Math.sign(tower.x) * 0.7),
  z: tower.z + (tower.role === 'hotel' ? -0.28 : Math.sign(tower.z) * 0.24),
  bottom: 0.12,
  height: tower.height + 0.06,
  radius: tower.role === 'hotel' ? 0.095 : 0.13,
  sides: 16,
  rotation: 0,
  floors: 12,
}));

export const RENCEN_CAMERA: CameraSpec = { position: [3.3, 3.2, 10.6], fov: 48 };

export function rencenOutline(solid: RencenSolid): readonly Point[] {
  return Array.from({ length: solid.sides + (solid.half ? 1 : 0) }, (_, i) => {
    const angle = solid.half
      ? -Math.PI / 2 + (i / solid.sides) * Math.PI
      : (i / solid.sides) * Math.PI * 2 + solid.rotation;
    return [Math.sin(angle) * solid.radius, Math.cos(angle) * solid.radius] as const;
  });
}

/** Same fixed view direction as the clay camera; the vector drawing needs no canvas. */
export function projectRencen(x: number, y: number, z: number): Point {
  return [380 + 96 * (0.955 * x - 0.297 * z), 366 + 82 * (0.081 * x + 0.262 * z - 0.962 * y)];
}

export function rencenVisibleFaces(solid: RencenSolid): readonly (readonly [Point, Point])[] {
  const outline = rencenOutline(solid);
  return outline.flatMap((a, i) => {
    const b = outline[(i + 1) % outline.length];
    if (!b || (a[0] + b[0]) * 0.297 + (a[1] + b[1]) * 0.955 <= 0) return [];
    return [[a, b] as const];
  });
}

export type RencenFacade = Readonly<{ positions: Float32Array; normals: Float32Array }>;

/** One bounded mesh per facade, never a mesh per window or floor. R3F owns/disposes buffers. */
export function buildRencenFacade(solid: RencenSolid): RencenFacade {
  const positions: number[] = [];
  const normals: number[] = [];
  const outline = rencenOutline(solid);
  for (const [index, a] of outline.entries()) {
    const b = outline[(index + 1) % outline.length];
    if (!b) continue;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    const nx = -dz / length;
    const nz = dx / length;
    const point = (along: number, y: number): readonly number[] => [
      a[0] + dx * along + nx * 0.003,
      y,
      a[1] + dz * along + nz * 0.003,
    ];
    const quad = (left: number, right: number, bottom: number, top: number): void => {
      const corners = [
        point(left, bottom),
        point(right, bottom),
        point(right, top),
        point(left, top),
      ];
      for (const n of [0, 1, 2, 0, 2, 3]) {
        const p = corners[n];
        if (p) positions.push(...p);
        normals.push(nx, 0, nz);
      }
    };
    for (let floor = 1; floor < solid.floors; floor++) {
      const y = (solid.height * floor) / solid.floors;
      quad(0, 1, y, y + 0.01);
    }
    // Fine vertical divisions, not the old five thick barrel rings.
    const divisions = solid.sides <= 8 ? 4 : 1;
    for (let division = 0; division < divisions; division++) {
      const at = division / divisions;
      quad(at, Math.min(1, at + 0.006 / length), 0, solid.height);
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals) };
}

/** Face normals preserve the offices' flat planes; cylinder smoothing would round them away. */
export function buildRencenPrism(solid: RencenSolid): RencenFacade {
  const positions: number[] = [];
  const normals: number[] = [];
  const outline = rencenOutline(solid);
  for (const [index, a] of outline.entries()) {
    const b = outline[(index + 1) % outline.length];
    if (!b) continue;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = (a[1] - b[1]) / length;
    const nz = (b[0] - a[0]) / length;
    for (const [p, y] of [
      [a, 0],
      [b, 0],
      [b, solid.height],
      [a, 0],
      [b, solid.height],
      [a, solid.height],
    ] as const) {
      positions.push(p[0], y, p[1]);
      normals.push(nx, 0, nz);
    }
    for (const p of [[0, 0], a, b] as const) {
      positions.push(p[0], solid.height, p[1]);
      normals.push(0, 1, 0);
    }
    for (const p of [[0, 0], b, a] as const) {
      positions.push(p[0], 0, p[1]);
      normals.push(0, -1, 0);
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals) };
}

/** Finite authored asset data, not a growing geometry cache or scene state. */
export const RENCEN_PARTS = [...RENCEN_TOWERS, ...RENCEN_CORES].map((solid) => ({
  solid,
  facade: buildRencenFacade(solid),
  surface: solid.sides <= 8 ? buildRencenPrism(solid) : null,
}));
