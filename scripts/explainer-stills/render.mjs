#!/usr/bin/env node
/**
 * Dev tool: render PNG stills of explainer scenes for visual review.
 *
 *   node scripts/explainer-stills/render.mjs <fixtures-file> [name-filter]
 *
 * <fixtures-file> is a JSON file under scripts/explainer-stills/fixtures/:
 *   [{ "name": "equation-basic", "scene": {...ExplainerScene}, "frames": [20, 60, 120],
 *      "durationSec": 6 }]
 * Frames are at 30 fps. Output: /tmp/explainer-stills/<name>-f<frame>.png
 * plus one contact sheet per fixture (<name>-sheet.png) when ffmpeg is on PATH.
 *
 * Bundles once, then renders every still with the ANGLE GL backend (needed for
 * the 3D scenes on macOS). Not part of the app build.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { enableTailwind } from '@remotion/tailwind';

const root = path.resolve(import.meta.dirname, '..', '..');
const outDir = path.join(tmpdir(), 'explainer-stills');

const args = process.argv.slice(2);
const [fixturesArg, filter] = args;
if (!fixturesArg) {
  console.error('usage: render.mjs <fixtures.json> [name-filter]');
  process.exit(2);
}
const fixturesPath = path.isAbsolute(fixturesArg)
  ? fixturesArg
  : path.join(root, 'scripts', 'explainer-stills', 'fixtures', fixturesArg);
const fixtures = JSON.parse(readFileSync(fixturesPath, 'utf8')).filter(
  (f) => !filter || f.name.includes(filter),
);
if (fixtures.length === 0) {
  console.error(`no fixtures match "${filter ?? ''}" in ${fixturesPath}`);
  process.exit(2);
}

const publicDir = mkdtempSync(path.join(tmpdir(), 'explainer-stills-public-'));
mkdirSync(outDir, { recursive: true });
try {
  cpSync(path.join(root, 'resources', 'fonts'), path.join(publicDir, 'fonts'), { recursive: true });
  const serveUrl = await bundle({
    entryPoint: path.join(root, 'src', 'main', 'remotion', 'index.ts'),
    rootDir: root,
    publicDir,
    webpackOverride: (config) => {
      const tw = enableTailwind(config, { configLocation: path.join(root, 'tailwind.config.js') });
      return {
        ...tw,
        resolve: {
          ...tw.resolve,
          alias: {
            ...(tw.resolve?.alias ?? {}),
            '@': path.join(root, 'src', 'renderer', 'src'),
            '@shared': path.join(root, 'src', 'shared'),
          },
        },
      };
    },
  });

  for (const fx of fixtures) {
    const inputProps = {
      accentColor: '#9f75ff',
      scene: fx.scene,
      layout: fx.layout ?? 'stack',
    };
    const composition = await selectComposition({
      serveUrl,
      id: 'ExplainerScene',
      inputProps,
      chromiumOptions: { gl: 'angle' },
    });
    const durationInFrames = Math.round((fx.durationSec ?? 6) * 30);
    const files = [];
    for (const frame of fx.frames ?? [15, 45, 90, 150]) {
      const output = path.join(outDir, `${fx.name}-f${frame}.png`);
      await renderStill({
        serveUrl,
        composition: { ...composition, durationInFrames },
        inputProps,
        frame: Math.min(frame, durationInFrames - 1),
        output,
        chromiumOptions: { gl: 'angle' },
        overwrite: true,
      });
      files.push(output);
    }
    // Contact sheet: frames side by side at half size.
    const sheet = path.join(outDir, `${fx.name}-sheet.png`);
    try {
      if (files.length < 2) throw new Error('single frame');
      const inputs = files.flatMap((f) => ['-i', f]);
      const filterGraph = `${files.map((_, i) => `[${i}:v]scale=540:-1[s${i}]`).join(';')};${files
        .map((_, i) => `[s${i}]`)
        .join('')}hstack=inputs=${files.length}`;
      execFileSync(
        'ffmpeg',
        ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filterGraph, sheet],
        { stdio: 'inherit' },
      );
      console.log(`✓ ${fx.name} → ${sheet}`);
    } catch {
      console.log(`✓ ${fx.name} → ${files.join(', ')}`);
    }
  }
} finally {
  rmSync(publicDir, { recursive: true, force: true });
}
