import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type ComponentType, createElement, Fragment, isValidElement } from 'react';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { ApprovalRail, ExceptionTrolley, PermissionCard, PlaybookBinder } from './authority';
import { AUTHORITY_ASSET_BUDGETS, AUTHORITY_ASSET_IDS } from './authority-poses';

// Actual recursive model JSX accounting, not rendered/GPU/draw-call/resource proof.
// Never skip mounted children for visible=false, zero scale or zero opacity.
vi.mock('../../stage', async (original) => {
  const actual = await original<typeof import('../../stage')>();
  return { ...actual, useStage: () => actual.STAGE };
});
vi.mock('../../hero-kit', () => ({ Clay: () => null }));
vi.mock('../../explanation-kit', () => ({ ClayBlock: () => createElement('mesh') }));

type Props = Record<string, unknown>;
const geometryLeaves = new Set([
  'cylinderGeometry',
  'torusGeometry',
  'sphereGeometry',
  'capsuleGeometry',
]);
function meshes(node: unknown): number {
  if (Array.isArray(node)) return node.reduce<number>((sum, child) => sum + meshes(child), 0);
  if (node === null || node === undefined || typeof node === 'boolean') return 0;
  if (!isValidElement<Props>(node)) throw new Error('Unaccounted non-element in mesh accounting');
  if (node.type === Fragment) return meshes(node.props.children);
  if (typeof node.type === 'function')
    return meshes(Reflect.apply(node.type, undefined, [node.props]));
  if (typeof node.type !== 'string') throw new Error('Unaccounted component in mesh accounting');
  if (node.type === 'mesh') {
    if (node.props.geometry !== undefined) throw new Error('Unaccounted prebuilt geometry');
    return 1 + meshes(node.props.children);
  }
  if (node.type === 'group' || geometryLeaves.has(node.type)) return meshes(node.props.children);
  throw new Error(`Unaccounted JSX type: ${node.type}`);
}
function count<T extends object>(model: ComponentType<T>, props: T): number {
  return meshes(createElement(model, props));
}

const counted = { 'A-05': 12, 'A-06': 24, 'A-07': 21, 'A-08': 24 } as const;
function withinBudget(id: (typeof AUTHORITY_ASSET_IDS)[number], actual: number): void {
  expect(actual).toBe(counted[id]);
  expect(actual).toBeLessThanOrEqual(AUTHORITY_ASSET_BUDGETS[id]);
  expect(AUTHORITY_ASSET_BUDGETS[id]).toBeLessThanOrEqual(24);
}

describe('authority actual JSX mesh accounting (CPU only)', () => {
  it('ties the mocked ClayBlock leaf to the real single-mesh definition', () => {
    const path = resolve('src/main/remotion/compositions/explainer/explanation-kit.tsx');
    const source = ts.createSourceFile(
      path,
      readFileSync(path, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const block = source.statements.find(
      (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'ClayBlock',
    );
    if (!block) throw new Error('Missing ClayBlock');
    const tags: string[] = [];
    function visit(node: ts.Node): void {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
        tags.push(node.tagName.getText(source));
      ts.forEachChild(node, visit);
    }
    visit(block);
    expect(tags).toEqual(['mesh', 'Clay']);
  });

  it('rejects unknown JSX, instancing, prebuilt objects, skinned meshes and opaque components', () => {
    for (const type of [
      'primitive',
      'instancedMesh',
      'skinnedMesh',
      'line',
      'sprite',
      'unknownMesh',
    ]) {
      expect(() => meshes(createElement(type))).toThrow('Unaccounted JSX type');
    }
    expect(() => meshes(createElement('mesh', { geometry: {} }))).toThrow(
      'Unaccounted prebuilt geometry',
    );
    expect(() => meshes({ geometry: 'opaque' })).toThrow('Unaccounted non-element');
  });

  it('counts mounted meshes even when hidden, scaled to zero or using zero opacity', () => {
    expect(
      meshes(
        createElement(
          'group',
          { visible: false, scale: 0 },
          createElement('mesh', { visible: false, material: { opacity: 0 } }),
          createElement('mesh', { scale: [0, 0, 0] }),
        ),
      ),
    ).toBe(2);
  });

  it('covers exactly the four exported asset budgets with authored counts', () => {
    expect(Object.keys(counted)).toEqual([...AUTHORITY_ASSET_IDS]);
    expect(counted).toEqual(AUTHORITY_ASSET_BUDGETS);
  });

  it.each([
    'allowed',
    'denied',
    'unknown',
  ] as const)('A-05 permission=%s: twelve meshes at every focus', (state) => {
    for (const focus of [0, 0.5, 1]) withinBudget('A-05', count(PermissionCard, { state, focus }));
  });

  it.each([
    0, 0.5, 1,
  ])('A-06 accepted=%s: includes the document, connector and approver meshes', (accepted) => {
    withinBudget('A-06', count(ApprovalRail, { accepted }));
  });

  for (const revision of [0, 1] as const) {
    it.each([
      0, 0.5, 1,
    ])(`A-07 revision=${revision}, open=%s: counts both mounted version sheets`, (open) => {
      withinBudget('A-07', count(PlaybookBinder, { revision, open }));
    });
  }

  it.each([
    true,
    false,
  ])('A-08 pending=%s: counts the mounted document and pause marks even when hidden', (pending) => {
    withinBudget('A-08', count(ExceptionTrolley, { pending }));
  });
});
