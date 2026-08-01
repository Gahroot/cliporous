import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ffmpegStaticPath from 'ffmpeg-static';
import {
  type ArchetypeWindow,
  type CaptionStyleInput,
  generateCaptions,
  type WordInput,
} from '../../src/main/captions';
import { buildASSFilter } from '../../src/main/render/helpers';
import { resolveSubtitleAnchor } from '../../src/shared/caption-layout';

const ROOT = resolve(__dirname, '../..');
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');
const OUTPUT_DIR = join(ROOT, '.ezcoder/tmp/caption-stability', RUN_ID);
const FONTS_DIR = join(ROOT, 'resources/fonts');
const SOURCE_PATH = join(OUTPUT_DIR, 'solid-source.mp4');
const ASS_PATH = join(OUTPUT_DIR, 'caption-stability.ass');
const RENDERED_PATH = join(OUTPUT_DIR, 'caption-stability.mp4');
const CONTACT_SHEET_PATH = join(OUTPUT_DIR, 'contact-sheet.png');
const FRAME_WIDTH = 1080;
const FRAME_HEIGHT = 1920;
const DURATION_SECONDS = 6.5;
const POSITION = { x: 50, y: 78 };

interface ParsedEvent {
  line: string;
  payload: string;
  text: string;
  start: number;
  end: number;
  anchor: { x: number; y: number } | null;
  alignment: number | null;
  lineCount: number;
  fontSize: number | null;
  hero: boolean;
}

