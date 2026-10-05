import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  parseBusinessBlueprint,
  parseBusinessReplication,
} from '../../../../../ai/explainer/business-commercial-contract';
import { makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import { HybridStage } from '../../diagrams/HybridStage';
import { Stage3D } from '../../Stage3D';
import {
  COMMERCIAL_RAW_FIXTURES,
  COMMERCIAL_SOURCE_FIXTURES,
  type CommercialSourceFixture,
  makeCommercialSourceFixture,
} from './fixtures';
import { commercialIdentities } from './poses';
import { commercialContentCounts, commercialTable, layoutCommercialTable } from './presentation';
import { CommercialDiagramParts, CommercialModelParts, CommercialSceneView } from './Scene';
import type { CommercialScene, FounderDependency } from './types';

vi.mock('../../stage', () => ({
  useStage: () => ({
    text: '#23100c',
    card: '#f6ecd9',
    cardRaised: '#fff',
    cardBorder: '#777',
    accent: '#9f75ff',
    clay: ['#999', '#777', '#555', '#888', '#666'],
    font: 'Inter',
  }),
  useSceneTime: () => ({ t: 20 }),
  shade: (color: string) => color,
}));
vi.mock('../../hero-kit', () => ({ Clay: () => null }));
// CPU authored-tree budget: each existing rounded ClayBlock is a single mesh leaf.
// Materials and rounded geometry are not WebGL-mounted; invisible descendants still count.
vi.mock('../../explanation-kit', () => ({
  ClayBlock: (props: { position?: number[]; size?: number[] }) =>
    createElement(
      'mesh',
      { position: props.position },
      createElement('boxGeometry', { args: props.size }),
    ),
}));

function parsed(fixture: CommercialSourceFixture, raw: Rec = fixture.raw): CommercialScene {
  const ctx = makeParseContext(fixture.words, fixture.window);
  const scene =
    raw.kind === 'business-replication'
      ? parseBusinessReplication(raw, ctx)
      : parseBusinessBlueprint(raw, ctx);
  expect(scene, `${fixture.fixtureId}: ${ctx.issues.join('; ')}`).not.toBeNull();
  if (!scene) throw new Error(`${fixture.fixtureId}: rejected RAW fixture`);
  return scene;
}
function fixture(id: CommercialSourceFixture['id']): CommercialSourceFixture {
  const found = COMMERCIAL_RAW_FIXTURES.find((entry) => entry.id === id);
  if (!found) throw new Error(`Missing RAW fixture ${id}`);
  return found;
}
interface AuthoredNode {
  type: string;
  props: Record<string, unknown>;
}
function expanded(node: ReactNode, result: AuthoredNode[] = []): AuthoredNode[] {
  if (Array.isArray(node)) {
    for (const child of node) expanded(child, result);
    return result;
  }
  if (!isValidElement<Record<string, unknown>>(node)) return result;
  if (typeof node.type === 'function') {
    result.push({ type: node.type.name, props: node.props });
    expanded(Reflect.apply(node.type, undefined, [node.props]) as ReactNode, result);
  } else {
    if (typeof node.type === 'string') result.push({ type: node.type, props: node.props });
    expanded(node.props.children as ReactNode, result);
  }
  return result;
}
function model(scene: CommercialScene, seconds: number): AuthoredNode[] {
  return expanded(CommercialModelParts({ scene, seconds }));
}
function named(nodes: AuthoredNode[], name: string): AuthoredNode {
  const node = nodes.find((entry) => entry.props.name === name);
  if (!node) throw new Error(`Missing authored carrier ${name}`);
  return node;
}
function numbers(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(numbers);
  return [];
}
function fingerprint(nodes: AuthoredNode[]): unknown[] {
  return nodes.map(({ type, props }) => ({
    type,
    name: props.name,
    position: props.position,
    scale: props.scale,
    rotation: props.rotation,
    args: props.args,
    visible: props.visible,
    opacity: props.opacity,
    userData: props.userData,
  }));
}
function facts(nodes: AuthoredNode[]): unknown[] {
  return nodes
    .filter((entry) => entry.props.userData)
    .map((entry) => ({ name: entry.props.name, facts: entry.props.userData }));
}
function boundaryCount(node: ReactNode): number {
  if (Array.isArray(node))
    return node.reduce<number>((total, child) => total + boundaryCount(child), 0);
  if (!isValidElement<{ children?: ReactNode }>(node)) return 0;
  return (node.type === Stage3D ? 1 : 0) + boundaryCount(node.props.children);
}
function escapedText(text: string): string {
  return renderToStaticMarkup(createElement('text', null, text)).slice(6, -7);
}

// Actual contract-parsed RAW + word + full-window fixtures, for both catalog-declared modes.
// These are CPU SVG/assembly tests, not native canvas, GPU, raster or projected-pixel proof.
describe('commercial scene parts', () => {
  it.each(
    COMMERCIAL_SOURCE_FIXTURES,
  )('$fixtureId renders the full fixed-font factual SVG and retains the source story', (source) => {
    const scene = parsed(source);
    const table = commercialTable(scene);
    const layout = layoutCommercialTable(table);
    const svg = renderToStaticMarkup(
      createElement(
        'svg',
        null,
        createElement(CommercialDiagramParts, { scene, seconds: scene.resolveAt }),
      ),
    );
    expect(svg).toContain(`data-business-recipe="${source.id}"`);
    for (const row of table.rows) expect(svg).toContain(`data-relationship-id="${row.id}"`);
    // Compare every character, including wrapped numerals, units and denominator text.
    const text = svg
      .replace(/<[^>]*>/gu, ' ')
      .replace(/\s+/gu, ' ')
      .trim();
    for (const word of [
      ...table.headings,
      ...table.rows.flatMap((row) => row.cells),
      ...table.notes,
    ].flatMap((cell) => cell.split(/\s+/u))) {
      // Long words wrap at fixed columns; all their characters remain in tspans.
      const chars = escapedText(word).replace(/\s/gu, '');
      expect(text.replace(/\s/gu, '')).toContain(chars);
    }
    expect(svg).toContain('font-size="24"');
    expect(svg).toContain('font-size="22"');
    expect(svg).not.toMatch(/font-size="(?:1\d|[0-9])"|ellipsis|foreignObject|<canvas|<image/u);
    expect(layout.height).toBeLessThanOrEqual(478);
    expect(layout.rowY.every((y) => y >= 60 && y < 478)).toBe(true);
    const view = CommercialSceneView({ scene });
    expect(view.type).toBe(HybridStage);
    if (!isValidElement<Parameters<typeof HybridStage>[0]>(view))
      throw new Error('missing commercial stage');
    expect(view.props.scene).toBe(scene);
    expect(view.props.scene.condition).toBe(scene.condition);
    expect(view.props.scene.outcome).toBe(scene.outcome);
    // The actual existing wrapper chooses zero/one authored Stage3D boundary.
    expect(boundaryCount(HybridStage(view.props))).toBe(scene.visualMode === 'hybrid' ? 1 : 0);
  });

  it.each(
    COMMERCIAL_SOURCE_FIXTURES,
  )('$fixtureId mounts bounded recognizable carriers with stable identities, facts and seekable holds', (source) => {
    const scene = parsed(source);
    const counts = commercialContentCounts(scene);
    expect(counts.identities).toBeLessThanOrEqual(8);
    expect(counts.links).toBeLessThanOrEqual(12);
    expect(counts.holds).toBeLessThanOrEqual(4);
    const times = [
      source.window.startTime,
      scene.setupAt,
      scene.actionAt,
      scene.responseAt,
      scene.checkAt,
      scene.resolveAt,
      source.window.endTime,
    ];
    const before = structuredClone(scene);
    const expected = new Map(times.map((seconds) => [seconds, fingerprint(model(scene, seconds))]));
    const initialFacts = facts(model(scene, scene.setupAt));
    const identities = commercialIdentities(scene)
      .map((entry) => `identity:${entry.id}`)
      .sort();
    for (const seconds of [...times, ...[...times].reverse(), scene.responseAt]) {
      const nodes = model(scene, seconds);
      expect(fingerprint(nodes)).toEqual(expected.get(seconds));
      expect(facts(nodes)).toEqual(initialFacts);
      expect(
        nodes
          .filter(
            (node) =>
              node.type === 'group' &&
              typeof node.props.name === 'string' &&
              node.props.name.startsWith('identity:'),
          )
          .map((node) => node.props.name)
          .sort(),
      ).toEqual(identities);
      expect(nodes.filter((node) => node.type === 'mesh').length).toBeGreaterThan(0);
      expect(nodes.filter((node) => node.type === 'mesh').length).toBeLessThanOrEqual(180);
      expect(nodes.some((node) => /Canvas|Stage3D|HybridStage/u.test(node.type))).toBe(false);
      expect(
        nodes
          .flatMap((node) =>
            [node.props.position, node.props.scale, node.props.rotation, node.props.args].flatMap(
              numbers,
            ),
          )
          .every(Number.isFinite),
      ).toBe(true);
    }
    expect(fingerprint(model(scene, source.window.endTime))).toEqual(
      fingerprint(model(scene, scene.resolveAt)),
    );
    const finalSvg = renderToStaticMarkup(
      createElement(CommercialDiagramParts, { scene, seconds: scene.resolveAt }),
    );
    expect(
      renderToStaticMarkup(
        createElement(CommercialDiagramParts, { scene, seconds: source.window.endTime }),
      ),
    ).toBe(finalSvg);
    expect(
      fingerprint(
        model(
          { ...scene, visualMode: scene.visualMode === 'diagram' ? 'hybrid' : 'diagram' },
          scene.resolveAt,
        ),
      ),
    ).toEqual(expected.get(scene.resolveAt));
    expect(scene).toEqual(before);
  });

  it('depicts absent measurements as absent documents, not zero slots, occupancy or available capacity', () => {
    const source = fixture('OP-19');
    const scene = parsed(source, { ...source.raw, reserved: null, used: null, available: null });
    const nodes = model(scene, scene.resolveAt);
    const quantities = nodes.filter(
      (node) => node.type === 'group' && String(node.props.name).startsWith('quantity:'),
    );
    expect(quantities).toHaveLength(3);
    for (const quantity of quantities)
      expect(quantity.props.userData).toMatchObject({ quantity: null });
    expect(nodes.filter((node) => node.type === 'PaperTray')).toHaveLength(3);
    expect(nodes.filter((node) => node.type === 'FoldedDocument')).toHaveLength(0);
    expect(nodes.find((node) => node.type === 'ServiceStation')?.props.occupied).toBe(false);
    expect(commercialTable(scene).rows[0].cells).toEqual([
      'Not stated',
      'Not stated',
      'Not stated',
    ]);
    const measured = parsed(source);
    expect(commercialTable(measured).notes.join(' ')).toContain(
      'slots; clients; July; denominator 10',
    );
    expect(
      named(model(measured, measured.resolveAt), 'quantity:available').props.userData,
    ).toMatchObject({ quantity: { state: 'unknown', count: null } });
  });

  it('an observed booking never accepts pending delivery or occupies the service station', () => {
    const scene = parsed(fixture('OP-20'));
    for (const seconds of [scene.setupAt, scene.resolveAt, 20]) {
      const nodes = model(scene, seconds);
      expect(named(nodes, 'stage:booking').props.userData).toMatchObject({
        sourceState: 'observed',
      });
      expect(named(nodes, 'stage:delivery').props.userData).toMatchObject({
        sourceState: 'pending',
      });
      expect(nodes.find((node) => node.type === 'ServiceStation')?.props.occupied).toBe(false);
      expect(named(nodes, 'identity:reservation').props.userData).toMatchObject({
        stages: [{ role: 'booking', state: 'observed' }],
      });
      expect(named(nodes, 'identity:package').props.userData).toMatchObject({
        stages: [{ role: 'delivery', state: 'pending' }],
      });
    }
  });

  it('conditional module contact does not close its rail, resolve its condition or complete a service', () => {
    const scene = parsed(fixture('OP-22'));
    for (const seconds of [scene.setupAt, scene.resolveAt, 20]) {
      const nodes = model(scene, seconds);
      expect(named(nodes, 'compatibility:intake:support').props.userData).toMatchObject({
        sourceState: 'conditional',
      });
      expect(
        nodes.find(
          (node) =>
            node.type === 'group' &&
            (node.props.userData as { sourceState?: string } | undefined)?.sourceState ===
              'conditional' &&
            'connected' in (node.props.userData as object),
        )?.props.userData,
      ).toMatchObject({ connected: false });
      expect(nodes.find((node) => node.type === 'ServiceStation')?.props.occupied).toBe(false);
      expect(nodes.some((node) => node.props.name === 'repeated-offering')).toBe(false);
    }
    expect(scene.condition).toBe('If approved');
    expect(commercialTable(scene).rows.at(-1)?.cells.at(-1)).toBe('conditional');
  });

  it('keeps the shared standard, both local units, locally bound contexts and use states distinct', () => {
    const scene = parsed(fixture('OP-23'));
    for (const seconds of [scene.setupAt, scene.responseAt, scene.resolveAt, 20]) {
      const nodes = model(scene, seconds);
      expect(nodes.filter((node) => node.type === 'BranchPod')).toHaveLength(2);
      expect(named(nodes, 'identity:guide').props.userData).toMatchObject({
        sourceIdentityId: 'guide',
      });
      expect(named(nodes, 'identity:north').props.userData).toMatchObject({
        standardUse: { state: 'observed' },
        localDifference: { label: 'Early hours', state: 'source-stated' },
      });
      expect(named(nodes, 'identity:south').props.userData).toMatchObject({
        standardUse: { state: 'pending' },
        localDifference: { label: 'Late hours', state: 'unknown' },
      });
      expect(named(nodes, 'context:north').props.userData).toMatchObject({ label: 'Early hours' });
      expect(named(nodes, 'context:south').props.userData).toMatchObject({ label: 'Late hours' });
    }
  });

  it.each([
    ['dependent', "Atlas's Payroll depends on Ada.", undefined],
    ['removed', "Atlas removed Payroll's dependency on Ada.", undefined],
    ['negative', "Atlas's Payroll does not depend on Ada.", undefined],
    ['unknown', "Atlas's Payroll dependency on Ada is unknown.", undefined],
    ['conditional', "If approved, Atlas's Payroll will depend on Ada.", 'If approved'],
  ] satisfies [
    FounderDependency['state'],
    string,
    string | undefined,
  ][])('changes the founder rail only for source-stated removal, not %s timing', (state, claim, condition) => {
    const source = makeCommercialSourceFixture(
      'OP-21',
      [
        'Atlas is a business. Ada is the founder. Payroll is a task.',
        claim,
        'Payroll records stay separate.',
        'The dependency is checked.',
        'Dependency remains stated.',
      ],
      (s) => ({
        business: s.identity('atlas', 'Atlas', 'Atlas is a business.'),
        founder: s.identity('ada', 'Ada', 'Ada is the founder.'),
        task: s.identity('payroll', 'Payroll', 'Payroll is a task.'),
        dependency: { state, source: s.span(claim) },
      }),
      condition,
    );
    const scene = parsed(source);
    const nodes = model(scene, 20);
    expect(named(nodes, 'founder-dependency').props.userData).toMatchObject({
      sourceState: state,
      removed: state === 'removed',
    });
    const rail = nodes.find((node) => node.type === 'CarrierLink');
    expect(rail?.props.opacity).toBe(state === 'removed' ? 0 : 1);
    expect(named(nodes, 'identity:payroll').props.userData).toMatchObject({
      sourceIdentityId: 'payroll',
    });
    expect(commercialTable(scene).rows[0].cells.at(-1)).toBe(state);
  });
});
