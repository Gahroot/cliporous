/**
 * Real-FFmpeg smoke test for the explainer stage layouts. Opt-in (spawns the
 * bundled ffmpeg-static binary and writes PNGs to /tmp/layouts):
 *
 *   LAYOUT_FFMPEG_IT=1 npx vitest run --config vitest.config.main.ts \
 *     src/main/layouts/segment-layouts.ffmpeg.test.ts
 *
 * Mirrors `encodeSegment()` (segment-render.ts): source at input 0 (seeked,
 * `-hwaccel auto`), stage at input 1 (`-stream_loop -1`), layout graph +
 * the same fps/tpad/trim + audio normalisation tail.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ExplainerLayout } from '../remotion/compositions/explainer/types';
import { buildDriftZoom } from '../zoom-filters';
import { buildArchetypeLayout } from './segment-layouts';

const RUN = process.env.LAYOUT_FFMPEG_IT === '1';
const OUT_DIR = '/tmp/layouts';
const FX = join(OUT_DIR, 'fx');
const FONT = '/System/Library/Fonts/Supplemental/Arial.ttf';
const DUR = 3;
const FPS = 30;

function ffmpegBin(): string {
  return createRequire(import.meta.url)('ffmpeg-static') as string;
}

function ff(args: string[]): { status: number | null; stderr: string } {
  const r = spawnSync(ffmpegBin(), ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: r.status, stderr: r.stderr };
}

function must(args: string[]): void {
  const r = ff(args);
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
}

function text(size: number, y: string, label: string): string {
  const font = existsSync(FONT) ? `fontfile=${FONT}:` : '';
  return `drawtext=${font}text=${label}:fontsize=${size}:fontcolor=white:x=(w-tw)/2:y=${y}`;
}

beforeAll(() => {
  if (!RUN) return;
  mkdirSync(FX, { recursive: true });
  must([
    ...['-f', 'lavfi', '-i', `testsrc2=s=1920x1080:r=${FPS}:d=${DUR}`],
    ...['-f', 'lavfi', '-i', `sine=f=440:d=${DUR}`],
    ...['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest'],
    join(FX, 'speaker.mp4'),
  ]);
  must([
    ...[
      '-f',
      'lavfi',
      '-i',
      `color=c=navy:s=1080x960:r=${FPS}:d=3.3,${text(160, '(h-th)/2', 'STAGE')}`,
    ],
    ...['-c:v', 'libx264', '-pix_fmt', 'yuv420p'],
    join(FX, 'stage960.mp4'),
  ]);
  must([
    ...[
      '-f',
      'lavfi',
      '-i',
      `color=c=navy:s=1080x1920:r=${FPS}:d=3.3,${text(200, '500', 'STAGE')}`,
    ],
    ...['-c:v', 'libx264', '-pix_fmt', 'yuv420p'],
    join(FX, 'stage1920.mp4'),
  ]);
  // Semi-transparent (alpha 170/255) rounded card in the upper third.
  const card =
    "geq=r='40':g='60':b='140':" +
    "a='if(lt(hypot(max(abs(X-540)-390\\,0)\\,max(abs(Y-490)-250\\,0))\\,60)\\,170\\,0)'";
  must([
    ...[
      '-f',
      'lavfi',
      '-i',
      `color=c=black@0:s=1080x1920:r=${FPS}:d=3.3,format=rgba,${card},${text(150, '420', 'CARD')}`,
    ],
    ...['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le'],
    join(FX, 'stage_alpha.mov'),
  ]);
}, 120_000);

const STAGE_FOR: Record<ExplainerLayout, string> = {
  stack: 'stage960.mp4',
  'stack-flipped': 'stage960.mp4',
  takeover: 'stage1920.mp4',
  pip: 'stage1920.mp4',
  over: 'stage_alpha.mov',
};

describe.skipIf(!RUN)('explainer layouts through real ffmpeg', () => {
  for (const layout of Object.keys(STAGE_FOR) as ExplainerLayout[]) {
    it(`renders ${layout}`, () => {
      const zoom =
        layout === 'over'
          ? buildDriftZoom({
              width: 1080,
              height: 1920,
              fps: FPS,
              duration: DUR,
              zoomIntensity: 1.1,
            })
          : undefined;
      const { filterComplex } = buildArchetypeLayout('split-image', {
        width: 1080,
        height: 1920,
        segmentDuration: DUR,
        fps: FPS,
        mediaPath: join(FX, STAGE_FOR[layout]),
        sourceWidth: 1920,
        sourceHeight: 1080,
        cropRect: { x: 656, y: 0, width: 608, height: 1080 },
        explainerLayout: layout,
        speakerZoomFilter: zoom,
      });
      const d = DUR.toFixed(3);
      const graph = [
        filterComplex,
        `[outv]fps=${FPS},tpad=stop_mode=clone:stop_duration=${d},trim=duration=${d},setpts=PTS-STARTPTS,format=yuv420p[finalv]`,
        `[0:a]aresample=48000,apad=pad_dur=${d},atrim=duration=${d},asetpts=PTS-STARTPTS[finala]`,
      ].join(';');
      const mp4 = join(OUT_DIR, `${layout}.mp4`);
      const enc = ff([
        ...['-hwaccel', 'auto', '-ss', '0', '-i', join(FX, 'speaker.mp4')],
        ...['-stream_loop', '-1', '-i', join(FX, STAGE_FOR[layout])],
        ...['-filter_complex', graph, '-map', '[finalv]', '-map', '[finala]'],
        ...['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-r', String(FPS)],
        ...['-fps_mode', 'cfr', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000'],
        ...['-t', String(DUR), mp4],
      ]);
      expect(enc.stderr).toBe('');
      expect(enc.status).toBe(0);
      must(['-ss', '1.5', '-i', mp4, '-frames:v', '1', join(OUT_DIR, `${layout}.png`)]);
      // pip slide-in: a frame mid-slide.
      if (layout === 'pip') {
        must(['-ss', '0.1', '-i', mp4, '-frames:v', '1', join(OUT_DIR, 'pip-slide.png')]);
      }
      const probe = spawnSync(ffmpegBin(), ['-hide_banner', '-i', mp4], { encoding: 'utf8' });
      expect(probe.stderr).toMatch(/Audio: aac/);
      expect(probe.stderr).toMatch(/1080x1920/);
      expect(probe.stderr).toMatch(/Duration: 00:00:0(2\.9|3\.0)/);
    }, 120_000);
  }
});
