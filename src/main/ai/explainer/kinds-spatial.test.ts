import { describe, expect, it } from 'vitest';
import {
  SPATIAL_PRESETS,
  type SpatialScene,
} from '../../remotion/compositions/explainer/spatial/types';
import {
  TECHNOLOGY_LAYOUTS,
  TECHNOLOGY_WORD_FIELDS,
} from '../../remotion/compositions/explainer/technology/types';
import { collectSceneTimes, mapSceneTimes } from '../../remotion/compositions/explainer/types';
import { parseExplainerPlan, toSceneRelative } from '../explainer-scenes';
import { type KindSpec, makeParseContext, type PlannerWord, type Rec } from './kind-spec';
import { SPATIAL_KIND_SPECS } from './kinds-spatial';
import { buildShortlist } from './shortlist';

type Kind = SpatialScene['kind'];
const PHASES = ['setup', 'action', 'response', 'check', 'resolve'] as const;
type Phase = (typeof PHASES)[number];
const TIMES = [0, 1.8, 3.4, 5, 6.6] as const;
const DURATION = 8.4;
interface Example {
  id: string;
  kind: Kind;
  preset: string;
  fields: Rec;
  outcome: string;
  subject: string;
  phases: readonly [string, string, string, string, string];
}
function example(
  kind: Kind,
  preset: string,
  fields: Rec,
  outcome: string,
  phases: Example['phases'],
  subject = 'house',
): Example {
  return { id: `${kind}/${preset}`, kind, preset, fields, outcome, phases, subject };
}

