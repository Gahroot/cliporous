import { readFileSync } from 'node:fs';
import type { ExpansionSourceFixture } from '../../src/main/ai/explainer/expansion-fixture-words';
import { parseExpansionReasoning } from '../../src/main/ai/explainer/expansion-reasoning-contract';
import {
  type TemporalFixtureSeed,
  temporalSourceFixtures,
} from '../../src/main/ai/explainer/expansion-temporal-fixtures';
import type { Rec } from '../../src/main/ai/explainer/kind-spec';
import { makeParseContext } from '../../src/main/ai/explainer/kind-spec';
import { OUTPUT_FPS } from '../../src/main/aspect-ratios';
import { expansionStory } from '../../src/main/remotion/compositions/explainer/expansion/catalog';
import type { ExpansionReasoningScene } from '../../src/main/remotion/compositions/explainer/expansion/reasoning/types';
import { deriveExplainerPalette } from '../../src/main/remotion/compositions/explainer/palette';
import type {
  ExplainerLayout,
  ExplainerPalette,
} from '../../src/main/remotion/compositions/explainer/types';

export interface ReasoningRenderFixture {
  name: string;
  description: string;
  sourceText: string;
  sourceWords: ExpansionSourceFixture['words'];
  plannerInput: Rec;
  durationSec: number;
  scene: ExpansionReasoningScene;
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

const packets = ['trace', 'argument', 'information', 'scope'] as const;
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

/** Offline authored fixtures only. Exact local parser output; no model or saved-project access. */
export function reasoningFixtureRows(): ReasoningRenderFixture[] {
  return packets
    .flatMap((packetName) => {
      const packet = JSON.parse(
        readFileSync(
          `scripts/explainer-stills/fixtures/expansion/reasoning/${packetName}.source.json`,
          'utf8',
        ),
      ) as { version: number; pack: string; stories: TemporalFixtureSeed[] };
      if (packet.version !== 1 || packet.pack !== 'reasoning' || !Array.isArray(packet.stories))
        throw new Error('Malformed authored reasoning source packet');
      const ids = [...new Set(packet.stories.map(({ id }) => id))].sort();
      return ids.flatMap((id) => {
        const seed = packet.stories.find((story) => story.id === id);
        if (!seed) throw new Error('Missing canonical source');
        const fixture = temporalSourceFixtures([seed])[0];
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
          const scene = parseExpansionReasoning(plannerInput, ctx);
          if (!scene || ctx.issues.length)
            throw new Error(`Authored reasoning ${id}/${visualMode}: ${ctx.issues.join('; ')}`);
          const durationSec = fixture.window.endTime;
          const frame = (seconds: number): number =>
            Math.min(
              Math.ceil(durationSec * OUTPUT_FPS) - 1,
              Math.max(0, Math.ceil(seconds * OUTPUT_FPS)),
            );
          return {
            name: `expansion-reasoning-${id}-${visualMode}`,
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
              // Standalone landscape full frame, NOT a portrait or legacy-overlay takeover offer.
              { name: 'landscape-full-light', layout: 'takeover', aspect: '16:9', palette: light },
              { name: 'landscape-full-dark', layout: 'takeover', aspect: '16:9', palette: dark },
            ] as const,
          };
        });
      });
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
}
