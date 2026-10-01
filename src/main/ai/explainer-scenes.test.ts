import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HERO_CATALOG } from '../remotion/compositions/explainer/hero-catalog';
import {
  TECHNOLOGY_KINDS,
  type TechnologyScene,
} from '../remotion/compositions/explainer/technology/types';
import { collectSceneTimes, mapSceneTimes } from '../remotion/compositions/explainer/types';
import { BEAT_EDGE_SEC } from './explainer/kind-spec';
import { type PlannerWord, parseExplainerPlan, toSceneRelative } from './explainer-scenes';

describe('technology fixtures through the real planner boundary', () => {
  const fixtures = TECHNOLOGY_KINDS.flatMap(
    (kind) =>
      JSON.parse(
        readFileSync(
          new URL(
            `../../../scripts/explainer-stills/fixtures/technology-${kind}.json`,
            import.meta.url,
          ),
          'utf8',
        ),
      ) as {
        name: string;
        raw: Record<string, unknown>;
        words?: PlannerWord[];
        sourceText: string;
        wordStepSec?: number;
        wordTiming?: { fps: number; stepFrames: number; durationFrames: number };
        scene: TechnologyScene;
      }[],
  );

  function sourceWords(fixture: (typeof fixtures)[number]): PlannerWord[] {
    if (fixture.words) return fixture.words;
    const timing = fixture.wordTiming;
    if (timing)
      return fixture.sourceText.split(/\s+/).map((text, i) => ({
        text,
        start: (i * timing.stepFrames) / timing.fps,
        end: (i * timing.stepFrames + timing.durationFrames) / timing.fps,
      }));
    const step = fixture.wordStepSec;
    if (step === undefined) throw new Error(`Missing source timing: ${fixture.name}`);
    const round = (time: number): number => Math.round(time * 1e6) / 1e6;
    return fixture.sourceText
      .split(/\s+/)
      .map((text, i) => ({ text, start: round(i * step), end: round((i + 0.9) * step) }));
  }

  it.each(
    fixtures,
  )('$name keeps all five source beats at nonzero absolute timestamps', (fixture) => {
    const offset = 30;
    const shifted = sourceWords(fixture).map((word) => ({
      ...word,
      start: word.start + offset,
      end: word.end + offset,
    }));
    const plan = parseExplainerPlan(
      {
        scenes: [
          {
            ...fixture.raw,
            laterStamp: { text: 'DONE', word: fixture.raw.resolveWord },
            dimWord: fixture.raw.checkWord,
            reactions: [{ word: fixture.raw.checkWord, strength: 'shake' }],
          },
        ],
      },
      shifted,
      { minStart: 0, maxEnd: 90 },
      { emphasisTimes: [offset + 3] },
    );
    expect(plan).toHaveLength(1);
    const [scene] = plan;
    const expected = mapSceneTimes(fixture.scene, (time) => time + offset);
    // The shared entrance clamp is intentional; later beats must stay on exact source time.
    expected.setupAt = Math.max(
      shifted[Number(fixture.raw.setupWord)].start,
      scene.startTime + BEAT_EDGE_SEC,
    );
    expect(mapSceneTimes(scene.scene, () => 0)).toEqual(mapSceneTimes(expected, () => 0));
    const expectedTimes = collectSceneTimes(expected);
    expect(collectSceneTimes(scene.scene)).toHaveLength(5);
    collectSceneTimes(scene.scene).forEach((time, i) => {
      expect(time).toBeCloseTo(expectedTimes[i], 10);
    });
    expect(scene.scene).not.toHaveProperty('pulses');
    expect(scene.scene).not.toHaveProperty('overlayStamp');
    expect(scene.scene).not.toHaveProperty('dimAt');
    expect(scene.cues.length).toBeGreaterThan(0);
    expect(scene.cues.every((cue) => cue.at >= scene.startTime && cue.at <= scene.endTime)).toBe(
      true,
    );
    expect(toSceneRelative(scene.scene, scene.startTime)).toEqual(
      mapSceneTimes(expected, (time) =>
        Math.max(0, Math.round((time - scene.startTime) * 1000) / 1000),
      ),
    );
  });

  it.each(
    fixtures,
  )('$name is rejected rather than clipping setup or the resolution hold', (fixture) => {
    const shifted = sourceWords(fixture).map((word) => ({
      ...word,
      start: word.start + 30,
      end: word.end + 30,
    }));
    expect(
      parseExplainerPlan({ scenes: [fixture.raw] }, shifted, {
        minStart: fixture.scene.setupAt + 30.3,
        maxEnd: 90,
      }),
    ).toEqual([]);
    expect(
      parseExplainerPlan({ scenes: [fixture.raw] }, shifted, {
        minStart: 0,
        maxEnd: fixture.scene.resolveAt + 30.4,
      }),
    ).toEqual([]);
  });
});