// Synthetic narration lives only in tests, not in the planner's production vocabulary.
const EXAMPLES: Example[] = [
  example('house-cutaway', 'rooms', { parts: ['kitchen', 'bedroom'] }, 'reveals its rooms', [
    'The house contains several rooms.',
    'Lifting the roof reveals the kitchen and bedroom.',
    'The kitchen and bedroom are rooms inside the house.',
    'The house shows its interior.',
    'The house reveals its rooms.',
  ]),
  example('house-cutaway', 'utilities', { parts: ['plumbing', 'wiring'] }, 'connect the house', [
    'The house has plumbing and wiring.',
    'Plumbing carries water through the house.',
    'Wiring supplies power to rooms.',
    'The house utilities connect each room.',
    'Utilities connect the house.',
  ]),
  example('house-build', 'construct', { planLabel: 'blueprint' }, 'matches the blueprint', [
    'The house has a blueprint.',
    'We build the house foundation.',
    'We construct the house walls and roof.',
    'The house follows the blueprint.',
    'The house matches the blueprint.',
  ]),
  example(
    'house-build',
    'plan-mismatch',
    { planLabel: 'blueprint' },
    'does not match the blueprint',
    [
      'The house has a blueprint.',
      'We lay the house foundation.',
      'We assemble the house walls and roof.',
      'The house deviates from the blueprint.',
      'The house does not match the blueprint.',
    ],
  ),
  example('house-renovation', 'cosmetic', { partLabel: 'facade' }, 'facade has new paint', [
    'The house facade needs cosmetic work.',
    'We repaint the house facade.',
    'The facade surface is refreshed.',
    'The house structure stays intact.',
    'The house facade has new paint.',
  ]),
  example('house-renovation', 'structural', { partLabel: 'beam' }, 'beam is repaired', [
    'The house beam supports the roof.',
    'We replace the load-bearing beam in the house.',
    'The house beam carries the roof weight.',
    'The structural repair supports the house.',
    'The house beam is repaired.',
  ]),
  example(
    'property-access',
    'scoped-key',
    { allowedLabel: 'kitchen', restrictedLabel: 'office' },
    'opens only the kitchen',
    [
      'The key has scoped access inside the house.',
      'The key unlocks the kitchen.',
      'The office stays locked.',
      'The key allows kitchen access.',
      'The key opens only the kitchen.',
    ],
    'key',
  ),
  example(
    'property-access',
    'revoked-key',
    { allowedLabel: 'kitchen', restrictedLabel: 'office' },
    'kitchen stays closed',
    [
      'The key opens the kitchen inside the house.',
      'We revoke the key permission for the kitchen.',
      'The office stays locked.',
      'The key cannot unlock the kitchen.',
      'The kitchen stays closed.',
    ],
    'key',
  ),
  example(
    'neighborhood',
    'replicate',
    { contextLabels: ['original home', 'copied home'] },
    'design is repeated',
    [
      'This house is our original home.',
      'We copy the original home to make a copied home.',
      'The house template is replicated across the neighborhood.',
      'The homes share the same design.',
      'The house design is repeated.',
    ],
  ),
  example(
    'neighborhood',
    'context',
    { contextLabels: ['busy road', 'quiet park'] },
    'setting changes',
    [
      'The same house appears in two surroundings.',
      'The house stays unchanged.',
      'The surroundings differ between a busy road and a quiet park.',
      'The home remains the same.',
      'The house setting changes.',
    ],
  ),
  example(
    'floorplan-fit',
    'fits',
    { items: ['sofa', 'table'] },
    'fits inside the room',
    [
      'The room has a fixed floorplan.',
      'The sofa and table fit inside the room.',
      'The room has clearance around the furniture.',
      'The sofa and table fit in the room.',
      'The furniture fits inside the room.',
    ],
    'room',
  ),
  example(
    'floorplan-fit',
    'rearrange',
    { items: ['sofa', 'table'] },
    'fits inside the room',
    [
      'The room has a fixed floorplan.',
      'We rearrange the sofa and table within the room.',
      'We rotate the sofa within the room.',
      'The room walls stay fixed.',
      'The furniture fits inside the room.',
    ],
    'room',
  ),
  example(
    'house-options',
    'compare',
    { options: ['extension', 'loft'] },
    'options remain undecided',
    [
      'The house has two treatment options.',
      'We compare an extension and a loft for this house.',
      'The extension and loft remain alternatives for this house.',
      'There is no winner.',
      'The house options remain undecided.',
    ],
  ),
  example(
    'house-options',
    'tradeoff',
    { options: ['extension', 'loft'] },
    'alternatives remain unresolved',
    [
      'The house has two treatment options.',
      'We compare an extension and a loft for this house.',
      'The extension gains space at more cost for this house.',
      'The loft costs less but gives up space.',
      'The house alternatives remain unresolved.',
    ],
  ),
  example(
    'property-lifecycle',
    'occupancy',
    { stageLabels: ['vacant', 'occupied'] },
    'house is occupied',
    [
      'The house is vacant.',
      'The tenants move in to the house.',
      'The house now shelters the tenants.',
      'The house is occupied by residents.',
      'The house is occupied.',
    ],
  ),
  example(
    'property-lifecycle',
    'maintenance',
    { stageLabels: ['wear', 'repair', 'maintained'] },
    'house is maintained',
    [
      'The house has wear.',
      'We repair the house after wear.',
      'The house repair fixes the leak.',
      'The house is working again.',
      'The house is maintained.',
    ],
  ),
  example(
    'property-lifecycle',
    'cash-flow',
    { stageLabels: ['income', 'expense'] },
    'Income and expense stay separate',
    [
      'The house has income and expense.',
      'The house receives income from tenants.',
      'The owner pays the house expense for repairs.',
      'Income is not profit.',
      'Income and expense stay separate.',
    ],
  ),
];

