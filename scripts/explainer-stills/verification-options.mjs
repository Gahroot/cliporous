import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { verificationPlan } from './fixture-manifest.mjs';
import { parseRenderArgs } from './fixture-schema.mjs';
import { ROOT } from './harness-runtime.mjs';

export const FIXTURES = path.join(ROOT, 'scripts/explainer-stills/fixtures');
export const HELP = `Local-only production-bundle verification (does not build or download).
  --bundle DIR             Default out/remotion; must already be built
  --all                    Every declared deliverable fixture (systems: kinds/relays/technology/explanation)
  --controls               Only old regression controls
  --fixture FILE           Repeatable fixture files, replaces default discovery
  --select TEXT            Repeatable fixture name, kind, or coverage ID substring (OR)
  --case TEXT              Repeatable case name/layout/aspect substring (OR)
  --software-raster        Explicit POSIX verification override: disable GPU 2D rasterization; ANGLE unchanged
  --native-cases           Do not add stack + contrasting compact matrix cases
  --no-determinism         Only first critical-frame pass (coverage != determinism)
  --no-media               No movie/alpha/cost claims
  --media-frames N          Window length (default motion:12, systems:full); 0 means full
  --no-controls            Do not render matched benchmark controls
  --timeout-ms N           Per operation deadline, default 600000
  --probe-cleanup          Exercise real invalid-frame rejection + render cancellation
  --dry-run                Print planned counts, open no browser, execute nothing
  --out DIR                Fresh empty directory outside repository (default mkdtemp)
  --help
Examples:
  node scripts/explainer-stills/verify-motion.mjs --select flywheel --case stack --no-media
  node scripts/explainer-stills/verify-motion.mjs --all --media-frames 12
  node scripts/explainer-stills/verify-systems.mjs --all --probe-cleanup
  node scripts/explainer-stills/coverage.mjs --complete --report /tmp/run/report.json --bundle out/remotion
Reports preserve PNGs/MOVs and errors. Systems movies are SILENT; production SFX is verified separately by verify-systems-e2e.mjs.`;

export function parseVerificationArgs(args, mode = 'motion') {
  const { values } = parseArgs({
    args,
    options: {
      bundle: { type: 'string', default: path.join(ROOT, 'out/remotion') },
      out: { type: 'string' },
      all: { type: 'boolean', default: false },
      controls: { type: 'boolean', default: false },
      fixture: { type: 'string', multiple: true, default: [] },
      select: { type: 'string', multiple: true, default: [] },
      case: { type: 'string', multiple: true, default: [] },
      'native-cases': { type: 'boolean', default: false },
      'software-raster': { type: 'boolean', default: false },
      'no-determinism': { type: 'boolean', default: false },
      'no-media': { type: 'boolean', default: false },
      'no-controls': { type: 'boolean', default: false },
      'media-frames': { type: 'string', default: mode === 'systems' ? '0' : '12' },
      'timeout-ms': { type: 'string', default: '600000' },
      'probe-cleanup': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  for (const key of ['media-frames', 'timeout-ms']) {
    if (!/^\d+$/.test(values[key])) throw new Error(`--${key} must be an integer`);
    values[key] = Number(values[key]);
    const min = key === 'timeout-ms' ? 1000 : 0;
    const max = key === 'timeout-ms' ? 3600000 : 1800;
    if (!Number.isSafeInteger(values[key]) || values[key] < min || values[key] > max)
      throw new Error(`--${key} must be ${min}..${max}`);
  }
  for (const key of ['bundle', 'out', 'fixture', 'select', 'case']) {
    for (const value of [values[key]].flat().filter((v) => v !== undefined)) {
      if (!value.trim() || /^[a-z][a-z0-9+.-]*:\/\//i.test(value))
        throw new Error(`--${key} must be nonempty and local`);
    }
  }
  if (values.controls && values.all) throw new Error('--controls and --all are mutually exclusive');
  return values;
}

/** Extend the legacy stills CLI without changing its fixture/filter/path validation or `--` semantics. */
export function parseStillsArgs(args) {
  const { values, tokens } = parseArgs({
    args,
    allowPositionals: true,
    tokens: true,
    options: {
      out: { type: 'string' },
      bundle: { type: 'string' },
      'software-raster': { type: 'boolean', default: false },
    },
  });
  const removed = new Set(
    tokens.filter((t) => t.kind === 'option' && t.name === 'software-raster').map((t) => t.index),
  );
  return {
    ...parseRenderArgs(args.filter((_, index) => !removed.has(index))),
    softwareRaster: values['software-raster'],
  };
}

export function loadFixtures(files = []) {
  const paths = files.length
    ? files.map((file) => path.resolve(file.includes(path.sep) ? file : path.join(FIXTURES, file)))
    : readdirSync(FIXTURES)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .map((f) => path.join(FIXTURES, f));
  const fixtures = paths.flatMap((file) => {
    const rows = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(rows)) throw new Error(`${file}: expected array`);
    return rows;
  });
  return { fixtures, paths };
}

export function selectVerificationPlan(options, mode = 'motion') {
  const loaded = loadFixtures(options.controls ? ['regression-controls.json'] : options.fixture);
  let fixtures = loaded.fixtures;
  if (!options.controls && !options.fixture.length) {
    fixtures = fixtures.filter(
      (fx) =>
        fx.covers?.length &&
        (mode !== 'systems' ||
          fx.covers.some((t) =>
            ['kind', 'relay', 'technology', 'explanation'].includes(t.category),
          )),
    );
  }
  if (options.select.length) {
    const search = (fx) =>
      `${fx.name} ${fx.scene.kind} ${(fx.covers ?? []).map((t) => `${t.category}:${t.id}`).join(' ')}`;
    for (const query of options.select)
      if (!fixtures.some((fx) => search(fx).includes(query)))
        throw new Error(`--select ${query}: no fixtures`);
    fixtures = fixtures.filter((fx) => options.select.some((q) => search(fx).includes(q)));
  } else if (!options.all && !options.controls && !options.fixture.length) {
    // A bounded default, not a claim of full coverage. Explicit --all is always required for that.
    const kinds =
      mode === 'systems'
        ? ['bottleneck', 'feedback-control', 'relay']
        : ['hero', 'bottleneck', 'statement'];
    fixtures = kinds.flatMap((kind) => fixtures.find((fx) => fx.scene.kind === kind) ?? []);
  }
  if (!fixtures.length) throw new Error('No selected fixtures; fixtures may still be pending.');
  let plan = verificationPlan(fixtures, { matrix: !options['native-cases'] });
  if (options.case.length) {
    const search = (p) =>
      `${p.caseName ?? 'default'} ${p.inputProps.layout} ${p.inputProps.aspect}`;
    for (const query of options.case)
      if (!plan.some((p) => search(p).includes(query)))
        throw new Error(`--case ${query}: no cases`);
    plan = plan.filter((p) => options.case.some((q) => search(p).includes(q)));
  }
  return { plan, fixtureFiles: loaded.paths };
}

/** Fixed permutation, not Math.random: shuffled seeks are reproducible and include backwards jumps. */
export function shuffledSamples(samples) {
  const result = [...samples];
  let state = 0x6d2b79f5;
  for (let i = result.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
