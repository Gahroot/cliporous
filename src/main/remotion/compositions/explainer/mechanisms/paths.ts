export type Vec3 = readonly [number, number, number];

type PathSample = { position: Vec3; tangent: Vec3 };
type Segment = { from: Vec3; to: Vec3; length: number };

function assertPoint(point: unknown): asserts point is Vec3 {
  if (
    !Array.isArray(point) ||
    point.length !== 3 ||
    ![point[0], point[1], point[2]].every(Number.isFinite)
  ) {
    throw new RangeError('Authored points must contain exactly three finite coordinates');
  }
}

function assertPoints(points: readonly Vec3[], min: number, max: number): void {
  if (!Array.isArray(points) || points.length < min || points.length > max) {
    throw new RangeError(`Authored paths require ${min}..${max} points`);
  }
  for (const point of points) assertPoint(point);
}

function finite(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError('Path values must be finite');
  return value;
}

function progressAt(progress: number): number {
  return Math.max(0, Math.min(1, finite(progress)));
}

function distance(from: Vec3, to: Vec3): number {
  return finite(Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]));
}

function direction(from: Vec3, to: Vec3): Vec3 {
  const length = distance(from, to);
  return length === 0
    ? [1, 0, 0]
    : [(to[0] - from[0]) / length, (to[1] - from[1]) / length, (to[2] - from[2]) / length];
}

/** Linear interpolation; unlike path progress, u may extrapolate. */
export function lerpPoint(from: Vec3, to: Vec3, u: number): Vec3 {
  assertPoint(from);
  assertPoint(to);
  finite(u);
  if (u === 0) return from;
  if (u === 1) return to;
  if (from.every((coordinate, i) => coordinate === to[i])) return from;
  const point: Vec3 = [
    (1 - u) * from[0] + u * to[0],
    (1 - u) * from[1] + u * to[1],
    (1 - u) * from[2] + u * to[2],
  ];
  assertPoint(point);
  return point;
}

/** Cubic parameter sampling, clamped to [0, 1]; zero derivatives use +X. */
export function sampleBezier(
  points: readonly [Vec3, Vec3, Vec3, Vec3],
  progress: number,
): PathSample {
  assertPoints(points, 4, 4);
  const t = progressAt(progress);
  const [a, b, c, d] = points;
  const ab = lerpPoint(a, b, t);
  const bc = lerpPoint(b, c, t);
  const cd = lerpPoint(c, d, t);
  const left = lerpPoint(ab, bc, t);
  const right = lerpPoint(bc, cd, t);
  return { position: lerpPoint(left, right, t), tangent: direction(left, right) };
}

/** Arc-length sampling, clamped to [0, 1]; exact corners use the incoming tangent. */
export function samplePolyline(points: readonly Vec3[], progress: number): PathSample {
  assertPoints(points, 2, 64);
  const t = progressAt(progress);
  const first = points[0];
  assertPoint(first);
  const segments: Segment[] = [];
  let from = first;
  let total = 0;
  for (const to of points.slice(1)) {
    const length = distance(from, to);
    if (length > 0) segments.push({ from, to, length });
    total = finite(total + length);
    from = to;
  }
  const last = segments.at(-1);
  if (!last) return { position: first, tangent: [1, 0, 0] };
  const end: PathSample = { position: last.to, tangent: direction(last.from, last.to) };
  if (t === 1) return end;
  const target = t * total;
  let travelled = 0;
  for (const segment of segments) {
    if (target <= travelled + segment.length) {
      return {
        position: lerpPoint(segment.from, segment.to, (target - travelled) / segment.length),
        tangent: direction(segment.from, segment.to),
      };
    }
    travelled += segment.length;
  }
  return end;
}

/** +Y is up; lift is the nonnegative peak height above the straight-line path. */
export function transferPoint(from: Vec3, to: Vec3, progress: number, lift = 0): Vec3 {
  finite(lift);
  if (lift < 0) throw new RangeError('Transfer lift must be nonnegative');
  const t = progressAt(progress);
  const base = lerpPoint(from, to, t);
  if (t === 0 || t === 1 || lift === 0) return base;
  const point: Vec3 = [base[0], base[1] + lift * (4 * t * (1 - t)), base[2]];
  assertPoint(point);
  return point;
}
