import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement, Fragment, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Box3, BufferGeometry, CylinderGeometry, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExpansionKitPose, ExpansionKitState } from '../scene-types';
import { EXPANSION_LIMITS, type ExpansionDerivation } from '../value-types';
import type { KitAssetProps } from './geometry';
import {
  CorrespondenceClay,
  CorrespondenceDiagram,
  type CorrespondenceRepresentationProps,
  correspondenceLayout,
  ExactTilesClay,
  ExactTilesDiagram,
  MatrixClay,
  MatrixDiagram,
  type MatrixRepresentationProps,
  matrixDimensions,
  matrixLayout,
  type PlanarPoint,
  REPRESENTATION_ASSET_BUDGETS,
  type ReferenceTemplate,
  type RepresentationItem,
  type RepresentationValue,
  representationValueText,
  tileLayout,
  VectorProjectionClay,
  VectorProjectionDiagram,
  type VectorProjectionProps,
  vectorProjection,
} from './representations';

// CPU-only expansion of the ACTUAL ClayBlock/Clay, including attached RoundedBoxGeometry.
// Hook shims only: no one-mesh component stubs, renderer, WebGL or measured GPU/RSS claim.
const allocated = vi.hoisted(() => new Set<{ dispose(): void }>());
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => unknown) => {
    const value = factory();
    if (
      value &&
      typeof value === 'object' &&
      'dispose' in value &&
      typeof value.dispose === 'function'
    )
      allocated.add(value as { dispose(): void });
    return value;
  },
  useEffect: () => undefined,
}));
afterEach(() => {
  for (const geometry of allocated) geometry.dispose();
  allocated.clear();
});

