/**
 * Fixture JSON: [{name, scene, durationSec?, frames?, samples?, cases?, layout?, aspect?, palette?, covers?}].
 * Legacy: frames defaults to [15,45,90,150], durationSec to 6, layout to stack, aspect to 9:16.
 * New: samples [{name,frame}] replaces frames; cases [{name,layout,aspect,palette?}] replaces the
 * single default case. Either new field requires explicit durationSec. All samples run in each case.
 * Palette is a full ExplainerPalette (types.ts), NOT a seed or palette ID; case palette overrides
 * fixture palette. scene and covers are passed through unchanged (scene internals/tags not validated).
 * Identifiers: 1–80 ASCII letters/digits/_/-, starting with a letter/digit; unique ignoring case.
 * Frames: integers in [0, round(durationSec * 30)); durationSec: 1/30–60, finite. No frame clamping.
 * Files: <fixture>[--<case>]-<sample>.png and ...-sheet.png; legacy samples are named f<frame>.
 * Ambiguous output names are rejected. Limits apply before CLI filtering.
 */
import { parseArgs } from 'node:util';

export const FPS = 30;
export const LIMITS = Object.freeze({ fixtures: 256, samples: 16, cases: 16, durationSec: 60 });
export const USAGE =
  'render.mjs <fixtures.json> [filter] [--out directory] [--bundle local-directory]';
const LAYOUTS = ['stack', 'stack-flipped', 'takeover', 'pip', 'over'];
const ASPECTS = ['9:16', '16:9'];
// ExplainerPalette in src/main/remotion/compositions/explainer/types.ts.
const PALETTE_COLORS = [
  'bgOuter',
  'bgInner',
  'card',
  'cardRaised',
  'cardBorder',
  'text',
  'muted',
  'accent',
  'accent2',
  'accentSoft',
  'positive',
  'negative',
  'paper',
  'paperText',
];

function fail(where, message) {
  throw new Error(`${where}: ${message}`);
}

function record(value, where) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(where, 'expected an object');
}

function list(value, max, where) {
  if (!Array.isArray(value) || value.length < 1 || value.length > max) {
    fail(where, `expected an array with 1–${max} entries`);
  }
}

function identifier(value, seen, where) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(value)) {
    fail(where, 'use 1–80 letters/digits/_/-, starting with a letter/digit (no paths or dots)');
  }
  const key = value.toLowerCase();
  if (seen.has(key))
    fail(where, `duplicate identifier ${JSON.stringify(value)} (case-insensitive)`);
  seen.add(key);
}

function palette(value, where) {
  if (value === undefined) return;
  record(value, where);
  const color = (v) => typeof v === 'string' && v.trim().length > 0;
  for (const key of PALETTE_COLORS) {
    if (!color(value[key]))
      fail(`${where}.${key}`, 'full ExplainerPalette requires a color string');
  }
  if (!Array.isArray(value.clay) || value.clay.length !== 3 || !value.clay.every(color)) {
    fail(`${where}.clay`, 'full ExplainerPalette requires exactly three color strings');
  }
}

function variant(value, where) {
  if (value.paletteId !== undefined)
    fail(`${where}.paletteId`, 'use a full palette object; palette names are not render props');
  if (!LAYOUTS.includes(value.layout)) fail(`${where}.layout`, `expected ${LAYOUTS.join(' | ')}`);
  if (!ASPECTS.includes(value.aspect)) fail(`${where}.aspect`, `expected ${ASPECTS.join(' | ')}`);
  palette(value.palette, `${where}.palette`);
  return value;
}

export function parseRenderArgs(args) {
  const { values, positionals } = parseArgs({
    args,
    options: { out: { type: 'string' }, bundle: { type: 'string' } },
    allowPositionals: true,
  });
  if (positionals.length < 1 || positionals.length > 2 || !positionals[0]) {
    fail('usage', USAGE);
  }
  for (const [key, value] of Object.entries(values)) {
    if (!value.trim() || /^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
      fail(`--${key}`, 'expected a local directory path, not an empty value or URL');
    }
  }
  return { fixturesArg: positionals[0], filter: positionals[1], ...values };
}

