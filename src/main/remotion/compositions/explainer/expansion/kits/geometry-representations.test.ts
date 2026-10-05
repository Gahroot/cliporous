import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement, Fragment, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExpansionKitPose, ExpansionKitState } from '../scene-types';
import { EXPANSION_LIMITS } from '../value-types';
import {
  type AuthoredPoint,
  analyticClearance,
  analyticSection,
  authoredGeometryCamera,
  boundedKitPose,
  type CubeFaceId,
  CubeNetClay,
  CubeNetDiagram,
  GEOMETRY_ASSET_BUDGETS,
  type GeometryAssetProps,
  GeometryGuideDiagram,
  type GeometryTemplate,
  geometryDimensions,
  geometryInteriorParts,
  type KitAssetProps,
  kitAppearance,
  matchedCubeNet,
  projectGeometryPoint,
  ScannerPlaneClay,
  ScannerPlaneDiagram,
  SectionableGeometryClay,
  SectionableGeometryDiagram,
} from './geometry';

// Expand the REAL ClayPart (including its hidden/reused geometry), not a one-mesh stub.
// CPU-only hook evaluation for JSX accounting; no stage, WebGL or measured GPU/RSS claim.
const allocated = vi.hoisted(() => new Set<{ dispose(): void }>());
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => unknown) => {
    const result = factory();
    if (
      result &&
      typeof result === 'object' &&
      'dispose' in result &&
      typeof result.dispose === 'function'
    )
      allocated.add(result as { dispose(): void });
    return result;
  },
}));
afterEach(() => {
  for (const geometry of allocated) geometry.dispose();
  allocated.clear();
});

const templates: readonly GeometryTemplate[] = ['box', 'cylinder', 'gadget'];
const states: readonly ExpansionKitState[] = [
  'retained',
  'active',
  'excluded',
  'unknown',
  'disputed',
];
const seekOrder = [1, 0, 0.75, 0.25, 1, 0.5, 0, 0.25] as const;
const pose = (p: number): ExpansionKitPose => ({
  reveal: p,
  action: p,
  response: p,
  check: p,
  resolve: p,
});
const base: KitAssetProps = {
  pose: pose(1),
  state: 'retained',
  position: [0, 0, 0],
  colors: { surface: '#f6ecd9', text: '#23100c', accent: '#9f75ff', muted: '#766e64' },
  label: 'Assembly',
  qualifier: { kind: 'schematic', text: 'Not to scale' },
};
const props = (template: GeometryTemplate, p = 1): GeometryAssetProps => ({
  ...base,
  template,
  pose: pose(p),
});
const guideLabels = ['width', 'height', 'depth'] as const;

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
  if (typeof node.type !== 'string') throw new Error('Unsupported component in JSX accounting');
  if (['primitive', 'instancedMesh', 'skinnedMesh', 'canvas', 'Canvas'].includes(node.type))
    throw new Error(`Unaccounted object or Canvas: ${node.type}`);
  const position = node.props.position as number[] | undefined;
  const rotation = node.props.rotation as number[] | undefined;
  const scale = node.props.scale as number | number[] | undefined;
  const world = parent
    .clone()
    .multiply(
      new Matrix4().compose(
        new Vector3(...(position ?? [0, 0, 0])),
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
const svgHosts = new Set(['g', 'text', 'rect', 'ellipse', 'line', 'polygon']);
function svgCount(node: unknown): number {
  const hosts = expanded(node);
  for (const host of hosts) expect(svgHosts.has(host.type), host.type).toBe(true);
  return hosts.length;
}
function meshCount(node: unknown): number {
  return expanded(node).filter((host) => host.type === 'mesh').length;
}
function closePoint(actual: readonly number[], expected: readonly number[]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, i) => {
    expect(value).toBeCloseTo(expected[i], 10);
  });
}
function finiteNumbers(value: unknown): void {
  if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
  else if (Array.isArray(value)) value.forEach(finiteNumbers);
  else if (value && typeof value === 'object') Object.values(value).forEach(finiteNumbers);
}
function meshBounds(node: unknown): Box3 {
  const box = new Box3();
  for (const host of expanded(node).filter((h) => h.type === 'mesh')) {
    // Geometry props (ClayPart) still belong to and count as this actual mounted mesh.
    let geometry = host.props.geometry;
    const ownsGeometry = !(geometry instanceof BufferGeometry);
    if (ownsGeometry) {
      const children = expanded(host.props.children).filter((h) => h.type.endsWith('Geometry'));
      expect(children).toHaveLength(1);
      const child = children[0];
      switch (child.type) {
        case 'boxGeometry':
          geometry = new BoxGeometry(
            ...(child.props.args as ConstructorParameters<typeof BoxGeometry>),
          );
          break;
        case 'planeGeometry':
          geometry = new PlaneGeometry(
            ...(child.props.args as ConstructorParameters<typeof PlaneGeometry>),
          );
          break;
        case 'circleGeometry':
          geometry = new CircleGeometry(
            ...(child.props.args as ConstructorParameters<typeof CircleGeometry>),
          );
          break;
        case 'cylinderGeometry':
          geometry = new CylinderGeometry(
            ...(child.props.args as ConstructorParameters<typeof CylinderGeometry>),
          );
          break;
        default:
          throw new Error(`Unaccounted geometry: ${child.type}`);
      }
    }
    if (!(geometry instanceof BufferGeometry)) throw new Error('Missing accounted mesh geometry');
    geometry.computeBoundingBox();
    if (!geometry.boundingBox) throw new Error('Missing geometry bounds');
    const transformed = geometry.boundingBox.clone().applyMatrix4(host.world);
    finiteNumbers([...transformed.min.toArray(), ...transformed.max.toArray()]);
    box.union(transformed);
    if (ownsGeometry) geometry.dispose();
  }
  return box;
}
function markup(node: Parameters<typeof renderToStaticMarkup>[0]): string {
  const html = renderToStaticMarkup(node);
  expect(html).not.toMatch(/<(?:canvas|Canvas|mesh|group|foreignObject)\b|NaN|Infinity/);
  return html;
}

