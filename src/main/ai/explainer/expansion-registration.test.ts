import { isValidElement } from 'react';
import { describe, expect, it } from 'vitest';
import { computingFixtureRows } from '../../../../scripts/explainer-stills/computing-fixtures';
import { decisionsFixtureRows } from '../../../../scripts/explainer-stills/decisions-fixtures';
import { geometryFixtureRows } from '../../../../scripts/explainer-stills/geometry-fixtures';
import { physicalFixtureRows } from '../../../../scripts/explainer-stills/physical-fixtures';
import { probabilityFixtureRows } from '../../../../scripts/explainer-stills/probability-fixtures';
import { quantitiesFixtureRows } from '../../../../scripts/explainer-stills/quantities-fixtures';
import { reasoningFixtureRows } from '../../../../scripts/explainer-stills/reasoning-fixtures';
import { relationshipsFixtureRows } from '../../../../scripts/explainer-stills/relationships-fixtures';
import { representationsFixtureRows } from '../../../../scripts/explainer-stills/representations-fixtures';
import { temporalFixtureRows } from '../../../../scripts/explainer-stills/temporal-fixtures';
import { ExpansionSceneView } from '../../remotion/compositions/explainer/expansion/Scene';
import { SceneBody } from '../../remotion/compositions/explainer/SceneBody';
import { EXPLAINER_SCENE_KINDS } from '../../remotion/compositions/explainer/types';
import { parseLongformSceneSpec, sceneCues } from '../explainer-scenes';
import { ALL_EXPANSION_PRESET_SPECS, getRegisteredSceneSpec } from './expansion-registry';
import { makeParseContext } from './kind-spec';
import { ALL_KIND_SPECS, getKindSpec } from './kinds';

const rows = [
  ...reasoningFixtureRows(),
  ...probabilityFixtureRows(),
  ...quantitiesFixtureRows(),
  ...decisionsFixtureRows(),
  ...relationshipsFixtureRows(),
  ...temporalFixtureRows(),
  ...representationsFixtureRows(),
  ...geometryFixtureRows(),
  ...computingFixtureRows(),
  ...physicalFixtureRows(),
];

