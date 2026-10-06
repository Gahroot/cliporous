/**
 * Opt-in scene canvas media proof. Real saved plan + transcript + source video (local paths via
 * env), real production validation, timeline, canvas grouping, Remotion render and FFmpeg encode.
 * Electron is the only boundary replaced. Never calls AI. Output stays outside the repository.
 *
 * SCENE_CANVAS_PROJECT=<.batchclip> SCENE_CANVAS_OUT=<empty tmp dir> SCENE_CANVAS_BUNDLE=<snapshot>
 *   npx vitest run --config scripts/explainer-stills/vitest.scene-canvas.config.ts
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { it, vi } from 'vitest';
import { validateSceneFirstLongformPlan } from '../../src/main/ai/longform-scene-contract';
import { setupFFmpeg } from '../../src/main/ffmpeg';
import { deriveExplainerPalette } from '../../src/main/remotion/compositions/explainer/palette';
import { groupSceneCanvases } from '../../src/main/render/longform-scene-canvas';
import { renderSceneFirstLongform } from '../../src/main/render/longform-scene-render';
import { buildLongformSceneTimeline } from '../../src/main/render/longform-scene-timeline';
import {
  longformSceneId,
  longformSourceFingerprint,
  type SceneFirstLongformPlan,
} from '../../src/shared/longform-scenes';
import type { Palette } from '../../src/shared/palettes';
import type { StoryboardStyle } from '../../src/shared/storyboards';

const env = vi.hoisted(() => {
  const out = process.env.SCENE_CANVAS_OUT;
  if (out) {
    Object.defineProperty(process, 'resourcesPath', {
      value: `${out}/resources`,
      configurable: true,
    });
  }
  return { out };
});
vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    getAppPath: () => process.cwd(),
    getPath: () => env.out,
  },
}));

const require = createRequire(import.meta.url);

interface Word {
  text: string;
  start: number;
  end: number;
}

function loadProject(path: string): {
  plan: SceneFirstLongformPlan;
  words: Word[];
  palette: Palette;
  sourcePath: string;
} {
  const project = JSON.parse(readFileSync(path, 'utf8'));
  const sourceId = Object.keys(project.longformPlans)[0];
  assert.ok(sourceId, 'Project has no long-form plan');
  const record = project.longformPlans[sourceId];
  const source = project.sources.find((s: { id: string }) => s.id === sourceId);
  return {
    plan: record.plan,
    words: project.transcriptions[sourceId].words,
    palette: record.palette,
    sourcePath: source.path,
  };
}

/** Cut the plan to [start, end) and rebase everything to 0 for a short local proof. */
function slice(
  full: ReturnType<typeof loadProject>,
  start: number,
  end: number,
  style: StoryboardStyle,
  duration = end - start,
) {
  const firstWord = full.words.findIndex((w) => w.start >= start);
  const lastWord = full.words.findLastIndex((w) => w.end <= end);
  const words = full.words
    .slice(firstWord, lastWord + 1)
    .map((w) => ({ ...w, start: w.start - start, end: w.end - start }));
  const shiftIndices = (value: unknown, key = ''): unknown => {
    if (Array.isArray(value)) return value.map((item) => shiftIndices(item));
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shiftIndices(v, k)]));
    if (typeof value === 'number' && /word$/i.test(key)) return value - firstWord;
    return value;
  };
  const scenes = full.plan.scenes
    .filter((s) => s.startTime >= start && s.endTime <= end && !s.omitted)
    .map((s) => ({
      ...s,
      startTime: s.startTime - start,
      endTime: s.endTime - start,
      id: longformSceneId(s.kind, s.startWord - firstWord, s.endWord - firstWord),
      startWord: s.startWord - firstWord,
      endWord: s.endWord - firstWord,
      sourceSpec: shiftIndices(s.sourceSpec) as typeof s.sourceSpec,
    }));
  const sections = full.plan.sections
    .filter((s) => s.endTime > start && s.startTime < end)
    .map((s) => ({
      ...s,
      startWord: Math.max(0, s.startWord - firstWord),
      endWord: Math.min(words.length - 1, s.endWord - firstWord),
      startTime: Math.max(0, s.startTime - start),
      endTime: Math.min(end - start, s.endTime - start),
    }));
  const plan = {
    ...full.plan,
    sourceDuration: duration,
    sourceFingerprint: longformSourceFingerprint(words, duration),
    // Scene-only proof: phrase/block/card overlays are a separate existing feature.
    blocks: [],
    phrases: [],
    cards: [],
    scenes,
    sections,
    storyboardStyle: style,
  } as SceneFirstLongformPlan;
  return { plan, words };
}

