import { describe, expect, it } from 'vitest';
import { DETROIT_CATALOG } from '../../remotion/compositions/explainer/detroit/catalog';
import { parseDetroitPlace } from './detroit-contract';
import { hybridFixture } from './hybrid-fixture';
import { detroitPlaceSpec } from './kinds-detroit';

function fixture(
  landmark = 'renaissance-center',
  preset = 'landmark-focus',
  mode = 'hybrid',
  name = 'Renaissance Center',
) {
  return hybridFixture(
    [
      `Detroit has the ${name}.`,
      `The ${name} has a recognizable silhouette.`,
      'The authored diagram keeps the same identity.',
      'The landmark remains distinct in this city portrait.',
      'A recognizable skyline gives the city its identity.',
    ],
    {
      kind: 'detroit-place',
      preset,
      visualMode: mode,
      label: name,
      subject: 'Detroit',
      outcome: 'A recognizable skyline',
      evidence: 'source-stated',
      landmarks: [landmark],
    },
  );
}
describe('source-grounded Detroit contract', () => {
  for (const mode of ['diagram', 'hybrid'])
    for (const preset of ['landmark-focus', 'city-portrait', 'market-block']) {
      it(`accepts ${preset}/${mode} with real source mapping`, () => {
        const f =
          preset === 'market-block'
            ? fixture('eastern-market', preset, mode, 'Eastern Market')
            : fixture('renaissance-center', preset, mode);
        const scene = detroitPlaceSpec.parse(f.raw, f.ctx);
        expect(scene, f.ctx.issues.join('; ')).not.toBeNull();
        expect(scene?.visualMode).toBe(mode);
        expect(scene).toEqual(detroitPlaceSpec.parse(f.raw, f.ctx));
        expect(scene?.resolveAt).toBeLessThanOrEqual(9.2);
      });
    }
  for (const entry of DETROIT_CATALOG)
    it(`accepts qualified ${entry.label}`, () => {
      const f = fixture(entry.id, 'landmark-focus', 'diagram', entry.label);
      expect(parseDetroitPlace(f.raw, f.ctx), f.ctx.issues.join('; ')).not.toBeNull();
    });
  for (const [field, value] of [
    ['landmarks', ['spirit-of-detroit']],
    ['landmarks', ['fox-theatre']],
    ['landmarks', ['renaissance-center', 'renaissance-center']],
    ['landmarks', Array(9).fill('renaissance-center')],
    ['visualMode', 'webgl'],
    ['camera', [1, 2, 3]],
    ['geometry', '<svg/>'],
    ['outcome', 'The fund owns the building'],
    ['resolveWord', 0],
    ['condition', 'If prices rise'],
  ])
    it(`rejects unsupported ${field}: ${JSON.stringify(value)}`, () => {
      const f = fixture();
      expect(parseDetroitPlace({ ...f.raw, [String(field)]: value }, f.ctx)).toBeNull();
      expect(f.ctx.issues.length).toBeGreaterThan(0);
    });
  it('cannot turn unqualified train station, fox or Renaissance into a landmark', () => {
    for (const [id, name] of [
      ['michigan-central', 'train station'],
      ['fox-theatre', 'fox'],
      ['renaissance-center', 'Renaissance'],
    ]) {
      const f = fixture(id, 'landmark-focus', 'diagram', name);
      expect(parseDetroitPlace(f.raw, f.ctx)).toBeNull();
    }
  });
});
