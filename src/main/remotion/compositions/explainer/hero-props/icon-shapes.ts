/** Project-authored filled silhouettes. No SVG parser, URLs, fonts or downloaded assets. */
import { Path, Shape } from 'three';
import { roundedRectShape } from '../hero-kit';

export const ICON_PROPS = [
  'shield',
  'cloud',
  'checkmark',
  'warning',
  'lightning',
  'chat',
  'crown',
  'diamond',
  'bookmark',
  'compass',
  'link',
  'graduation-cap',
] as const;
export type IconProp = (typeof ICON_PROPS)[number];

function polygon(points: readonly [number, number][]): Shape {
  const s = new Shape();
  points.forEach(([x, y], i) => {
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  });
  s.closePath();
  return s;
}

function disc(x: number, y: number, r: number): Shape {
  const s = new Shape();
  s.absarc(x, y, r, 0, Math.PI * 2, false);
  return s;
}

function rect(x: number, y: number, w: number, h: number, r = 0.06): Shape {
  const s = roundedRectShape(w, h, r);
  return polygon(s.getPoints(6).map((p) => [p.x + x, p.y + y]));
}

function check(scale = 1): Shape {
  return polygon(
    [
      [-0.9, 0],
      [-0.58, 0.3],
      [-0.18, -0.13],
      [0.63, 0.75],
      [0.95, 0.47],
      [-0.17, -0.75],
    ].map(([x = 0, y = 0]) => [x * scale, y * scale]),
  );
}

function linkRing(x: number, y: number): Shape {
  const s = new Shape();
  s.absellipse(x, y, 0.66, 0.4, 0, Math.PI * 2, false, Math.PI / 4);
  const hole = new Path();
  hole.absellipse(x, y, 0.42, 0.18, 0, Math.PI * 2, true, Math.PI / 4);
  s.holes.push(hole);
  return s;
}

export interface IconShapes {
  body: Shape[];
  detail: Shape[];
}

/** Fresh Shapes per mounted prop; the declarative R3F geometries own their GPU lifetime. */
export function createIconShapes(prop: IconProp): IconShapes {
  switch (prop) {
    case 'shield': {
      const s = new Shape();
      s.moveTo(0, 1);
      s.quadraticCurveTo(0.5, 0.7, 0.9, 0.65);
      s.lineTo(0.82, -0.15);
      s.quadraticCurveTo(0.7, -0.72, 0, -1);
      s.quadraticCurveTo(-0.7, -0.72, -0.82, -0.15);
      s.lineTo(-0.9, 0.65);
      s.quadraticCurveTo(-0.5, 0.7, 0, 1);
      return { body: [s], detail: [check(0.52)] };
    }
    case 'cloud': {
      const s = new Shape();
      s.moveTo(-0.7, -0.55);
      s.bezierCurveTo(-1.35, -0.55, -1.25, 0.42, -0.62, 0.38);
      s.bezierCurveTo(-0.65, 1.25, 0.62, 1.2, 0.72, 0.48);
      s.bezierCurveTo(1.4, 0.55, 1.38, -0.55, 0.7, -0.55);
      s.closePath();
      return {
        body: [s],
        detail: [
          polygon([
            [-0.12, -0.38],
            [0.12, -0.38],
            [0.12, 0.17],
            [0.4, 0.17],
            [0, 0.59],
            [-0.4, 0.17],
            [-0.12, 0.17],
          ]),
        ],
      };
    }
    case 'checkmark':
      return { body: [check()], detail: [] };
    case 'warning':
      return {
        body: [
          polygon([
            [0, 1],
            [-1, -0.8],
            [1, -0.8],
          ]),
        ],
        detail: [rect(0, 0.12, 0.18, 0.65), disc(0, -0.43, 0.11)],
      };
    case 'lightning':
      return {
        body: [
          polygon([
            [0.18, 1.1],
            [-0.88, -0.1],
            [-0.16, -0.1],
            [-0.38, -1.1],
            [0.9, 0.32],
            [0.15, 0.32],
          ]),
        ],
        detail: [],
      };
    case 'chat': {
      const s = new Shape();
      s.moveTo(-0.9, -0.5);
      s.lineTo(-0.9, 0.48);
      s.quadraticCurveTo(-0.9, 0.7, -0.68, 0.7);
      s.lineTo(0.68, 0.7);
      s.quadraticCurveTo(0.9, 0.7, 0.9, 0.48);
      s.lineTo(0.9, -0.34);
      s.quadraticCurveTo(0.9, -0.56, 0.68, -0.56);
      s.lineTo(-0.22, -0.56);
      s.lineTo(-0.68, -0.94);
      s.lineTo(-0.65, -0.56);
      s.closePath();
      return { body: [s], detail: [-0.42, 0, 0.42].map((x) => disc(x, 0.08, 0.105)) };
    }
    case 'crown':
      return {
        body: [
          polygon([
            [-0.88, 0.75],
            [-0.48, 0.15],
            [0, 0.95],
            [0.48, 0.15],
            [0.88, 0.75],
            [0.64, -0.65],
            [-0.64, -0.65],
          ]),
        ],
        detail: [rect(0, -0.39, 1.12, 0.14), disc(0, 0.07, 0.12)],
      };
    case 'diamond':
      return {
        body: [
          polygon([
            [-0.65, 0.7],
            [0.65, 0.7],
            [1, 0.22],
            [0, -1],
            [-1, 0.22],
          ]),
        ],
        detail: [
          polygon([
            [-0.5, 0.64],
            [0, 0.28],
            [-0.14, -0.63],
            [-0.82, 0.22],
          ]),
          polygon([
            [0.08, 0.26],
            [0.53, 0.63],
            [0.84, 0.22],
            [0.06, -0.74],
          ]),
        ],
      };
    case 'bookmark':
      return {
        body: [
          polygon([
            [-0.66, 0.94],
            [0.66, 0.94],
            [0.66, -0.96],
            [0, -0.55],
            [-0.66, -0.96],
          ]),
        ],
        detail: [rect(0, 0.48, 0.76, 0.1), rect(0, 0.16, 0.76, 0.1)],
      };
    case 'compass': {
      const ring = disc(0, 0, 0.92);
      const hole = new Path();
      hole.absarc(0, 0, 0.67, 0, Math.PI * 2, true);
      ring.holes.push(hole);
      return {
        body: [ring],
        detail: [
          polygon([
            [0, 0.69],
            [-0.22, -0.08],
            [0, -0.68],
            [0.22, 0.08],
          ]),
        ],
      };
    }
    case 'link':
      return { body: [linkRing(-0.36, -0.34)], detail: [linkRing(0.36, 0.34)] };
    case 'graduation-cap':
      return {
        body: [
          polygon([
            [-0.62, 0.03],
            [0.62, 0.03],
            [0.62, -0.56],
            [0, -0.78],
            [-0.62, -0.56],
          ]),
          polygon([
            [-1.08, 0.38],
            [0, 0.92],
            [1.08, 0.38],
            [0, -0.17],
          ]),
        ],
        detail: [rect(0.82, -0.18, 0.07, 0.94, 0.025), disc(0.82, -0.7, 0.09)],
      };
  }
}