interface Fixture {
  raw: Rec;
  words: PlannerWord[];
  duration: number;
}
function fixture(
  value: Example,
  changes: Partial<Record<Phase, string>> = {},
  patch: Rec = {},
): Fixture {
  const raw: Rec = {
    kind: value.kind,
    preset: value.preset,
    label: value.subject,
    subject: value.subject,
    outcome: value.outcome,
    ...structuredClone(value.fields),
    startWord: 0,
    layout: 'stack',
  };
  const words: PlannerWord[] = [];
  PHASES.forEach((phase, n) => {
    const tokens = (changes[phase] ?? value.phases[n]).split(/\s+/);
    const start = TIMES[n];
    const end = TIMES[n + 1] ?? DURATION;
    raw[`${phase}Word`] = words.length;
    tokens.forEach((text, i) => {
      words.push({
        text,
        start: start + ((end - start) * i) / tokens.length,
        end: start + ((end - start) * (i + 1)) / tokens.length,
      });
    });
  });
  raw.endWord = words.length - 1;
  return { raw: { ...raw, ...patch }, words, duration: DURATION };
}
function byId(id: string): Example {
  const result = EXAMPLES.find((e) => e.id === id);
  if (!result) throw new Error(`Missing test story ${id}`);
  return result;
}
function spec(kind: unknown): KindSpec<Kind> {
  const found = SPATIAL_KIND_SPECS.find((s) => s.kind === kind);
  if (!found) throw new Error(`Missing spatial spec ${kind}`);
  return found as KindSpec<Kind>;
}
function parse(value: Fixture) {
  const ctx = makeParseContext(value.words, {
    startWord: 0,
    endWord: value.words.length - 1,
    startTime: 0,
    endTime: value.duration,
  });
  return { scene: spec(value.raw.kind).parse(value.raw, ctx), ctx };
}
function reject(value: Fixture): void {
  const { scene, ctx } = parse(value);
  expect(scene).toBeNull();
  expect(ctx.issues.length).toBeGreaterThan(0);
}

const NEGATIVE_STORIES: [string, Partial<Record<Phase, string>>, Rec?][] = [
  [
    'house-cutaway/rooms',
    {
      action: 'Kitchen. Bedroom.',
      response: 'The kitchen and bedroom are names.',
      check: 'The house is here.',
    },
  ],
  [
    'house-cutaway/utilities',
    {
      action: 'Plumbing never carries water through the house.',
      response: 'Wiring does not supply power to rooms.',
    },
  ],
  [
    'house-build/construct',
    {
      action: 'We mention the house foundation.',
      response: 'The house walls and roof are a proposal.',
    },
  ],
  ['house-build/construct', { resolve: 'The house never matches the blueprint.' }],
  ['house-build/construct', { resolve: 'Another house matches the blueprint.' }],
  [
    'house-build/plan-mismatch',
    {
      check: 'The house never deviates from the blueprint.',
      resolve: 'The house does not deviate from the blueprint.',
    },
    { outcome: 'does not deviate from the blueprint' },
  ],
  [
    'house-renovation/cosmetic',
    {
      action: 'We never repaint the house facade.',
      response: 'The facade surface is not refreshed.',
    },
  ],
  [
    'house-renovation/structural',
    {
      action: 'We paint the load-bearing beam in the house.',
      check: 'The structure supports the house.',
    },
  ],
  [
    'house-renovation/structural',
    {
      setup: 'The house beam is decorative.',
      action: 'We replace the decorative beam in the house.',
      response: 'The house beam has a smooth finish.',
      check: 'The house looks different.',
    },
  ],
  [
    'property-access/scoped-key',
    { action: 'The key cannot unlock the kitchen.', check: 'The key never allows kitchen access.' },
  ],
  ['property-access/scoped-key', { response: "The office isn't locked." }],
  [
    'property-access/scoped-key',
    {
      response: 'The office stays locked.',
      check: 'We revoke the key permission for the kitchen.',
    },
  ],
  [
    'property-access/revoked-key',
    { action: 'We never revoke the key permission for the kitchen.' },
  ],
  [
    'property-access/revoked-key',
    { resolve: 'The kitchen is not closed.' },
    { outcome: 'kitchen is not closed' },
  ],
  [
    'neighborhood/replicate',
    {
      action: 'The original home and copied home are mentioned.',
      response: 'The house template is discussed.',
    },
  ],
  [
    'neighborhood/context',
    { action: 'The house never stays unchanged.', check: 'The home does not remain the same.' },
  ],
  [
    'neighborhood/context',
    { resolve: 'The house changes along with its setting.' },
    { outcome: 'house changes' },
  ],
  [
    'floorplan-fit/fits',
    {
      action: 'The sofa and table do not fit inside the room.',
      check: 'The sofa and table never fit in the room.',
    },
  ],
  [
    'floorplan-fit/rearrange',
    {
      action: 'We never rearrange the sofa and table within the room.',
      response: 'We do not rotate the sofa within the room.',
    },
  ],
  ['floorplan-fit/rearrange', { check: 'We remove the room walls.' }],
  [
    'house-options/compare',
    { action: 'The extension and loft are names.', response: 'The house has a wall.' },
  ],
  [
    'house-options/compare',
    { resolve: 'The extension is the winner.' },
    { outcome: 'extension is the winner' },
  ],
  [
    'house-options/tradeoff',
    {
      response: 'The extension is an option for this house.',
      check: 'The loft is an option for this house.',
    },
  ],
  [
    'house-options/tradeoff',
    { resolve: 'The house alternatives are not unresolved.' },
    { outcome: 'alternatives are not unresolved' },
  ],
  ['property-lifecycle/occupancy', { action: 'The tenants never move in to the house.' }],
  [
    'property-lifecycle/occupancy',
    { resolve: 'The house is not occupied.' },
    { outcome: 'house is not occupied' },
  ],
  [
    'property-lifecycle/maintenance',
    {
      action: 'We never repair the house after wear.',
      response: 'The house repair does not fix the leak.',
    },
  ],
  [
    'property-lifecycle/maintenance',
    { resolve: 'The house is not maintained.' },
    { outcome: 'house is not maintained' },
  ],
  [
    'property-lifecycle/cash-flow',
    { action: 'The house has income.', response: 'The owner mentions the house expense.' },
  ],
  [
    'property-lifecycle/cash-flow',
    { response: 'The owner never pays the house expense for repairs.' },
  ],
  ['property-lifecycle/cash-flow', { check: 'Income is profit.' }],
];

