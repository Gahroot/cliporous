import { readFileSync } from 'node:fs';
import { type ComponentType, createElement, Fragment, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { Clay } from '../../hero-kit';
import type { ExpansionKitPose, ExpansionKitState } from '../scene-types';
import {
  ClaimPlaqueClay,
  type ClaimPlaqueProps,
  ClaimPlaqueSvg,
  EVIDENCE_CAP_BUDGET,
  EVIDENCE_SOURCE_BUDGETS,
  EvidenceDocumentClay,
  type EvidenceDocumentProps,
  EvidenceDocumentSvg,
  EvidenceLinkClay,
  type EvidenceLinkProps,
  type EvidenceLinkRole,
  EvidenceLinkSvg,
  MissingEvidenceSlotClay,
  type MissingEvidenceSlotProps,
  MissingEvidenceSlotSvg,
  ScopeTabClay,
  type ScopeTabProps,
  ScopeTabSvg,
} from './evidence';

// Only the hook/rounded-geometry leaf is substituted. Its actual one-mesh source is
// checked below; all asset assemblies and the real Clay material are expanded.
// This counts mounted meshes, including visible=false geometry, not GPU resources.
vi.mock('../../explanation-kit', () => ({
  ClayBlock: (props: Record<string, unknown>) =>
    createElement(
      'mesh',
      props,
      createElement('boxGeometry', { args: props.size }),
      createElement(Clay, {
        color: props.color as string,
        opacity: props.opacity as number | undefined,
      }),
    ),
}));

type Fixture = EvidenceDocumentProps &
  ClaimPlaqueProps &
  ScopeTabProps &
  EvidenceLinkProps &
  MissingEvidenceSlotProps;
type Intrinsic = { type: string; props: Record<string, unknown> };
const states: readonly ExpansionKitState[] = [
  'retained',
  'active',
  'excluded',
  'unknown',
  'disputed',
];
const roles: readonly EvidenceLinkRole[] = ['support', 'rebuttal', 'provenance'];
const colors = Object.freeze({
  surface: '#f6ecd9',
  text: '#23100c',
  accent: '#9f75ff',
  muted: '#81706a',
});
const poses: readonly ExpansionKitPose[] = [0, 0.15, 0.33, 0.5, 0.75, 1].map((p) =>
  Object.freeze({
    reveal: p,
    action: p,
    response: 1 - p,
    check: p * 0.8,
    resolve: p * 0.5,
  }),
);
const pairs: readonly {
  key: keyof typeof EVIDENCE_SOURCE_BUDGETS;
  svg: ComponentType<Fixture>;
  clay: ComponentType<Fixture>;
}[] = [
  { key: 'document', svg: EvidenceDocumentSvg, clay: EvidenceDocumentClay },
  { key: 'claimPlaque', svg: ClaimPlaqueSvg, clay: ClaimPlaqueClay },
  { key: 'scopeTab', svg: ScopeTabSvg, clay: ScopeTabClay },
  { key: 'link', svg: EvidenceLinkSvg, clay: EvidenceLinkClay },
  { key: 'missingSlot', svg: MissingEvidenceSlotSvg, clay: MissingEvidenceSlotClay },
];
function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return Object.freeze({
    id: 'evidence-authored-7',
    state: 'unknown',
    pose: poses[5],
    colors,
    placement: Object.freeze({ position: [0, 0, 0] as const, scale: 1 }),
    label: 'W'.repeat(4096),
    source: 'W'.repeat(4096),
    claim: 'W'.repeat(4096),
    scope: 'W'.repeat(4096),
    version: 'W'.repeat(4096),
    role: 'provenance',
    from: Object.freeze([-240, 240] as const),
    to: Object.freeze([240, -240] as const),
    ...overrides,
  });
}
function expand(node: unknown): Intrinsic[] {
  if (Array.isArray(node)) return node.flatMap(expand);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  if (node.type === Fragment) return expand(node.props.children);
  if (typeof node.type === 'function')
    return expand(Reflect.apply(node.type, undefined, [node.props]));
  if (typeof node.type !== 'string') throw new Error('Unsupported component in source accounting');
  if (['primitive', 'instancedMesh', 'skinnedMesh', 'canvas'].includes(node.type))
    throw new Error(`Unaccounted or forbidden intrinsic: ${node.type}`);
  const { children, ...props } = node.props;
  return [{ type: node.type, props }, ...expand(children)];
}
const meshes = (node: ReactNode): number => expand(node).filter((n) => n.type === 'mesh').length;
const svg = (node: ReactNode): string =>
  renderToStaticMarkup(createElement('svg', { xmlns: 'http://www.w3.org/2000/svg' }, node));