const sectionBudget = {
  box: GEOMETRY_ASSET_BUDGETS.sectionBox,
  cylinder: GEOMETRY_ASSET_BUDGETS.sectionCylinder,
  gadget: GEOMETRY_ASSET_BUDGETS.sectionGadget,
} as const;

describe('geometry kit analytic contracts', () => {
  it.each(
    templates,
  )('%s sections share dimensions, stable parts and finite solid measures on shuffled seeks', (template) => {
    const [w, h, d] = geometryDimensions(template);
    const parts = geometryInteriorParts(template);
    expect(new Set(parts.map((part) => part.id)).size).toBe(parts.length);
    expect(parts.length).toBe(template === 'gadget' ? 4 : 2);
    for (const part of parts) {
      finiteNumbers(part);
      part.size.forEach((size, i) => {
        expect(size).toBeGreaterThan(0);
        expect(Math.abs(part.position[i]) + size / 2).toBeLessThanOrEqual([w, h, d][i] / 2);
      });
      if (template === 'cylinder') {
        expect(
          Math.hypot(
            Math.abs(part.position[0]) + part.size[0] / 2,
            Math.abs(part.position[2]) + part.size[2] / 2,
          ),
        ).toBeLessThan(w / 2);
      }
    }
    const expected = new Map(seekOrder.map((p) => [p, analyticSection(template, p)]));
    for (const p of seekOrder) {
      const section = analyticSection(template, p);
      finiteNumbers(section);
      expect(section).toEqual(expected.get(p));
      closePoint([section.width, section.height, section.depth], [w, h, d]);
      expect(section.retainedHeight).toBeCloseTo(h * (1 - 0.65 * p), 12);
      expect(section.cutY).toBeCloseTo(-h / 2 + section.retainedHeight, 12);
      expect(section.centerY + section.retainedHeight / 2).toBeCloseTo(section.cutY, 12);
      expect(section.centerY - section.retainedHeight / 2).toBeCloseTo(-h / 2, 12);
      expect(section.area).toBeCloseTo(
        template === 'cylinder' ? Math.PI * (w / 2) ** 2 : w * d,
        12,
      );
      expect(section.volume).toBeCloseTo(section.area * section.retainedHeight, 12);
      expect(geometryInteriorParts(template)).toEqual(parts);
    }
    expect(analyticSection(template, -1)).toEqual(analyticSection(template, 0));
    expect(analyticSection(template, 2)).toEqual(analyticSection(template, 1));
    expect(analyticSection(template, 1).volume / analyticSection(template, 0).volume).toBeCloseTo(
      0.35,
      12,
    );
    const sectionNodes = expanded(createElement(SectionableGeometryClay, props(template, 0.5)));
    const scanner = sectionNodes.find(
      (host) =>
        host.type === 'mesh' &&
        expanded(host.props.children).some((child) => child.type === 'planeGeometry'),
    );
    expect(scanner?.props.position).toEqual([0, analyticSection(template, 0.5).cutY, 0]);
    expect(
      sectionNodes.filter(
        (host) => host.type === 'group' && parts.some((part) => part.id === host.props.name),
      ),
    ).toHaveLength(parts.length);
    const identities = markup(createElement(SectionableGeometryDiagram, props(template)));
    for (const part of parts) expect(identities).toContain(`data-entity-id="${part.id}"`);
  });

  it.each(
    templates,
  )('%s clearance and guide geometry derive from the same authored dimensions', (template) => {
    const clearance = analyticClearance(template);
    finiteNumbers(clearance);
    expect(clearance.object).toEqual(geometryDimensions(template));
    clearance.opening.forEach((size, i) => {
      expect((size - clearance.object[i]) / 2).toBeCloseTo(clearance.gap, 12);
    });
    const hosts = expanded(
      createElement(GeometryGuideDiagram, {
        ...props(template),
        guide: 'clearance',
        labels: guideLabels,
      }),
    );
    const rectangles = hosts.filter((host) => host.type === 'rect');
    expect(rectangles).toHaveLength(2);
    expect(rectangles[0].props.width).toBe(clearance.opening[0] * 100);
    expect(rectangles[1].props.width).toBe(clearance.object[0] * 100);
    const lines = hosts.filter((host) => host.type === 'line');
    const widthGap = lines[0].props;
    expect(Number(widthGap.x2) - Number(widthGap.x1)).toBeCloseTo(clearance.gap * 100, 12);
    const heightGap = lines[3].props;
    expect(Number(heightGap.y2) - Number(heightGap.y1)).toBeCloseTo(clearance.gap * 100, 12);
    const depthGap = lines[6].props;
    closePoint(
      [Number(depthGap.x2) - Number(depthGap.x1), Number(depthGap.y2) - Number(depthGap.y1)],
      [clearance.gap * 40, clearance.gap * 20],
    );
    const [w, h, d] = geometryDimensions(template);
    const dimensions = expanded(
      createElement(GeometryGuideDiagram, {
        ...props(template),
        guide: 'dimensions',
        labels: guideLabels,
      }),
    ).filter((host) => host.type === 'line');
    expect(Number(dimensions[0].props.x2) - Number(dimensions[0].props.x1)).toBeCloseTo(
      w * 100,
      12,
    );
    expect(Number(dimensions[3].props.y2) - Number(dimensions[3].props.y1)).toBeCloseTo(
      h * 100,
      12,
    );
    closePoint(
      [
        Number(dimensions[6].props.x2) - Number(dimensions[6].props.x1),
        Number(dimensions[6].props.y2) - Number(dimensions[6].props.y1),
      ],
      [d * 40, d * 20],
    );
  });

  it('returns defensive dimension/part copies, fixed finite cameras and a linear schematic projection', () => {
    const dimensions = geometryDimensions('gadget');
    (dimensions as unknown as number[])[0] = 999;
    const parts = geometryInteriorParts('gadget');
    (parts[0].position as unknown as number[])[0] = 999;
    expect(geometryDimensions('gadget')).toEqual([2.4, 1.5, 1.2]);
    expect(geometryInteriorParts('gadget')[0].position[0]).toBe(0);
    for (const camera of ['front', 'isometric'] as const) {
      const a = authoredGeometryCamera(camera);
      expect(a).toEqual(authoredGeometryCamera(camera));
      finiteNumbers(a);
      expect(a.target).toEqual([0, 0, 0]);
      expect(Math.hypot(...a.position)).toBeGreaterThan(6);
      expect(Math.hypot(...a.position)).toBeLessThanOrEqual(8);
    }
    closePoint(projectGeometryPoint([1, 2, 3]), [220, -140]);
    closePoint(projectGeometryPoint([-1, -2, -3]), [-220, 140]);
    closePoint(projectGeometryPoint([0, 0, 0]), [0, 0]);
    for (const x of [-16, 0, 16])
      for (const y of [-16, 0, 16])
        for (const z of [-16, 0, 16]) {
          const result = projectGeometryPoint([x, y, z]);
          finiteNumbers(result);
          expect(Math.abs(result[0])).toBeLessThanOrEqual(2240);
          expect(Math.abs(result[1])).toBeLessThanOrEqual(1920);
        }
    expect(() => authoredGeometryCamera('raw' as 'front')).toThrow(RangeError);
    expect(() => geometryDimensions('house' as GeometryTemplate)).toThrow(RangeError);
    for (const value of [NaN, Infinity, -Infinity, -16.01, 16.01]) {
      expect(() => projectGeometryPoint([value, 0, 0])).toThrow(RangeError);
      expect(() => projectGeometryPoint([0, value, 0])).toThrow(RangeError);
      expect(() => projectGeometryPoint([0, 0, value])).toThrow(RangeError);
    }
    expect(() => projectGeometryPoint([0, 0] as unknown as AuthoredPoint)).toThrow(RangeError);
  });

  it('caps all five finite pose channels, placements, labels and source/schematic qualifiers', () => {
    expect(boundedKitPose(pose(-1))).toEqual(pose(0));
    expect(boundedKitPose(pose(2))).toEqual(pose(1));
    for (const key of ['reveal', 'action', 'response', 'check', 'resolve'] as const)
      for (const value of [NaN, Infinity, -Infinity])
        expect(() => kitAppearance({ ...base, pose: { ...base.pose, [key]: value } })).toThrow(
          RangeError,
        );
    for (const scale of [0.125, 4]) {
      const a = kitAppearance({ ...base, position: [16, -16, 16], scale });
      expect(a.transform).toBe(`translate(1600 1600) scale(${scale})`);
      expect(a.position).toEqual([16, -16, 16]);
    }
    for (const scale of [0, 0.124, 4.001, Infinity, NaN])
      expect(() => kitAppearance({ ...base, scale })).toThrow(RangeError);
    for (const position of [
      [16.01, 0, 0],
      [0, NaN, 0],
      [0, 0, Infinity],
      [0, 0],
    ])
      expect(() =>
        kitAppearance({ ...base, position: position as unknown as AuthoredPoint }),
      ).toThrow(RangeError);
    const capped = {
      ...base,
      label: 'L'.repeat(EXPANSION_LIMITS.actorLabel),
      qualifier: { kind: 'source' as const, text: 'Q'.repeat(EXPANSION_LIMITS.qualifier) },
    };
    expect(() => kitAppearance(capped)).not.toThrow();
    for (const label of ['', ' ', `${capped.label}L`])
      expect(() => kitAppearance({ ...capped, label })).toThrow(RangeError);
    for (const text of ['', ' ', `${capped.qualifier.text}Q`])
      expect(() => kitAppearance({ ...capped, qualifier: { kind: 'source', text } })).toThrow(
        RangeError,
      );
    expect(() => kitAppearance({ ...base, state: 'known' as ExpansionKitState })).toThrow(
      RangeError,
    );
    expect(() =>
      kitAppearance({ ...base, qualifier: { kind: 'measured' as 'source', text: 'Claim' } }),
    ).toThrow(RangeError);
    expect(() =>
      GeometryGuideDiagram({
        ...props('box'),
        guide: 'dimensions',
        labels: ['a', 'b'] as unknown as readonly [string, string, string],
      }),
    ).toThrow(RangeError);
    expect(() =>
      GeometryGuideDiagram({
        ...props('box'),
        guide: 'dimensions',
        labels: ['a', 'b', 'L'.repeat(29)],
      }),
    ).toThrow(RangeError);
    expect(() =>
      GeometryGuideDiagram({ ...props('box'), guide: 'dimensions', labels: ['a', ' ', 'c'] }),
    ).toThrow(RangeError);
    expect(() =>
      GeometryGuideDiagram({ ...props('box'), guide: 'raw' as 'dimensions', labels: guideLabels }),
    ).toThrow(RangeError);
  });
});