function runFfmpeg(args: string[]): void {
  if (!ffmpegStaticPath) throw new Error('ffmpeg-static did not resolve an executable path');
  execFileSync(ffmpegStaticPath, ['-hide_banner', '-loglevel', 'error', ...args], {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

function assTimeToSeconds(value: string): number {
  const [hours, minutes, seconds] = value.split(':');
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

function parseEvents(document: string): ParsedEvent[] {
  return document
    .split('\n')
    .filter((line) => line.startsWith('Dialogue:'))
    .map((line) => {
      const fields = line.split(',');
      const payload = fields.slice(9).join(',');
      const anchorMatch = payload.match(/\\pos\((\d+),(\d+)\)/);
      const alignmentMatch = payload.match(/\\an(\d)/);
      const fontSizeMatch = payload.match(/\\fs(\d+)/);
      return {
        line,
        payload,
        text: payload.replace(/\{[^}]*\}/g, '').replaceAll('\\N', ' '),
        start: assTimeToSeconds(fields[1]),
        end: assTimeToSeconds(fields[2]),
        anchor: anchorMatch ? { x: Number(anchorMatch[1]), y: Number(anchorMatch[2]) } : null,
        alignment: alignmentMatch ? Number(alignmentMatch[1]) : null,
        lineCount: (payload.match(/\\N/g)?.length ?? 0) + 1,
        fontSize: fontSizeMatch ? Number(fontSizeMatch[1]) : null,
        hero: payload.includes('\\fnInstrument Serif'),
      };
    });
}

function assertAudit(document: string, events: ParsedEvent[]): string[] {
  const failures: string[] = [];
  const expectedOrdinaryAnchor = resolveSubtitleAnchor(POSITION, FRAME_WIDTH, FRAME_HEIGHT);
  const styleFontSize = Number(document.match(/Style: Default,Inter,(\d+)/)?.[1]);

  if (!document.includes('WrapStyle: 2')) failures.push('ASS document is not using WrapStyle: 2');
  if (!Number.isFinite(styleFontSize))
    failures.push('Could not resolve the ordinary style font size');
  if (!events.some((event) => event.lineCount === 2))
    failures.push('Fixture produced no two-line event');
  if (!events.some((event) => event.payload.includes('\\fnBebas Neue'))) {
    failures.push('Fixture produced no emphasis-highlight event');
  }
  if (!events.some((event) => event.hero))
    failures.push('Fixture produced no fullscreen-quote hero');

  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    if (!event.anchor) failures.push(`Event ${index + 1} has no explicit \\pos anchor`);
    if (event.lineCount > 2) failures.push(`Event ${index + 1} has ${event.lineCount} lines`);
    if (!event.payload.includes('\\q2'))
      failures.push(`Event ${index + 1} does not disable auto-wrap`);

    if (event.hero) {
      if (event.alignment !== 5) failures.push(`Hero event ${index + 1} is not center-anchored`);
      if (event.anchor?.x !== FRAME_WIDTH / 2 || event.anchor?.y !== FRAME_HEIGHT / 2) {
        failures.push(`Hero event ${index + 1} is not frame-centered`);
      }
      if (event.fontSize === null) failures.push(`Hero event ${index + 1} has no size override`);
    } else {
      if (event.alignment !== 2) {
        failures.push(`Ordinary event ${index + 1} is not bottom-anchored`);
      }
      if (
        event.anchor?.x !== expectedOrdinaryAnchor.x ||
        event.anchor?.y !== expectedOrdinaryAnchor.y
      ) {
        failures.push(`Ordinary event ${index + 1} moved away from the shared anchor`);
      }
      if (event.fontSize !== null) {
        failures.push(`Ordinary event ${index + 1} changed the global font size`);
      }
    }

    const next = events[index + 1];
    if (next && event.end > next.start) {
      failures.push(
        `Events ${index + 1}/${index + 2} overlap (${event.end.toFixed(2)} > ${next.start.toFixed(2)})`,
      );
    }
  }

  return failures;
}

function eventByText(events: ParsedEvent[], text: string): ParsedEvent {
  const event = events.find((candidate) => candidate.text === text);
  if (!event) throw new Error(`Could not find rendered event for fixture text: ${text}`);
  return event;
}

async function main(): Promise<void> {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const words: WordInput[] = [
    { text: 'Stable', start: 0.2, end: 0.45 },
    { text: 'this', start: 1, end: 1.15 },
    { text: 'is', start: 1.18, end: 1.3 },
    { text: 'very', start: 1.33, end: 1.5 },
    { text: 'cool', start: 1.53, end: 1.75 },
    { text: 'make', start: 2.3, end: 2.45 },
    { text: 'it', start: 2.48, end: 2.6 },
    { text: 'pop', start: 2.63, end: 2.8, emphasis: 'emphasis' },
    { text: 'split', start: 3.25, end: 3.5 },
    { text: 'image', start: 3.8, end: 4.05 },
    { text: 'BROLL', start: 4.25, end: 4.5 },
    { text: 'quote', start: 5.2, end: 5.45 },
    { text: 'centered', start: 5.65, end: 5.95 },
  ];
  const archetypeWindows: ArchetypeWindow[] = [
    { startTime: 0, endTime: 0.8, archetype: 'talking-head' },
    { startTime: 0.8, endTime: 2.1, archetype: 'tight-punch' },
    { startTime: 2.1, endTime: 3.2, archetype: 'wide-breather' },
    { startTime: 3.2, endTime: 3.7, archetype: 'split-image' },
    { startTime: 3.7, endTime: 5, archetype: 'fullscreen-image' },
    { startTime: 5, endTime: DURATION_SECONDS, archetype: 'fullscreen-quote' },
  ];
  const style: CaptionStyleInput = {
    captionMode: 'emphasis_highlight',
    accentColor: '#9f75ff',
    fontSize: 0.065,
    wordsPerLine: 4,
  };

  await generateCaptions(words, style, ASS_PATH, {
    frameWidth: FRAME_WIDTH,
    frameHeight: FRAME_HEIGHT,
    position: POSITION,
    archetypeWindows,
    editStyleId: 'prestyj',
  });

  const document = await import('node:fs/promises').then(({ readFile }) =>
    readFile(ASS_PATH, 'utf8'),
  );
  const events = parseEvents(document);
  const failures = assertAudit(document, events);
  const auditLines = events.map((event, index) => {
    const anchor = event.anchor ? `${event.anchor.x},${event.anchor.y}` : 'missing';
    const font = event.fontSize ?? 'global';
    return `${index + 1}. ${event.start.toFixed(2)}-${event.end.toFixed(2)}s | anchor ${anchor} | ${event.lineCount} line(s) | font ${font} | ${event.hero ? 'hero' : 'ordinary'} | ${event.text}`;
  });
  const auditReport = [
    `Ordinary style font: ${document.match(/Style: Default,Inter,(\d+)/)?.[1] ?? 'missing'}`,
    `Timing overlap audit: ${failures.some((failure) => failure.includes('overlap')) ? 'FAIL' : 'PASS'}`,
    ...auditLines,
    ...(failures.length > 0 ? ['', 'FAILURES', ...failures] : ['', 'Structural audit: PASS']),
  ].join('\n');
  writeFileSync(join(OUTPUT_DIR, 'audit.txt'), `${auditReport}\n`, 'utf8');
  console.log(auditReport);
  if (failures.length > 0) throw new Error(`Caption structural audit failed (${failures.length})`);

  runFfmpeg([
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=0xf6ecd9:s=${FRAME_WIDTH}x${FRAME_HEIGHT}:r=30:d=${DURATION_SECONDS}`,
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-pix_fmt',
    'yuv420p',
    SOURCE_PATH,
  ]);
  runFfmpeg([
    '-y',
    '-i',
    SOURCE_PATH,
    '-vf',
    buildASSFilter(ASS_PATH, FONTS_DIR),
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-pix_fmt',
    'yuv420p',
    '-an',
    RENDERED_PATH,
  ]);

  const selections = [
    ['one-line', eventByText(events, 'Stable')],
    ['two-line', eventByText(events, 'this is very cool')],
    ['emphasis', eventByText(events, 'make it pop')],
    ['ordinary-transition', eventByText(events, 'split')],
    ['fullscreen-image', eventByText(events, 'image BROLL')],
    ['fullscreen-quote', eventByText(events, 'quote')],
  ] as const;
  const framePaths: string[] = [];
  for (const [label, event] of selections) {
    const timestamp = (event.start + event.end) / 2;
    const framePath = join(OUTPUT_DIR, `${label}-${timestamp.toFixed(2)}s.png`);
    framePaths.push(framePath);
    runFfmpeg([
      '-y',
      '-ss',
      timestamp.toFixed(3),
      '-i',
      RENDERED_PATH,
      '-frames:v',
      '1',
      framePath,
    ]);
  }

  const stackInputs = framePaths.flatMap((framePath) => ['-i', framePath]);
  const scaleFilters = framePaths
    .map((_, index) => `[${index}:v]scale=360:640[v${index}]`)
    .join(';');
  const layout = ['0_0', '360_0', '720_0', '0_640', '360_640', '720_640'].join('|');
  const stackLabels = framePaths.map((_, index) => `[v${index}]`).join('');
  runFfmpeg([
    '-y',
    ...stackInputs,
    '-filter_complex',
    `${scaleFilters};${stackLabels}xstack=inputs=${framePaths.length}:layout=${layout}[sheet]`,
    '-map',
    '[sheet]',
    '-frames:v',
    '1',
    CONTACT_SHEET_PATH,
  ]);

  console.log(`\nCaption stability evidence: ${OUTPUT_DIR}`);
  console.log(`Contact sheet: ${CONTACT_SHEET_PATH}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
