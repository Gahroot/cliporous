import { isValidElement } from 'react';
import { describe, expect, it } from 'vitest';
import { BUSINESS_ALTERNATIVE_SOURCE_FIXTURES } from '../../remotion/compositions/explainer/business/decisions/alternative-fixtures';
import { BusinessAlternativeSceneView } from '../../remotion/compositions/explainer/business/decisions/alternative-Scene';
import { PERSPECTIVE_FIXTURES } from '../../remotion/compositions/explainer/concepts/perspective/fixture-data';
import { sourceFixture } from '../../remotion/compositions/explainer/concepts/perspective/fixtures';
import { PerspectiveSceneView } from '../../remotion/compositions/explainer/concepts/perspective/Scene';
import { SceneBody } from '../../remotion/compositions/explainer/SceneBody';
import { parseLongformSceneSpec, parsePlanWithDiagnostics } from '../explainer-scenes';

const historical = PERSPECTIVE_FIXTURES.filter(
  (fixture) => fixture.scene.kind === 'possible-futures',
);

describe('OP-75 opt-in preserves historical possible-futures stories', () => {
  it.each(
    BUSINESS_ALTERNATIVE_SOURCE_FIXTURES,
  )('$id: actual root parser dispatches only the complete source-bound opt-in', (fixture) => {
    const result = parsePlanWithDiagnostics(
      { scenes: [{ ...fixture.raw, layout: 'stack' }] },
      fixture.words,
      { minStart: 0, maxEnd: 60 },
    );
    expect(result.rejected).toEqual([]);
    expect(result.omitted).toEqual([]);
    expect(result.accepted).toHaveLength(1);
    const scene = result.accepted[0].scene;
    if (scene.kind !== 'possible-futures') throw new Error('Incorrect opt-in grammar');
    expect(scene.businessAlternatives?.version).toBe(1);
    expect(scene.businessAlternatives?.visualMode).toBe(fixture.raw.visualMode);
    const element = SceneBody({ scene });
    if (!isValidElement(element)) throw new Error('Missing opt-in view');
    expect(element.type).toBe(BusinessAlternativeSceneView);
    const saved = parseLongformSceneSpec({ ...fixture.raw, layout: 'over' }, fixture.words, {
      clipStart: 0,
      clipEnd: 60,
    });
    expect(saved?.scene).toEqual(scene);
    expect(saved?.cues).toEqual(result.accepted[0].cues);
    expect(saved?.layout).toBe('over');
  });
  it('covers both existing qualitative presets without converting their approved source', () => {
    expect(historical.map((fixture) => fixture.scene.preset)).toEqual([
      'branching-scenarios',
      'forecast-range',
    ]);
  });

  it.each(
    historical,
  )('$scene.preset: unchanged fields, facts, cues and original renderer', (fixture) => {
    const { words } = sourceFixture(fixture.sentences);
    const raw = structuredClone(fixture.raw);
    const originalJson = JSON.stringify(raw);
    const result = parsePlanWithDiagnostics({ scenes: [raw] }, words, { minStart: 0, maxEnd: 60 });
    expect(result.rejected).toEqual([]);
    expect(result.omitted).toEqual([]);
    expect(result.accepted).toHaveLength(1);
    const plan = result.accepted[0];
    expect(plan.scene).toEqual(fixture.scene);
    expect(JSON.stringify(raw)).toBe(originalJson);
    expect(plan.scene).not.toHaveProperty('businessAlternatives');
    expect(plan.scene).not.toHaveProperty('visualMode');
    expect(plan.cues).toEqual([
      { kind: 'flip', at: fixture.scene.actionAt, gain: 0.3 },
      { kind: 'tick', at: fixture.scene.checkAt, gain: 0.25 },
    ]);
    const element = SceneBody({ scene: plan.scene });
    if (!isValidElement(element)) throw new Error('Missing historical renderer');
    expect(element.type).toBe(PerspectiveSceneView);
    const saved = parseLongformSceneSpec({ ...raw, layout: 'over' }, words, {
      clipStart: 0,
      clipEnd: 60,
    });
    expect(saved?.scene).toEqual(fixture.scene);
    expect(saved?.cues).toEqual(plan.cues);
    expect(saved?.layout).toBe('over');
  });

  it.each(
    historical,
  )('$scene.preset: unsupported or incomplete opt-in never changes legacy meaning', (fixture) => {
    const { words } = sourceFixture(fixture.sentences);
    for (const patch of [
      { visualMode: 'diagram' },
      { visualMode: 'hybrid' },
      { businessAlternatives: null },
      { businessAlternatives: {} },
      { businessAlternatives: { version: 99 }, visualMode: 'diagram' },
      { businessAlternatives: { version: 1 }, visualMode: 'hybrid' },
      { arbitraryGeometry: 'unsupported' },
    ]) {
      const result = parsePlanWithDiagnostics({ scenes: [{ ...fixture.raw, ...patch }] }, words, {
        minStart: 0,
        maxEnd: 60,
      });
      expect(result.accepted).toEqual([]);
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].problems.length).toBeGreaterThan(0);
      expect(
        parseLongformSceneSpec({ ...fixture.raw, ...patch, layout: 'over' }, words, {
          clipStart: 0,
          clipEnd: 60,
        }),
      ).toBeNull();
    }
  });
});
