import { allHybridFixtures } from '../../src/main/ai/explainer/hybrid-test-fixtures';
import { getKindSpec } from '../../src/main/ai/explainer/kinds';
import { DIAGRAM_LAYOUTS } from '../../src/main/remotion/compositions/explainer/diagrams/types';
import { deriveExplainerPalette } from '../../src/main/remotion/compositions/explainer/palette';
import type {
  ExplainerPalette,
  ExplainerScene,
} from '../../src/main/remotion/compositions/explainer/types';

export const HYBRID_DARK_PALETTE = deriveExplainerPalette({
  background: '#23100c',
  foreground: '#f6ecd9',
  accent: '#9f75ff',
});
/** Deliberate light-stage stress case; production seed derivation normally chooses a dark stage. */
export const HYBRID_LIGHT_PALETTE: ExplainerPalette = {
  ...HYBRID_DARK_PALETTE,
  bgOuter: '#f6ecd9',
  bgInner: '#fffaf2',
  card: '#f6ecd9',
  cardRaised: '#fffaf2',
  cardBorder: '#7c6c62',
  text: '#23100c',
  muted: '#635045',
  paper: '#fffaf2',
  paperText: '#23100c',
};

export function hybridFixtureFiles(): Record<string, unknown[]> {
  const rows = allHybridFixtures().map(({ name, fixture }) => {
    const spec = getKindSpec(String(fixture.raw.kind));
    const scene = spec?.parse(fixture.raw, fixture.ctx);
    if (!scene) throw new Error(`${name}: ${fixture.ctx.issues.join('; ')}`);
    return {
      name,
      sourceText: fixture.sourceText,
      sourceWords: fixture.words,
      plannerInput: { ...fixture.raw, layout: 'stack' },
      durationSec: fixture.durationSec,
      scene,
      palette: HYBRID_DARK_PALETTE,
      covers: [
        String(fixture.raw.kind),
        String(fixture.raw.preset),
        String(fixture.raw.visualMode),
        ...('landmarks' in scene ? scene.landmarks : []),
      ],
      samples: [
        { name: 'setup', frame: 30 },
        { name: 'action', frame: 87 },
        { name: 'response', frame: 126 },
        { name: 'check', frame: 200 },
        { name: 'resolve', frame: 247 },
        { name: 'hold', frame: 282 },
      ],
      cases: DIAGRAM_LAYOUTS.flatMap((layout) =>
        ['light', 'dark'].map((palette) => ({
          name: `${layout}-${palette}`,
          layout,
          aspect: layout === 'over' ? '16:9' : '9:16',
          palette: palette === 'light' ? HYBRID_LIGHT_PALETTE : HYBRID_DARK_PALETTE,
        })),
      ),
    };
  });
  const showcaseKinds = [
    'detroit-place',
    'fund-flow',
    'cash-timing',
    'ownership-change',
    'token-attention',
    'portfolio-exposure',
    'inference-tradeoff',
  ];
  const showcase = showcaseKinds.map((kind, i) => {
    const row = rows.find(
      (row) =>
        row.scene.kind === kind &&
        'visualMode' in row.scene &&
        row.scene.visualMode === (i % 2 === 0 ? 'hybrid' : 'diagram') &&
        (kind !== 'detroit-place' ||
          ('preset' in row.scene && row.scene.preset === 'city-portrait')),
    );
    if (!row) throw new Error(`Showcase missing ${kind}`);
    return {
      ...row,
      name: `chapter-${i + 1}-${kind}`,
      cases: undefined,
      aspect: '9:16',
      layout: 'stack',
    };
  });
  const stress = rows
    .filter((row, i) => rows.findIndex((other) => other.scene.kind === row.scene.kind) === i)
    .map((row) => {
      const scene = {
        ...row.scene,
        label: 'W'.repeat(48),
        subject: 'W'.repeat(34),
        condition: 'W'.repeat(96),
        outcome: 'W'.repeat(54),
      } as ExplainerScene;
      return {
        ...row,
        name: `stress-${row.scene.kind}`,
        scene,
        plannerInput: undefined,
        sourceWords: undefined,
        sourceText: undefined,
        covers: ['layout-only-unvalidated-maximum-text', row.scene.kind],
        samples: [{ name: 'hold', frame: 282 }],
      };
    });
  return {
    'detroit-landmarks.json': rows.filter((row) => row.scene.kind === 'detroit-place'),
    'hybrid-finance.json': rows.filter((row) =>
      ['fund-flow', 'ownership-change', 'portfolio-exposure'].includes(row.scene.kind),
    ),
    'hybrid-business.json': rows.filter((row) => row.scene.kind === 'cash-timing'),
    'hybrid-ai.json': rows.filter((row) =>
      ['token-attention', 'inference-tradeoff'].includes(row.scene.kind),
    ),
    'hybrid-showcase.json': showcase,
    'hybrid-stress.json': stress,
  };
}