describe('every completed expansion preset reaches the real source planner', () => {
  it('registers every combined scene kind and all eighty exact preset routes', () => {
    const kinds = new Set(
      [...ALL_KIND_SPECS, ...ALL_EXPANSION_PRESET_SPECS].map((spec) => spec.kind),
    );
    expect([...kinds].sort()).toEqual([...EXPLAINER_SCENE_KINDS].sort());
    expect(ALL_EXPANSION_PRESET_SPECS).toHaveLength(80);
    expect(
      new Set(ALL_EXPANSION_PRESET_SPECS.map((spec) => `${spec.kind}\0${spec.preset}`)).size,
    ).toBe(80);
    for (const spec of ALL_EXPANSION_PRESET_SPECS) {
      expect(getRegisteredSceneSpec({ kind: spec.kind, preset: spec.preset })).toBe(spec);
    }
  });
  it('keeps unqualified legacy kind defaults unchanged', () => {
    for (const kind of new Set(rows.map((row) => row.scene.kind))) {
      expect(getRegisteredSceneSpec({ kind })).toBe(getKindSpec(kind));
    }
  });
  it('does not discard an unsupported preset through a permissive legacy equation parser', () => {
    const raw = {
      kind: 'equation',
      preset: 'unsupported',
      terms: [
        { text: 'two', word: 0 },
        { text: 'two', word: 1 },
      ],
      ops: ['+'],
      result: 'four',
      resultWord: 2,
    };
    const words = [
      { text: 'two', start: 0.25, end: 1 },
      { text: 'two', start: 2, end: 3 },
      { text: 'four', start: 4, end: 5 },
    ];
    const ctx = makeParseContext(words, { startWord: 0, endWord: 2, startTime: 0, endTime: 6 });
    expect(getKindSpec('equation')?.parse(raw, ctx)).not.toBeNull();
    expect(getRegisteredSceneSpec(raw)?.parse(raw, ctx)).toBeNull();
  });
  it('aggregates all eighty advertised story identities: unique routes, each parsing and dispatching in both diagram and hybrid modes', () => {
    // Exactly eighty advertised (kind,preset) routes, none duplicated.
    const specRoutes = ALL_EXPANSION_PRESET_SPECS.map((s) => `${s.kind}\0${s.preset}`);
    expect(ALL_EXPANSION_PRESET_SPECS).toHaveLength(80);
    expect(new Set(specRoutes).size).toBe(80);

    // The authored fixtures cover exactly those routes, one story identity each.
    const rowRoutes = new Set(rows.map((r) => `${r.scene.kind}\0${r.scene.preset}`));
    expect([...rowRoutes].sort()).toEqual([...new Set(specRoutes)].sort());
    expect(rows).toHaveLength(160);

    const byStory = new Map<string, Array<(typeof rows)[number]>>();
    for (const row of rows) {
      const group = byStory.get(row.scene.storyId) ?? [];
      group.push(row);
      byStory.set(row.scene.storyId, group);
    }
    expect(byStory.size).toBe(80);

    for (const [storyId, storyRows] of byStory) {
      // Every story identity is authored in BOTH modes, exactly once each.
      expect(
        storyRows.map((r) => r.plannerInput.visualMode).sort(),
        `story ${storyId} modes`,
      ).toEqual(['diagram', 'hybrid']);
      for (const row of storyRows) {
        // Parse in the exact mode.
        const planned = parseLongformSceneSpec(row.plannerInput, row.sourceWords, {
          minStart: 0,
          maxEnd: row.durationSec,
        });
        expect(planned?.scene, `${row.name} parse`).toEqual(row.scene);
        // Dispatch in the exact mode.
        const rendered = SceneBody({ scene: row.scene });
        expect(isValidElement(rendered), `${row.name} dispatch`).toBe(true);
        if (!isValidElement<{ scene: typeof row.scene }>(rendered))
          throw new Error('Actual dispatch element required');
        expect(rendered.type, `${row.name} dispatch route`).toBe(ExpansionSceneView);
        expect(rendered.props.scene, `${row.name} dispatch scene`).toBe(row.scene);
        const pack = ExpansionSceneView({ scene: row.scene });
        expect(pack.props.scene, `${row.name} pack scene`).toBe(row.scene);
      }
    }
  });
  it('keeps local source validation aligned and rejects a clipped final hold', () => {
    const row = rows.find((candidate) => candidate.scene.storyId === '65');
    if (!row) throw new Error('Actual cache source fixture is required');
    const last = row.sourceWords.at(-1);
    if (!last) throw new Error('Actual source words are required');
    const endTime = last.end + 0.35;
    const ctx = makeParseContext(row.sourceWords, {
      startWord: 0,
      endWord: row.sourceWords.length - 1,
      startTime: 0,
      endTime,
    });
    const parsed = getRegisteredSceneSpec(row.plannerInput)?.parse(row.plannerInput, ctx);
    expect(parsed, ctx.issues.join('; ')).toEqual(row.scene);
    expect(
      parseLongformSceneSpec(row.plannerInput, row.sourceWords, {
        minStart: 0,
        maxEnd: row.scene.resolveAt + 0.7,
      }),
    ).toBeNull();
  });
  for (const row of rows) {
    it(`retains actual complete source specification ${row.name}`, () => {
      const planned = parseLongformSceneSpec(row.plannerInput, row.sourceWords, {
        minStart: 0,
        maxEnd: row.durationSec,
      });
      expect(planned?.scene).toEqual(row.scene);
      expect(planned?.cues).toHaveLength(5);
      expect(planned?.cues.map((cue) => cue.at)).toEqual([
        row.scene.setupAt,
        row.scene.actionAt,
        row.scene.responseAt,
        row.scene.checkAt,
        row.scene.resolveAt,
      ]);
    });
    it(`dispatches the exact accepted story without mounting frame contexts ${row.name}`, () => {
      const rendered = SceneBody({ scene: row.scene });
      expect(isValidElement(rendered)).toBe(true);
      if (!isValidElement<{ scene: typeof row.scene }>(rendered))
        throw new Error('Actual dispatch element required');
      expect(rendered.type).toBe(ExpansionSceneView);
      expect(rendered.props.scene).toBe(row.scene);
      const pack = ExpansionSceneView({ scene: row.scene });
      expect(pack.props.scene).toBe(row.scene);
      expect(
        Reflect.apply(sceneCues, undefined, [{ scene: { ...row.scene, preset: 'unsupported' } }]),
      ).toEqual([]);
      expect(
        Reflect.apply(sceneCues, undefined, [{ scene: { ...row.scene, storyId: 'unsupported' } }]),
      ).toEqual([]);
      expect(
        Reflect.apply(SceneBody, undefined, [{ scene: { ...row.scene, storyId: 'unsupported' } }]),
      ).toBeNull();
      expect(
        Reflect.apply(SceneBody, undefined, [{ scene: { ...row.scene, preset: 'unsupported' } }]),
      ).toBeNull();
    });
    it(`rejects a malformed mode for a recognized preset ${row.name}`, () => {
      expect(
        parseLongformSceneSpec(
          { ...row.plannerInput, visualMode: 'unsupported' },
          row.sourceWords,
          { minStart: 0, maxEnd: row.durationSec },
        ),
      ).toBeNull();
    });
    it(`rejects an unsupported new preset without generic fallback ${row.name}`, () => {
      expect(
        parseLongformSceneSpec(
          { ...row.plannerInput, preset: 'unrecognized-expansion-preset' },
          row.sourceWords,
          {
            minStart: 0,
            maxEnd: row.durationSec,
          },
        ),
      ).toBeNull();
    });
  }
});