describe('matched unit cube/net correspondence', () => {
  const ids: readonly CubeFaceId[] = ['front', 'right', 'left', 'top', 'bottom', 'back'];
  it('keeps six faces, unit corners/normals and all five real hinges on shuffled/repeated seeks', () => {
    const expected = new Map(seekOrder.map((p) => [p, matchedCubeNet(p)]));
    for (const p of seekOrder) {
      const faces = matchedCubeNet(p);
      expect(faces).toEqual(expected.get(p));
      expect(faces.map((face) => face.id)).toEqual(ids);
      expect(new Set(faces.map((face) => face.id)).size).toBe(6);
      finiteNumbers(faces);
      for (const face of faces) {
        expect(face.corners).toHaveLength(4);
        expect(Math.hypot(...face.normal)).toBeCloseTo(1, 12);
        for (let i = 0; i < 4; i++) {
          const delta = new Vector3(...face.corners[i]).sub(new Vector3(...face.center));
          expect(delta.dot(new Vector3(...face.normal))).toBeCloseTo(0, 12);
          expect(delta.length()).toBeCloseTo(Math.SQRT1_2, 12);
          expect(
            new Vector3(...face.corners[i]).distanceTo(new Vector3(...face.corners[(i + 1) % 4])),
          ).toBeCloseTo(1, 12);
          expect(Math.max(...face.corners[i].map(Math.abs))).toBeLessThanOrEqual(2.501);
        }
        const u = new Vector3(...face.corners[1]).sub(new Vector3(...face.corners[0]));
        const v = new Vector3(...face.corners[3]).sub(new Vector3(...face.corners[0]));
        closePoint(u.cross(v).toArray(), face.normal);
      }
      const byId = Object.fromEntries(faces.map((face) => [face.id, face]));
      for (const [a, ai, b, bi] of [
        ['front', 1, 'right', 0],
        ['front', 2, 'right', 3],
        ['front', 0, 'left', 1],
        ['front', 3, 'left', 2],
        ['front', 3, 'top', 0],
        ['front', 2, 'top', 1],
        ['front', 0, 'bottom', 3],
        ['front', 1, 'bottom', 2],
        ['right', 1, 'back', 0],
        ['right', 2, 'back', 3],
      ] as const)
        closePoint(byId[a].corners[ai], byId[b].corners[bi]);
      const diagram = expanded(createElement(CubeNetDiagram, { ...base, pose: pose(p) }));
      const clay = expanded(createElement(CubeNetClay, { ...base, pose: pose(p) }));
      expect(
        diagram
          .filter((host) => host.props['data-entity-id'])
          .map((host) => host.props['data-entity-id']),
      ).toEqual(clay.filter((host) => host.type === 'mesh').map((host) => host.props.name));
      expect(
        diagram.filter((host) => host.type === 'polygon').map((host) => host.props.points),
      ).toEqual(
        faces.map((face) =>
          face.corners.map((point) => projectGeometryPoint(point).join(',')).join(' '),
        ),
      );
      clay
        .filter((host) => host.type === 'mesh')
        .forEach((host, i) => {
          expect(host.props.position).toEqual(faces[i].center);
          expect(host.props.rotation).toEqual(faces[i].rotation);
          const vertices = [
            [-0.5, -0.5, 0],
            [0.5, -0.5, 0],
            [0.5, 0.5, 0],
            [-0.5, 0.5, 0],
          ];
          vertices.forEach((point, j) => {
            closePoint(
              new Vector3(...point).applyMatrix4(host.world).toArray(),
              faces[i].corners[j],
            );
          });
        });
    }
  });
  it('has exactly eight shared cube vertices at p0 and the authored non-overlapping cross at p1', () => {
    const closed = matchedCubeNet(0);
    const vertices = new Map<string, number>();
    for (const face of closed) {
      expect(Math.hypot(...face.center)).toBeCloseTo(0.5, 12);
      for (const corner of face.corners) {
        corner.forEach((v) => {
          expect(Math.abs(v)).toBeCloseTo(0.5, 12);
        });
        const id = corner.map((v) => (v > 0 ? '+' : '-')).join('');
        vertices.set(id, (vertices.get(id) ?? 0) + 1);
      }
    }
    expect(vertices.size).toBe(8);
    expect([...vertices.values()]).toEqual(Array(8).fill(3));
    const open = matchedCubeNet(1);
    expect(open.map((face) => face.center)).toEqual([
      [0, 0, 0.5],
      [1, 0, 0.5],
      [-1, 0, 0.5],
      [0, 1, 0.5],
      [0, -1, 0.5],
      [2, 0, 0.5],
    ]);
    for (const face of open) {
      closePoint(face.normal, [0, 0, 1]);
      for (const point of face.corners) expect(point[2]).toBe(0.5);
    }
    for (let i = 0; i < 6; i++)
      for (let j = i + 1; j < 6; j++)
        expect(
          Math.max(
            Math.abs(open[i].center[0] - open[j].center[0]),
            Math.abs(open[i].center[1] - open[j].center[1]),
          ),
        ).toBeGreaterThanOrEqual(1);
    expect(matchedCubeNet(-1)).toEqual(closed);
    expect(matchedCubeNet(2)).toEqual(open);
    expect(() => matchedCubeNet(NaN)).toThrow(RangeError);
  });
});

