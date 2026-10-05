import { describe, expect, it } from 'vitest';
import {
  ECONOMICS_SOURCE_FIXTURES,
  ECONOMICS_SOURCE_NEGATIVES,
  economicsFixtureContext,
} from '../../remotion/compositions/explainer/business/economics/fixtures';
import { isRec, type Rec } from './kind-spec';
import {
  OPERATING_COST_SPEC,
  SCALE_ECONOMICS_SPEC,
  VALUE_CAPTURE_SPEC,
} from './kinds-business-economics';

const specs = [OPERATING_COST_SPEC, SCALE_ECONOMICS_SPEC, VALUE_CAPTURE_SPEC];
describe('concrete economics local KindSpecs', () => {
  for (const fixture of ECONOMICS_SOURCE_FIXTURES)
    it(`${fixture.id}: concrete accepted parser, actual JSON example and five neutral cues`, () => {
      const ctx = economicsFixtureContext(fixture);
      const scene =
        fixture.raw.kind === 'operating-cost'
          ? OPERATING_COST_SPEC.parse(fixture.raw, ctx)
          : fixture.raw.kind === 'scale-economics'
            ? SCALE_ECONOMICS_SPEC.parse(fixture.raw, ctx)
            : VALUE_CAPTURE_SPEC.parse(fixture.raw, ctx);
      expect(ctx.issues).toEqual([]);
      if (!scene) throw new Error('Rejected source fixture');
      const cues =
        scene.kind === 'operating-cost'
          ? OPERATING_COST_SPEC.cues(scene)
          : scene.kind === 'scale-economics'
            ? SCALE_ECONOMICS_SPEC.cues(scene)
            : VALUE_CAPTURE_SPEC.cues(scene);
      expect(cues.map((c) => c.at)).toEqual([
        scene.setupAt,
        scene.actionAt,
        scene.responseAt,
        scene.checkAt,
        scene.resolveAt,
      ]);
      expect(cues.every((c) => Number.isFinite(c.at) && (c.gain ?? 1) <= 0.25)).toBe(true);
      expect(cues.map((c) => c.kind)).not.toContain('stamp');
      const spec = specs.find((s) => s.kind === scene.kind);
      if (!spec) throw new Error('Missing typed spec');
      const line = spec.schema.split('\n').find((l) => l.startsWith(`${fixture.id}: `));
      if (!line) throw new Error('Missing dedicated schema example');
      const example: unknown = JSON.parse(line.slice(line.indexOf(': ') + 2));
      if (!isRec(example)) throw new Error('Not strict JSON object');
      const raw: Rec = {
        ...example,
        startWord: fixture.raw.startWord,
        endWord: fixture.raw.endWord,
        layout: fixture.raw.layout,
      };
      const exampleCtx = economicsFixtureContext(fixture);
      const accepted =
        raw.kind === 'operating-cost'
          ? OPERATING_COST_SPEC.parse(raw, exampleCtx)
          : raw.kind === 'scale-economics'
            ? SCALE_ECONOMICS_SPEC.parse(raw, exampleCtx)
            : VALUE_CAPTURE_SPEC.parse(raw, exampleCtx);
      expect(accepted, exampleCtx.issues.join('; ')).not.toBeNull();
    });
  for (const bad of ECONOMICS_SOURCE_NEGATIVES)
    it(`${bad.recipeId}: spec retains source-negative rejection`, () => {
      const ctx = economicsFixtureContext(bad.fixture);
      const rejected =
        bad.fixture.raw.kind === 'operating-cost'
          ? OPERATING_COST_SPEC.parse(bad.fixture.raw, ctx)
          : bad.fixture.raw.kind === 'scale-economics'
            ? SCALE_ECONOMICS_SPEC.parse(bad.fixture.raw, ctx)
            : VALUE_CAPTURE_SPEC.parse(bad.fixture.raw, ctx);
      expect(rejected).toBeNull();
      expect(ctx.issues.length).toBeGreaterThan(0);
    });
  it('retains existing data family and bounds, strict asset gates and every concrete preset', () => {
    for (const spec of specs) {
      expect(spec.family).toBe('data');
      expect(spec.durationSec).toEqual([5, 12]);
      expect(spec.layouts).toEqual(['stack', 'stack-flipped', 'takeover', 'pip', 'over']);
      for (const limit of ['<=8', '<=12', '<=4', '>=1.5s', '>=0.8s'])
        expect(spec.limits).toContain(limit);
      expect(spec.avoid).toBeTruthy();
      expect(spec.limits).toContain('no evidence swaps');
    }
    for (const fixture of ECONOMICS_SOURCE_FIXTURES)
      expect(specs.find((s) => s.kind === fixture.raw.kind)?.schema).toContain(
        String(fixture.raw.preset),
      );
    expect(OPERATING_COST_SPEC.limits).toContain('DIAGRAM ONLY');
    expect(VALUE_CAPTURE_SPEC.limits).toContain('not M-10');
  });
  it.each([
    'AI helps this business.',
    'An operating system uses a cost function.',
    'The implementation details use JavaScript variables.',
    'The model scaling laws increase token attention.',
    'Regex capture groups read market value.',
  ])('false friend does not force economics: %s', (text) => {
    expect(specs.some((s) => s.triggers?.some((t) => t.test(text)))).toBe(false);
  });
  it.each([
    'cost per resolved task',
    'implementation playbook revisions',
    'pricing bases',
    'stated-cost remainder',
    'fixed cost versus variable costs',
    'jobs and staffing',
    'source-stated allocation',
    'allocation components with retained remainder',
  ])('specific grounded trigger: %s', (text) => {
    expect(specs.some((s) => s.triggers?.some((t) => t.test(text)))).toBe(true);
  });
});
