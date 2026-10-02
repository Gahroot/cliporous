#!/usr/bin/env node
/**
 * Render the story board prototype in both skins.
 * Usage: node scripts/storyboard-proof/render.mjs <source.mp4> [--video] [--skin ink|polish]
 *   Stills at key beats + one contact sheet per skin; --video also renders the
 *   full 1920×1080 MP4 with the source footage and audio underneath.
 * Output: a fresh $TMPDIR/storyboard-proof-* directory (printed). Nothing is written to the repo.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { onBrowserDownload, openLocalBrowser } from '../explainer-stills/harness-runtime.mjs';

const root = path.resolve(import.meta.dirname, '..', '..');
const args = process.argv.slice(2);
const source = args.find((a) => !a.startsWith('--') && a.endsWith('.mp4'));
const wantVideo = args.includes('--video');
const skinArg = args[args.indexOf('--skin') + 1];
const skins = args.includes('--skin') ? [skinArg] : ['ink', 'polish'];
if (!source || !existsSync(source))
  throw new Error('Pass the source .mp4 path as the first argument.');
if (!skins.every((s) => s === 'ink' || s === 'polish'))
  throw new Error('--skin must be ink or polish');

/** Beat times (s) sampled for the stills sheet — one per story moment. */
const BEATS = [
  ['01-dissolve', 0.75],
  ['02-window', 2.4],
  ['03-throw', 3.75],
  ['04-neq', 7.0],
  ['05-curve', 8.9],
  ['06-problem', 11.0],
  ['07-crowd', 13.1],
  ['08-swipe', 13.85],
  ['09-notes', 19.9],
  ['10-ring', 24.4],
  ['11-swipe2', 25.6],
  ['12-built', 28.5],
  ['13-recap', 29.3],
  ['14-back', 30.5],
];

const out = mkdtempSync(path.join(tmpdir(), 'storyboard-proof-'));
const work = mkdtempSync(path.join(tmpdir(), 'storyboard-proof-work-'));
console.log(`Output: ${out}`);
const ff = ffmpegPath ?? 'ffmpeg';

let browser;
try {
  const publicDir = path.join(work, 'public');
  cpSync(path.join(root, 'resources', 'fonts'), path.join(publicDir, 'fonts'), { recursive: true });
  copyFileSync(source, path.join(publicDir, 'proof-source.mp4'));
  const { bundle } = await import('@remotion/bundler');
  const serveUrl = await bundle({
    entryPoint: path.join(
      root,
      'src',
      'main',
      'remotion',
      'compositions',
      'storyboard',
      'proof-root.tsx',
    ),
    rootDir: root,
    outDir: path.join(work, 'bundle'),
    publicDir,
  });
  const { renderStill, renderMedia, selectComposition } = await import('@remotion/renderer');
  const opened = await openLocalBrowser();
  browser = opened.browser;
  const shared = { ...opened.shared, serveUrl, onBrowserDownload };

  for (const skin of skins) {
    const inputProps = { skin, withSource: true };
    const composition = await selectComposition({ ...shared, id: 'StoryBoardProof', inputProps });
    const files = [];
    for (const [name, sec] of BEATS) {
      const output = path.join(out, `${skin}-${name}.png`);
      await renderStill({
        ...shared,
        composition,
        inputProps,
        frame: Math.round(sec * composition.fps),
        output,
        imageFormat: 'png',
      });
      files.push(output);
    }
    console.log(`✓ ${skin}: ${files.length} stills`);
    // 4-wide contact sheet with beat labels.
    const sheet = path.join(out, `${skin}-sheet.png`);
    const inputs = files.flatMap((f) => ['-i', f]);
    const cols = 4;
    const label = (i) => `${BEATS[i][0]} ${BEATS[i][1].toFixed(2)}s`;
    const scaled = files
      .map(
        (_, i) =>
          `[${i}:v]scale=640:-1,drawtext=text='${label(i)}':x=10:y=10:fontsize=22:fontcolor=yellow:box=1:boxcolor=black@0.6[s${i}]`,
      )
      .join(';');
    const pad = (cols - (files.length % cols)) % cols;
    const blanks = Array.from({ length: pad }, (_, k) => `color=black:s=640x360:d=1[b${k}]`).join(
      ';',
    );
    const all = [
      ...files.map((_, i) => `[s${i}]`),
      ...Array.from({ length: pad }, (_, k) => `[b${k}]`),
    ];
    const layout = all.map((_, i) => `${(i % cols) * 640}_${Math.floor(i / cols) * 360}`).join('|');
    execFileSync(
      ff,
      [
        '-y',
        '-loglevel',
        'error',
        ...inputs,
        '-filter_complex',
        `${scaled}${blanks ? `;${blanks}` : ''};${all.join('')}xstack=inputs=${all.length}:layout=${layout}`,
        '-frames:v',
        '1',
        sheet,
      ],
      { stdio: 'inherit' },
    );
    console.log(`✓ ${skin}: sheet → ${sheet}`);
    if (wantVideo) {
      const video = path.join(out, `${skin}-board.mp4`);
      const started = Date.now();
      await renderMedia({
        ...shared,
        composition,
        inputProps,
        codec: 'h264',
        outputLocation: video,
        crf: 20,
        concurrency: 4,
      });
      console.log(`✓ ${skin}: video → ${video} (${((Date.now() - started) / 1000).toFixed(0)}s)`);
    }
  }
} finally {
  if (browser) await browser.close({ silent: true });
  rmSync(work, { recursive: true, force: true });
}
