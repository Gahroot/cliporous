import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Box3, Euler, Matrix4, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  parseOperatingCostScene,
  parseScaleEconomicsScene,
  parseValueCaptureScene,
} from '../../../../../ai/explainer/business-economics-contract';
import { HybridStage } from '../../diagrams/HybridStage';
import { labelLines } from '../../diagrams/layout';
import { diagramPose } from '../../diagrams/motion';
import { Stage3D } from '../../Stage3D';
import { ECONOMICS_SOURCE_FIXTURES, economicsFixtureContext } from './fixtures';
import { economicsFacts } from './identities';
import { economicsAssembly, sampleEconomics } from './poses';
import { economicsPages } from './presentation';
import { ECONOMICS_READING_LAYOUT as R } from './readability';
import { EconomicsDiagramParts, EconomicsModelParts, EconomicsSceneView } from './Scene';

vi.mock('../../stage', () => ({
  useStage: () => ({
    text: '#23100c',
    card: '#f6ecd9',
    cardRaised: '#fff',
    cardBorder: '#777',
    accent: '#9f75ff',
    clay: ['#999', '#777', '#555', '#888'],
    font: 'Inter',
  }),
  useSceneTime: () => ({ t: 10 }),
  shade: (c: string) => c,
}));
vi.mock('../../hero-kit', () => ({ Clay: () => null }));
// CPU authored-tree leaves only. Does not mount WebGL or measure projected/raster pixels.
vi.mock('../../explanation-kit', () => ({
  ClayBlock: (p: { position?: number[]; rotation?: number[]; size: number[]; opacity?: number }) =>
    createElement(
      'mesh',
      { position: p.position, rotation: p.rotation },
      createElement('boxGeometry', { args: p.size }),
    ),
}));
interface Node {
  type: string;
  props: Record<string, unknown>;
  world: Matrix4;
}
function vector(value: unknown, fallback: number): number[] {
  return typeof value === 'number'
    ? [value, value, value]
    : Array.isArray(value)
      ? value.map(Number)
      : [fallback, fallback, fallback];
}
function expanded(node: ReactNode, parent = new Matrix4(), nodes: Node[] = []): Node[] {
  if (Array.isArray(node)) {
    for (const child of node) expanded(child, parent, nodes);
    return nodes;
  }
  if (!isValidElement<Record<string, unknown>>(node)) return nodes;
  if (typeof node.type === 'function') {
    expanded(Reflect.apply(node.type, undefined, [node.props]) as ReactNode, parent, nodes);
    return nodes;
  }
  const pos = vector(node.props.position, 0),
    rot = vector(node.props.rotation, 0),
    scale = vector(node.props.scale, 1);
  const local = new Matrix4().makeRotationFromEuler(new Euler(rot[0], rot[1], rot[2]));
  local.scale(new Vector3(scale[0], scale[1], scale[2]));
  local.setPosition(pos[0], pos[1], pos[2]);
  const world = parent.clone().multiply(local);
  if (typeof node.type === 'string') nodes.push({ type: node.type, props: node.props, world });
  expanded(node.props.children as ReactNode, world, nodes);
  return nodes;
}
function boundaryCount(node: ReactNode): number {
  if (Array.isArray(node)) return node.reduce<number>((n, child) => n + boundaryCount(child), 0);
  if (!isValidElement<{ children?: ReactNode }>(node)) return 0;
  return (node.type === Stage3D ? 1 : 0) + boundaryCount(node.props.children);
}
function fingerprint(nodes: Node[]) {
  return nodes.map((n) => ({
    type: n.type,
    name: n.props.name,
    position: n.props.position,
    scale: n.props.scale,
    args: n.props.args,
    visible: n.props.visible,
    facts: n.props.userData,
  }));
}
describe('economics actual authored SVG/model parts (CPU only)', () => {
  for (const fixture of ECONOMICS_SOURCE_FIXTURES) {
    it(`${fixture.id}: complete fixed readable pages, authored identities/geometry and zero/one stage`, () => {
      const ctx = economicsFixtureContext(fixture);
      const scene =
        fixture.raw.kind === 'operating-cost'
          ? parseOperatingCostScene(fixture.raw, ctx)
          : fixture.raw.kind === 'scale-economics'
            ? parseScaleEconomicsScene(fixture.raw, ctx)
            : parseValueCaptureScene(fixture.raw, ctx);
      if (!scene) throw new Error(ctx.issues.join('; '));
      const pages = economicsPages(scene),
        seen = new Set<string>();
      for (const page of pages) {
        const svg = renderToStaticMarkup(
          createElement(
            'svg',
            null,
            createElement(EconomicsDiagramParts, { scene, seconds: page.start + 0.01 }),
          ),
        );
        expect(svg).not.toMatch(/<canvas|<image|foreignObject|ellipsis/u);
        expect(svg).toContain('font-size="24"');
        expect(svg).toContain('font-size="22"');
        const chars = svg.replace(/<[^>]*>/gu, '').replace(/\s/gu, '');
        for (const c of page.cards) {
          seen.add(c.card.id);
          expect(svg).toContain(`data-fact-id="${c.card.id}"`);
          for (const line of [c.card.title, ...c.card.lines])
            expect(chars).toContain(line.replace(/\s/gu, ''));
          expect(c.x).toBeGreaterThanOrEqual(0);
          expect(c.x + c.width).toBeLessThanOrEqual(952);
          expect(c.y + c.height).toBeLessThanOrEqual(478);
          for (const [i, line] of c.card.lines.entries())
            expect(
              c.lineY[i] + (labelLines(line, R.columns).length - 1) * R.bodySize * R.lineHeight,
            ).toBeLessThanOrEqual(c.y + c.height - R.padding);
        }
        expect(page.end - page.start).toBeGreaterThanOrEqual(1.5 - 1e-7);
      }
      expect(seen).toEqual(new Set(economicsFacts(scene).map((p) => p.id)));
      const rawModel = EconomicsModelParts({ scene, seconds: scene.resolveAt });
      const finalNodes = expanded(rawModel);
      expect(finalNodes.filter((n) => n.type === 'mesh').length).toBeLessThanOrEqual(180);
      if (scene.carrier) {
        expect(
          finalNodes.some(
            (n) =>
              (n.props.userData as { businessAssetId?: string } | undefined)?.businessAssetId ===
              scene.carrier?.asset,
          ),
        ).toBe(true);
        for (const f of economicsFacts(scene))
          expect(finalNodes.some((n) => n.props.name === `fact:${f.id}`)).toBe(true);
      } else expect(finalNodes.filter((n) => n.type === 'mesh')).toHaveLength(0);
      const critical = [
        scene.setupAt,
        scene.actionAt,
        scene.responseAt,
        scene.checkAt,
        scene.resolveAt,
        scene.resolveAt + scene.finalHoldSeconds,
      ];
      const firstFrame = Math.ceil(ctx.win.startTime * 30);
      const frames = Array.from(
        { length: Math.floor(ctx.win.endTime * 30) - firstFrame + 1 },
        (_, index) => (firstFrame + index) / 30,
      );
      const boxes = new Map<string, Box3>();
      for (const t of [...critical, ...frames, ...[...critical].reverse()]) {
        const modelTurn = new Matrix4().makeRotationY(diagramPose(t, scene).modelTurn);
        const nodes = expanded(EconomicsModelParts({ scene, seconds: t }), modelTurn);
        expect(fingerprint(nodes)).toEqual(
          fingerprint(expanded(EconomicsModelParts({ scene, seconds: t }), modelTurn)),
        );
        const meshes = nodes.filter((node) => node.type === 'mesh');
        expect(meshes.length).toBeLessThanOrEqual(180);
        expect(
          meshes.every((mesh) => mesh.props.geometry === undefined),
          'opaque geometry needs an explicit buffer inspection',
        ).toBe(true);
        expect(nodes.every((node) => node.world.elements.every(Number.isFinite))).toBe(true);
        const envelope = new Box3();
        for (const n of nodes.filter((p) => p.type.endsWith('Geometry'))) {
          const key = `${n.type}:${JSON.stringify(n.props.args)}`;
          let box = boxes.get(key);
          if (!box) {
            expect([
              'boxGeometry',
              'planeGeometry',
              'sphereGeometry',
              'torusGeometry',
              'cylinderGeometry',
              'capsuleGeometry',
            ]).toContain(n.type);
            const args = vector(n.props.args, 0);
            expect(args.every(Number.isFinite)).toBe(true);
            let size = args.slice(0, 3);
            if (n.type === 'planeGeometry') size = [args[0], args[1], 0];
            if (n.type === 'sphereGeometry') size = [2 * args[0], 2 * args[0], 2 * args[0]];
            if (n.type === 'torusGeometry')
              size = [2 * (args[0] + args[1]), 2 * (args[0] + args[1]), 2 * args[1]];
            if (n.type === 'cylinderGeometry')
              size = [2 * Math.max(args[0], args[1]), args[2], 2 * Math.max(args[0], args[1])];
            if (n.type === 'capsuleGeometry')
              size = [2 * args[0], args[1] + 2 * args[0], 2 * args[0]];
            expect(size).toHaveLength(3);
            expect(size.every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
            box = new Box3(
              new Vector3(-size[0] / 2, -size[1] / 2, -size[2] / 2),
              new Vector3(size[0] / 2, size[1] / 2, size[2] / 2),
            );
            boxes.set(key, box);
          }
          // Box3 transforms all eight conservative corners for every source frame.
          envelope.union(box.clone().applyMatrix4(n.world));
        }
        if (meshes.length > 0) {
          expect(envelope.min.x).toBeGreaterThanOrEqual(-3.4);
          expect(envelope.max.x).toBeLessThanOrEqual(3.4);
          expect(envelope.min.y).toBeGreaterThanOrEqual(-1.4);
          expect(envelope.max.y).toBeLessThanOrEqual(2.7);
          expect(envelope.min.z).toBeGreaterThanOrEqual(-2.6);
          expect(envelope.max.z).toBeLessThanOrEqual(1.8);
        }
      }
      const baseView = EconomicsSceneView({ scene });
      expect(baseView.type).toBe(HybridStage);
      if (!isValidElement<Parameters<typeof HybridStage>[0]>(baseView))
        throw new Error('Missing scene wrapper');
      expect(baseView.props.settledOutcome).toBe(true);
      expect(boundaryCount(HybridStage(baseView.props))).toBe(0);
      if (scene.preset !== 'comparable-pricing-bases') {
        const hybridView = EconomicsSceneView({ scene: { ...scene, visualMode: 'hybrid' } });
        if (!isValidElement<Parameters<typeof HybridStage>[0]>(hybridView))
          throw new Error('Missing hybrid wrapper');
        expect(boundaryCount(HybridStage(hybridView.props))).toBe(1);
      }
      const holdNodes = expanded(
        EconomicsModelParts({ scene, seconds: scene.resolveAt + scene.finalHoldSeconds }),
      );
      expect(fingerprint(holdNodes)).toEqual(fingerprint(finalNodes));
      if (scene.preset === 'output-staffing' || scene.preset === 'fixed-variable')
        expect(economicsAssembly(scene, sampleEconomics(scene, scene.resolveAt))?.assembly).toEqual(
          { asset: 'A-02', occupied: false },
        );
    });
  }
});
