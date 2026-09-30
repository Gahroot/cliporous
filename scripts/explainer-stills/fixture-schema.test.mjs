import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canvasFor,
  createRenderPlan,
  LIMITS,
  normalizeFixtures,
  parseRenderArgs,
} from './fixture-schema.mjs';

const fixture = (overrides = {}) => ({
  name: 'hero-lock',
  scene: { kind: 'hero', prop: 'lock', label: 'Privacy', at: 0.4 },
  ...overrides,
});
const fullPalette = {
  bgOuter: '#001122',
  bgInner: '#112233',
  card: '#223344',
  cardRaised: '#334455',
  cardBorder: 'rgba(255,255,255,0.09)',
  text: '#ffffff',
  muted: '#8899aa',
  accent: '#9f75ff',
  accent2: '#bb99ff',
  accentSoft: 'rgba(159,117,255,0.18)',
  positive: '#6fbf8a',
  negative: '#e0735f',
  paper: '#fff4e8',
  paperText: '#001122',
  clay: ['#aabbcc', '#bbccdd', '#ccddee'],
};
const planFor = (overrides) => createRenderPlan(normalizeFixtures([fixture(overrides)]));
const bad = (overrides, message) =>
  assert.throws(() => normalizeFixtures([fixture(overrides)]), message);

test('legacy defaults and filenames are preserved without mutating fixtures', () => {
  const input = fixture();
  const copy = structuredClone(input);
  const [normalized] = normalizeFixtures([input]);
  assert.deepEqual(input, copy);
  assert.equal(normalized.durationSec, 6);
  assert.equal(normalized.durationInFrames, 180);
  assert.deepEqual(
    normalized.samples,
    [15, 45, 90, 150].map((frame) => ({ name: `f${frame}`, frame })),
  );
  const [plan] = createRenderPlan([normalized]);
  assert.equal(plan.samples[0].file, 'hero-lock-f15.png');
  assert.equal(plan.sheet, 'hero-lock-sheet.png');
  assert.deepEqual(plan.composition, { width: 1080, height: 960, fps: 30, durationInFrames: 180 });
  assert.equal(plan.inputProps.scene, input.scene);
  assert.equal(plan.inputProps.layout, 'stack');
  assert.equal(plan.inputProps.aspect, '9:16');
  assert.equal(plan.inputProps.accentColor, '#9f75ff');
  assert.equal('durationSec' in plan.inputProps, false);
  assert.equal('palette' in plan.inputProps, false);
});

test('named samples, explicit durations, cases and actual palette props', () => {
  const covers = [{ category: 'prop', id: 'lock' }];
  const input = fixture({
    durationSec: 2,
    samples: [
      { name: 'intro', frame: 0 },
      { name: 'settled', frame: 59 },
    ],
    cases: [
      { name: 'short', layout: 'pip', aspect: '9:16' },
      { name: 'wide', layout: 'over', aspect: '16:9', palette: fullPalette },
    ],
    covers,
  });
  const normalized = normalizeFixtures([input]);
  assert.equal(normalized[0].covers, covers);
  const [short, wide] = createRenderPlan(normalized);
  assert.equal(short.samples[0].file, 'hero-lock--short-intro.png');
  assert.equal(wide.samples[1].file, 'hero-lock--wide-settled.png');
  assert.equal(wide.sheet, 'hero-lock--wide-sheet.png');
  assert.deepEqual(wide.composition, { width: 1920, height: 1080, fps: 30, durationInFrames: 60 });
  assert.equal(short.composition.height, 1920);
  assert.equal(wide.inputProps.palette, fullPalette);
  assert.equal(wide.inputProps.accentColor, fullPalette.accent);
  assert.equal('covers' in wide.inputProps, false);
  assert.deepEqual(normalized[0].samples, input.samples);
});

test('covers metadata is not interpreted or transformed', () => {
  const covers = { parentOwnsValidation: true };
  assert.equal(normalizeFixtures([fixture({ covers })])[0].covers, covers);
});

