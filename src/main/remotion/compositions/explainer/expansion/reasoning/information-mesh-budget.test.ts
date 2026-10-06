import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { describe, expect, it } from 'vitest';
import { expansionFixtureSpeech } from '../../../../../ai/explainer/expansion-fixture-words';
import { parseExpansionMissingEvidenceMap } from '../../../../../ai/explainer/expansion-reasoning-information-contract';
import { makeParseContext } from '../../../../../ai/explainer/kind-spec';
import { InformationDiagram } from './information-Diagram';
import { InformationModelOverlay, InformationModels } from './information-models';
import { informationPose } from './information-poses';
import { informationSourceScenes } from './information-poses.fixtures';
import type { ExpansionReasoningInformationScene } from './information-types';

// Raw, locally grounded fixtures: the helper's 10 known + 2 absent records is not
// maximum occupancy (11 known + 1 absent). Long strings are retained, not padded after parsing.
function occupancyScene(
  mode: 'diagram' | 'hybrid',
  knownCount: number,
  absentState: 'missing' | 'unknown',
) {
  const scope = 'S'.repeat(40),
    topic = 'T'.repeat(96),
    content = 'V'.repeat(96);
  const owners = Array.from(
    { length: 8 },
    (_, i) => `${'W'.repeat(27)}${String.fromCharCode(65 + i)}`,
  );
  const records = Array.from({ length: 12 }, (_, i) => ({
    owner: owners[i % 8],
    topic: i === knownCount ? 'F'.repeat(37) : i < 8 ? topic : 'X'.repeat(96),
    state: i < knownCount ? 'known' : absentState,
    ...(i < knownCount
      ? { content }
      : { qualification: absentState === 'missing' ? 'not supplied' : 'not determined' }),
  }));
  const focus = records[knownCount];
  const clauses = [
    `${scope} reviews ${[...new Set(records.map((r) => r.topic))].slice(0, -1).join(', ')}, and ${[...new Set(records.map((r) => r.topic))].at(-1)} for ${owners.slice(0, -1).join(', ')}, and ${owners[7]}.`,
    ...records
      .slice(0, knownCount)
      .map((r) => `${r.owner} reports ${r.topic} as ${content} in ${scope}.`),
    ...records
      .slice(knownCount)
      .map(
        (r) =>
          `${r.owner}'s ${r.topic} is ${'qualification' in r ? r.qualification : ''} in ${scope}.`,
      ),
    `${absentState} ${focus.topic} for ${focus.owner} in ${scope} is not a zero or false value.`,
    `${focus.owner}'s ${focus.topic} stays unresolved in ${scope}.`,
  ];
  const speech = expansionFixtureSpeech(clauses, 12);
  const phases = [0, 1, knownCount + 1, 13, 14, 15],
    times = [0.25, 1.1, 4.8, 7.4, 9.4, 11.65];
  for (let phase = 0; phase < 5; phase++) {
    const first = speech.spans[phases[phase]].fromWord,
      last = speech.spans[phases[phase + 1] - 1].toWord;
    for (let i = first; i <= last; i++) {
      speech.words[i].start =
        times[phase] +
        ((times[phase + 1] - times[phase] - 0.05) * (i - first)) / (last - first + 1);
      speech.words[i].end =
        times[phase] +
        ((times[phase + 1] - times[phase] - 0.05) * (i - first + 1)) / (last - first + 1);
    }
  }
  const ctx = makeParseContext(speech.words, speech.window);
  const scene = parseExpansionMissingEvidenceMap(
    {
      kind: 'retrieval-grounding',
      preset: 'missing-evidence-map',
      visualMode: mode,
      evidence: 'source-stated',
      layout: 'stack',
      label: scope,
      subject: focus.owner,
      scope,
      outcome: `${focus.topic} stays unresolved`,
      startWord: 0,
      endWord: speech.window.endWord,
      setupWord: speech.spans[0].fromWord,
      actionWord: speech.spans[1].fromWord,
      responseWord: speech.spans[knownCount + 1].fromWord,
      checkWord: speech.spans[13].fromWord,
      resolveWord: speech.spans[14].fromWord,
      entities: owners.map((label) => ({ label, evidence: speech.spans[0] })),
      records: records.map((r, i) => ({ ...r, evidence: speech.spans[i + 1] })),
      focusRecord: knownCount,
      nonFalse: {
        record: knownCount,
        qualification: 'not a zero or false value',
        evidence: speech.spans[13],
      },
      resolution: { record: knownCount, status: 'unresolved', evidence: speech.spans[14] },
    },
    ctx,
  );
  expect(ctx.issues).toEqual([]);
  if (!scene) throw new Error('Raw maximum occupancy rejected');
  expect(scene.entities).toHaveLength(8);
  expect(scene.records).toHaveLength(12);
  expect(scene.records.filter((r) => r.state === 'known')).toHaveLength(knownCount);
  expect(scene.records.filter((r) => r.state === absentState)).toHaveLength(12 - knownCount);
  expect(scene.records.filter((r) => r.topic.length === 96)).toHaveLength(11);
  expect(scene.outcome).toBe(`${'F'.repeat(37)} stays unresolved`);
  expect(scene.outcome).toHaveLength(54);
  expect(scene.records[knownCount].topic).toHaveLength(37);
  expect(scene.entities.every((entity) => entity.label.length === 28)).toBe(true);
  expect(scene.scope).toHaveLength(40);
  expect(scene.resolution.status).toBe('unresolved');
  expect(scene.records.filter((r) => r.state !== 'known').every((r) => !('content' in r))).toBe(
    true,
  );
  expect(
    scene.records.filter((r) => r.state === 'known').every((r) => r.content.length === 96),
  ).toBe(true);
  return scene;
}

