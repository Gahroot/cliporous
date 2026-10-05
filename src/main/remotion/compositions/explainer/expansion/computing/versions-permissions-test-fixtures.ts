import { readFileSync } from 'node:fs';
import {
  parseExpansionReplicaMerge,
  parseExpansionSoftwareScope,
} from '../../../../../ai/explainer/expansion-computing-versions-permissions-contract';
import {
  type TemporalFixtureSeed,
  temporalSourceFixtures,
} from '../../../../../ai/explainer/expansion-temporal-fixtures';
import { makeParseContext } from '../../../../../ai/explainer/kind-spec';
import type { ExpansionVersionsPermissionsScene } from './versions-permissions-types';

export function versionsPermissionsCases(): ExpansionVersionsPermissionsScene[] {
  const packet = JSON.parse(
    readFileSync(
      'scripts/explainer-stills/fixtures/expansion/computing/versions-permissions.source.json',
      'utf8',
    ),
  ) as {
    stories: TemporalFixtureSeed[];
    positiveExamples: (NonNullable<TemporalFixtureSeed['negatives']>[number] & {
      id: '69' | '70';
    })[];
  };
  const fixtures = temporalSourceFixtures(packet.stories);
  const raw = fixtures.map((f) => ({
    id: f.id,
    proposal: f.proposal,
    words: f.words,
    window: f.window,
  }));
  for (const example of packet.positiveExamples) {
    const base = packet.stories.find((s) => s.id === example.id);
    if (!base) throw new Error('Missing complete source');
    const [f] = temporalSourceFixtures([{ ...base, paraphrases: [], negatives: [example] }]);
    const p = f.negatives[0];
    if (!p.words || !p.window) throw new Error('Missing source timing');
    raw.push({ id: example.id, proposal: p.proposal, words: p.words, window: p.window });
  }
  // Parser-accepted character maxima. Token counts/timings and all evidence offsets stay exact.
  const replacements: Record<string, string> = {
    Copies: 'W'.repeat(48),
    Access: 'W'.repeat(48),
    Nora: `N${'W'.repeat(27)}`,
    Draft: `D${'W'.repeat(27)}`,
    East: `E${'W'.repeat(27)}`,
    West: `R${'W'.repeat(27)}`,
    Lab: 'W'.repeat(40),
    Trial: 'W'.repeat(32),
    Alpha: `A${'W'.repeat(27)}`,
    Beta: `B${'W'.repeat(27)}`,
    reviewed: 'W'.repeat(93),
    checked: 'V'.repeat(93),
  };
  function maximal<T>(value: T): T {
    return JSON.parse(
      JSON.stringify(value).replace(
        /\b(Copies|Access|Nora|Draft|East|West|Lab|Trial|Alpha|Beta|reviewed|checked)\b/g,
        (word) => replacements[word],
      ),
    ) as T;
  }
  raw.push(...raw.map(maximal));
  return raw.flatMap((f) =>
    (['diagram', 'hybrid'] as const).map((visualMode) => {
      const ctx = makeParseContext(f.words, f.window);
      const parse = f.id === '69' ? parseExpansionReplicaMerge : parseExpansionSoftwareScope;
      const scene = parse({ ...f.proposal, visualMode }, ctx);
      if (!scene || ctx.issues.length) throw new Error(JSON.stringify(ctx.issues));
      return scene;
    }),
  );
}
