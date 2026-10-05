import { describe, expect, it, vi } from 'vitest';
import {
  WORK_SOURCE_FIXTURES,
  type WorkSourceFixture,
} from '../../remotion/compositions/explainer/business/work/fixtures';
import * as presentation from '../../remotion/compositions/explainer/business/work/presentation';
import type { BusinessWorkScene } from '../../remotion/compositions/explainer/business/work/types';
import type { SceneCue } from '../../remotion/compositions/explainer/types';
import { isRec, makeParseContext } from './kind-spec';
import {
  COORDINATION_MAP_SPEC,
  coordinationMapCues,
  parseCoordinationMap,
  parseTaskMap,
  parseWorkRedesign,
  TASK_MAP_SPEC,
  taskMapCues,
  WORK_REDESIGN_SPEC,
  workRedesignCues,
} from './kinds-business-work';

const specs = [TASK_MAP_SPEC, COORDINATION_MAP_SPEC, WORK_REDESIGN_SPEC];
function runSpec(fixture: WorkSourceFixture): {
  scene: BusinessWorkScene | null;
  cues: SceneCue[];
  issues: string[];
} {
  const ctx = makeParseContext(fixture.words, fixture.window);
  if (fixture.raw.kind === 'task-map') {
    const scene = TASK_MAP_SPEC.parse(fixture.raw, ctx);
    return { scene, cues: scene ? TASK_MAP_SPEC.cues(scene) : [], issues: ctx.issues };
  }
  if (fixture.raw.kind === 'coordination-map') {
    const scene = COORDINATION_MAP_SPEC.parse(fixture.raw, ctx);
    return { scene, cues: scene ? COORDINATION_MAP_SPEC.cues(scene) : [], issues: ctx.issues };
  }
  const scene = WORK_REDESIGN_SPEC.parse(fixture.raw, ctx);
  return { scene, cues: scene ? WORK_REDESIGN_SPEC.cues(scene) : [], issues: ctx.issues };
}

describe('concrete work specs before Step13 root integration', () => {
  it('exports exact concrete parsers and cue functions without a root Scene assertion', () => {
    expect(TASK_MAP_SPEC.parse).toBe(parseTaskMap);
    expect(COORDINATION_MAP_SPEC.parse).toBe(parseCoordinationMap);
    expect(WORK_REDESIGN_SPEC.parse).toBe(parseWorkRedesign);
    expect(TASK_MAP_SPEC.cues).toBe(taskMapCues);
    expect(COORDINATION_MAP_SPEC.cues).toBe(coordinationMapCues);
    expect(WORK_REDESIGN_SPEC.cues).toBe(workRedesignCues);
  });
  it.each(
    WORK_SOURCE_FIXTURES,
  )('parses $id with concrete spec and five neutral beat cues', (fixture) => {
    const before = structuredClone(fixture);
    const result = runSpec(fixture);
    expect(result.issues).toEqual([]);
    expect(result.scene).not.toBeNull();
    if (!result.scene) throw new Error(result.issues.join('; '));
    expect(result.scene.recipeId).toBe(fixture.id);
    expect(presentation.workPresentationFits(result.scene)).toBe(true);
    expect(
      presentation.layoutWorkTable(presentation.workTable(result.scene)).height,
    ).toBeLessThanOrEqual(478);
    expect(result.cues.map((cue) => cue.at)).toEqual([
      result.scene.setupAt,
      result.scene.actionAt,
      result.scene.responseAt,
      result.scene.checkAt,
      result.scene.resolveAt,
    ]);
    for (const cue of result.cues) {
      expect(['flip', 'slide', 'tick']).toContain(cue.kind);
      expect(Number.isFinite(cue.at)).toBe(true);
      expect(cue.gain).toBeGreaterThan(0);
      expect(cue.gain).toBeLessThanOrEqual(0.3);
    }
    expect(runSpec(fixture)).toEqual(result);
    expect(fixture).toEqual(before);
  });
  it.each(
    specs,
  )('$kind schema contains actual full semantic inputs for every advertised preset', (spec) => {
    const fixtures = WORK_SOURCE_FIXTURES.filter((fixture) => fixture.raw.kind === spec.kind);
    const examples = spec.schema.split('\n');
    expect(examples).toHaveLength(fixtures.length);
    examples.forEach((example, index) => {
      const fixture = fixtures[index];
      const colon = example.indexOf(':');
      expect(example.slice(0, colon)).toBe(fixture.id);
      const raw: unknown = JSON.parse(example.slice(colon + 1));
      if (!isRec(raw)) throw new Error('Invalid schema example');
      expect(raw).toEqual(
        Object.fromEntries(
          Object.entries(fixture.raw).filter(
            ([key]) => key !== 'startWord' && key !== 'endWord' && key !== 'layout',
          ),
        ),
      );
      expect(Object.hasOwn(raw, 'startWord')).toBe(false);
      expect(Object.hasOwn(raw, 'endWord')).toBe(false);
      expect(Object.hasOwn(raw, 'layout')).toBe(false);
      for (const beat of ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'])
        expect(Number.isInteger(raw[beat])).toBe(true);
      const parsed = runSpec({
        ...fixture,
        raw: {
          ...raw,
          startWord: fixture.window.startWord,
          endWord: fixture.window.endWord,
          layout: 'stack',
        },
      });
      expect(parsed.issues).toEqual([]);
      expect(parsed.scene?.recipeId).toBe(fixture.id);
      expect(spec.limits).toContain(String(raw.preset));
    });
  });
  it.each(
    specs,
  )('$kind has existing-family metadata without generic specialization triggers', (spec) => {
    expect([
      'list',
      'compare',
      'words',
      'data',
      'framework',
      'story',
      'process',
      'object',
    ]).toContain(spec.family);
    expect(spec.durationSec).toEqual([5, 12]);
    expect(spec.layouts).toEqual(['stack', 'stack-flipped', 'takeover', 'pip', 'over']);
    expect(spec.describe.length).toBeGreaterThan(50);
    expect(spec.avoid?.length).toBeGreaterThan(30);
    expect(spec.limits).toContain('478px');
    expect(spec.limits).toContain('Final reading hold >=0.8s');
    expect(Object.hasOwn(spec, 'general')).toBe(false);
    for (const generic of ['AI', 'business', 'companies', 'strategy', 'success'])
      expect(spec.triggers.some((trigger) => trigger.test(generic))).toBe(false);
    const grounded =
      spec.kind === 'task-map'
        ? 'task ownership and tested capability'
        : spec.kind === 'coordination-map'
          ? 'review queue and handoff load'
          : 'records expertise into a playbook revision';
    expect(spec.triggers.some((trigger) => trigger.test(grounded))).toBe(true);
  });
  it('applies the parent presentation acceptance gate to every valid route without shrinking or omission', () => {
    const fit = vi.spyOn(presentation, 'workPresentationFits').mockReturnValue(false);
    try {
      for (const fixture of WORK_SOURCE_FIXTURES) {
        fit.mockClear();
        const before = structuredClone(fixture);
        const result = runSpec(fixture);
        expect(fit).toHaveBeenCalledTimes(1);
        expect(result.scene).toBeNull();
        expect(result.issues.join(' ')).toMatch(/478px.*split the source.*shrink.*omit/iu);
        expect(result.cues).toEqual([]);
        expect(fixture).toEqual(before);
      }
    } finally {
      fit.mockRestore();
    }
  });
});
