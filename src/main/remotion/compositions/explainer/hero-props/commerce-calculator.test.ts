import { readFileSync } from 'node:fs';
import { Children, createElement, isValidElement, type ReactNode } from 'react';
import { Box3, BoxGeometry, BufferGeometry, Group, Mesh, type Object3D } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMMERCE_TIMING } from '../hero-catalog';
import { STAGE } from '../stage';
import { CalculatorRig } from './commerce';
import {
  CALCULATOR_KEY_CONTACTS,
  CALCULATOR_KEY_RELEASE_SEC,
  CALCULATOR_KEY_STROKE,
  sampleCalculatorPose,
} from './commerce-poses';

// Expand the real meshes/segments without a Canvas. This is geometry/wiring coverage,
// not a replacement for the parent's rebuilt-bundle visual matrix.
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => unknown) => factory(),
  useEffect: () => undefined,
}));
vi.mock('../stage', async (original) => {
  const actual = await original<typeof import('../stage')>();
  return { ...actual, useStage: () => actual.STAGE };
});

const owned = new Set<BufferGeometry>();
afterEach(() => {
  for (const geometry of owned) geometry.dispose();
  owned.clear();
});

function calculator(time: number): Group {
  const root = new Group();
  const visit = (children: ReactNode, parent: Object3D): void => {
    Children.forEach(children, (node) => {
      if (!isValidElement<Record<string, unknown>>(node)) return;
      const { type, props } = node;
      if (typeof type === 'function') {
        visit((type as (props: Record<string, unknown>) => ReactNode)(props), parent);
        return;
      }
      if (type === 'group' || type === 'mesh') {
        const object = type === 'mesh' ? new Mesh() : new Group();
        if (object instanceof Mesh) owned.add(object.geometry);
        object.name = typeof props.name === 'string' ? props.name : '';
        object.visible = props.visible !== false;
        if (Array.isArray(props.position)) object.position.fromArray(props.position);
        if (Array.isArray(props.rotation))
          object.rotation.set(props.rotation[0], props.rotation[1], props.rotation[2]);
        if (Array.isArray(props.scale)) object.scale.fromArray(props.scale);
        else if (typeof props.scale === 'number') object.scale.setScalar(props.scale);
        parent.add(object);
        visit(props.children as ReactNode, object);
        return;
      }
      if (parent instanceof Mesh) {
        const geometry =
          type === 'boxGeometry'
            ? new BoxGeometry(...(props.args as [number, number, number]))
            : type === 'primitive' && props.object instanceof BufferGeometry
              ? props.object
              : null;
        if (geometry) {
          parent.geometry = geometry;
          owned.add(geometry);
        }
        if (type === 'meshPhysicalMaterial') {
          parent.userData.opacity = props.opacity;
          parent.userData.color = props.color;
        }
      }
      visit(props.children as ReactNode, parent);
    });
  };
  visit(createElement(CalculatorRig, sampleCalculatorPose(time)), root);
  root.updateMatrixWorld(true);
  return root;
}

function named(root: Object3D, name: string): Object3D {
  const node = root.getObjectByName(name);
  if (!node) throw new Error(`Missing authored calculator part: ${name}`);
  return node;
}

// Decode the actual segment combination, not just the symbol's group name.
const SYMBOLS: Record<string, string> = {
  abcdef: '0',
  bc: '1',
  abdeg: '2',
  abcdg: '3',
  bcfg: '4',
  acdfg: '5',
  acdefg: '6',
  abc: '7',
  abcdefg: '8',
  abcdfg: '9',
  gh: '+',
  ij: '=',
};
function symbol(node: Object3D): string {
  const segments: string[] = [];
  node.traverse((part) => {
    if (part instanceof Mesh) {
      expect(part.geometry.type).toBe('BoxGeometry');
      expect(part.name).toMatch(/^segment-[a-j]$/);
      segments.push(part.name.slice('segment-'.length));
    }
  });
  const glyph = SYMBOLS[segments.sort().join('')];
  if (!glyph) throw new Error(`Unrecognizable calculator segments: ${segments}`);
  return glyph;
}
function display(root: Object3D): string {
  return named(root, 'calculator-display')
    .children.filter((part) => part.visible)
    .map(symbol)
    .join('');
}

