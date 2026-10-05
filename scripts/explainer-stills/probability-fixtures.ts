import { readFileSync } from 'node:fs';
import type { ExpansionSourceFixture } from '../../src/main/ai/explainer/expansion-fixture-words';
import { parseExpansionProbability } from '../../src/main/ai/explainer/expansion-probability-contract';
import {
  type TemporalFixtureSeed,
  temporalSourceFixtures,
} from '../../src/main/ai/explainer/expansion-temporal-fixtures';
import { isRec, makeParseContext, type Rec } from '../../src/main/ai/explainer/kind-spec';
import { OUTPUT_FPS } from '../../src/main/aspect-ratios';
import { expansionStory } from '../../src/main/remotion/compositions/explainer/expansion/catalog';
import type { ExpansionProbabilityScene } from '../../src/main/remotion/compositions/explainer/expansion/probability/types';
import { deriveExplainerPalette } from '../../src/main/remotion/compositions/explainer/palette';
import type {
  ExplainerLayout,
  ExplainerPalette,
} from '../../src/main/remotion/compositions/explainer/types';

export interface ProbabilityRenderFixture {
  name: string;
  description: string;
  sourceText: string;
  sourceWords: ExpansionSourceFixture['words'];
  plannerInput: Rec;
  durationSec: number;
  scene: ExpansionProbabilityScene;
  palette: ExplainerPalette;
  covers: readonly string[];
  samples: readonly { name: string; frame: number }[];
  cases: readonly {
    name: string;
    layout: ExplainerLayout;
    aspect: '9:16' | '16:9';
    palette: ExplainerPalette;
  }[];
}

const packets = [
  'base-update',
  'conditioning-sampling',
  'variation-range',
  'risk-calibration',
] as const;
const dark = deriveExplainerPalette({
  background: '#23100c',
  foreground: '#f6ecd9',
  accent: '#9f75ff',
});
const light = {
  ...dark,
  bgOuter: '#f6ecd9',
  bgInner: '#fffaf2',
  card: '#f6ecd9',
  cardRaised: '#fffaf2',
  cardBorder: '#7c6c62',
  text: '#23100c',
  muted: '#635045',
  paper: '#fffaf2',
  paperText: '#23100c',
};

