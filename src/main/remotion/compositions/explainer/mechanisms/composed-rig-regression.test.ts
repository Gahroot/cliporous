import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Captured BEFORE extraction from the unchanged standalone models. Guards original
// mesh dimensions, transforms and material flags, not a replacement for pixel stills.
const BASELINE = [
  {
    file: 'mechanics',
    name: 'Gears',
    rig: 'GearsRig',
    hash: '27d1bcc7abd92d490ec38d2420e0938b4f748a19f37a354e0fa1772d56925d47',
  },
  {
    file: 'mechanics',
    name: 'Key',
    rig: 'KeyRig',
    hash: '66caa72bad4a4e477d5d9ab5e6aea9e0e46f2433d9a508c7a9030e492e6a574b',
  },
  {
    file: 'mechanics',
    name: 'Door',
    rig: 'DoorRig',
    hash: '84b8030576bdb361d5f1cac91e365859b11b770db15c8e74201f9b7afba1add2',
  },
  {
    file: 'growth',
    name: 'Sprout',
    rig: 'SproutRig',
    hash: 'cfddaef1fa36cf10abe2292ced1c516cd15fcd391f8b3091cb6d8af0d8e3b767',
  },
  {
    file: 'growth',
    name: 'Puzzle',
    rig: 'PuzzleRig',
    hash: '4f049bde317b41318b04870993f0800aeb6c6ab0f33f633f4b74a36bbd30db89',
  },
  {
    file: 'mind',
    name: 'Battery',
    rig: 'BatteryRig',
    hash: 'd63c016dc8fbb253a0191925c9b9b0556fbdcc9cc28803ea711293a552285eff',
  },
  {
    file: 'signals',
    name: 'Magnet',
    rig: 'MagnetRig',
    hash: '38ee095469bfcd42b2b39579c0464042979478596806e9ebd276994d473e81a1',
  },
] as const;
const ATTRS = new Set([
  'position',
  'rotation',
  'scale',
  'args',
  'roughness',
  'metalness',
  'opacity',
  'depthWrite',
  'transparent',
  'geometry',
]);
function declaration(source: ts.SourceFile, name: string): ts.VariableDeclaration {
  let found: ts.VariableDeclaration | undefined;
  function walk(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) found = node;
    ts.forEachChild(node, walk);
  }
  walk(source);
  if (!found) throw new Error(`Missing component ${name}`);
  return found;
}
describe('standalone geometry extraction regression guards', () => {
  it.each(BASELINE)('$name retains original mesh attributes and a clock-free rig', ({
    file,
    name,
    rig,
    hash,
  }) => {
    const text = readFileSync(new URL(`../hero-props/${file}.tsx`, import.meta.url), 'utf8');
    const source = ts.createSourceFile(
      `${file}.tsx`,
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const attrs: string[] = [];
    function collect(node: ts.Node): void {
      if (ts.isJsxAttribute(node) && ATTRS.has(node.name.getText(source)))
        attrs.push(
          node
            .getText(source)
            .replace(/\s+/g, '')
            .replace(/,(?=[\]}])/g, ''),
        );
      ts.forEachChild(node, collect);
    }
    collect(declaration(source, name));
    collect(declaration(source, rig));
    expect(createHash('sha256').update(JSON.stringify(attrs.sort())).digest('hex')).toBe(hash);
    expect(declaration(source, rig).getText(source)).not.toMatch(
      /useSceneTime|useSpringAt|useBreath|Date\.now|Math\.random/,
    );
  });
  it('keeps exploded magnification in one stage with the same selected part model', () => {
    const source = readFileSync(new URL('../ExplodedViewScene.tsx', import.meta.url), 'utf8');
    expect(source.match(/<MechanismStage\b/g)).toHaveLength(1);
    expect(source).not.toMatch(/<ThreeCanvas|<Canvas|<Stage3D|PerspectiveCamera/);
    expect(source).toContain('<DetailInset');
    expect(source).toContain('part={selected}');
    expect(source).toContain('camera={sampledCamera}');
  });
});