test('all supported layout/aspect dimensions follow stageCanvasFor behavior', () => {
  for (const layout of ['stack', 'stack-flipped', 'takeover', 'pip', 'over']) {
    assert.deepEqual(canvasFor({ layout, aspect: '16:9' }), { width: 1920, height: 1080 });
    assert.deepEqual(canvasFor({ layout, aspect: '9:16' }), {
      width: 1080,
      height: ['stack', 'stack-flipped'].includes(layout) ? 960 : 1920,
    });
  }
  assert.equal(planFor({ layout: 'over', frames: [0] })[0].composition.height, 1920);
});

test('palette is a full object, with exactly three clay colors; case palette overrides base', () => {
  assert.equal(planFor({ palette: fullPalette, frames: [0] })[0].inputProps.palette, fullPalette);
  const alternate = { ...fullPalette, accent: '#123456' };
  const [inherited, overridden] = planFor({
    durationSec: 6,
    palette: fullPalette,
    frames: [0],
    cases: [
      { name: 'base', layout: 'stack', aspect: '9:16' },
      { name: 'alternate', layout: 'stack', aspect: '9:16', palette: alternate },
    ],
  });
  assert.equal(inherited.inputProps.palette, fullPalette);
  assert.equal(overridden.inputProps.palette, alternate);
  for (const palette of [
    'violet',
    null,
    {},
    { background: '#000', foreground: '#fff', accent: '#f00' },
  ]) {
    bad({ palette }, /hero-lock.*palette/);
  }
  for (const key of Object.keys(fullPalette)) {
    const incomplete = { ...fullPalette };
    delete incomplete[key];
    bad({ palette: incomplete }, /hero-lock.*palette/);
  }
  bad({ palette: { ...fullPalette, clay: ['#fff', '#000'] } }, /palette.clay/);
  bad({ palette: { ...fullPalette, clay: ['#fff', '#000', ''] } }, /palette.clay/);
});

test('palette names never silently render as the default colors', () => {
  bad({ paletteId: 'charcoal-amber' }, /hero-lock.*paletteId.*full palette object/);
  bad(
    {
      durationSec: 6,
      cases: [{ name: 'amber', layout: 'stack', aspect: '9:16', paletteId: 'charcoal-amber' }],
    },
    /cases\[0\].paletteId.*full palette object/,
  );
});

test('finite bounded durations; new schema requires durationSec', () => {
  for (const durationSec of [null, '6', NaN, Infinity, -Infinity, -1, 0, 0.01, 61]) {
    bad({ durationSec }, /hero-lock.*durationSec/);
  }
  bad({ samples: [{ name: 'intro', frame: 0 }] }, /explicit durationSec/);
  bad({ cases: [{ name: 'wide', aspect: '16:9', layout: 'over' }] }, /explicit durationSec/);
  assert.equal(planFor({ durationSec: 1 / 30, frames: [0] })[0].composition.durationInFrames, 1);
  assert.equal(planFor({ durationSec: 60, frames: [1799] })[0].composition.durationInFrames, 1800);
  assert.equal(planFor({ durationSec: 1.05, frames: [31] })[0].composition.durationInFrames, 32);
});

test('frames are never silently clamped or coerced, in either sample format', () => {
  for (const frame of [-1, 180, NaN, Infinity, 1.5, '15', null]) {
    bad({ frames: [frame] }, /hero-lock.*frames\[0\].*integer from 0 to 179/);
    bad(
      { durationSec: 6, samples: [{ name: 'bad', frame }] },
      /hero-lock.*samples\[0\].*integer from 0 to 179/,
    );
  }
  bad({ durationSec: 1 }, /hero-lock.*frames\[1\].*change frame or durationSec/);
  bad({ frames: [15, 15] }, /duplicate identifier/);
  assert.equal(
    planFor({
      durationSec: 6,
      samples: [
        { name: 'first', frame: 15 },
        { name: 'repeat', frame: 15 },
      ],
    })[0].samples.length,
    2,
  );
  bad({ durationSec: 6, frames: [0], samples: [{ name: 'intro', frame: 0 }] }, /samples OR frames/);
});