/** 40 words, one every 0.5s starting at t=10 (source-absolute time). */
function words(count = 40, start = 10): PlannerWord[] {
  return Array.from({ length: count }, (_, i) => ({
    text: `w${i}`,
    start: start + i * 0.5,
    end: start + i * 0.5 + 0.4,
  }));
}

const BOUNDS = { minStart: 12, maxEnd: 30 };

describe('parseExplainerPlan', () => {
  it.each([
    'vault',
    'wallet',
    'card-reader',
    'calculator',
    'parcel',
    'filing-cabinet',
    'aperture',
    'telescope',
    'bridge',
    'arch',
  ] as const)('parses %s with its exact action cue and omits unsupported reversal', (prop) => {
    const result = parseExplainerPlan(
      {
        scenes: [
          { kind: 'hero', prop, label: prop, startWord: 6, endWord: 14, word: 6, tone: 'down' },
        ],
      },
      words(),
      BOUNDS,
    );
    expect(result).toHaveLength(1);
    const p = result[0];
    if (p.scene.kind !== 'hero') throw new Error('Expected hero');
    expect(p.scene).toMatchObject({ kind: 'hero', prop, label: prop });
    expect(p.scene).not.toHaveProperty('tone');
    const impact = HERO_CATALOG[prop];
    expect(p.cues).toContainEqual({ ...impact.impactCue, at: p.scene.at + impact.impactSec });
    expect(toSceneRelative(p.scene, p.startTime).at).toBeCloseTo(p.scene.at - p.startTime);
  });
  it.each([
    'prism',
    'magnifying-glass',
  ] as const)('keeps %s optical effects quiet and does not invent a reversed action', (prop) => {
    const result = parseExplainerPlan(
      {
        scenes: [
          { kind: 'hero', prop, label: prop, startWord: 6, endWord: 14, word: 6, tone: 'down' },
        ],
      },
      words(),
      BOUNDS,
    );
    expect(result).toHaveLength(1);
    const p = result[0];
    if (p.scene.kind !== 'hero') throw new Error('Expected hero');
    expect(p.scene).toMatchObject({ kind: 'hero', prop });
    expect(p.scene).not.toHaveProperty('tone');
    expect(p.cues).toEqual([{ kind: 'whoosh', at: p.scene.at, gain: 0.6 }]);
    expect(toSceneRelative(p.scene, p.startTime).at).toBeCloseTo(p.scene.at - p.startTime);
  });
  it('preserves the reservoir drain action and its catalog completion cue', () => {
    const [p] = parseExplainerPlan(
      {
        scenes: [
          {
            kind: 'hero',
            prop: 'reservoir',
            label: 'Reserves',
            startWord: 6,
            endWord: 14,
            word: 6,
            tone: 'down',
          },
        ],
      },
      words(),
      BOUNDS,
    );
    expect(p.scene).toMatchObject({ kind: 'hero', prop: 'reservoir', tone: 'down' });
    if (p.scene.kind !== 'hero') throw new Error('Expected hero');
    const info = HERO_CATALOG.reservoir;
    expect(p.cues).toContainEqual({
      ...info.impactCue,
      at: p.scene.at + (info.downImpactSec ?? info.impactSec),
    });
  });
  it('maps word indices to exact word times for a checklist', () => {
    const w = words();
    const plan = parseExplainerPlan(
      {
        scenes: [
          {
            kind: 'checklist',
            startWord: 6,
            endWord: 16,
            items: [
              { label: 'Rebuild the deal', icon: 'FileText', word: 8 },
              { label: 'Compare sources', icon: 'Search', word: 12 },
            ],
          },
        ],
      },
      w,
      BOUNDS,
    );

    expect(plan).toHaveLength(1);
    const [scene] = plan;
    expect(scene?.startTime).toBeCloseTo(13 - 0.25);
    expect(scene?.endTime).toBeCloseTo(18.4 + 0.35);
    expect(scene?.layout).toBe('stack');
    expect(scene?.chained).toBe(false);
    expect(scene?.cues.map((c) => c.kind)).toEqual(['slide', 'tick', 'tick']);
    expect(scene?.scene).toEqual({
      kind: 'checklist',
      items: [
        { label: 'Rebuild the deal', icon: 'FileText', doneAt: 14 },
        { label: 'Compare sources', icon: 'Search', doneAt: 16 },
      ],
    });
  });

  it('replaces unknown icons, uppercases stamps, and drops invalid scenes', () => {
    const plan = parseExplainerPlan(
      {
        scenes: [
          {
            kind: 'stamp',
            startWord: 6,
            endWord: 14,
            icon: 'NotAnIcon',
            word: 'never',
            stampWord: 9,
            strikeWord: null,
          },
          {
            kind: 'checklist',
            startWord: 20,
            endWord: 30,
            items: [{ label: 'only one', icon: 'Check', word: 22 }],
          },
          { kind: 'hologram', startWord: 32, endWord: 38 },
          { kind: 'versus', startWord: 30, endWord: 20, left: {}, right: {} },
        ],
      },
      words(),
      BOUNDS,
    );

    expect(plan).toHaveLength(1);
    expect(plan[0]?.scene).toEqual({ kind: 'stamp', icon: 'Circle', word: 'NEVER', stampAt: 14.5 });
  });

  it('rejects labels over the length cap and beats outside the scene', () => {
    const plan = parseExplainerPlan(
      {
        scenes: [
          {
            kind: 'versus',
            startWord: 6,
            endWord: 16,
            left: { label: 'x'.repeat(40), icon: 'Bot', word: 8 },
            right: { label: 'People', icon: 'Users', word: 12 },
          },
          {
            kind: 'versus',
            startWord: 20,
            endWord: 30,
            left: { label: 'AI', icon: 'Bot', word: 22 },
            right: { label: 'People', icon: 'Users', word: 35 },
          },
        ],
      },
      words(),
      BOUNDS,
    );
    expect(plan).toEqual([]);
  });

  it('clamps minStart and preserves baseline variety rules (no repeat kind, gap)', () => {
    const plan = parseExplainerPlan(
      {
        scenes: [
          {
            kind: 'stamp',
            startWord: 0,
            endWord: 12,
            icon: 'Ban',
            word: 'Stop',
            stampWord: 8,
            strikeWord: 10,
          },
          {
            kind: 'stamp',
            startWord: 14,
            endWord: 22,
            icon: 'Ban',
            word: 'Again',
            stampWord: 16,
            strikeWord: null,
          },
          {
            kind: 'stamp',
            startWord: 24,
            endWord: 34,
            icon: 'Zap',
            word: 'Yes',
            stampWord: 26,
            strikeWord: null,
          },
        ],
      },
      words(),
      BOUNDS,
      { profile: 'baseline-policy-codex-v1' },
    );

    // 2nd stamp is too close AND a repeat kind; 3rd is a repeat of the kept 1st
    // (same kind back-to-back after the drop) — only the first survives.
    expect(plan.map((p) => p.startTime)).toEqual([12]);
    expect(plan[0]?.scene).toMatchObject({ stampAt: 14, strikeAt: 15 });
  });

  it('keeps beats chronological and orders flow output after input', () => {
    const plan = parseExplainerPlan(
      {
        scenes: [
          {
            kind: 'flow',
            startWord: 6,
            endWord: 20,
            inputLabel: 'Prompt',
            inputText: 'Closed deal',
            engineLabel: 'AI',
            outputLabel: 'Answer',
            outputText: 'Delivery plan',
            inputWord: 10,
            outputWord: 10,
          },
        ],
      },
      words(),
      BOUNDS,
    );
    expect(plan[0]?.scene).toMatchObject({ kind: 'flow', inputAt: 15, outputAt: 16 });
  });

  it('returns nothing for malformed responses', () => {
    expect(parseExplainerPlan(null, words(), BOUNDS)).toEqual([]);
    expect(parseExplainerPlan({ scenes: 'nope' }, words(), BOUNDS)).toEqual([]);
    expect(parseExplainerPlan({ scenes: [] }, [], BOUNDS)).toEqual([]);
  });
});