const svgCount = (markup: string): number =>
  [...markup.matchAll(/<([a-zA-Z][\w:-]*)\b/g)].length - 1;
function finiteProps(value: unknown): void {
  if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
  else if (Array.isArray(value)) value.forEach(finiteProps);
  else if (value && typeof value === 'object') Object.values(value).forEach(finiteProps);
}
function signature(component: ComponentType<Fixture>, props: Fixture): string {
  return JSON.stringify(expand(createElement(component, props)));
}

// No collection validator is exported by these individual assets. ID uniqueness and
// 8/12/16 cardinality rejection belong to the caller; only that bounded envelope is proved.
describe('evidence source assets (CPU JSX/SSR, not native rendering)', () => {
  it('ties the only mocked helper to its actual single intrinsic mesh and Clay material', () => {
    const path = 'src/main/remotion/compositions/explainer/explanation-kit.tsx';
    const source = ts.createSourceFile(
      path,
      readFileSync(path, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const block = source.statements.find(
      (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === 'ClayBlock',
    );
    expect(block).toBeDefined();
    const tags: string[] = [];
    function visit(node: ts.Node): void {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
        tags.push(node.tagName.getText(source));
      ts.forEachChild(node, visit);
    }
    visit(block as ts.Node);
    expect(tags.filter((tag) => tag === 'mesh')).toHaveLength(1);
    expect(tags.filter((tag) => tag === 'Clay')).toHaveLength(1);
    expect(
      tags.filter((tag) => ['primitive', 'instancedMesh', 'skinnedMesh'].includes(tag)),
    ).toEqual([]);
  });

  for (const pair of pairs) {
    it(`${pair.key}: measures its exact ceiling across every state, role and hidden pose`, () => {
      let maxMeshes = 0;
      let maxSvg = 0;
      for (const state of states)
        for (const role of roles)
          for (const pose of poses) {
            const props = fixture({ state, role, pose });
            const clay = createElement(pair.clay, props);
            const planar = createElement(pair.svg, props);
            const clayCount = meshes(clay);
            const planarCount = expand(planar).length;
            const markup = svg(planar);
            expect(svgCount(markup)).toBe(planarCount);
            expect(
              expand(planar).every((n) => ['g', 'path', 'rect', 'text', 'circle'].includes(n.type)),
            ).toBe(true);
            expect(markup).not.toMatch(/canvas|foreignObject|<image|<script/);
            expect(clayCount).toBeLessThanOrEqual(EVIDENCE_SOURCE_BUDGETS[pair.key].meshes);
            expect(planarCount).toBeLessThanOrEqual(EVIDENCE_SOURCE_BUDGETS[pair.key].svgElements);
            if (pose.reveal === 0) {
              expect(expand(clay)[0].props.visible).toBe(false);
              expect(clayCount).toBe(meshes(createElement(pair.clay, fixture({ state, role }))));
              expect(expand(planar)[0].props.opacity).toBe(0);
            }
            maxMeshes = Math.max(maxMeshes, clayCount);
            maxSvg = Math.max(maxSvg, planarCount);
          }
      expect({ meshes: maxMeshes, svgElements: maxSvg }).toEqual(EVIDENCE_SOURCE_BUDGETS[pair.key]);
    });

    it(`${pair.key}: remains identical for chronological, shuffled and repeated seeks`, () => {
      for (const state of states)
        for (const role of roles) {
          const baseline = poses.map((pose) => {
            const props = fixture({ state, role, pose });
            return { clay: signature(pair.clay, props), svg: svg(createElement(pair.svg, props)) };
          });
          for (const index of [5, 0, 2, 4, 1, 3, 3, 0, 5]) {
            const props = fixture({ state, role, pose: poses[index] });
            expect(signature(pair.clay, props)).toBe(baseline[index].clay);
            expect(svg(createElement(pair.svg, props))).toBe(baseline[index].svg);
          }
        }
    });

    it(`${pair.key}: bounds labels, authored placement and degenerate/nonfinite poses`, () => {
      for (const length of [0, 21, 22, 23, 4096]) {
        const value = 'W'.repeat(length);
        const planar = expand(
          createElement(
            pair.svg,
            fixture({ label: value, source: value, claim: value, scope: value, version: value }),
          ),
        );
        for (const text of planar.filter(
          (n) => n.type === 'text' && n.props.textLength !== undefined,
        )) {
          expect(text.props.textLength).toBeGreaterThanOrEqual(0);
          expect(text.props.textLength).toBeLessThanOrEqual(128);
          expect(text.props.lengthAdjust).toBe('spacingAndGlyphs');
          expect(text.props.fontFamily).toContain('Inter');
        }
        const markup = svg(
          createElement(
            pair.svg,
            fixture({ label: value, source: value, claim: value, scope: value, version: value }),
          ),
        );
        expect(markup).not.toContain('W'.repeat(23));
      }
      for (const pose of [
        { reveal: -1, action: -1, response: -1, check: -1, resolve: -1 },
        { reveal: 100, action: 100, response: 100, check: 100, resolve: 100 },
        {
          reveal: Number.NaN,
          action: Number.POSITIVE_INFINITY,
          response: Number.NEGATIVE_INFINITY,
          check: Number.NaN,
          resolve: 100,
        },
      ]) {
        const props = fixture({
          pose,
          placement: {
            position: [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY],
            scale: Number.NaN,
          },
          from: [Number.NaN, Number.POSITIVE_INFINITY],
          to: [Number.NEGATIVE_INFINITY, Number.NaN],
        });
        expand(createElement(pair.clay, props)).forEach((n) => {
          finiteProps(n.props);
        });
        expand(createElement(pair.svg, props)).forEach((n) => {
          finiteProps(n.props);
        });
        expect(svg(createElement(pair.svg, props))).not.toMatch(/NaN|Infinity/);
      }
      const props = fixture({ placement: { position: [1e10, -1e10, 1e10], scale: 1e10 } });
      expect(expand(createElement(pair.clay, props))[0].props.position).toEqual([32, -32, 32]);
      expect(expand(createElement(pair.clay, props))[0].props.scale).toBe(8);
      expect(expand(createElement(pair.svg, props))[0].props.transform).toBe(
        'translate(4096 -4096) scale(8)',
      );
    });

    it(`${pair.key}: keeps state visible in words AND geometry with a monochrome palette`, () => {
      const monochrome = {
        surface: '#222222',
        text: '#222222',
        accent: '#222222',
        muted: '#222222',
      };
      const statePaths = states.map((state) => {
        const props = fixture({ state, colors: monochrome });
        const markup = svg(createElement(pair.svg, props));
        expect(markup).toContain(state[0].toUpperCase() + state.slice(1));
        const nodes = expand(createElement(pair.svg, props));
        const badgeIndex = nodes.findIndex(
          (n) => n.type === 'g' && n.props.transform === 'translate(-30 0)',
        );
        return nodes[badgeIndex + 1].props.d;
      });
      expect(new Set(statePaths).size).toBe(states.length);
      const unknown = fixture({ state: 'unknown', colors: monochrome });
      const excluded = fixture({ state: 'excluded', colors: monochrome });
      expect(
        meshes(createElement(pair.clay, unknown)) - meshes(createElement(pair.clay, excluded)),
      ).toBe(3);
      expect(signature(pair.clay, unknown)).not.toBe(signature(pair.clay, excluded));
    });
  }

  it('retains source/claim/scope/version values and caller identity, escaping raw directives', () => {
    const props = fixture({
      label: 'Source ledger',
      source: 'Archive record #7',
      claim: 'Stated hypothesis',
      scope: 'Only adults',
      version: 'v3.2',
    });
    expect(svg(createElement(EvidenceDocumentSvg, props))).toContain('Source ledger');
    expect(svg(createElement(EvidenceDocumentSvg, props))).toContain('Archive record #7');
    expect(svg(createElement(ClaimPlaqueSvg, props))).toContain('Stated hypothesis');
    const tab = svg(createElement(ScopeTabSvg, props));
    expect(tab).toContain('Scope: Only adults');
    expect(tab).toContain('Version: v3.2');
    for (const pair of pairs) {
      expect(svg(createElement(pair.svg, props))).toContain(
        'data-evidence-id="evidence-authored-7"',
      );
      expect(expand(createElement(pair.clay, props))[0].props.name).toBe(props.id);
      const escaped = svg(
        createElement(
          pair.svg,
          fixture({
            label: '<script/>',
            source: '<script/>',
            claim: '<script/>',
            scope: '<script/>',
            version: '<script/>',
          }),
        ),
      );
      expect(escaped).not.toContain('<script');
      if (pair.key !== 'link') expect(escaped).toContain('&lt;script/&gt;');
      const nodes = expand(createElement(pair.svg, props));
      for (const n of nodes)
        for (const key of ['fill', 'stroke']) {
          if (n.props[key] !== undefined)
            expect([...Object.values(colors), 'none']).toContain(n.props[key]);
        }
      for (const n of expand(createElement(pair.clay, props)).filter(
        (n) => n.type === 'meshPhysicalMaterial',
      ))
        expect(Object.values(colors)).toContain(n.props.color);
    }
  });

  it('retains distinct support, rebuttal and provenance connectors rather than generic arrows', () => {
    const terminals: unknown[] = [];
    const clayCounts: number[] = [];
    for (const role of roles) {
      const props = fixture({ role, state: 'retained', from: [-120, 0], to: [120, 0] });
      const markup = svg(createElement(EvidenceLinkSvg, props));
      expect(markup).toContain(role[0].toUpperCase() + role.slice(1));
      const paths = expand(createElement(EvidenceLinkSvg, props)).filter((n) => n.type === 'path');
      terminals.push(paths[1].props.d);
      expect(paths[0].props.strokeDasharray).toBe(role === 'provenance' ? '8 6' : undefined);
      const clay = createElement(EvidenceLinkClay, props);
      clayCounts.push(meshes(clay));
      expect(expand(clay).some((n) => n.type === 'torusGeometry')).toBe(role === 'provenance');
    }
    expect(new Set(terminals).size).toBe(3);
    expect(new Set(clayCounts).size).toBe(3);
  });

  it('preserves an empty missing cradle independently from unknown truth and exclusion', () => {
    const missing = fixture({ label: 'Absent source', state: 'unknown' });
    const markup = svg(createElement(MissingEvidenceSlotSvg, missing));
    expect(markup).toContain('Absent source');
    expect(markup).toContain('Missing (not false)');
    expect(markup).toContain('Unknown');
    const outline = expand(createElement(MissingEvidenceSlotSvg, missing)).find(
      (n) => n.type === 'rect',
    );
    expect(outline?.props.fill).toBe('none');
    expect(outline?.props.strokeDasharray).toBe('6 5');
    expect(svg(createElement(EvidenceDocumentSvg, missing))).not.toContain('Missing (not false)');
    expect(svg(createElement(MissingEvidenceSlotSvg, fixture({ state: 'excluded' })))).toContain(
      'Excluded',
    );
    expect(signature(MissingEvidenceSlotClay, missing)).not.toBe(
      signature(EvidenceDocumentClay, missing),
    );
  });

  it('measures the actual maximum caller envelope, including tabs and hidden links', () => {
    const { actors, records, relations } = EVIDENCE_CAP_BUDGET;
    const planar: ReactNode[] = [];
    const clay: ReactNode[] = [];
    const add = (pair: (typeof pairs)[number], id: string): void => {
      const props = fixture({ id, pose: poses[0], state: 'unknown', role: 'provenance' });
      planar.push(createElement(pair.svg, { ...props, key: id }));
      clay.push(createElement(pair.clay, { ...props, key: id }));
    };
    for (let i = 0; i < actors; i++) add(pairs[1], `claim-${i}`);
    for (let i = 0; i < records; i++) {
      add(pairs[0], `source-${i}`);
      add(pairs[2], `scope-${i}`);
    }
    for (let i = 0; i < relations; i++) add(pairs[3], `relation-${i}`);
    expect(meshes(clay)).toBe(EVIDENCE_CAP_BUDGET.meshes);
    expect(expand(planar)).toHaveLength(EVIDENCE_CAP_BUDGET.svgElements);
    expect(svgCount(svg(planar))).toBe(EVIDENCE_CAP_BUDGET.svgElements);
    const ids = expand(planar)
      .filter((n) => n.props['data-evidence-id'] !== undefined)
      .map((n) => n.props['data-evidence-id']);
    expect(new Set(ids).size).toBe(actors + records * 2 + relations);
    expect(expand(clay).filter((n) => n.props.visible === false)).toHaveLength(
      actors + records * 2 + relations,
    );
    const missing = pairs[4];
    expect(meshes(createElement(missing.clay, fixture()))).toBeLessThanOrEqual(
      meshes(createElement(pairs[0].clay, fixture())),
    );
    expect(expand(createElement(missing.svg, fixture())).length).toBeLessThanOrEqual(
      expand(createElement(pairs[0].svg, fixture())).length,
    );
  });
});