describe('spatial source contracts', () => {
  it('covers exactly all eight kinds and seventeen authored presets', () => {
    expect(EXAMPLES.map((e) => e.id).sort()).toEqual(
      Object.entries(SPATIAL_PRESETS)
        .flatMap(([kind, presets]) => presets.map((preset) => `${kind}/${preset}`))
        .sort(),
    );
    expect(EXAMPLES).toHaveLength(17);
    expect(SPATIAL_KIND_SPECS).toHaveLength(8);
  });

  it.each(EXAMPLES)('$id parses all labels and exactly five source-derived beats', (value) => {
    const { scene, ctx } = parse(fixture(value));
    expect(ctx.issues).toEqual([]);
    expect(scene).toEqual({
      kind: value.kind,
      preset: value.preset,
      label: value.subject,
      subject: value.subject,
      outcome: value.outcome,
      ...value.fields,
      setupAt: 0.3,
      actionAt: 1.8,
      responseAt: 3.4,
      checkAt: 5,
      resolveAt: 6.6,
    });
    expect(collectSceneTimes(scene as SpatialScene)).toEqual([0.3, 1.8, 3.4, 5, 6.6]);
  });

  it.each(EXAMPLES)('$id rejects invented strings in every visible field', (value) => {
    for (const field of ['label', 'subject', 'outcome', ...Object.keys(value.fields)]) {
      const original = value.fields[field];
      reject(
        fixture(
          value,
          {},
          {
            [field]: Array.isArray(original)
              ? original.map((text, i) => (i === 0 ? 'invented claim' : text))
              : 'invented claim',
          },
        ),
      );
    }
    reject(fixture(value, {}, { condition: 'if invented' }));
  });

  it.each(
    NEGATIVE_STORIES,
  )('%s rejects missing, opposite or negated relationships (%j)', (id, changes, patch) => {
    reject(fixture(byId(id), changes, patch));
  });

  it.each(
    EXAMPLES,
  )('$id rejects unknown presets and arbitrary geometry/assets/numeric claims', (value) => {
    reject(fixture(value, {}, { preset: 'invented-preset' }));
    for (const patch of [
      { geometry: { position: [0, 1, 2] } },
      { url: 'https://example.com/house.glb' },
      { code: 'process.exit()' },
      { amount: 42 },
      { profit: 10 },
      { setupAt: 1.5 },
    ])
      reject(fixture(value, {}, patch));
  });

  it.each(
    EXAMPLES.filter((e) => Object.values(e.fields).some(Array.isArray)),
  )('$id bounds arrays without filtering, truncation or silent deduplication', (value) => {
    const field = Object.keys(value.fields).find((key) =>
      Array.isArray(value.fields[key]),
    ) as string;
    const labels = value.fields[field] as string[];
    for (const bad of [
      null,
      'not an array',
      [],
      [labels[0]],
      [labels[0], labels[0].toUpperCase()],
      [...labels, 'extra', 'another'],
      [labels[0], 42],
      [labels[0], { label: labels[1] }],
    ])
      reject(fixture(value, {}, { [field]: bad }));
  });

  it('rejects indistinguishable room labels and misordered lifecycle stages', () => {
    reject(fixture(byId('property-access/scoped-key'), {}, { restrictedLabel: 'KITCHEN' }));
    reject(
      fixture(byId('property-lifecycle/occupancy'), {}, { stageLabels: ['occupied', 'vacant'] }),
    );
    reject(
      fixture(
        byId('property-lifecycle/maintenance'),
        {},
        { stageLabels: ['repair', 'wear', 'maintained'] },
      ),
    );
    reject(
      fixture(byId('property-lifecycle/cash-flow'), {}, { stageLabels: ['expense', 'income'] }),
    );
  });

  it('accepts actual income/expense source labels without requiring literal category words', () => {
    const value = fixture(
      byId('property-lifecycle/cash-flow'),
      {
        setup: 'The house has rent and repairs.',
        action: 'The owner receives rent from the house tenants.',
        response: 'The owner pays for repairs to the house.',
        check: 'Rent is not profit.',
        resolve: 'Rent and repairs stay separate.',
      },
      { stageLabels: ['rent', 'repairs'], outcome: 'Rent and repairs stay separate' },
    );
    expect(parse(value).ctx.issues).toEqual([]);
    expect(parse(value).scene).toMatchObject({ stageLabels: ['rent', 'repairs'] });
    reject({ ...value, raw: { ...value.raw, stageLabels: ['repairs', 'rent'] } });
  });

  it('distinguishes look-alike presets using relationships, not nouns', () => {
    for (const [id, preset] of [
      ['house-cutaway/rooms', 'utilities'],
      ['house-cutaway/utilities', 'rooms'],
      ['house-build/construct', 'plan-mismatch'],
      ['house-build/plan-mismatch', 'construct'],
      ['house-renovation/cosmetic', 'structural'],
      ['house-renovation/structural', 'cosmetic'],
      ['property-access/scoped-key', 'revoked-key'],
      ['property-access/revoked-key', 'scoped-key'],
      ['neighborhood/replicate', 'context'],
      ['neighborhood/context', 'replicate'],
      ['floorplan-fit/fits', 'rearrange'],
      ['floorplan-fit/rearrange', 'fits'],
      ['house-options/compare', 'tradeoff'],
      ['property-lifecycle/occupancy', 'maintenance'],
    ])
      reject(fixture(byId(id), {}, { preset }));
  });

  it('accepts ordinary passive and clause-internal narration rather than one exact template', () => {
    const value = fixture(
      byId('house-build/construct'),
      {
        action: 'For the house the foundation was laid.',
        response: 'Its walls were raised and the roof was attached.',
        check: 'This house conforms to the blueprint.',
        resolve: 'The finished house follows the blueprint.',
      },
      { outcome: 'follows the blueprint' },
    );
    // The beat may point at the predicate; the sentence retains its subject.
    value.raw.resolveWord = Number(value.raw.resolveWord) + 3;
    expect(parse(value).ctx.issues).toEqual([]);
    expect(parse(value).scene).not.toBeNull();
  });

  it.each(EXAMPLES)('$id preserves complete conditional stories, not verified claims', (value) => {
    const conditional = fixture(
      value,
      { setup: `If permission arrives, ${value.phases[0]}` },
      { condition: 'If permission arrives' },
    );
    const { scene, ctx } = parse(conditional);
    expect(ctx.issues).toEqual([]);
    expect(scene?.condition).toBe('If permission arrives');
    reject({ ...conditional, raw: { ...conditional.raw, condition: undefined } });
    reject({ ...conditional, raw: { ...conditional.raw, condition: 'permission arrives' } });
    reject(
      fixture(
        value,
        { setup: `If permission arrives, unless funding fails, ${value.phases[0]}` },
        { condition: 'If permission arrives' },
      ),
    );
  });

  it('preserves conditional future outcome text and does not invent its condition', () => {
    const conditional = fixture(
      byId('house-build/construct'),
      {
        setup: 'If permission arrives, the house has a blueprint.',
        resolve: 'The house will match the blueprint.',
      },
      { condition: 'If permission arrives', outcome: 'will match the blueprint' },
    );
    expect(parse(conditional).scene).toMatchObject({
      condition: 'If permission arrives',
      outcome: 'will match the blueprint',
    });
    reject(
      fixture(
        byId('house-build/construct'),
        { resolve: 'The house will match the blueprint.' },
        { outcome: 'will match the blueprint' },
      ),
    );
  });

  it('preserves negative outcomes without allowing cherry-picked positive fragments', () => {
    reject(fixture(byId('house-build/plan-mismatch'), {}, { outcome: 'match the blueprint' }));
    const denied = fixture(
      byId('property-access/revoked-key'),
      { resolve: "The key can't open the kitchen." },
      { outcome: "can't open the kitchen" },
    );
    expect(parse(denied).scene).not.toBeNull();
    reject({ ...denied, raw: { ...denied.raw, outcome: 'open the kitchen' } });
  });

  it.each(
    EXAMPLES,
  )('$id validates indices, finite source times, spacing and final holds', (value) => {
    for (const field of TECHNOLOGY_WORD_FIELDS) {
      for (const bad of [-1, 1.5, NaN, Infinity, '1', 10000, undefined])
        reject(fixture(value, {}, { [field]: bad }));
    }
    const backwards = fixture(value);
    backwards.raw.responseWord = backwards.raw.actionWord;
    reject(backwards);
    for (const duration of [4.9, 12.1, NaN, Infinity, 7.1]) reject({ ...fixture(value), duration });
    for (const bad of [NaN, Infinity, -1]) {
      const invalid = fixture(value);
      invalid.words[Number(invalid.raw.actionWord)].start = bad;
      reject(invalid);
    }
    const nonBeat = fixture(value);
    nonBeat.words[1].end = NaN;
    reject(nonBeat);
    const reversed = fixture(value);
    reversed.words[Number(reversed.raw.responseWord)].start = 1;
    reject(reversed);
    const compressed = fixture(value);
    compressed.words[Number(compressed.raw.checkWord)].start = 3.5;
    reject(compressed);
  });

  it('rejects markup/URLs even when spoken and rejects unsupported numeric labels', () => {
    for (const label of ['<script>', 'https://evil.test', 'data:mesh']) {
      const value = fixture(
        byId('house-build/construct'),
        { setup: `The house has a blueprint named ${label}.` },
        { label },
      );
      reject(value);
    }
    reject(
      fixture(
        byId('house-renovation/cosmetic'),
        { resolve: 'The house facade has new paint worth -50%.' },
        { outcome: '50%' },
      ),
    );
    reject(
      fixture(
        byId('house-build/construct'),
        { setup: 'The house has an extraordinarily elaborate blueprint.' },
        { planLabel: 'extraordinarily elaborate blueprint' },
      ),
    );
  });

  it.each(
    EXAMPLES,
  )('$id ignores known planner envelope extras without leaking them into scene bodies', (value) => {
    const base = fixture(value);
    const withExtras = fixture(
      value,
      {},
      {
        transition: 'grow',
        continues: false,
        laterStamp: { text: 'DONE', word: base.raw.resolveWord },
        annotation: { kind: 'marker', word: base.raw.checkWord },
        dimWord: base.raw.checkWord,
        reactions: [{ word: base.raw.checkWord, strength: 'shake' }],
        bursts: [{ word: base.raw.resolveWord }],
      },
    );
    expect(parse(withExtras).scene).toEqual(parse(base).scene);
  });
});