it('renders a real saved section as one scene canvas through the production export', async () => {
  const projectPath = process.env.SCENE_CANVAS_PROJECT;
  const bundle = process.env.SCENE_CANVAS_BUNDLE;
  const out = env.out;
  assert.ok(projectPath && bundle && out, 'Set SCENE_CANVAS_PROJECT, _BUNDLE and _OUT');
  const start = Number(process.env.SCENE_CANVAS_START ?? 0);
  const end = Number(process.env.SCENE_CANVAS_END ?? 70);
  const style = (process.env.SCENE_CANVAS_STYLE ?? 'ink') as StoryboardStyle;

  // Packaged-path resources: snapshot bundle, SFX and pinned FFmpeg/ffprobe.
  const resources = join(out, 'resources');
  mkdirSync(join(resources, 'bin'), { recursive: true });
  cpSync(bundle, join(resources, 'remotion'), { recursive: true });
  cpSync(join(process.cwd(), 'resources', 'sfx'), join(resources, 'sfx'), { recursive: true });
  const ffmpeg = require('ffmpeg-static') as string;
  const ffprobe = (require('@ffprobe-installer/ffprobe') as { path: string }).path;
  const suffix = process.platform === 'win32' ? '.exe' : '';
  copyFileSync(ffmpeg, join(resources, 'bin', `ffmpeg${suffix}`));
  copyFileSync(ffprobe, join(resources, 'bin', `ffprobe${suffix}`));
  // Packaged-path compositor, exactly where production resolves it (no downloads).
  const compositor =
    process.platform === 'win32'
      ? `compositor-win32-${process.arch}-msvc`
      : process.platform === 'darwin'
        ? `compositor-darwin-${process.arch}`
        : `compositor-linux-${process.arch}-gnu`;
  cpSync(
    join(process.cwd(), 'node_modules', '@remotion', compositor),
    join(resources, 'app.asar.unpacked', 'node_modules', '@remotion', compositor),
    { recursive: true },
  );
  setupFFmpeg();

  const full = loadProject(projectPath);
  assert.ok(existsSync(full.sourcePath), `Source video missing: ${full.sourcePath}`);
  const clipPath = join(out, 'source-slice.mp4');
  execFileSync(ffmpeg, [
    '-v',
    'error',
    '-y',
    '-ss',
    String(start),
    '-t',
    String(end - start),
    '-i',
    full.sourcePath,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-c:a',
    'aac',
    clipPath,
  ]);
  // Probe the encoded slice: production validates against the real media duration.
  const duration = Number(
    execFileSync(ffprobe, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      clipPath,
    ]).toString(),
  );
  const { plan, words } = slice(full, start, start + duration, style, duration);
  const validated = validateSceneFirstLongformPlan(plan, words, duration);
  assert.ok(validated.ok, validated.ok ? '' : validated.error);
  const timeline = buildLongformSceneTimeline(validated.value.plan, validated.value.scenes);
  const entries = groupSceneCanvases(timeline.segments, timeline.totalFrames);
  const canvases = entries.filter((e) => e.kind === 'canvas');
  assert.ok(canvases.length > 0, 'Expected at least one scene canvas in this slice');

  const outputPath = join(out, `scene-canvas-${style}.mp4`);
  const started = performance.now();
  const reconciliation = await renderSceneFirstLongform({
    sourceVideoPath: clipPath,
    outputPath,
    plan,
    words,
    palette: deriveExplainerPalette(full.palette),
    storyboardPalette: full.palette,
    qualityParams: { crf: 20, preset: 'veryfast' },
    sceneSfxEnabled: true,
  });
  const elapsed = (performance.now() - started) / 1000;
  writeFileSync(
    join(out, `report-${style}.json`),
    `${JSON.stringify(
      {
        style,
        slice: [start, end],
        elapsedSec: elapsed,
        canvases: canvases.map((c) =>
          c.kind === 'canvas'
            ? {
                startTime: c.group.startTime,
                endTime: c.group.endTime,
                scenes: c.group.members.map((m) => [
                  m.compiled.placement.kind,
                  m.compiled.placement.startTime,
                ]),
              }
            : null,
        ),
        reconciliation,
      },
      null,
      2,
    )}\n`,
  );
  assert.ok(existsSync(outputPath));
  const failed = (reconciliation.sceneResults ?? []).filter((s) => s.status === 'failed');
  assert.equal(failed.length, 0, JSON.stringify(failed));
});
