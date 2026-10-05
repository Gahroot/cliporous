import { readFileSync } from 'node:fs';
import type { ExpansionSourceFixture } from '../../src/main/ai/explainer/expansion-fixture-words';
import { parseExpansionTemporal } from '../../src/main/ai/explainer/expansion-temporal-contract';
import {
  type TemporalFixtureSeed,
  temporalClauseFixture,
  temporalSourceFixtures,
} from '../../src/main/ai/explainer/expansion-temporal-fixtures';
import { isRec, makeParseContext, type Rec } from '../../src/main/ai/explainer/kind-spec';
import { OUTPUT_FPS } from '../../src/main/aspect-ratios';
import { expansionStory } from '../../src/main/remotion/compositions/explainer/expansion/catalog';
import type { ExpansionTemporalScene } from '../../src/main/remotion/compositions/explainer/expansion/temporal/types';
import { deriveExplainerPalette } from '../../src/main/remotion/compositions/explainer/palette';
import type {
  ExplainerLayout,
  ExplainerPalette,
} from '../../src/main/remotion/compositions/explainer/types';

export interface TemporalRenderFixture {
  name: string;
  description: string;
  sourceText: string;
  sourceWords: ExpansionSourceFixture['words'];
  plannerInput: Rec;
  durationSec: number;
  scene: ExpansionTemporalScene;
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
const packets = ['lanes-critical', 'reversible-expiry', 'delay-phase', 'history-twin'] as const;
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
function validSourceWords(words: unknown, endTime: number): boolean {
  if (!Array.isArray(words) || words.length === 0 || words.length > 4096) return false;
  let previousEnd = 0;
  for (const word of words) {
    if (
      !isRec(word) ||
      typeof word.text !== 'string' ||
      !word.text.trim() ||
      word.text.length > 256 ||
      typeof word.start !== 'number' ||
      typeof word.end !== 'number' ||
      !Number.isFinite(word.start) ||
      !Number.isFinite(word.end) ||
      word.start < 0 ||
      word.start < previousEnd - 1e-7 ||
      word.end <= word.start ||
      word.end > endTime
    )
      return false;
    previousEnd = word.end;
  }
  return true;
}
/** Authored source packets remain separate from real-parser-derived still inputs. */
export function temporalFixtureRows(): TemporalRenderFixture[] {
  const rows = packets
    .flatMap((packetName) => {
      const packet: unknown = JSON.parse(
        readFileSync(
          `scripts/explainer-stills/fixtures/expansion/temporal/${packetName}.source.json`,
          'utf8',
        ),
      );
      if (
        !isRec(packet) ||
        packet.version !== 1 ||
        packet.pack !== 'temporal' ||
        !Array.isArray(packet.stories) ||
        packet.stories.length < 2 ||
        packet.stories.length > 16
      )
        throw new Error('Malformed authored temporal source packet');
      const seeds = packet.stories.map((seed: unknown) => {
        if (packetName !== 'history-twin') return seed;
        const timing = packet.timing;
        if (
          !isRec(seed) ||
          (seed.id !== '47' && seed.id !== '48') ||
          !Array.isArray(seed.clauses) ||
          seed.clauses.length !== 5 ||
          seed.clauses.some(
            (clause: unknown) =>
              typeof clause !== 'string' || !clause.trim() || clause.length > 8192,
          ) ||
          !isRec(seed.proposal) ||
          !isRec(timing) ||
          typeof timing.durationSec !== 'number' ||
          typeof timing.interClausePauseSec !== 'number' ||
          typeof timing.leadInSec !== 'number' ||
          typeof timing.tailSec !== 'number' ||
          !Array.isArray(timing.clauseStarts) ||
          timing.clauseStarts.some((start: unknown) => typeof start !== 'number')
        )
          throw new Error('Malformed authored temporal source seed');
        return temporalClauseFixture(
          { id: seed.id, clauses: seed.clauses, proposal: seed.proposal },
          {
            durationSec: timing.durationSec,
            clauseStarts: timing.clauseStarts,
            interClausePauseSec: timing.interClausePauseSec,
            leadInSec: timing.leadInSec,
            tailSec: timing.tailSec,
          },
        );
      });
      const ids = [
        ...new Set(
          seeds.map((seed: unknown) => {
            if (
              !isRec(seed) ||
              typeof seed.id !== 'string' ||
              !/^4[1-8]$/.test(seed.id) ||
              !Array.isArray(seed.words) ||
              seed.words.length === 0 ||
              seed.words.length > 4096 ||
              !isRec(seed.window) ||
              !isRec(seed.proposal) ||
              typeof seed.sourceText !== 'string' ||
              seed.window.startWord !== 0 ||
              seed.window.endWord !== seed.words.length - 1 ||
              seed.window.startTime !== 0 ||
              typeof seed.window.endTime !== 'number' ||
              !Number.isFinite(seed.window.endTime) ||
              seed.window.endTime < 5 ||
              seed.window.endTime > 12 ||
              !validSourceWords(seed.words, seed.window.endTime) ||
              seed.words.map((word: { text: string }) => word.text).join(' ') !== seed.sourceText
            )
              throw new Error('Malformed authored temporal source seed');
            return seed.id;
          }),
        ),
      ].sort();
      return ids.flatMap((id) => {
        const seed = seeds.find((entry: unknown) => isRec(entry) && entry.id === id) as
          | TemporalFixtureSeed
          | undefined;
        if (!seed) throw new Error('Missing canonical temporal source');
        const fixture = temporalSourceFixtures([
          { ...seed, negatives: [], paraphrases: [], examples: [] },
        ])[0];
        if (!fixture || fixture.window.startTime !== 0)
          throw new Error('Canonical still source must retain zero-based window');
        return (['diagram', 'hybrid'] as const).map((visualMode) => {
          const plannerInput = {
            startWord: fixture.window.startWord,
            endWord: fixture.window.endWord,
            ...fixture.proposal,
            visualMode,
          };
          const ctx = makeParseContext(fixture.words, fixture.window);
          const scene = parseExpansionTemporal(plannerInput, ctx);
          if (!scene || scene.storyId !== id || ctx.issues.length)
            throw new Error(
              `Authored temporal ${id}/${visualMode} rejected: ${ctx.issues.join('; ')}`,
            );
          const durationSec = fixture.window.endTime;
          const frame = (seconds: number): number =>
            Math.min(
              Math.ceil(durationSec * OUTPUT_FPS) - 1,
              Math.max(0, Math.ceil(seconds * OUTPUT_FPS)),
            );
          return {
            name: `expansion-temporal-${id}-${visualMode}`,
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
              // Standalone landscape, never an eligible portrait speaker-hidden takeover.
              { name: 'landscape-full-light', layout: 'takeover', aspect: '16:9', palette: light },
              { name: 'landscape-full-dark', layout: 'takeover', aspect: '16:9', palette: dark },
            ] as const,
          };
        });
      });
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  if (rows.length !== 16 || new Set(rows.map((row) => row.name)).size !== 16)
    throw new Error('Temporal fixtures must cover eight distinct stories in both modes');
  return rows;
}
