// Synthetic transcript only: no recorded human, network asset, or model response is needed.
import { readFileSync } from 'node:fs';
import type { PlannerWord } from '../../src/main/ai/explainer/kind-spec';
import {
  TECHNOLOGY_KINDS,
  type TechnologyScene,
} from '../../src/main/remotion/compositions/explainer/technology/types';

export interface TechnologyFixture {
  name: string;
  raw: Record<string, unknown>;
  words?: PlannerWord[];
  sourceText: string;
  wordStepSec?: number;
  wordTiming?: { fps: number; stepFrames: number; durationFrames: number };
  scene: TechnologyScene;
}
export function technologyFixtures(): TechnologyFixture[] {
  return TECHNOLOGY_KINDS.flatMap(
    (kind) =>
      JSON.parse(
        readFileSync(new URL(`./fixtures/technology-${kind}.json`, import.meta.url), 'utf8'),
      ) as TechnologyFixture[],
  );
}
export function sourceWords(fixture: TechnologyFixture): PlannerWord[] {
  if (fixture.words) return structuredClone(fixture.words);
  const timing = fixture.wordTiming;
  if (timing)
    return fixture.sourceText.split(/\s+/).map((text, i) => ({
      text,
      start: (i * timing.stepFrames) / timing.fps,
      end: (i * timing.stepFrames + timing.durationFrames) / timing.fps,
    }));
  const step = fixture.wordStepSec;
  if (step === undefined) throw new Error(`Missing source timing: ${fixture.name}`);
  const round = (time: number) => Math.round(time * 1e6) / 1e6;
  return fixture.sourceText
    .split(/\s+/)
    .map((text, i) => ({ text, start: round(i * step), end: round((i + 0.9) * step) }));
}

function sentence(text: string, start: number, step: number, spoken: number): PlannerWord[] {
  return text.split(' ').map((word, i) => ({
    text: word,
    start: Number((start + i * step).toFixed(3)),
    end: Number((start + i * step + spoken).toFixed(3)),
  }));
}

const bottleneck = sentence(
  'Orders pile up behind the approval gate until we open it and clear the waiting queue today',
  10,
  0.4,
  0.3,
);
const keystone = sentence(
  'Temporary supports hold blocks while we seat the wedges then the keystone locks the arch before we withdraw supports and it stands',
  17.1,
  0.3,
  0.25,
);
const offset = bottleneck.length;
export const words = [...bottleneck, ...keystone];
// Leave speaker-only room in the clip so the real planner's coverage budget accepts both scenes.
export const bounds = { minStart: 8, maxEnd: 60 };
export const rawPlan = {
  scenes: [
    {
      kind: 'bottleneck',
      layout: 'stack',
      startWord: 0,
      endWord: offset - 1,
      label: 'Approval gate',
      tokenCount: 6,
      feedWord: 0,
      queueWord: 3,
      openWord: 9,
      clearWord: 12,
    },
    {
      kind: 'keystone',
      layout: 'stack',
      startWord: offset,
      endWord: words.length - 1,
      label: 'Keystone locks the arch',
      supportsWord: offset,
      blocksWord: offset + 6,
      lockWord: offset + 12,
      withdrawWord: offset + 17,
      continues: true,
      transition: 'fade',
    },
  ],
};

export const syntheticFace = { x: 830, y: 240, width: 260, height: 260 };
export const fps = 30;
