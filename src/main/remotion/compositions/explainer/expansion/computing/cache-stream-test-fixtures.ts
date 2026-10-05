import { readFileSync } from 'node:fs';
import {
  parseExpansionBatchStream,
  parseExpansionCacheFreshness,
} from '../../../../../ai/explainer/expansion-computing-cache-stream-contract';
import {
  type TemporalFixtureSeed,
  temporalSourceFixtures,
} from '../../../../../ai/explainer/expansion-temporal-fixtures';
import { makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import type { ExpansionCacheStreamScene } from './cache-stream-types';
/** Independent source paraphrases go through the frozen real parser. */
export function cacheStreamCases(): ExpansionCacheStreamScene[] {
  const packet = JSON.parse(
    readFileSync(
      'scripts/explainer-stills/fixtures/expansion/computing/cache-stream.source.json',
      'utf8',
    ),
  ) as { stories: TemporalFixtureSeed[] };
  const extra = packet.stories.flatMap((seed) =>
    ['known', 'conditional', 'unknown', 'missing', 'disputed', 'simulated', 'illustrative'].map(
      (state) => {
        const proposal = structuredClone(seed.proposal);
        const labels = Array.from({ length: 8 }, (_, i) => 'M'.repeat(27) + String(i));
        const setupEvidence = (proposal.entities as Rec[])[0].evidence;
        proposal.entities = labels.map((label) => ({ label, evidence: setupEvidence }));
        proposal.scope = 'M'.repeat(40);
        proposal.period = 'M'.repeat(32);
        delete proposal.condition;
        proposal.evidence =
          state === 'simulated' || state === 'illustrative' ? 'illustrative' : 'source-stated';
        const facts = [...(proposal.records as Rec[]), ...(proposal.relations as Rec[])];
        const clauses = [
          `${proposal.subject} lists ${labels.join(' and ')} at ${proposal.scope} during ${proposal.period}.`,
        ];
        facts.forEach((fact, index) => {
          fact.actor = labels[0];
          fact.targets = labels.slice(1, seed.id === '66' ? 7 : 8);
          const localState = state === 'conditional' && index !== 2 ? 'known' : state;
          fact.scope = proposal.scope;
          fact.period = proposal.period;
          fact.state = localState;
          delete fact.condition;
          delete fact.qualifier;
          if (['unknown', 'missing', 'disputed'].includes(state)) {
            delete fact.value;
            fact.qualifier = state;
          } else {
            fact.value =
              index === 0
                ? seed.id === '65'
                  ? 'v999999'
                  : labels[7]
                : index === 1
                  ? seed.id === '65'
                    ? 'unverified'
                    : 'unordered'
                  : index === 2
                    ? seed.id === '65'
                      ? 'retain'
                      : 'pending'
                    : 'pending';
            if (localState === 'conditional') {
              proposal.condition = `if ${'M'.repeat(93)}`;
              fact.condition = proposal.condition;
            }
            if (state === 'simulated' || state === 'illustrative')
              fact.qualifier = state === 'simulated' ? 'simulation' : 'teaching example';
          }
          let clause = `${fact.actor} reports ${(fact.targets as string[]).join(' and ')} ${fact.role} as ${fact.value ?? state} at ${fact.scope} during ${fact.period}.`;
          if (localState === 'conditional') clause = `${fact.condition}, ${clause}`;
          if (state === 'simulated' || state === 'illustrative')
            clause = `In this ${fact.qualifier}, ${clause}`;
          clauses.push(clause);
        });
        proposal.outcome = facts[3].value ?? state;
        return {
          ...seed,
          proposal,
          negatives: [],
          paraphrases: [{ name: `maximal ${state}`, clauses, outcome: String(proposal.outcome) }],
        };
      },
    ),
  );
  const originals = temporalSourceFixtures(packet.stories);
  const maximal = extra.flatMap((seed) => temporalSourceFixtures([seed]).slice(1));
  return [...originals, ...maximal].flatMap((f) =>
    (['diagram', 'hybrid'] as const).map((visualMode) => {
      const ctx = makeParseContext(f.words, f.window);
      const scene = (f.id === '65' ? parseExpansionCacheFreshness : parseExpansionBatchStream)(
        { ...f.proposal, visualMode },
        ctx,
      );
      if (!scene) throw new Error(ctx.issues.join('; '));
      return scene;
    }),
  );
}