/** Long clip so the 55% coverage budget never interferes. */
const WIDE = { minStart: 12, maxEnd: 60 };

describe('parseExplainerPlan v2 extras', () => {
  it('snaps a continuing scene onto the previous one and keeps the shared layout', () => {
    const plan = parseExplainerPlan(
      {
        scenes: [
          {
            kind: 'stamp',
            startWord: 6,
            endWord: 14,
            layout: 'stack',
            icon: 'Ban',
            word: 'never',
            stampWord: 9,
            strikeWord: null,
          },
          {
            kind: 'stack',
            startWord: 15,
            endWord: 26,
            layout: 'stack',
            continues: true,
            transition: 'slide',
            layers: [
              { label: 'Tools', word: 17 },
              { label: 'Workflow', word: 20 },
            ],
            dimWord: null,
          },
        ],
      },
      words(100),
      WIDE,
    );
    expect(plan).toHaveLength(2);
    expect(plan[1]?.chained).toBe(true);
    expect(plan[1]?.transition).toBe('slide');
    expect(plan[1]?.startTime).toBeCloseTo(plan[0]?.endTime ?? 0);
  });

  it('parses laterStamp, dimWord and reactions into scene extras', () => {
    const plan = parseExplainerPlan(
      {
        scenes: [
          {
            kind: 'flow',
            startWord: 6,
            endWord: 30,
            layout: 'stack',
            inputLabel: 'Prompt',
            inputText: 'Closed deal',
            engineLabel: 'AI',
            outputLabel: 'Answer',
            outputText: 'Delivery plan',
            inputWord: 8,
            outputWord: 12,
            laterStamp: { text: 'Yes, but', word: 20 },
            dimWord: 26,
            reactions: [{ word: 14, item: 1, strength: 'pulse' }],
          },
        ],
      },
      words(100),
      WIDE,
    );
    expect(plan[0]?.scene).toMatchObject({
      overlayStamp: { word: 'YES, BUT', at: 20 },
      dimAt: 23,
      pulses: [{ at: 17, target: 1, strength: 'pulse' }],
    });
    expect(plan[0]?.cues.some((c) => c.kind === 'thump' && c.at > 20)).toBe(true);
  });

  it('falls back to the preferred layout when the model picks one the kind does not allow', () => {
    const plan = parseExplainerPlan(
      {
        scenes: [
          {
            kind: 'checklist',
            startWord: 6,
            endWord: 16,
            layout: 'takeover',
            items: [
              { label: 'One', icon: 'Check', word: 8 },
              { label: 'Two', icon: 'Check', word: 12 },
            ],
          },
        ],
      },
      words(100),
      WIDE,
    );
    expect(plan[0]?.layout).toBe('stack');
  });
});