const pose = (p: number): ExpansionKitPose => ({
  reveal: p,
  action: p,
  response: p,
  check: p,
  resolve: p,
});
const seeks = [1, 0, 0.75, 0.25, 1, 0.5, 0, 0.25] as const;
const states: readonly ExpansionKitState[] = [
  'retained',
  'active',
  'excluded',
  'unknown',
  'disputed',
];
const known = (numerator: number, denominator = 1): RepresentationValue => ({
  state: 'known',
  value: { numerator, denominator },
});
const derived: RepresentationValue = {
  state: 'derived',
  operation: 'matrix-product',
  value: { numerator: -3, denominator: 7 },
};
const values: readonly RepresentationValue[] = [
  known(-1, 3),
  { state: 'unknown' },
  { state: 'missing' },
  derived,
];
const base: KitAssetProps = {
  pose: pose(1),
  state: 'retained',
  position: [0, 0, 0],
  label: 'Representation',
  qualifier: { kind: 'schematic', text: 'Illustrative normalized layout' },
  colors: { surface: '#f6ecd9', text: '#23100c', accent: '#9f75ff', muted: '#766e64' },
};
const items = (n: number, prefix = 'item'): readonly RepresentationItem[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefix}-${String(i).padStart(2, '0')}`,
    label: `Record ${i}`,
    state: states[i % states.length],
    value: values[i % values.length],
  }));
const matrix = (r: number, c: number): MatrixRepresentationProps => {
  const cells = items(r * c, 'cell');
  return {
    ...base,
    rows: Array.from({ length: r }, (_, i) => cells.slice(i * c, (i + 1) * c)),
    rowLabels: Array.from({ length: r }, (_, i) => `Row ${i}`),
    columnLabels: Array.from({ length: c }, (_, i) => `Column ${i}`),
  };
};
const vector: VectorProjectionProps = {
  ...base,
  vector: { id: 'signed-vector', label: 'Direction', x: known(-3), y: known(2) },
  reference: 'negative-x',
  basisLabels: ['reference', 'orthogonal'],
  projectionLabel: 'Projection',
};
const correspondence: CorrespondenceRepresentationProps = {
  ...base,
  from: items(12, 'input'),
  to: items(12, 'output'),
  links: Array.from({ length: 16 }, (_, i) => ({
    id: `link-${String(i).padStart(2, '0')}`,
    label: `Maps ${i}`,
    fromId: `input-${String(i % 12).padStart(2, '0')}`,
    toId: `output-${String((i + Math.floor(i / 12)) % 12).padStart(2, '0')}`,
  })),
};
type Props = Record<string, unknown>;
interface Host {
  readonly type: string;
  readonly props: Props;
  readonly world: Matrix4;
}
function expanded(node: unknown, parent = new Matrix4()): Host[] {
  if (Array.isArray(node)) return node.flatMap((child) => expanded(child, parent));
  if (!isValidElement<Props>(node)) return [];
  if (node.type === Fragment) return expanded(node.props.children, parent);
  if (typeof node.type === 'function')
    return expanded(Reflect.apply(node.type, undefined, [node.props]), parent);
  if (typeof node.type !== 'string') throw new Error('Unsupported JSX accounting component');
  if (['primitive', 'instancedMesh', 'skinnedMesh', 'canvas', 'Canvas'].includes(node.type))
    throw new Error(`Unaccounted object: ${node.type}`);
  const at = node.props.position as number[] | undefined,
    rotation = node.props.rotation as number[] | undefined;
  const scale = node.props.scale as number | number[] | undefined;
  const world = parent
    .clone()
    .multiply(
      new Matrix4().compose(
        new Vector3(...(at ?? [0, 0, 0])),
        new Quaternion().setFromEuler(
          new Euler(rotation?.[0] ?? 0, rotation?.[1] ?? 0, rotation?.[2] ?? 0),
        ),
        typeof scale === 'number'
          ? new Vector3(scale, scale, scale)
          : new Vector3(...(scale ?? [1, 1, 1])),
      ),
    );
  return [{ type: node.type, props: node.props, world }, ...expanded(node.props.children, world)];
}
const svgTypes = new Set(['g', 'text', 'rect', 'line', 'path']);
function svgCount(node: unknown): number {
  const hosts = expanded(node);
  for (const host of hosts) expect(svgTypes.has(host.type), host.type).toBe(true);
  return hosts.length;
}
function meshCount(node: unknown): number {
  return expanded(node).filter((host) => host.type === 'mesh').length;
}
function ids(node: unknown, clay = false): string[] {
  return expanded(node)
    .flatMap((host) => {
      const value = clay ? host.props.name : host.props['data-entity-id'];
      return typeof value === 'string' &&
        !['exact-tiles', 'matrix', 'correspondence'].includes(value)
        ? [value]
        : [];
    })
    .sort();
}
function geometryBounds(node: unknown): Box3 {
  const bounds = new Box3();
  for (const host of expanded(node).filter((h) => h.type === 'mesh')) {
    let geometry = host.props.geometry;
    const own = !(geometry instanceof BufferGeometry);
    if (own) {
      const geometries = expanded(host.props.children).filter((h) => h.type.endsWith('Geometry'));
      expect(geometries).toHaveLength(1);
      expect(geometries[0].type).toBe('cylinderGeometry');
      geometry = new CylinderGeometry(
        ...(geometries[0].props.args as ConstructorParameters<typeof CylinderGeometry>),
      );
    }
    if (!(geometry instanceof BufferGeometry))
      throw new Error('Unaccounted attached mesh geometry');
    geometry.computeBoundingBox();
    if (!geometry.boundingBox) throw new Error('Missing geometry bounds');
    bounds.union(geometry.boundingBox.clone().applyMatrix4(host.world));
    if (own) geometry.dispose();
  }
  expect([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)).toBe(true);
  return bounds;
}
function html(node: Parameters<typeof renderToStaticMarkup>[0]): string {
  const markup = renderToStaticMarkup(createElement('svg', {}, node));
  expect(markup).not.toMatch(/<(?:canvas|Canvas|mesh|group|foreignObject)\b|NaN|Infinity/);
  return markup;
}
function close(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((v, i) => {
    expect(v).toBeCloseTo(expected[i], 10);
  });
}
function endpoint(path: unknown): PlanarPoint {
  const match = /^M0 0 L([^ ]+) ([^ ]+)/.exec(String(path));
  if (!match) throw new Error('Missing authored arrow endpoint');
  return [Number(match[1]), Number(match[2])];
}
const referenceCases: readonly [ReferenceTemplate, PlanarPoint][] = [
  ['x', [1, 0]],
  ['negative-x', [-1, 0]],
  ['y', [0, 1]],
  ['negative-y', [0, -1]],
  ['diagonal', [Math.SQRT1_2, Math.SQRT1_2]],
  ['negative-diagonal', [-Math.SQRT1_2, -Math.SQRT1_2]],
];

describe('representation contracts and exact planar values', () => {
  it('caps reduced signed rationals and preserves unknown/missing/derived without invented zero or evaluation', () => {
    expect(values.map(representationValueText)).toEqual([
      '-1/3',
      'unknown',
      'missing',
      'derived: -3/7',
    ]);
    expect(representationValueText(known(0))).toBe('0');
    expect(representationValueText(known(-1_000_000_000, 999_999_999))).toBe(
      '-1000000000/999999999',
    );
    expect(representationValueText(known(999_999_999, 1_000_000_000))).toBe('999999999/1000000000');
    for (const [n, d] of [
      [2, 4],
      [0, 2],
      [1, 0],
      [1, -1],
      [0.5, 1],
      [1, 0.5],
      [1e9 + 1, 1],
      [1, 1e9 + 1],
      [NaN, 1],
      [1, Infinity],
    ])
      expect(() => representationValueText(known(n, d))).toThrow(RangeError);
    expect(() =>
      representationValueText({ ...derived, operation: 'evaluate' as ExpansionDerivation }),
    ).toThrow(RangeError);
    expect(() =>
      representationValueText({ state: 'simulated' } as unknown as RepresentationValue),
    ).toThrow(RangeError);
    const supplied = {
      ...matrix(1, 2),
      rows: [
        [
          { ...items(1)[0], value: derived },
          { ...items(1, 'second')[0], value: known(97, 101) },
        ],
      ],
    };
    const markup = html(createElement(MatrixDiagram, supplied));
    expect(markup).toContain('derived: -3/7');
    expect(markup).toContain('97/101');
    expect(markup).not.toContain('0.960');
    expect(supplied.rows[0][0].value).toEqual(derived);
  });
  it('bounds records/labels/IDs and gives order-independent tile identity/placement without mutating input', () => {
    const input = items(12),
      original = [...input];
    expect(tileLayout([...input].reverse())).toEqual(tileLayout(input));
    expect(input).toEqual(original);
    expect(tileLayout([])).toEqual([]);
    expect(tileLayout(input)).toHaveLength(12);
    expect(() => tileLayout(items(13))).toThrow(RangeError);
    expect(() => tileLayout([input[0], input[0]])).toThrow(RangeError);
    for (const id of ['', 'bad id', 'x'.repeat(65)])
      expect(() => tileLayout([{ ...input[0], id }])).toThrow(RangeError);
    for (const label of ['', ' ', 'x'.repeat(29)])
      expect(() => tileLayout([{ ...input[0], label }])).toThrow(RangeError);
    expect(() =>
      tileLayout([{ ...input[0], id: 'x'.repeat(64), label: 'x'.repeat(28) }]),
    ).not.toThrow();
    expect(() => tileLayout([{ ...input[0], state: 'missing' as ExpansionKitState }])).toThrow(
      RangeError,
    );
    const layout = tileLayout(input);
    for (let i = 0; i < layout.length; i++)
      for (let j = i + 1; j < layout.length; j++) {
        const a = layout[i].position,
          b = layout[j].position;
        expect(Math.abs(a[0] - b[0]) >= 0.76 || Math.abs(a[1] - b[1]) >= 0.5).toBe(true);
      }
  });
  it('accepts all 1–4 by 1–4 rectangles, preserves matrix order and rejects ragged/oversized/duplicate dimensions', () => {
    for (let r = 1; r <= 4; r++)
      for (let c = 1; c <= 4; c++) {
        const input = matrix(r, c);
        expect(matrixDimensions(input.rows)).toEqual([r, c]);
        expect(matrixLayout(input.rows).map(({ item }) => item.id)).toEqual(
          input.rows.flat().map((item) => item.id),
        );
        expect(svgCount(createElement(MatrixDiagram, input))).toBe(3 + 4 * r * c + r + c);
        expect(meshCount(createElement(MatrixClay, input))).toBe(1 + r * c);
      }
    for (const rows of [
      [],
      [[]],
      matrix(5, 1).rows,
      matrix(1, 5).rows,
      [items(2), items(1, 'other')],
      [[items(1)[0], items(1)[0]]],
    ])
      expect(() => matrixDimensions(rows)).toThrow(RangeError);
    for (const bad of [
      { ...matrix(2, 2), rowLabels: ['only'] },
      { ...matrix(2, 2), columnLabels: ['a', ''] },
    ]) {
      expect(() => MatrixDiagram(bad)).toThrow(RangeError);
      expect(() => MatrixClay(bad)).toThrow(RangeError);
    }
  });
  it.each(
    referenceCases,
  )('%s keeps signed basis direction, signed coefficient and orthogonal analytic projection', (reference, u) => {
    const input = { ...vector, reference },
      p = vectorProjection(input.vector, reference);
    close(p.reference, u);
    expect(Math.hypot(...p.reference)).toBeCloseTo(1, 12);
    expect(p.signedCoefficient).toBeCloseTo(-3 * u[0] + 2 * u[1], 12);
    close(p.vector ?? [], [-1.25, (2 * 1.25) / 3]);
    if (!p.vector || !p.projection) throw new Error('Known projection absent');
    const residual: PlanarPoint = [p.vector[0] - p.projection[0], p.vector[1] - p.projection[1]];
    expect(residual[0] * u[0] + residual[1] * u[1]).toBeCloseTo(0, 12);
    expect(p.projection[0] * u[1] - p.projection[1] * u[0]).toBeCloseTo(0, 12);
    const paths = expanded(createElement(VectorProjectionDiagram, input)).filter(
      (h) => h.type === 'path',
    );
    close(endpoint(paths[0].props.d), [u[0] * 165, -u[1] * 165]);
    close(endpoint(paths[1].props.d), [-u[1] * 165, -u[0] * 165]);
    close(endpoint(paths[2].props.d), [p.vector[0] * 100, -p.vector[1] * 100]);
    close(endpoint(paths[3].props.d), [p.projection[0] * 100, -p.projection[1] * 100]);
    const markup = html(createElement(VectorProjectionDiagram, input));
    expect(markup).toContain('Direction: x=-3, y=2');
    expect(markup).toContain('schematic Projection');
    expect(markup).not.toContain('signedCoefficient');
  });
  it('distinguishes absent vector states from exact zero/derived; caps labels and rejects unsupported reference/code', () => {
    for (const value of values) {
      const input = { ...vector, vector: { ...vector.vector, x: value } },
        p = vectorProjection(input.vector, input.reference);
      expect(p.state).toBe(value.state);
      if (value.state === 'unknown' || value.state === 'missing') {
        expect(p.vector).toBeNull();
        expect(p.projection).toBeNull();
        expect(p.signedCoefficient).toBeNull();
        const paths = expanded(createElement(VectorProjectionDiagram, input)).filter(
          (h) => h.type === 'path',
        );
        expect(paths[2].props.opacity).toBe(0);
        expect(paths[3].props.opacity).toBe(0);
      }
      expect(html(createElement(VectorProjectionDiagram, input))).toContain(
        `data-value-state="${value.state}"`,
      );
    }
    const zero = vectorProjection({ ...vector.vector, x: known(0), y: known(0) }, 'x');
    expect(zero.state).toBe('known');
    expect(zero.vector).toEqual([0, 0]);
    expect(zero.projection).toEqual([0, 0]);
    for (const reference of ['constructor', 'raw-camera', 'eval(x)', ''] as const)
      expect(() => vectorProjection(vector.vector, reference as ReferenceTemplate)).toThrow(
        RangeError,
      );
    for (const bad of [
      { ...vector, basisLabels: ['only'] as unknown as readonly [string, string] },
      { ...vector, projectionLabel: 'x'.repeat(29) },
      { ...vector, basisLabels: ['', 'basis'] as const },
    ]) {
      expect(() => VectorProjectionDiagram(bad)).toThrow(RangeError);
      expect(() => VectorProjectionClay(bad)).toThrow(RangeError);
    }
    const big = vectorProjection(
      { ...vector.vector, x: known(-1e9), y: known(1, 1e9) },
      'diagonal',
    );
    expect(
      [
        ...(big.vector ?? []),
        ...(big.projection ?? []),
        big.displayScale,
        big.signedCoefficient,
      ].every((n) => typeof n === 'number' && Number.isFinite(n)),
    ).toBe(true);
  });
});

describe('correspondence actual layout and endpoints', () => {
  it('has >=58SVG pitch with 50SVG tiles, matching ordered IDs and exact edge attachments in both modes', () => {
    const diagram = expanded(createElement(CorrespondenceDiagram, correspondence));
    const clay = expanded(createElement(CorrespondenceClay, correspondence));
    const tiles = diagram.filter(
      (h) =>
        typeof h.props['data-entity-id'] === 'string' &&
        /^(from|to)-/.test(String(h.props['data-entity-id'])),
    );
    const positions = new Map<string, PlanarPoint>();
    for (const tile of tiles) {
      const match = /^translate\(([^ ]+) ([^)]+)\)$/.exec(String(tile.props.transform));
      if (!match) throw new Error('Missing tile translation');
      positions.set(String(tile.props['data-entity-id']), [Number(match[1]), Number(match[2])]);
    }
    for (const side of ['from', 'to'] as const) {
      const ys = [...positions]
        .filter(([id]) => id.startsWith(`${side}-`))
        .map(([, p]) => p[1])
        .sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++)
        expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(58 - 1e-10);
    }
    const links = correspondenceLayout(correspondence);
    for (const { link, from, to } of links) {
      const a = positions.get(`from-${link.fromId}`),
        b = positions.get(`to-${link.toId}`);
      if (!a || !b) throw new Error('Unresolved tile identity');
      close([from[0] * 100, -from[1] * 100], [a[0] + 38, a[1]]);
      close([to[0] * 100, -to[1] * 100], [b[0] - 38, b[1]]);
      const linkGroup = diagram.find((h) => h.props['data-entity-id'] === link.id);
      const line = expanded(linkGroup?.props.children).find((h) => h.type === 'line');
      close(
        [
          Number(line?.props.x1),
          Number(line?.props.y1),
          Number(line?.props.x2),
          Number(line?.props.y2),
        ],
        [a[0] + 38, a[1], b[0] - 38, b[1]],
      );
    }
    for (const tile of tiles) {
      const id = String(tile.props['data-entity-id']),
        counterpart = clay.find((h) => h.props.name === id),
        p = positions.get(id);
      if (!counterpart || !p) throw new Error('Unmatched tile');
      close((counterpart.props.position as number[]).slice(0, 2), [p[0] / 100, -p[1] / 100]);
    }
    const tileBottom = Math.max(...[...positions.values()].map((p) => p[1] + 25));
    const caption = diagram.find((h) => h.type === 'text' && h.props.fontSize === 14);
    expect(Number(caption?.props.y)).toBeGreaterThan(tileBottom + 20);
    expect(
      geometryBounds(createElement(CorrespondenceClay, correspondence)).max.y,
    ).toBeGreaterThanOrEqual(3.44);
    expect(ids(createElement(CorrespondenceDiagram, correspondence))).toEqual(
      ids(createElement(CorrespondenceClay, correspondence), true),
    );
    expect(
      correspondenceLayout({
        ...correspondence,
        from: [...correspondence.from].reverse(),
        to: [...correspondence.to].reverse(),
        links: [...correspondence.links].reverse(),
      }),
    ).toEqual(links);
  });
  it('rejects duplicate IDs/pairs, missing endpoints, over-cap lists/links and oversized link labels', () => {
    const first = correspondence.links[0];
    const bad = [
      { ...correspondence, from: items(13, 'input') },
      { ...correspondence, to: items(13, 'output') },
      { ...correspondence, links: [...correspondence.links, { ...first, id: 'extra' }] },
      { ...correspondence, links: [first, { ...correspondence.links[1], id: first.id }] },
      { ...correspondence, links: [first, { ...first, id: 'other' }] },
      { ...correspondence, links: [{ ...first, fromId: 'absent' }] },
      { ...correspondence, links: [{ ...first, toId: 'absent' }] },
      { ...correspondence, links: [{ ...first, label: 'x'.repeat(29) }] },
    ];
    for (const input of bad) expect(() => correspondenceLayout(input)).toThrow(RangeError);
    expect(correspondenceLayout({ from: [], to: [], links: [] })).toEqual([]);
  });
});

describe('actual representation JSX/SSR source ceilings and seeks', () => {
  it('matches every declared cap including unknown/missing/derived, invisible meshes and actual rounded geometry', () => {
    for (const p of seeks)
      for (const state of states) {
        const common = { ...base, pose: pose(p), state };
        const pairs = [
          [
            createElement(ExactTilesDiagram, { ...common, items: items(12) }),
            createElement(ExactTilesClay, { ...common, items: items(12) }),
            REPRESENTATION_ASSET_BUDGETS.exactTiles,
          ],
          [
            createElement(MatrixDiagram, { ...matrix(4, 4), ...common }),
            createElement(MatrixClay, { ...matrix(4, 4), ...common }),
            REPRESENTATION_ASSET_BUDGETS.matrix,
          ],
          [
            createElement(VectorProjectionDiagram, { ...vector, ...common }),
            createElement(VectorProjectionClay, { ...vector, ...common }),
            REPRESENTATION_ASSET_BUDGETS.vectorProjection,
          ],
          [
            createElement(CorrespondenceDiagram, { ...correspondence, ...common }),
            createElement(CorrespondenceClay, { ...correspondence, ...common }),
            REPRESENTATION_ASSET_BUDGETS.correspondence,
          ],
        ] as const;
        for (const [diagram, clay, budget] of pairs) {
          expect(svgCount(diagram)).toBe(budget.svgElements);
          expect(meshCount(clay)).toBe(budget.meshes);
          expect(meshCount(diagram)).toBe(0);
          expect(ids(diagram)).toEqual(ids(clay, true));
          const hosts = expanded(clay),
            attached = hosts.filter(
              (h) => h.type === 'mesh' && h.props.geometry instanceof BufferGeometry,
            );
          expect(attached.length).toBeGreaterThan(0);
          for (const host of attached) {
            const geometry = host.props.geometry as BufferGeometry;
            expect(geometry.type).toBe('RoundedBoxGeometry');
            expect(geometry.getAttribute('position').count).toBeGreaterThan(24);
          }
          if (p === 0) expect(hosts[0].props.visible).toBe(false);
        }
      }
    for (const value of values) {
      const input = { ...vector, vector: { ...vector.vector, x: value }, pose: pose(0) };
      expect(svgCount(createElement(VectorProjectionDiagram, input))).toBe(15);
      expect(meshCount(createElement(VectorProjectionClay, input))).toBe(2);
    }
    for (const type of ['primitive', 'instancedMesh', 'skinnedMesh', 'Canvas', 'canvas'])
      expect(() => expanded(createElement(type))).toThrow(/Unaccounted/);
  });
  it('is finite/repeatable on shuffled seeks; clay dimensions do not encode quantities; diagrams have zero Canvas', () => {
    const render = (p: number) => [
      html(createElement(ExactTilesDiagram, { ...base, items: items(12), pose: pose(p) })),
      html(createElement(MatrixDiagram, { ...matrix(4, 4), pose: pose(p) })),
      html(createElement(VectorProjectionDiagram, { ...vector, pose: pose(p) })),
      html(createElement(CorrespondenceDiagram, { ...correspondence, pose: pose(p) })),
    ];
    const snapshots = new Map(seeks.map((p) => [p, render(p)]));
    for (const p of seeks) expect(render(p)).toEqual(snapshots.get(p));
    const shape = (input: VectorProjectionProps) =>
      geometryBounds(createElement(VectorProjectionClay, input)).getSize(new Vector3()).toArray();
    expect(shape(vector)).toEqual(
      shape({ ...vector, vector: { ...vector.vector, x: known(-1e9), y: known(1, 1e9) } }),
    );
    expect(shape(vector)).toEqual(
      shape({ ...vector, vector: { ...vector.vector, x: { state: 'unknown' } } }),
    );
    for (const input of [
      createElement(ExactTilesClay, { ...base, items: items(12) }),
      createElement(MatrixClay, matrix(4, 4)),
      createElement(VectorProjectionClay, vector),
      createElement(CorrespondenceClay, correspondence),
    ]) {
      const bounds = geometryBounds(input);
      expect(
        Math.max(...bounds.min.toArray().map(Math.abs), ...bounds.max.toArray().map(Math.abs)),
      ).toBeLessThanOrEqual(3.601);
    }
    const placed = geometryBounds(
      createElement(CorrespondenceClay, { ...correspondence, position: [16, -16, 16], scale: 4 }),
    );
    expect(
      Math.max(...placed.min.toArray().map(Math.abs), ...placed.max.toArray().map(Math.abs)),
    ).toBeLessThanOrEqual(30.401);
  });
  it('validates common authored pose/placement/qualifiers without printing computed coefficient or fake measurements', () => {
    const render = (input: KitAssetProps) => ExactTilesDiagram({ ...input, items: items(1) });
    for (const p of [NaN, Infinity])
      for (const channel of ['reveal', 'action', 'response', 'check', 'resolve'] as const)
        expect(() => render({ ...base, pose: { ...base.pose, [channel]: p } })).toThrow(RangeError);
    for (const scale of [0, 4.001, NaN])
      expect(() => render({ ...base, scale })).toThrow(RangeError);
    expect(() => render({ ...base, position: [16.01, 0, 0] })).toThrow(RangeError);
    expect(() => render({ ...base, label: 'x'.repeat(EXPANSION_LIMITS.actorLabel + 1) })).toThrow(
      RangeError,
    );
    expect(() => render({ ...base, qualifier: { kind: 'source', text: '' } })).toThrow(RangeError);
    expect(() =>
      render({
        ...base,
        qualifier: { kind: 'source', text: 'x'.repeat(EXPANSION_LIMITS.qualifier + 1) },
      }),
    ).toThrow(RangeError);
    const caps = {
      ...base,
      label: 'x'.repeat(28),
      qualifier: { kind: 'source' as const, text: 'x'.repeat(96) },
      position: [-16, 16, -16] as const,
      scale: 0.125,
    };
    expect(() => render(caps)).not.toThrow();
    const variants = new Set(
      states.flatMap((state) =>
        ['source', 'schematic'].map((kind) =>
          html(
            createElement(VectorProjectionDiagram, {
              ...vector,
              state,
              qualifier: { kind: kind as 'source' | 'schematic', text: 'Grounded or illustrative' },
            }),
          ),
        ),
      ),
    );
    expect(variants.size).toBe(10);
    const exact = html(
      createElement(VectorProjectionDiagram, {
        ...vector,
        vector: { ...vector.vector, x: known(-3, 7), y: known(2, 11) },
        reference: 'diagonal',
      }),
    );
    expect(exact).toContain('x=-3/7, y=2/11');
    expect(exact).not.toMatch(/0\.428571|0\.181818|coefficient|measured/);
    const escaped = html(
      createElement(ExactTilesDiagram, {
        ...base,
        items: [{ ...items(1)[0], label: '<script>bad</script>' }],
      }),
    );
    expect(escaped).toContain('&lt;script&gt;bad&lt;/script&gt;');
    expect(escaped).not.toContain('<script>');
    const source = readFileSync(
      resolve('src/main/remotion/compositions/explainer/expansion/kits/representations.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(
      /\b(?:Canvas|StudioEnvironment|useFrame|useCurrentFrame|setTimeout|setInterval|fetch|Date|eval)\b|Math\.random|<(?:instancedMesh|skinnedMesh|primitive)\b/,
    );
    expect(source).not.toMatch(/import.*(?:physics|rapier|cannon)|function\s+matrixProduct/);
  });
});