describe('geometry kit actual JSX/SSR envelopes', () => {
  it.each(
    templates,
  )('%s respects source-derived section/scanner ceilings, including every hidden ClayPart', (template) => {
    const parts = geometryInteriorParts(template);
    const expectedMeshes = (template === 'cylinder' ? 3 : 6) + parts.length + 1;
    for (const p of seekOrder)
      for (const state of states) {
        const input = { ...props(template, p), state };
        const clay = createElement(SectionableGeometryClay, input);
        expect(meshCount(clay)).toBe(expectedMeshes);
        expect(meshCount(clay)).toBe(sectionBudget[template].meshes);
        expect(svgCount(createElement(SectionableGeometryDiagram, input))).toBe(
          sectionBudget[template].svgElements,
        );
        expect(meshCount(createElement(ScannerPlaneClay, input))).toBe(
          GEOMETRY_ASSET_BUDGETS.scanner.meshes,
        );
        expect(svgCount(createElement(ScannerPlaneDiagram, input))).toBe(
          GEOMETRY_ASSET_BUDGETS.scanner.svgElements,
        );
      }
    const hidden = expanded(createElement(SectionableGeometryClay, props(template, 1)));
    expect(hidden.some((host) => host.type === 'mesh' && host.props.visible === false)).toBe(true);
    const attached = hidden.filter(
      (host) => host.type === 'mesh' && host.props.geometry instanceof BufferGeometry,
    );
    expect(attached).toHaveLength(parts.length);
    for (const host of attached) {
      const geometry = host.props.geometry as BufferGeometry;
      expect(geometry.type).toBe('RoundedBoxGeometry');
      expect(geometry.getAttribute('position').count).toBeGreaterThan(24);
    }
  });
  it('counts net and both planar guides at all bounded templates/states/poses, even opacity zero', () => {
    for (const p of seekOrder)
      for (const state of states) {
        const input = { ...base, state, pose: pose(p) };
        expect(meshCount(createElement(CubeNetClay, input))).toBe(
          GEOMETRY_ASSET_BUDGETS.cubeNet.meshes,
        );
        expect(svgCount(createElement(CubeNetDiagram, input))).toBe(
          GEOMETRY_ASSET_BUDGETS.cubeNet.svgElements,
        );
        for (const template of templates)
          for (const guide of ['dimensions', 'clearance'] as const) {
            const node = createElement(GeometryGuideDiagram, {
              ...input,
              template,
              guide,
              labels: guideLabels,
            });
            expect(svgCount(node)).toBe(GEOMETRY_ASSET_BUDGETS[guide].svgElements);
            expect(meshCount(node)).toBe(0);
          }
      }
    for (const type of ['primitive', 'instancedMesh', 'skinnedMesh', 'Canvas', 'canvas'])
      expect(() => expanded(createElement(type))).toThrow(/Unaccounted/);
  });
  it('actual mounted clay bounds and SVG coordinates stay finite on shuffled seeks and placement/scale caps', () => {
    for (const p of seekOrder) {
      const nodes = [
        createElement(CubeNetClay, { ...base, pose: pose(p) }),
        ...templates.flatMap((template) => [
          createElement(SectionableGeometryClay, props(template, p)),
          createElement(ScannerPlaneClay, props(template, p)),
        ]),
      ];
      for (const node of nodes) {
        const bounds = meshBounds(node);
        expect(bounds.isEmpty()).toBe(false);
        expect(
          Math.max(...bounds.min.toArray().map(Math.abs), ...bounds.max.toArray().map(Math.abs)),
        ).toBeLessThanOrEqual(3);
      }
      for (const template of templates) {
        const hosts = expanded(createElement(SectionableGeometryDiagram, props(template, p)));
        for (const host of hosts)
          for (const value of Object.values(host.props))
            if (typeof value === 'number') {
              expect(Number.isFinite(value)).toBe(true);
              expect(Math.abs(value)).toBeLessThanOrEqual(400);
            }
      }
    }
    for (const scale of [0.125, 4]) {
      const bounds = meshBounds(
        createElement(CubeNetClay, { ...base, position: [16, -16, 16], scale }),
      );
      expect(
        Math.max(...bounds.min.toArray().map(Math.abs), ...bounds.max.toArray().map(Math.abs)),
      ).toBeLessThanOrEqual(28);
    }
  });
  it('all diagrams SSR to SVG only; states and source/schematic qualifiers remain explicit and distinct', () => {
    const render = (input: KitAssetProps) =>
      [
        createElement(CubeNetDiagram, input),
        createElement(ScannerPlaneDiagram, { ...input, template: 'box' }),
        createElement(SectionableGeometryDiagram, { ...input, template: 'gadget' }),
        createElement(GeometryGuideDiagram, {
          ...input,
          template: 'box',
          guide: 'dimensions',
          labels: guideLabels,
        }),
        createElement(GeometryGuideDiagram, {
          ...input,
          template: 'box',
          guide: 'clearance',
          labels: guideLabels,
        }),
      ].map((node) => markup(createElement('svg', {}, node)));
    const repeated = new Map(seekOrder.map((p) => [p, render({ ...base, pose: pose(p) })]));
    for (const p of seekOrder) expect(render({ ...base, pose: pose(p) })).toEqual(repeated.get(p));
    const unique = new Set<string>();
    for (const state of states)
      for (const kind of ['source', 'schematic'] as const) {
        const html = render({ ...base, state, qualifier: { kind, text: 'Bounded source span' } });
        for (const item of html) {
          expect(item).toContain(`data-state="${state}"`);
          expect(item).toContain(`Assembly · ${state}`);
          expect(item).toContain(`${kind}: Bounded source span`);
          expect(item).not.toContain('measured');
          const text = item.replace(/<[^>]*>/g, '');
          expect(text).not.toMatch(/\b(?:1\.5|2\.4|metres?|millimetres?|cm|mm)\b/);
        }
        unique.add(html.join(''));
      }
    expect(unique.size).toBe(10);
    expect(kitAppearance({ ...base, state: 'active' }).color).toBe(base.colors.accent);
    expect(kitAppearance({ ...base, state: 'retained' }).color).toBe(base.colors.surface);
    expect(kitAppearance({ ...base, state: 'excluded' }).opacity).toBe(0.3);
    expect(kitAppearance({ ...base, state: 'unknown' }).dash).toBe('5 4');
    expect(kitAppearance({ ...base, state: 'disputed' }).dash).toBe('5 4');
    const unsafeLabel = markup(
      createElement(CubeNetDiagram, { ...base, label: '<script>bad</script>' }),
    );
    expect(unsafeLabel).toContain('&lt;script&gt;bad&lt;/script&gt;');
    expect(unsafeLabel).not.toContain('<script>');
  });
  it('asset source owns no Canvas/studio, timers, randomness, physics, house copy or unaccounted mesh types', () => {
    const source = readFileSync(
      resolve('src/main/remotion/compositions/explainer/expansion/kits/geometry.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(
      /\b(?:Canvas|StudioEnvironment|useFrame|useCurrentFrame|setTimeout|setInterval|fetch|Date|instancedMesh|skinnedMesh|primitive|CSG)\b|Math\.random/,
    );
    expect(source).not.toMatch(/import.*(?:HouseModel|physics|rapier|cannon)/);
    // Explicit exported return contracts are a kit API boundary, not inferred unions for packs.
    for (const name of [
      'geometryInteriorParts',
      'kitAppearance',
      'authoredGeometryCamera',
      'analyticSection',
      'analyticClearance',
    ])
      expect(source).toMatch(new RegExp(`export function ${name}\\([^)]*\\): [^{\\n]+\\{`));
  });
});