describe('authored calculator geometry', () => {
  it('uses a numeric keypad and a compact complete 1+1=2 display, never a completion badge', () => {
    const root = calculator(COMMERCE_TIMING.calculator);
    const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '+', '0', '='];
    for (const [index, glyph] of keys.entries()) {
      const key = named(root, `calculator-key-${glyph}`);
      expect(key.position.toArray()).toEqual([
        ((index % 3) - 1) * 0.4,
        0.23 - Math.floor(index / 3) * 0.31,
        0.205,
      ]);
      expect(symbol(named(key, `calculator-symbol-${glyph}`))).toBe(glyph);
    }
    expect(display(root)).toBe('1+1=2');
    const result = named(root, 'calculator-result');
    expect(symbol(result)).toBe('2');
    // The 2 has upper-right and lower-left vertical strokes, not a mirrored 5.
    expect(named(result, 'segment-b').position.toArray()).toEqual([0.05, 0.034, 0]);
    expect(named(result, 'segment-e').position.toArray()).toEqual([-0.05, -0.034, 0]);
    const screen = named(root, 'calculator-display').clone(true);
    screen.position.set(0, 0, 0);
    const bounds = new Box3().setFromObject(screen, true);
    expect(bounds.min.x).toBeGreaterThan(-1.04 / 2);
    expect(bounds.max.x).toBeLessThan(1.04 / 2);
    expect(bounds.min.y).toBeGreaterThan(-0.29 / 2);
    expect(bounds.max.y).toBeLessThan(0.29 / 2);
  });

  it('uses palette text on the screen and paper text on the light key caps', () => {
    const root = calculator(COMMERCE_TIMING.calculator);
    const assertColor = (part: Object3D, color: string): void => {
      part.traverse((node) => {
        if (node instanceof Mesh) expect(node.userData.color).toBe(color);
      });
    };
    for (let index = 0; index < 4; index++)
      assertColor(named(root, `calculator-input-${index}`), STAGE.text);
    assertColor(named(root, 'calculator-result'), STAGE.accent);
    for (const glyph of ['7', '8', '9', '4', '5', '6', '1', '2', '3', '+', '0', '=']) {
      const key = named(root, `calculator-key-${glyph}`);
      assertColor(named(key, `calculator-symbol-${glyph}`), STAGE.paperText);
    }
  });

  it('moves the same 1 key twice and exposes each input only after its release', () => {
    const keys = ['1', '+', '1', '='];
    const prefixes = ['', '1', '1+', '1+1', '1+1='];
    for (const [index, at] of CALCULATOR_KEY_CONTACTS.entries()) {
      const root = calculator(at);
      for (const glyph of ['1', '+', '=']) {
        expect(named(root, `calculator-key-${glyph}`).position.z).toBeCloseTo(
          0.205 - (glyph === keys[index] ? CALCULATOR_KEY_STROKE : 0),
          12,
        );
      }
      expect(display(root)).toBe(prefixes[index]);
      expect(named(root, 'calculator-result').visible).toBe(false);
      expect(display(calculator(at + CALCULATOR_KEY_RELEASE_SEC))).toBe(prefixes[index + 1]);
    }
    expect(display(calculator(1.06))).toBe('1+1=');
    const resolving = calculator(1.1);
    expect(display(resolving)).toBe('1+1=2');
    named(resolving, 'calculator-result').traverse((part) => {
      if (part instanceof Mesh) {
        expect(part.userData.opacity).toBe(sampleCalculatorPose(1.1).display);
        expect(part.userData.opacity).toBeGreaterThan(0);
        expect(part.userData.opacity).toBeLessThan(1);
      }
    });
  });

  it('keeps every mesh bounded and the final display unchanged through the settled hold', () => {
    for (const time of [0, ...CALCULATOR_KEY_CONTACTS, 1.06, 1.2, 3.5, 1e6]) {
      const root = calculator(time);
      const bounds = new Box3().setFromObject(root, true);
      for (const coordinate of [...bounds.min.toArray(), ...bounds.max.toArray()]) {
        expect(Number.isFinite(coordinate)).toBe(true);
        expect(Math.abs(coordinate)).toBeLessThan(1.1);
      }
      if (time >= COMMERCE_TIMING.calculator) {
        expect(display(root)).toBe('1+1=2');
        named(root, 'calculator-result').traverse((part) => {
          if (part instanceof Mesh) expect(part.userData.opacity).toBe(1);
        });
      }
    }
  });
});

it('keeps neutral commerce fixture variants and probes before/on/after all four contacts and result', () => {
  const fixtures = JSON.parse(
    readFileSync(
      new URL(
        '../../../../../../scripts/explainer-stills/fixtures/props-commerce.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as {
    name: string;
    scene: { label: string; at: number };
    cases: { name: string }[];
    samples: { name: string; frame: number }[];
  }[];
  const fixture = fixtures.find((entry) => entry.name === 'calculator');
  if (!fixture) throw new Error('Missing calculator fixture');
  expect(fixture.scene.label).toBe('Simple arithmetic');
  expect(fixture.cases.map((entry) => entry.name)).toEqual(['violet', 'amber']);
  expect(fixture.samples).toHaveLength(16);
  const time = (name: string): number => {
    const sample = fixture.samples.find((entry) => entry.name === name);
    if (!sample) throw new Error(`Missing calculator sample: ${name}`);
    return sample.frame / 30 - fixture.scene.at;
  };
  for (const [index, name] of ['first-1', 'plus', 'second-1', 'equals'].entries()) {
    const at = CALCULATOR_KEY_CONTACTS[index];
    const key = [0, 1, 0, 2][index];
    expect(time(`${name}-on`)).toBeCloseTo(at, 12);
    expect(sampleCalculatorPose(time(`${name}-on`)).keyDepths[key]).toBeCloseTo(
      CALCULATOR_KEY_STROKE,
      12,
    );
    expect(time(`${name}-before`)).toBeLessThan(at);
    expect(time(`${name}-after`)).toBeGreaterThan(at);
  }
  expect(sampleCalculatorPose(time('result-before'))).toEqual({
    keyDepths: [0, 0, 0],
    inputCount: 4,
    display: 0,
  });
  const result = sampleCalculatorPose(time('result-on'));
  expect(result).toEqual({ keyDepths: [0, 0, 0], inputCount: 4, display: 1 });
  expect(sampleCalculatorPose(time('result-after'))).toEqual(result);
  expect(sampleCalculatorPose(time('hold'))).toEqual(result);
});
