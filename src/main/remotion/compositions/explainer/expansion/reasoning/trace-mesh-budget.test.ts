import { readFileSync } from 'node:fs';
import { Children, createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { expansionFixtureSpeech } from '../../../../../ai/explainer/expansion-fixture-words';
import {
  parseClaimSourceBoard,
  parseEvidenceToClaimTrace,
} from '../../../../../ai/explainer/expansion-reasoning-trace-contract';
import {
  type TemporalFixtureSeed,
  temporalSourceFixtures,
} from '../../../../../ai/explainer/expansion-temporal-fixtures';
import { makeParseContext } from '../../../../../ai/explainer/kind-spec';
import { DiagramStage } from '../../diagrams/DiagramStage';
import { Stage3D } from '../../Stage3D';
import { TraceDiagram } from './trace-Diagram';
import { TraceModels } from './trace-models';
import { tracePageTime, tracePose } from './trace-poses';
import { ReasoningTraceFrame } from './trace-Scene';
import type { ReasoningTraceScene } from './trace-types';

const packet = JSON.parse(
  readFileSync('scripts/explainer-stills/fixtures/expansion/reasoning/trace.source.json', 'utf8'),
) as { stories: TemporalFixtureSeed[] };
const colors = { surface: '#f6ecd9', text: '#23100c', accent: '#9f75ff', muted: '#81706a' };

function assertFrameStructure(scene: ReasoningTraceScene): void {
  for (const mode of ['diagram', 'hybrid'] as const) {
    const frame = ReasoningTraceFrame({
      scene: { ...scene, visualMode: mode },
      t: scene.resolveAt + 1,
      colors,
    });
    const components: unknown[] = [];
    const visit = (node: ReactNode): void => {
      for (const child of Children.toArray(node)) {
        if (!isValidElement<{ children?: ReactNode }>(child)) continue;
        components.push(child.type);
        visit(child.props.children);
      }
    };
    visit(frame);
    expect(components.filter((type) => type === Stage3D)).toHaveLength(mode === 'hybrid' ? 1 : 0);
    expect(components.filter((type) => type === DiagramStage)).toHaveLength(1);
    expect(components.filter((type) => type === TraceModels)).toHaveLength(
      mode === 'hybrid' ? 1 : 0,
    );
    expect(components.filter((type) => type === TraceDiagram)).toHaveLength(1);
  }
  // Actual stage's sole canvas owner; no mocked canvas or synthetic meshes.
  const stage = readFileSync('src/main/remotion/compositions/explainer/Stage3D.tsx', 'utf8');
  expect([...stage.matchAll(/<ThreeCanvas\b/g)]).toHaveLength(1);
  expect([...stage.matchAll(/<StudioEnvironment\b/g)]).toHaveLength(1);
  expect([...stage.matchAll(/<ContactShadows\b/g)]).toHaveLength(1);
  expect(stage).not.toMatch(/<mesh\b|<canvas\b/);
}

/** Eight actors permit at most seven records: each record has a distinct ID and needs a non-record source. */
function maximumTrace(): ReasoningTraceScene {
  const label = (name: string): string =>
    `${name} regional archive ledger`.padEnd(28, 'x').slice(0, 28);
  const source = label('Source');
  const excerpts = [0, 1, 2].map((i) => label(`Excerpt${i}`));
  const claims = [0, 1, 2, 3].map((i) => label(`Claim${i}`));
  const content =
    'the regional archive states returns may be accepted within thirty days under the complete record';
  const condition =
    'if the regional archive retains the original complete attribution during the recent review cycle';
  expect(content).toHaveLength(96);
  expect(condition).toHaveLength(96);
  const clauses = [`${claims[0]} is traced to ${source} and ${excerpts[0]}.`];
  const records: Record<string, unknown>[] = [];
  const relations: Record<string, unknown>[] = [];
  const entityClauses = new Map<string, number>();
  const add = (text: string): number => {
    clauses.push(`${text}.`);
    return clauses.length - 1;
  };
  for (const excerpt of excerpts) {
    const index = add(`${source} contains ${excerpt} stating ${content}`);
    entityClauses.set(excerpt, index);
    entityClauses.set(source, index);
    records.push({ entity: excerpt, role: 'excerpt', content, source, clause: index });
    relations.push({ from: source, to: excerpt, role: 'provenance', clause: index });
  }
  for (const claim of claims) {
    const index = add(`${claim} states ${content}`);
    entityClauses.set(claim, index);
    records.push({ entity: claim, role: 'claim', content, clause: index });
  }
  const checkIndex = clauses.length;
  for (const excerpt of excerpts)
    for (const claim of claims) {
      // The shared story contract permits one complete source condition, not
      // repeated conditional clauses. Keep the longest qualifier on one link.
      const qualifier = excerpt === excerpts[0] && claim === claims[0] ? condition : undefined;
      const index = add(
        `${excerpt} from ${source} supports ${claim}${qualifier ? ` ${qualifier}` : ''}`,
      );
      relations.push({
        from: excerpt,
        to: claim,
        role: 'support',
        ...(qualifier ? { condition: qualifier } : {}),
        clause: index,
      });
    }
  const citation = add(`${claims[0]} cites ${excerpts[0]} from ${source}`);
  relations.push({ from: excerpts[0], to: claims[0], role: 'provenance', clause: citation });
  const resolveIndex = add(`${claims[0]} retains its citation as provenance, not proof`);
  const speech = expansionFixtureSpeech(clauses, 12);
  // Authored stress transcript: five complete semantic clauses remain at least
  // one second apart; dense relation clauses are not fake animation timestamps.
  const phaseClauses = [0, 1, 4, checkIndex, resolveIndex, clauses.length];
  const phaseTimes = [0.25, 1.35, 3.25, 7.5, 10.45, 11.65];
  for (let phase = 0; phase < 5; phase++) {
    const first = speech.spans[phaseClauses[phase]].fromWord;
    const last = phase === 4 ? speech.words.length : speech.spans[phaseClauses[phase + 1]].fromWord;
    const step = (phaseTimes[phase + 1] - phaseTimes[phase]) / (last - first);
    for (let index = first; index < last; index++) {
      speech.words[index].start = phaseTimes[phase] + (index - first) * step;
      speech.words[index].end = phaseTimes[phase] + (index - first + 1) * step;
    }
  }
  const bind = (entry: Record<string, unknown>): Record<string, unknown> => {
    const { clause, ...facts } = entry;
    return { ...facts, evidence: speech.spans[clause as number] };
  };
  const base = packet.stories[0].proposal;
  const proposal = {
    ...base,
    startWord: 0,
    endWord: speech.words.length - 1,
    setupWord: speech.spans[0].fromWord,
    actionWord: speech.spans[1].fromWord,
    responseWord: speech.spans[4].fromWord,
    checkWord: speech.spans[checkIndex].fromWord,
    resolveWord: speech.spans[resolveIndex].fromWord,
    entities: [source, ...excerpts, ...claims].map((name) => ({
      label: name,
      evidence: speech.spans[entityClauses.get(name) as number],
    })),
    records: records.map(bind),
    relations: relations.map(bind),
    subject: claims[0],
    label: claims[0],
    condition,
    outcome: 'retains its citation as provenance',
  };
  const ctx = makeParseContext(speech.words, speech.window);
  const scene = parseEvidenceToClaimTrace(proposal, ctx);
  expect(ctx.issues).toEqual([]);
  if (!scene) throw new Error('Maximum raw trace rejected');
  expect(scene.entities).toHaveLength(8);
  expect(scene.records).toHaveLength(7);
  expect(scene.relations).toHaveLength(16);
  expect(scene.entities.every((entity) => entity.label.length === 28)).toBe(true);
  return scene;
}

it('parser-accepted maximum trace: every mounted page visible, exact authored budget, stable hold', () => {
  const scene = maximumTrace();
  const final = tracePose(scene, scene.resolveAt + 0.25);
  const samples = [
    scene.setupAt - 1,
    ...final.pages.map((page) => {
      const interval = tracePageTime(scene, page);
      return Number.isFinite(interval.end)
        ? (interval.start + interval.end) / 2
        : interval.start + 0.25;
    }),
  ];
  const svgCounts = { diagram: 0, hybrid: 0 };
  for (const [sampleIndex, t] of samples.entries()) {
    const pose = tracePose(scene, t);
    if (sampleIndex > 0) expect(pose.page).toBe(sampleIndex - 1);
    const models = renderToStaticMarkup(createElement(TraceModels, { scene, t, colors }));
    expect([...models.matchAll(/<mesh\b/g)]).toHaveLength(56); // four documents/excerpts × 8, four claims × 6
    for (const visualMode of ['diagram', 'hybrid'] as const) {
      const svg = renderToStaticMarkup(
        createElement(
          'svg',
          null,
          createElement(TraceDiagram, { scene: { ...scene, visualMode }, t }),
        ),
      );
      expect([...svg.matchAll(/data-entity-id=/g)]).toHaveLength(8);
      expect([...svg.matchAll(/data-record-id=/g)]).toHaveLength(7);
      expect([...svg.matchAll(/data-role=/g)]).toHaveLength(16);
      expect([...svg.matchAll(/data-page-id=/g)]).toHaveLength(24);
      expect([...svg.matchAll(/data-active="true"/g)]).toHaveLength(1);
      if (sampleIndex > 0)
        expect(svg).toContain(
          `data-page-index="${sampleIndex - 1}" data-active="true" opacity="1"`,
        );
      const count = [...svg.matchAll(/<([a-zA-Z][\w:-]*)\b/g)].length;
      expect(count).toBe(visualMode === 'diagram' ? 424 : 352);
      svgCounts[visualMode] = Math.max(svgCounts[visualMode], count);
      expect(svg).not.toMatch(/<canvas|<mesh\b/);
    }
  }
  expect(svgCounts).toEqual({ diagram: 424, hybrid: 352 });
  expect(tracePose(scene, 12)).toEqual(final);
  for (const Component of [TraceDiagram, TraceModels]) {
    expect(renderToStaticMarkup(createElement(Component, { scene, t: 12, colors }))).toBe(
      renderToStaticMarkup(createElement(Component, { scene, t: scene.resolveAt + 0.25, colors })),
    );
  }
  assertFrameStructure(scene);
});
for (const fixture of temporalSourceFixtures(packet.stories))
  it(`${fixture.id}: actual SSR meshes include hidden authored assemblies (no mocks)`, () => {
    const ctx = makeParseContext(fixture.words, fixture.window);
    const scene =
      fixture.id === '01'
        ? parseEvidenceToClaimTrace(fixture.proposal, ctx)
        : parseClaimSourceBoard(fixture.proposal, ctx);
    expect(ctx.issues).toEqual([]);
    if (!scene) throw new Error('Valid fixture rejected');
    const count = (t: number): number => {
      const markup = renderToStaticMarkup(createElement(TraceModels, { scene, t, colors }));
      return [...markup.matchAll(/<mesh\b/g)].length;
    };
    const expected = scene.entities.reduce((total, entity) => {
      const record = scene.records.find((entry) => entry.entityId === entity.id);
      return (
        total +
        (record?.role === 'claim' || record?.role === 'statement' ? 6 : 8) +
        (scene.storyId === '02' && record ? 1 : 0)
      );
    }, 0);
    expect(count(scene.setupAt - 1)).toBe(expected);
    expect(count(scene.resolveAt + 1)).toBe(expected);
    const diagram = renderToStaticMarkup(
      createElement('svg', null, createElement(TraceDiagram, { scene, t: scene.resolveAt + 1 })),
    );
    expect([...diagram.matchAll(/<([a-zA-Z][\w:-]*)\b/g)].length).toBeLessThan(250);
    expect(diagram).not.toMatch(/<canvas|<mesh\b/);
    assertFrameStructure(scene);
    console.info(
      `trace/${fixture.id}: authored meshes=${expected}, svg elements=${[...diagram.matchAll(/<([a-zA-Z][\w:-]*)\b/g)].length}`,
    );
  });