/** Authored offline source packets; validation is still performed by the real local parser. */
export function probabilityFixtureRows(): ProbabilityRenderFixture[] {
  const rows = packets
    .flatMap((packetName) => {
      const packet: unknown = JSON.parse(
        readFileSync(
          `scripts/explainer-stills/fixtures/expansion/probability/${packetName}.source.json`,
          'utf8',
        ),
      );
      if (
        !isRec(packet) ||
        packet.version !== 1 ||
        packet.pack !== 'probability' ||
        !Array.isArray(packet.stories) ||
        packet.stories.length < 2 ||
        packet.stories.length > 16
      )
        throw new Error('Malformed authored probability source packet');
      const seeds = packet.stories;
      const ids = [
        ...new Set(
          seeds.map((seed: unknown) => {
            if (
              !isRec(seed) ||
              typeof seed.id !== 'string' ||
              !/^(09|1[0-6])$/.test(seed.id) ||
              !Array.isArray(seed.words) ||
              seed.words.length === 0 ||
              seed.words.length > 4096 ||
              !isRec(seed.window) ||
              !isRec(seed.proposal) ||
              typeof seed.sourceText !== 'string' ||
              typeof seed.window.startWord !== 'number' ||
              seed.window.startWord !== 0 ||
              typeof seed.window.endWord !== 'number' ||
              seed.window.endWord !== seed.words.length - 1 ||
              seed.window.startTime !== 0 ||
              typeof seed.window.endTime !== 'number' ||
              !Number.isFinite(seed.window.endTime) ||
              seed.window.endTime < 5 ||
              seed.window.endTime > 12 ||
              seed.words.some(
                (word: unknown) =>
                  !isRec(word) ||
                  typeof word.text !== 'string' ||
                  !word.text.trim() ||
                  word.text.length > 256 ||
                  typeof word.start !== 'number' ||
                  typeof word.end !== 'number' ||
                  !Number.isFinite(word.start) ||
                  !Number.isFinite(word.end) ||
                  word.start < 0 ||
                  word.end <= word.start,
              ) ||
              seed.words.map((word: { text: string }) => word.text).join(' ') !== seed.sourceText
            )
              throw new Error('Malformed authored probability source seed');
            return seed.id;
          }),
        ),
      ].sort();
      return ids.flatMap((id) => {
        const seed = seeds.find((entry: unknown) => isRec(entry) && entry.id === id) as
          | TemporalFixtureSeed
          | undefined;
        if (!seed) throw new Error('Missing canonical probability source');
        // Render canonical sources only. Do not expand test patches, paraphrases or examples.
        const fixture = temporalSourceFixtures([
          { ...seed, negatives: [], paraphrases: [], examples: [] },
        ])[0];
        if (!fixture || fixture.window.startTime !== 0)
          throw new Error('Canonical still fixture must retain zero-based source window');
        return (['diagram', 'hybrid'] as const).map((visualMode) => {
          const plannerInput = {
            startWord: fixture.window.startWord,
            endWord: fixture.window.endWord,
            ...fixture.proposal,
            visualMode,
          };
          const ctx = makeParseContext(fixture.words, fixture.window);
          const scene = parseExpansionProbability(plannerInput, ctx);
          if (!scene || scene.storyId !== id || ctx.issues.length)
            throw new Error(
              `Authored probability ${id}/${visualMode} rejected: ${ctx.issues.join('; ')}`,
            );
          const durationSec = fixture.window.endTime;
          const frame = (seconds: number): number =>
            Math.min(
              Math.ceil(durationSec * OUTPUT_FPS) - 1,
              Math.max(0, Math.ceil(seconds * OUTPUT_FPS)),
            );
          return {
            name: `expansion-probability-${id}-${visualMode}`,
            description: expansionStory(scene.storyId).purpose,
            sourceText: fixture.sourceText,
            sourceWords: fixture.words,
            plannerInput,
            durationSec,
            scene,
            palette: light,
            covers: [
              scene.kind,
              `${scene.kind}/${scene.preset}`,
              `expansion-story-${id}`,
              visualMode,
            ],
            samples: [
              { name: 'setup', frame: frame(scene.setupAt) },
              { name: 'action', frame: frame(scene.actionAt) },
              { name: 'intermediate', frame: frame((scene.actionAt + scene.responseAt) / 2) },
              { name: 'response', frame: frame(scene.responseAt) },
              { name: 'check', frame: frame(scene.checkAt) },
              { name: 'resolve', frame: frame(scene.resolveAt) },
              { name: 'final-hold', frame: frame(durationSec - 1 / OUTPUT_FPS) },
            ],
            cases: [
              { name: 'portrait-stack-light', layout: 'stack', aspect: '9:16', palette: light },
              { name: 'portrait-stack-dark', layout: 'stack', aspect: '9:16', palette: dark },
              {
                name: 'portrait-flipped-light',
                layout: 'stack-flipped',
                aspect: '9:16',
                palette: light,
              },
              {
                name: 'portrait-flipped-dark',
                layout: 'stack-flipped',
                aspect: '9:16',
                palette: dark,
              },
              // Standalone landscape presentation, not an eligible portrait hidden-speaker takeover.
              { name: 'landscape-full-light', layout: 'takeover', aspect: '16:9', palette: light },
              { name: 'landscape-full-dark', layout: 'takeover', aspect: '16:9', palette: dark },
            ] as const,
          };
        });
      });
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  if (rows.length !== 16 || new Set(rows.map((row) => row.name)).size !== 16)
    throw new Error('Probability fixtures must cover eight distinct stories in both modes');
  return rows;
}
