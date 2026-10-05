import {
  parseCapitalStructureScene,
  parseEconomicRightsScene,
  parseInvestmentOutcomesScene,
} from '../../../../../ai/explainer/business-capital-contract';
import { isRec, type Rec } from '../../../../../ai/explainer/kind-spec';
import {
  CAPITAL_SOURCE_FIXTURES,
  type CapitalSourceFixture,
  capitalDebtFixture,
  capitalFixtureContext,
  capitalOutcomeFixture,
  capitalRightsFixture,
  capitalRoundsFixture,
} from './fixtures';
import type { CapitalScene } from './types';

export function parsedCapital(fixture: CapitalSourceFixture): CapitalScene {
  const ctx = capitalFixtureContext(fixture);
  const scene =
    fixture.raw.kind === 'economic-rights'
      ? parseEconomicRightsScene(fixture.raw, ctx)
      : fixture.raw.kind === 'investment-outcomes'
        ? parseInvestmentOutcomesScene(fixture.raw, ctx)
        : parseCapitalStructureScene(fixture.raw, ctx);
  if (!scene) throw new Error(`${fixture.id}: ${ctx.issues.join('; ')}`);
  return scene;
}
/** Source-authored labels: expand speech tokens and rebase every raw word index, not just UI strings. */
export function namedCapital(
  fixture: CapitalSourceFixture,
  name: string,
  fullName: string,
): CapitalSourceFixture {
  const original = structuredClone(fixture),
    starts: number[] = [],
    ends: number[] = [];
  const pattern = new RegExp(`\\b${name}\\b`, 'gu');
  const words = original.words.flatMap((word, index) => {
    starts[index] = index === 0 ? 0 : ends[index - 1] + 1;
    const tokens = word.text.replace(pattern, fullName).split(/\s+/u);
    ends[index] = starts[index] + tokens.length - 1;
    const step = (word.end - word.start) / tokens.length;
    return tokens.map((text, position) => ({
      text,
      start: word.start + position * step,
      end: word.start + (position + 1) * step,
    }));
  });
  const startFields = new Set([
    'fromWord',
    'startWord',
    'setupWord',
    'actionWord',
    'responseWord',
    'checkWord',
    'resolveWord',
  ]);
  function rebase(value: unknown, key = ''): unknown {
    if (typeof value === 'number' && startFields.has(key)) return starts[value];
    if (typeof value === 'number' && (key === 'toWord' || key === 'endWord')) return ends[value];
    if (typeof value === 'string') return value.replace(pattern, fullName);
    if (Array.isArray(value)) return value.map((v) => rebase(v));
    if (isRec(value))
      return Object.fromEntries(
        Object.entries(value).map(([field, v]) => [field, rebase(v, field)]),
      );
    return value;
  }
  const raw = rebase(original.raw);
  if (!isRec(raw)) throw new Error('Source fixture must remain a JSON object');
  return { ...original, raw, words };
}
export const CAPITAL_RENDER_VARIANTS: readonly CapitalSourceFixture[] = [
  capitalRightsFixture({ payout: 0, control: 'unknown' }),
  capitalRightsFixture({ payout: 10501, priority: 'source-stated' }),
  capitalOutcomeFixture({
    mode: 'distribution',
    outcomes: [
      { label: 'Gain', measure: 'return', minor: 5000, numerator: 1 },
      { label: 'Loss', measure: 'loss', minor: 2000, numerator: 3 },
    ],
  }),
  capitalRoundsFixture({ statuses: ['issued', 'issued'] }),
  capitalRoundsFixture({ statuses: ['issued', 'conditional'] }),
  capitalDebtFixture(true, { principal: null, commissioned: null }),
  capitalDebtFixture(false, { durationUnknown: true, principal: null }),
];
export const CAPITAL_LABEL_FIXTURES: readonly CapitalSourceFixture[] = [
  namedCapital(CAPITAL_SOURCE_FIXTURES[0], 'Ada', 'Ada Capital Partners'), // exact shared 40-character relationship-label cap
  namedCapital(CAPITAL_SOURCE_FIXTURES[1], 'Unresolved', 'Unresolved Investment Result'), // identity cap: 28
  namedCapital(CAPITAL_SOURCE_FIXTURES[2], 'Ada', 'Ada Capital Partners'),
  namedCapital(CAPITAL_SOURCE_FIXTURES[3], 'Hall', 'Hall Rack Installation AA'), // exact 40-character operator-label cap
  namedCapital(CAPITAL_SOURCE_FIXTURES[4], 'Warehouse', 'Warehouse Asset Holdings Ltd'), // identity cap: 28
  namedCapital(CAPITAL_SOURCE_FIXTURES[5], 'Ada', 'Ada Capital Partners'),
];
export function fixtureFacts(raw: Rec): string {
  return JSON.stringify(raw);
}