test('unsafe and duplicate identifiers fail before output paths can be formed', () => {
  for (const name of [
    '../escape',
    '/absolute',
    'a/b',
    'a\\b',
    '.',
    '..',
    '',
    '-flag',
    'a\0b',
    'a.b',
    'a'.repeat(81),
  ]) {
    bad({ name }, /fixture\[0\].*name/);
    bad({ durationSec: 6, samples: [{ name, frame: 0 }] }, /hero-lock.*samples\[0\].name/);
    bad(
      { durationSec: 6, cases: [{ name, layout: 'over', aspect: '16:9' }] },
      /hero-lock.*cases\[0\].name/,
    );
  }
  assert.throws(
    () => normalizeFixtures([fixture(), fixture({ name: 'HERO-LOCK' })]),
    /duplicate identifier/,
  );
  bad(
    {
      durationSec: 6,
      samples: [
        { name: 'intro', frame: 0 },
        { name: 'INTRO', frame: 1 },
      ],
    },
    /duplicate identifier/,
  );
  bad(
    {
      durationSec: 6,
      cases: [
        { name: 'wide', layout: 'over', aspect: '16:9' },
        { name: 'WIDE', layout: 'over', aspect: '16:9' },
      ],
    },
    /duplicate identifier/,
  );
});

test('shape, enum and collection bounds have fixture-specific errors', () => {
  for (const data of [null, {}, [], Array.from({ length: LIMITS.fixtures + 1 }, () => fixture())]) {
    assert.throws(() => normalizeFixtures(data), /fixtures.*1–256/);
  }
  bad({ scene: null }, /hero-lock.*scene/);
  bad({ scene: {} }, /hero-lock.*scene.kind/);
  bad({ layout: 'sideways' }, /hero-lock.*layout/);
  bad({ aspect: '1:1' }, /hero-lock.*aspect/);
  for (const field of ['frames', 'samples', 'cases']) {
    for (const value of [
      null,
      {},
      [],
      Array(LIMITS[field === 'frames' ? 'samples' : field] + 1).fill({}),
    ]) {
      bad({ durationSec: 6, [field]: value }, new RegExp(`hero-lock.*${field}.*1–16`));
    }
  }
  bad({ durationSec: 6, samples: [null] }, /samples\[0\].*object/);
  bad({ durationSec: 6, cases: [{ name: 'missing-layout', aspect: '16:9' }] }, /cases\[0\].layout/);
  bad({ durationSec: 6, cases: [{ name: 'missing-aspect', layout: 'over' }] }, /cases\[0\].aspect/);
});

test('filename collisions, including contact sheets, are rejected', () => {
  bad(
    { durationSec: 6, samples: [{ name: 'sheet', frame: 0 }] },
    /hero-lock.*output collision.*rename/,
  );
  assert.throws(
    () =>
      normalizeFixtures([
        fixture({
          name: 'one',
          durationSec: 6,
          cases: [{ name: 'two', layout: 'stack', aspect: '9:16' }],
        }),
        fixture({ name: 'one--two' }),
      ]),
    /one--two.*output collision/,
  );
});

test('legacy CLI plus --out and --bundle, in any order', () => {
  assert.deepEqual(parseRenderArgs(['existing.json']), {
    fixturesArg: 'existing.json',
    filter: undefined,
  });
  assert.deepEqual(
    parseRenderArgs(['--out', '/tmp/stills', 'existing.json', 'lock', '--bundle=out/remotion']),
    {
      fixturesArg: 'existing.json',
      filter: 'lock',
      out: '/tmp/stills',
      bundle: 'out/remotion',
    },
  );
  for (const args of [
    [],
    ['one', 'two', 'three'],
    ['one', '--unknown'],
    ['one', '--out'],
    ['one', '--out='],
    ['one', '--bundle', 'https://example.com'],
    ['one', '--bundle', 'file:///bundle'],
  ]) {
    assert.throws(() => parseRenderArgs(args));
  }
});