describe('toSceneRelative', () => {
  it('shifts every beat to scene-relative seconds', () => {
    expect(
      toSceneRelative(
        {
          kind: 'stack',
          layers: [
            { label: 'A', at: 12.5 },
            { label: 'B', at: 13.25 },
          ],
          dimAt: 15,
        },
        12,
      ),
    ).toEqual({
      kind: 'stack',
      layers: [
        { label: 'A', at: 0.5 },
        { label: 'B', at: 1.25 },
      ],
      dimAt: 3,
    });
  });
});

describe('review feedback', () => {
  it('reports why each draft scene was rejected', async () => {
    const { parsePlanWithRejections } = await import('./explainer-scenes');
    const rejected = parsePlanWithRejections(
      {
        scenes: [
          { kind: 'sparkles', startWord: 6, endWord: 16 },
          {
            kind: 'venn',
            startWord: 6,
            endWord: 16,
            left: { label: 'A much too long circle label', word: 7 },
            right: { label: 'B', word: 9 },
            center: { label: 'C', word: 30 },
          },
          { kind: 'hero', startWord: 6, endWord: 16, prop: 'unicorn', label: 'x', word: 8 },
        ],
      },
      words(),
      BOUNDS,
    );
    expect(rejected).toHaveLength(3);
    expect(rejected[0]?.problems[0]).toMatch(/unknown scene type "sparkles"/);
    expect(rejected[1]?.problems.join(' ')).toMatch(/chars \(max 14\)/);
    expect(rejected[2]?.problems[0]).toMatch(/prop must be one of/);
  });

  it('puts rejected scenes and their problems into the review prompt', async () => {
    const { buildReviewPrompt } = await import('./explainer-scenes');
    const prompt = buildReviewPrompt(words(), [], BOUNDS, '9:16', [
      { raw: { kind: 'venn', startWord: 6 }, problems: ['"xxx" is 40 chars (max 14)'] },
    ]);
    expect(prompt).toContain('REJECTED by the validator');
    expect(prompt).toContain('40 chars (max 14)');
  });

  it('keeps the tone of props that have a reversed action only', () => {
    const hero = (prop: string) =>
      parseExplainerPlan(
        {
          scenes: [
            {
              kind: 'hero',
              startWord: 6,
              endWord: 14,
              prop,
              label: 'Label',
              word: 8,
              tone: 'down',
            },
          ],
        },
        words(),
        BOUNDS,
      )[0]?.scene;
    expect(hero('battery')).toMatchObject({ prop: 'battery', tone: 'down' });
    const rocket = hero('rocket');
    expect(rocket).toMatchObject({ prop: 'rocket' });
    expect(rocket).not.toHaveProperty('tone');
  });
});