describe('spatial stories through the real planner boundary', () => {
  it.each(
    EXAMPLES,
  )('$id preserves source beats, allowed layouts/cues and protected extras at +30s', (value) => {
    const base = fixture(value);
    const { scene: parsed } = parse(base);
    expect(parsed).not.toBeNull();
    const words = base.words.map((w) => ({ ...w, start: w.start + 30, end: w.end + 30 }));
    for (const layout of TECHNOLOGY_LAYOUTS) {
      const plan = parseExplainerPlan(
        {
          scenes: [
            {
              ...base.raw,
              layout,
              laterStamp: { text: 'DONE', word: base.raw.resolveWord },
              dimWord: base.raw.checkWord,
              annotation: { kind: 'marker', word: base.raw.checkWord },
              reactions: [{ word: base.raw.checkWord, strength: 'shake' }],
            },
          ],
        },
        words,
        { minStart: 0, maxEnd: 90 },
        { emphasisTimes: [32.7, 35.7] },
      );
      expect(plan).toHaveLength(1);
      const [planned] = plan;
      // Shared variety rules may downgrade a long takeover to an offered layout.
      expect(spec(value.kind).layouts).toContain(planned.layout);
      const expected = mapSceneTimes(parsed as SpatialScene, (time) => time + 30);
      expected.setupAt = Math.max(words[Number(base.raw.setupWord)].start, planned.startTime + 0.3);
      expect(mapSceneTimes(planned.scene, () => 0)).toEqual(mapSceneTimes(expected, () => 0));
      expect(collectSceneTimes(planned.scene)).toHaveLength(5);
      collectSceneTimes(planned.scene).forEach((at, i) => {
        expect(at).toBeCloseTo(collectSceneTimes(expected)[i], 10);
      });
      expect(toSceneRelative(planned.scene, planned.startTime)).toEqual(
        mapSceneTimes(expected, (at) =>
          Math.max(0, Math.round((at - planned.startTime) * 1000) / 1000),
        ),
      );
      expect(planned.cues).toEqual(spec(value.kind).cues(expected));
      expect(
        planned.cues.every((cue) => cue.at >= planned.startTime && cue.at <= planned.endTime),
      ).toBe(true);
      for (const field of [
        'laterStamp',
        'overlayStamp',
        'dimAt',
        'annotation',
        'reactions',
        'pulses',
        'bursts',
      ])
        expect(planned.scene).not.toHaveProperty(field);
    }
  });

  it.each(EXAMPLES)('$id rejects clipping either setup or the final hold', (value) => {
    const base = fixture(value);
    const words = base.words.map((w) => ({ ...w, start: w.start + 30, end: w.end + 30 }));
    expect(
      parseExplainerPlan({ scenes: [base.raw] }, words, { minStart: 30.7, maxEnd: 90 }),
    ).toEqual([]);
    expect(parseExplainerPlan({ scenes: [base.raw] }, words, { minStart: 0, maxEnd: 37 })).toEqual(
      [],
    );
  });

  it.each(
    SPATIAL_KIND_SPECS,
  )('$kind is offered by the real shortlist for its positive story', (kindSpec) => {
    const value = EXAMPLES.find((e) => e.kind === kindSpec.kind) as Example;
    const shortlist = buildShortlist(fixture(value).words);
    expect(shortlist.scores[kindSpec.kind]).toBeGreaterThan(0);
    expect(shortlist.kinds.map((s) => s.kind)).toContain(kindSpec.kind);
  });
});
