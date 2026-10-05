import { readFileSync } from 'node:fs';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  parseExpansionExploreExploit,
  parseExpansionSequentialEvidence,
} from '../../../../../ai/explainer/expansion-decisions-explore-evidence-contract';
import {
  type ExpansionSourceFixture,
  expansionFixtureSpeech,
} from '../../../../../ai/explainer/expansion-fixture-words';
import { makeParseContext } from '../../../../../ai/explainer/kind-spec';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { ExplainerProvider } from '../../stage';
import { ExploreEvidenceDiagram } from './explore-evidence-Diagram';
import { exploreEvidencePose } from './explore-evidence-poses';
import type { ExpansionExploreEvidenceScene } from './explore-evidence-types';

export const exploreEvidenceFixtures = (
  JSON.parse(
    readFileSync(
      'scripts/explainer-stills/fixtures/expansion/decisions/explore-evidence.source.json',
      'utf8',
    ),
  ) as { stories: ExpansionSourceFixture[] }
).stories;
export function exploreEvidenceAccepted(
  fixture: ExpansionSourceFixture,
): ExpansionExploreEvidenceScene {
  const ctx = makeParseContext(fixture.words, fixture.window);
  const scene =
    fixture.id === '31'
      ? parseExpansionExploreExploit(fixture.proposal, ctx)
      : parseExpansionSequentialEvidence(fixture.proposal, ctx);
  if (!scene || ctx.issues.length) throw new Error(JSON.stringify(ctx.issues));
  return scene;
}
export function exploreEvidenceMaximum(
  id: '31' | '32',
  state:
    | 'known'
    | 'conditional'
    | 'simulated'
    | 'illustrative'
    | 'unknown'
    | 'missing'
    | 'disputed' = 'known',
  rewards = 1,
  rewardState:
    | 'known'
    | 'disputed'
    | 'unknown'
    | 'missing'
    | 'conditional'
    | 'simulated'
    | 'illustrative' = 'unknown',
  selection: 'unresolved' | 'known' | 'conditional' = 'unresolved',
  rewardUnit: 'count' | 'percentage-point' | 'USD' = 'percentage-point',
): ExpansionSourceFixture {
  const original = exploreEvidenceFixtures.find((f) => f.id === id);
  if (!original) throw new Error('Missing source fixture');
  const proposal = structuredClone(original.proposal),
    labels = Array.from({ length: 4 }, (_, i) => 'O'.repeat(27) + String.fromCharCode(65 + i));
  const scope = 'P'.repeat(34),
    period = 'M'.repeat(32),
    names = `${labels.slice(0, -1).join(', ')}, and ${labels[3]}`;
  const count = id === '31' ? 12 - rewards : 12;
  const testLabels = Array.from(
    { length: count },
    (_, i) => 'T'.repeat(24) + String(i).padStart(2, '0'),
  );
  const qualification =
    state === 'simulated' || rewardState === 'simulated'
      ? `simulation ${'Q'.repeat(85)}`
      : `teaching example ${'Q'.repeat(79)}`;
  const condition = `if ${'C'.repeat(93)}`;
  const qualified = state === 'illustrative' || state === 'simulated';
  const actualState = (i: number) =>
    state === 'conditional' && i !== 2
      ? 'known'
      : id === '31' && i < 2 && ['unknown', 'missing', 'disputed'].includes(state)
        ? 'known'
        : state;
  const clauses = [`${proposal.label} considers ${names} among ${scope} during ${period}.`];
  for (let i = 0; i < count; i++) {
    const s = actualState(i),
      option = labels[i % 4],
      behavior = i % 2 ? 'exploited' : 'explored';
    const absent = ['unknown', 'missing', 'disputed'].includes(s);
    let body =
      id === '31'
        ? absent
          ? `${option} ${i % 2 ? 'exploitation' : 'exploration'} is ${s}`
          : `${option} is ${behavior}`
        : absent
          ? `${option} ${testLabels[i]} test outcome is ${s}`
          : `${option} ${testLabels[i]} test reports ${['passed', 'failed', 'positive', 'negative', 'inconclusive'][i % 5]}`;
    body += ` among ${scope} during ${period}`;
    clauses.push(
      `${s === 'conditional' ? `${condition}, ` : qualified ? `In this ${qualification}, ` : ''}${body}.`,
    );
  }
  const checkIndex = clauses.length;
  const rewardValues =
    rewardUnit === 'USD'
      ? ['-10000000.00', '10000000.00', '0.01', '0.00']
      : ['-1000000000', '1000000000', '1/1000000000', '0'];
  const rewardAmounts = [
    { numerator: -1000000000, denominator: 1 },
    { numerator: 1000000000, denominator: 1 },
    { numerator: 1, denominator: 1000000000 },
    { numerator: 0, denominator: 1 },
  ];
  const rewardQualified = rewardState === 'simulated' || rewardState === 'illustrative';
  if (id === '31')
    for (let i = 0; i < rewards; i++) {
      const s = rewardState === 'conditional' && i !== 0 ? 'known' : rewardState;
      const value =
        s === 'unknown' || s === 'missing'
          ? s
          : s === 'disputed'
            ? `disputed between ${rewardValues[i]} and ${rewardValues[(i + 1) % 4]}`
            : rewardValues[i];
      clauses.push(
        `${s === 'conditional' ? `${condition}, ` : rewardQualified ? `In this ${qualification}, ` : ''}${labels[i]} reward is ${value} ${rewardUnit} during ${period} among ${scope} with denominator 1000000000.`,
      );
    }
  else
    clauses.push(
      `${testLabels.slice(0, -1).join(', ')}, and ${testLabels.at(-1)} tests gather evidence for ${names} among ${scope} during ${period}.`,
    );
  const resolveIndex = clauses.length;
  const outcome =
    id === '31'
      ? selection !== 'unresolved'
        ? 'is selected'
        : rewardState === 'unknown' || rewardState === 'missing' || rewardState === 'disputed'
          ? `remain available while rewards are ${rewardState}`
          : 'remain available while evidence is gathered'
      : state === 'missing'
        ? 'missing information is not false'
        : state === 'unknown'
          ? 'unknown information is not false'
          : 'evidence gathering continues';
  clauses.push(
    id === '31'
      ? selection !== 'unresolved'
        ? `${selection === 'conditional' ? `${condition}, ` : ''}${labels[1]} is selected while ${names} remain available among ${scope} during ${period}.`
        : `${names} ${outcome} among ${scope} during ${period}.`
      : `${names} remain under review while ${outcome} among ${scope} during ${period}.`,
  );
  const speech = expansionFixtureSpeech(clauses, 12);
  // Preserve a real phase window even when many source clauses occupy response/check.
  const phases = [0, 1, 2, checkIndex, resolveIndex, clauses.length],
    times = [0.25, 1.8, 3.4, 7.5, 9.4, 11.65];
  for (let p = 0; p < 5; p++) {
    const first = speech.spans[phases[p]].fromWord,
      last = speech.spans[phases[p + 1] - 1].toWord;
    for (let i = first; i <= last; i++) {
      speech.words[i].start =
        times[p] + ((times[p + 1] - times[p] - 0.05) * (i - first)) / (last - first + 1);
      speech.words[i].end =
        times[p] + ((times[p + 1] - times[p] - 0.05) * (i - first + 1)) / (last - first + 1);
    }
  }
  Object.assign(proposal, {
    scope,
    subject: scope,
    period,
    outcome,
    evidence: qualified || rewardQualified ? 'illustrative' : 'source-stated',
    ...(state === 'conditional' || rewardState === 'conditional' || selection === 'conditional'
      ? { condition }
      : {}),
    startWord: 0,
    endWord: speech.window.endWord,
    setupWord: 0,
    actionWord: speech.spans[1].fromWord,
    responseWord: speech.spans[2].fromWord,
    checkWord: speech.spans[checkIndex].fromWord,
    resolveWord: speech.spans[resolveIndex].fromWord,
    entities: labels.map((label) => ({ label, evidence: speech.spans[0] })),
  });
  const records = Array.from({ length: count }, (_, i) => ({
    option: labels[i % 4],
    state: actualState(i),
    evidence: speech.spans[i + 1],
    ...(actualState(i) === 'conditional'
      ? { condition }
      : qualified
        ? { qualification }
        : actualState(i) !== 'known'
          ? { qualification: state }
          : {}),
    ...(id === '31'
      ? { behavior: i % 2 ? 'exploit' : 'explore' }
      : {
          label: testLabels[i],
          ...(['unknown', 'missing', 'disputed'].includes(state)
            ? {}
            : { outcome: ['passed', 'failed', 'positive', 'negative', 'inconclusive'][i % 5] }),
        }),
  }));
  if (id === '31')
    Object.assign(proposal, {
      events: records,
      rewards: labels.slice(0, rewards).map((option, i) => ({
        option,
        quantity: {
          actor: option,
          claim: 'reward',
          state: rewardState === 'conditional' && i !== 0 ? 'known' : rewardState,
          ...(rewardState === 'unknown' || rewardState === 'missing'
            ? { qualifier: rewardState }
            : rewardState === 'disputed'
              ? {
                  qualifier: 'disputed',
                  alternatives: [rewardAmounts[i], rewardAmounts[(i + 1) % 4]].map((value) =>
                    rewardUnit === 'USD'
                      ? { kind: 'money', value: { currency: 'USD', minorUnits: value.numerator } }
                      : { kind: 'rational', value },
                  ),
                }
              : {
                  amount:
                    rewardUnit === 'USD'
                      ? {
                          kind: 'money',
                          value: { currency: 'USD', minorUnits: rewardAmounts[i].numerator },
                        }
                      : { kind: 'rational', value: rewardAmounts[i] },
                  ...(rewardState === 'conditional' && i === 0
                    ? { condition }
                    : rewardQualified
                      ? { qualifier: qualification }
                      : {}),
                }),
          basis: {
            unit: rewardUnit,
            period,
            population: scope,
            denominator: { numerator: 1000000000, denominator: 1 },
          },
          evidence: speech.spans[checkIndex + i],
        },
      })),
      decision: {
        state: selection,
        ...(selection !== 'unresolved' ? { option: labels[1] } : {}),
        ...(selection === 'conditional' ? { condition } : {}),
        qualification: outcome,
        evidence: speech.spans[resolveIndex],
      },
    });
  else
    Object.assign(proposal, {
      tests: records,
      gathering: { evidence: speech.spans[checkIndex] },
      conclusion: {
        state: 'unresolved',
        qualification: outcome,
        evidence: speech.spans[resolveIndex],
      },
    });
  return { ...original, proposal, ...speech, sourceText: clauses.join(' ') };
}
export function exploreEvidenceTestFixtures() {
  return [
    ...exploreEvidenceFixtures,
    ...(['31', '32'] as const).flatMap((id) =>
      (
        [
          'known',
          'conditional',
          'simulated',
          'illustrative',
          'unknown',
          'missing',
          'disputed',
        ] as const
      ).map((state) => exploreEvidenceMaximum(id, state)),
    ),
    exploreEvidenceMaximum('31', 'known', 4),
    ...(['known', 'disputed', 'missing', 'conditional', 'simulated', 'illustrative'] as const).map(
      (state) => exploreEvidenceMaximum('31', 'known', 4, state),
    ),
    ...(['known', 'conditional'] as const).map((selection) =>
      exploreEvidenceMaximum('31', 'known', 4, 'known', selection),
    ),
    ...(['known', 'disputed'] as const).map((state) =>
      exploreEvidenceMaximum('31', 'known', 4, state, 'unresolved', 'USD'),
    ),
  ];
}
export function exploreEvidenceTestScenes() {
  return exploreEvidenceTestFixtures().map(exploreEvidenceAccepted);
}
export function exploreEvidenceMarkup(
  scene: ExpansionExploreEvidenceScene,
  t: number,
  aspect: '9:16' | '16:9' = '9:16',
) {
  return renderToStaticMarkup(
    createElement(
      ExplainerProvider,
      {
        value: {
          aspect,
          nativeStage: true,
          presentation: aspect === '16:9' ? 'full-frame' : undefined,
        },
      },
      createElement(
        DiagramSurface,
        null,
        createElement(ExploreEvidenceDiagram, {
          scene,
          pose: exploreEvidencePose(scene, t),
        }),
      ),
    ),
  );
}
/** Real React SSR evaluates useMemo/ClayBlock, without a fabricated Canvas or hook context.
 * Three hosts are counted as markup, not claimed as native geometry/raster proof.
 * React's expected Three-host DOM warnings remain visible, never suppressed.
 */
export function exploreEvidenceHosts(node: ReactNode) {
  const hosts: { tag: string; props: Record<string, string>; parentMesh?: number }[] = [];
  const stack: number[] = [];
  for (const match of renderToStaticMarkup(node).matchAll(/<(\/)?([\w-]+)([^>]*?)(\/?)>/g)) {
    if (match[1]) {
      stack.pop();
      continue;
    }
    const parentMesh = [...stack].reverse().find((index) => hosts[index].tag === 'mesh');
    hosts.push({
      tag: match[2],
      props: Object.fromEntries(
        [...match[3].matchAll(/([\w-]+)="([^"]*)"/g)].map((attribute) => [
          attribute[1],
          attribute[2],
        ]),
      ),
      parentMesh,
    });
    if (!match[4]) stack.push(hosts.length - 1);
  }
  return hosts;
}