export function normalizeFixtures(data) {
  list(data, LIMITS.fixtures, 'fixtures');
  const names = new Set();
  const fixtures = data.map((fx, i) => {
    const where = `fixture[${i}]${typeof fx?.name === 'string' ? ` ${JSON.stringify(fx.name)}` : ''}`;
    record(fx, where);
    identifier(fx.name, names, `${where}.name`);
    record(fx.scene, `${where}.scene`);
    if (typeof fx.scene.kind !== 'string' || !fx.scene.kind.trim()) {
      fail(`${where}.scene.kind`, 'expected an ExplainerScene kind');
    }
    if ((fx.samples !== undefined || fx.cases !== undefined) && fx.durationSec === undefined) {
      fail(`${where}.durationSec`, 'set an explicit durationSec when using samples or cases');
    }
    const durationSec = fx.durationSec === undefined ? 6 : fx.durationSec;
    if (
      !Number.isFinite(durationSec) ||
      durationSec < 1 / FPS ||
      durationSec > LIMITS.durationSec
    ) {
      fail(
        `${where}.durationSec`,
        `expected a finite number from 1/${FPS} to ${LIMITS.durationSec}`,
      );
    }
    const durationInFrames = Math.round(durationSec * FPS);
    if (fx.samples !== undefined && fx.frames !== undefined) {
      fail(where, 'use samples OR frames, not both');
    }
    const source =
      fx.samples === undefined
        ? fx.frames === undefined
          ? [15, 45, 90, 150]
          : fx.frames
        : fx.samples;
    const sampleField = fx.samples === undefined ? 'frames' : 'samples';
    list(source, LIMITS.samples, `${where}.${sampleField}`);
    const sampleNames = new Set();
    const samples = source.map((value, index) => {
      const at = `${where}.${sampleField}[${index}]`;
      const sample = fx.samples === undefined ? { name: `f${value}`, frame: value } : value;
      record(sample, at);
      if (
        !Number.isSafeInteger(sample.frame) ||
        sample.frame < 0 ||
        sample.frame >= durationInFrames
      ) {
        fail(
          at,
          `frame ${String(sample.frame)} must be an integer from 0 to ${durationInFrames - 1} (${durationSec}s at ${FPS}fps); change frame or durationSec`,
        );
      }
      identifier(sample.name, sampleNames, `${at}.name`);
      return { ...sample };
    });
    const base = variant(
      {
        name: null,
        layout: fx.layout === undefined ? 'stack' : fx.layout,
        aspect: fx.aspect === undefined ? '9:16' : fx.aspect,
        palette: fx.palette,
        paletteId: fx.paletteId,
      },
      where,
    );
    let cases = [base];
    if (fx.cases !== undefined) {
      list(fx.cases, LIMITS.cases, `${where}.cases`);
      const caseNames = new Set();
      cases = fx.cases.map((value, index) => {
        const at = `${where}.cases[${index}]`;
        record(value, at);
        identifier(value.name, caseNames, `${at}.name`);
        return variant(
          { ...value, palette: value.palette === undefined ? fx.palette : value.palette },
          at,
        );
      });
    }
    return { ...fx, durationSec, durationInFrames, samples, cases };
  });
  // Check collisions, including contact sheets, before a browser is opened or filtering occurs.
  createRenderPlan(fixtures);
  return fixtures;
}

/** Mirrors stageCanvasFor, not Root's fixed 1080×960 ExplainerScene defaults. */
export function canvasFor({ aspect, layout }) {
  if (aspect === '16:9') return { width: 1920, height: 1080 };
  return { width: 1080, height: layout === 'stack' || layout === 'stack-flipped' ? 960 : 1920 };
}

export function createRenderPlan(fixtures) {
  const outputs = new Set();
  const reserve = (file, where) => {
    const key = file.toLowerCase();
    if (outputs.has(key))
      fail(where, `output collision for ${file}; rename fixture, case or sample`);
    outputs.add(key);
    return file;
  };
  return fixtures.flatMap((fx) =>
    fx.cases.map((entry) => {
      const where = `fixture ${JSON.stringify(fx.name)}${entry.name === null ? '' : ` case ${JSON.stringify(entry.name)}`}`;
      const stem = entry.name === null ? fx.name : `${fx.name}--${entry.name}`;
      return {
        label: where,
        inputProps: {
          scene: fx.scene,
          accentColor: entry.palette?.accent ?? '#9f75ff',
          layout: entry.layout,
          aspect: entry.aspect,
          ...(entry.palette === undefined ? {} : { palette: entry.palette }),
        },
        composition: { ...canvasFor(entry), fps: FPS, durationInFrames: fx.durationInFrames },
        samples: fx.samples.map((sample) => ({
          ...sample,
          file: reserve(`${stem}-${sample.name}.png`, where),
        })),
        sheet: reserve(`${stem}-sheet.png`, where),
      };
    }),
  );
}
