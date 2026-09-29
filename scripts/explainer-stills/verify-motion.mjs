/** Run after npm run build. Exercises the production bundle, frame seeking and ProRes alpha. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import ffmpeg from 'ffmpeg-static';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const serveUrl = path.join(root, 'out/remotion');
await fs.access(path.join(serveUrl, 'index.html'));
const out = await fs.mkdtemp(path.join(os.tmpdir(), 'batchclip-motion-check-'));
const chromiumOptions = { gl: 'angle' };
const browser = await openBrowser('chrome', { chromiumOptions });
const inputProps = {
  scene: {
    kind: 'hero',
    prop: 'shield',
    label: 'Protect privacy',
    at: 0.4,
    annotation: { kind: 'circle', at: 1.4 },
  },
  durationSec: 3,
  layout: 'over',
};

try {
  const selected = await selectComposition({
    serveUrl,
    id: 'ExplainerScene',
    inputProps,
    puppeteerInstance: browser,
  });
  const composition = { ...selected, width: 1080, height: 960, fps: 30, durationInFrames: 90 };
  const options = {
    serveUrl,
    composition,
    inputProps,
    chromiumOptions,
    puppeteerInstance: browser,
    imageFormat: 'png',
    timeoutInMilliseconds: 60000,
  };
  const first = await renderStill({ ...options, frame: 75 });
  await renderStill({ ...options, frame: 18 });
  const repeated = await renderStill({ ...options, frame: 75 });
  assert(first.buffer && repeated.buffer, 'Expected PNG buffers');
  assert(first.buffer.equals(repeated.buffer), 'Repeated frame differs after seeking backwards');
  await fs.writeFile(path.join(out, 'shield-f75.png'), first.buffer);
  console.log('PASS: identical PNG output for frame 75 → 18 → 75');

  const outputLocation = path.join(out, 'shield-alpha.mov');
  await renderMedia({
    ...options,
    codec: 'prores',
    proResProfile: '4444',
    pixelFormat: 'yuva444p10le',
    outputLocation,
    concurrency: 2,
  });
  assert(ffmpeg, 'Installed ffmpeg-static binary required');
  const rgba = execFileSync(
    ffmpeg,
    [
      '-v',
      'error',
      '-ss',
      '2.5',
      '-i',
      outputLocation,
      '-frames:v',
      '1',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgba',
      '-',
    ],
    { maxBuffer: 8 * 1024 * 1024, timeout: 60000 },
  );
  assert.equal(rgba.length, 1080 * 960 * 4);
  const alpha = (x, y) => rgba[(y * 1080 + x) * 4 + 3];
  for (const [x, y] of [
    [0, 0],
    [1079, 0],
    [0, 959],
    [1079, 959],
  ])
    assert.equal(alpha(x, y), 0, 'ProRes corner must remain transparent');
  assert(alpha(540, 480) > 200, 'Hero body must remain visible');
  console.log('PASS: 90-frame ProRes 4444 retains transparent corners and visible hero');
  console.log(`Evidence: ${out}`);
} finally {
  await browser.close({ silent: true });
}