function pageTimes(scene: ExpansionReasoningInformationScene): number[] {
  return [
    0,
    scene.setupAt,
    scene.actionAt,
    scene.responseAt,
    scene.checkAt,
    scene.resolveAt + 1,
    ...(scene.storyId === '06'
      ? scene.records.map(
          (_, i) =>
            scene.responseAt +
            ((scene.resolveAt - scene.responseAt) * (i + 0.5)) / scene.records.length,
        )
      : []),
  ];
}

const tags = (html: string, name: string) =>
  (html.match(new RegExp(`<${name}(?:[ >])`, 'g')) ?? []).length;

describe('information actual composed CPU trees (not GPU proof)', () => {
  it('counts real Clay/kits including hidden stations, plus studio preparation and shadow cost', () => {
    const room = new RoomEnvironment();
    let studioMeshes = 0;
    room.traverse((object) => {
      if ('isMesh' in object && object.isMesh) studioMeshes++;
    });
    let studioInstances = 0;
    room.traverse((object) => {
      if ('isInstancedMesh' in object && object.isInstancedMesh && 'count' in object)
        studioInstances += Number(object.count);
    });
    expect(studioInstances).toBe(6);
    room.dispose();
    // Installed ContactShadows owns one displayed plane and one blur-plane Mesh.
    const shadows = readFileSync('node_modules/@react-three/drei/core/ContactShadows.js', 'utf8');
    expect(shadows).toContain('new THREE.Mesh(planeGeometry)');
    expect(shadows.match(/React.createElement\("mesh"/g)).toHaveLength(1);
    expect(studioMeshes).toBe(8);
  });

  // Persisted measurements, not guessed ceilings. Includes every hidden station/page.
  // Local maxima keep 11 topics and every known value at 96 chars, all owner labels
  // at 28, scope at 40, and focus topic at 37 + ' stays unresolved' = 54-char outcome.
  // At width 534 / size 20, owner/topic/value contribute 2/4/4 detail tspans;
  // an absent qualification contributes one instead of four: each known record
  // adds exactly three SVG elements. Measured local maximum = 227 + 3*11 = 260.
  // These are accepted-source structural regressions, not a global grammar/GPU proof.
  // known document = seven document meshes + two retained-state bars = 9;
  // absent slot = five cradle meshes + four unknown bars + one dot = 10.
  // Thus 12 records with >=1 known and >=1 absent peak at 1*9 + 11*10 = 119,
  // NOT the helper maximum's 10*9 + 2*10 = 110 or the known-heavy 11*9 + 10 = 109.
  const budgets = [
    { name: 'source 05', entities: 3, known: 0, missing: 0, unknown: 0, meshes: 9, svg: 36 },
    { name: 'source 06', entities: 1, known: 1, missing: 1, unknown: 0, meshes: 19, svg: 40 },
    {
      name: 'maximum labels 05',
      entities: 3,
      known: 0,
      missing: 0,
      unknown: 0,
      meshes: 9,
      svg: 42,
    },
    {
      name: 'helper maximum 06',
      entities: 8,
      known: 10,
      missing: 1,
      unknown: 1,
      meshes: 110,
      svg: 247,
    },
    {
      name: '11 known, 1 missing',
      entities: 8,
      known: 11,
      missing: 1,
      unknown: 0,
      meshes: 109,
      svg: 260,
    },
    {
      name: '11 known, 1 unknown',
      entities: 8,
      known: 11,
      missing: 0,
      unknown: 1,
      meshes: 109,
      svg: 260,
    },
    {
      name: '1 known, 11 missing',
      entities: 8,
      known: 1,
      missing: 11,
      unknown: 0,
      meshes: 119,
      svg: 230,
    },
    {
      name: '1 known, 11 unknown',
      entities: 8,
      known: 1,
      missing: 0,
      unknown: 11,
      meshes: 119,
      svg: 230,
    },
  ];
  for (const mode of ['diagram', 'hybrid'] as const) {
    it.each(
      budgets.map((budget, index) => ({ ...budget, index })),
    )(`${mode}: $name exact composed costs and all detail pages`, (budget) => {
      const scenes = [
        ...informationSourceScenes(mode),
        occupancyScene(mode, 11, 'missing'),
        occupancyScene(mode, 11, 'unknown'),
        occupancyScene(mode, 1, 'missing'),
        occupancyScene(mode, 1, 'unknown'),
      ];
      expect(scenes).toHaveLength(budgets.length);
      const scene = scenes[budget.index];
      expect(scene.visualMode).toBe(mode);
      expect(scene.entities).toHaveLength(budget.entities);
      const records = scene.storyId === '06' ? scene.records : [];
      for (const state of ['known', 'missing', 'unknown'] as const) {
        expect(records.filter((r) => r.state === state)).toHaveLength(budget[state]);
      }
      expect(records).toHaveLength(budget.known + budget.missing + budget.unknown);
      expect(records.length).toBeLessThanOrEqual(12);
      expect(scene.entities.length).toBeLessThanOrEqual(8);
      const pages = new Set<number>();
      for (const t of pageTimes(scene)) {
        const pose = informationPose(scene, t);
        pages.add(pose.detailIndex);
        const model = renderToStaticMarkup(createElement(InformationModels, { scene, pose }));
        const diagram = renderToStaticMarkup(
          createElement('svg', {}, createElement(InformationDiagram, { scene, pose })),
        );
        const overlay = renderToStaticMarkup(
          createElement(InformationModelOverlay, { scene, pose }),
        );
        expect(model).not.toMatch(/<(?:instancedMesh|skinnedMesh|primitive)[ >]/);
        expect(tags(model, 'mesh')).toBe(budget.meshes);
        expect((diagram.match(/<[a-zA-Z][^/ >]*/g) ?? []).length).toBe(budget.svg);
        // Hybrid identities are separate SVG cost: svg/title + g/circle/text per identity.
        const overlaySvg = (overlay.match(/<(?:svg|title|g|circle|text)(?:[ >])/g) ?? []).length;
        expect(overlaySvg).toBe(mode === 'diagram' ? 0 : scene.storyId === '05' ? 11 : 5);
        if (scene.storyId === '06') {
          expect(tags(model, 'mesh')).toBe(
            budget.known * 9 + (budget.missing + budget.unknown) * 10,
          );
          expect(diagram.match(/data-detail-active="true"/g) ?? []).toHaveLength(1);
          expect(diagram.match(/data-record-id=/g) ?? []).toHaveLength(records.length);
          for (const record of records) {
            expect(diagram).toContain(`data-record-id="${record.id}"`);
            expect(diagram).toContain(`data-context-id="${record.id}"`);
          }
        }
      }
      expect([...pages].sort((a, b) => a - b)).toEqual(
        Array.from({ length: scene.storyId === '06' ? records.length : 1 }, (_, i) => i),
      );
    });
  }
  it('pins measured accepted-fixture maxima separately from studio and scratch shadow work', () => {
    expect(Math.max(...budgets.map((b) => b.meshes))).toBe(119);
    expect(Math.max(...budgets.map((b) => b.svg))).toBe(260);
    // Prepared-work accounting, not simultaneous GPU draw calls or native RSS.
    expect(Math.max(...budgets.map((b) => b.meshes)) + 8 + 2).toBe(129);
    expect(Math.max(...budgets.map((b) => b.svg + (b.known ? 5 : 11)))).toBe(265);
  });
  it('gates shared mode routing against the actual stage source, without substituting a stage mock', () => {
    const hybrid = readFileSync(
      'src/main/remotion/compositions/explainer/diagrams/HybridStage.tsx',
      'utf8',
    );
    expect(hybrid).toMatch(/if \(scene\.visualMode === 'diagram'\)\s*return \(?\s*<DiagramStage/);
    expect(hybrid.match(/<Stage3D\b/g)).toHaveLength(1);
    const diagram = readFileSync(
      'src/main/remotion/compositions/explainer/diagrams/DiagramStage.tsx',
      'utf8',
    );
    expect(diagram).not.toMatch(/import .*Stage3D|<ThreeCanvas|<canvas/);
  });
});
