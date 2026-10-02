/** Local authored words, not ASR or live planner output. Save raw specs, never geometry. */
import assert from 'node:assert/strict';
import { parseLongformSceneSpec } from '../../src/main/ai/explainer-scenes';
import {
  type CompiledLongformScene,
  validateSceneFirstLongformPlan,
} from '../../src/main/ai/longform-scene-contract';
import { compileStoryboardSpec } from '../../src/main/ai/storyboards/compiler';
import {
  boardFixture,
  multiPanelFixture,
  savedBoardFixture,
  sourceLabel,
} from '../../src/main/ai/storyboards/fixtures';
import { buildLongformSceneTimeline } from '../../src/main/render/longform-scene-timeline';
import {
  longformSceneId,
  longformSourceFingerprint,
  type SceneFirstLongformPlan,
} from '../../src/shared/longform-scenes';
import { BUILTIN_PALETTES, type Palette } from '../../src/shared/palettes';
import {
  STORYBOARD_LIMITS,
  STORYBOARD_MODELS,
  type StoryboardSourceSpec,
} from '../../src/shared/storyboards';
import { required } from './support';

export const STYLES = ['ink', 'polish'] as const;
export const PALETTES: Palette[] = [
  ...BUILTIN_PALETTES,
  {
    id: 'proof-custom-light',
    name: 'Authored light palette',
    builtin: false,
    background: '#fafafa',
    foreground: '#18202b',
    accent: '#154ae0',
    accent2: '#086b45',
  },
  {
    id: 'proof-low-contrast',
    name: 'Deliberately low contrast, resolved not overwritten',
    builtin: false,
    background: '#eeeeee',
    foreground: '#eeeeee',
    accent: '#eeeeee',
    accent2: '#ffffff',
  },
];
export type RawFixture = ReturnType<typeof boardFixture>;
interface SavedFixture {
  words: RawFixture['words'];
  duration: number;
  plan: SceneFirstLongformPlan;
  compiled: CompiledLongformScene[];
  timeline: ReturnType<typeof buildLongformSceneTimeline>;
}

function nearStart(f: RawFixture): RawFixture {
  const shift = 1.5 - f.words[0].start;
  return {
    spec: structuredClone(f.spec),
    words: f.words.map((w) => ({ ...w, start: w.start + shift, end: w.end + shift })),
    duration: Math.ceil((f.duration + shift) * 30) / 30,
  };
}
export function movingFixture(): RawFixture {
  const f = nearStart(multiPanelFixture(2, true));
  const first = f.spec.panels[0].prop;
  const last = f.spec.panels[1];
  assert.ok(first && last.prop);
  // Repeated identity is the same model AND source evidence, not two invented props.
  last.prop.id = first.id;
  last.prop.evidence = { ...first.evidence };
  return f;
}
export function maximumSourceFixture(): RawFixture {
  const f = nearStart(multiPanelFixture(5));
  f.spec.panels = f.spec.panels.map((panel) => {
    const start = panel.startWord;
    'System intake then review then delivery then archive battery waits while more context continues'
      .split(' ')
      .forEach((text, i) => {
        f.words[start + i].text = text;
      });
    return {
      ...panel,
      kind: 'process',
      title: sourceLabel(f.words, 'System', start),
      items: ['intake', 'review', 'delivery', 'archive'].map((s) => sourceLabel(f.words, s, start)),
      relationship: 'sequence',
      evidence: { startWord: start + 1, endWord: start + 7 },
      prop: {
        id: `battery${start}`,
        model: 'battery',
        action: 'reveal',
        atWord: start + 8,
        evidence: { startWord: start + 8, endWord: start + 8 },
      },
    };
  });
  return f;
}
export function fixtures(): (RawFixture & { name: string })[] {
  const long = nearStart(boardFixture());
  const panel = long.spec.panels[0];
  assert.equal(panel.kind, 'statement');
  if (panel.kind !== 'statement') throw new Error('statement fixture required');
  const text = 'keeps extraordinarily detailed, source-grounded explanations together';
  text.split(' ').forEach((word, i) => {
    long.words[i + 2].text = word;
  });
  panel.body = sourceLabel(long.words, text);
  return [
    { name: 'definition', ...nearStart(boardFixture()) },
    ...(['comparison', 'process', 'notes', 'quantity', 'hero'] as const).map((kind) => ({
      name: kind,
      ...nearStart(boardFixture(kind, 'battery', 'reveal')),
    })),
    ...STORYBOARD_MODELS.filter((model) => model !== 'battery').map((model) => ({
      name: `hero-${model}`,
      ...nearStart(boardFixture('hero', model, 'activate')),
    })),
    { name: 'moving-recurring', ...movingFixture() },
    { name: 'maximum-five-panels', ...nearStart(multiPanelFixture(5)) },
    { name: 'maximum-source-210-nodes', ...maximumSourceFixture() },
    { name: 'long-punctuated-label', ...long },
  ];
}
export function materialize(f: RawFixture): SavedFixture & { spec: StoryboardSourceSpec } {
  const plan: unknown = JSON.parse(JSON.stringify(savedBoardFixture(f)));
  const parsed = validateSceneFirstLongformPlan(plan, f.words, f.duration);
  assert.ok(parsed.ok, parsed.ok ? '' : parsed.error);
  return {
    ...f,
    plan: parsed.value.plan,
    compiled: parsed.value.scenes,
    timeline: buildLongformSceneTimeline(parsed.value.plan, parsed.value.scenes),
  };
}
// Shift EVERY inclusive word reference, preserving exact source strings and absolute beat times.
export function shiftWordIndices(value: unknown, delta: number): unknown {
  if (Array.isArray(value)) return value.map((v) => shiftWordIndices(v, delta));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, v]) => [
      key,
      typeof v === 'number' && (key === 'word' || key.endsWith('Word'))
        ? v + delta
        : shiftWordIndices(v, delta),
    ]),
  );
}
export function mixedFixture(repetitions = 1, ordinary = true): SavedFixture {
  assert.ok(Number.isInteger(repetitions) && repetitions >= 1 && repetitions <= 3);
  const base = movingFixture();
  const words: RawFixture['words'] = [];
  const rawSpecs: unknown[] = [];
  for (let r = 0; r < repetitions; r++) {
    rawSpecs.push(shiftWordIndices(base.spec, words.length));
    words.push(
      ...base.words.map((w) => ({
        ...w,
        start: w.start + r * (base.duration + STORYBOARD_LIMITS.minSeparationSec),
        end: w.end + r * (base.duration + STORYBOARD_LIMITS.minSeparationSec),
      })),
    );
  }
  // Repeated boards must obey the real >90s / <=30% coverage / 10s separation policy.
  let duration =
    repetitions === 1
      ? base.duration + 1
      : Math.max(
          STORYBOARD_LIMITS.longSourceSec + 1,
          Math.ceil((repetitions * base.duration) / STORYBOARD_LIMITS.maxCoverage) + 1,
        );
  const specs: StoryboardSourceSpec[] = rawSpecs.map((raw) => {
    const compiled = compileStoryboardSpec(raw, words, { clipStart: 0, clipEnd: duration });
    assert.ok(compiled.ok, JSON.stringify(compiled));
    return compiled.value.sourceSpec;
  });
  const first = materialize({ spec: required(specs[0], 'first spec'), words, duration });
  const plan = first.plan;
  plan.scenes = specs.map((spec) => savedBoardFixture({ spec, words, duration }).scenes[0]);
  if (ordinary) {
    const startWord = words.length;
    const start = duration;
    'Save the source then review the scene plan and finally export the approved result.'
      .split(' ')
      .forEach((text, i) => {
        words.push({ text, start: start + i * 0.25, end: start + (i + 0.9) * 0.25 });
      });
    duration = Math.ceil((required(words.at(-1), 'last word').end + 1) * 30) / 30;
    const raw = {
      kind: 'checklist',
      startWord,
      endWord: words.length - 1,
      layout: 'stack',
      items: [
        { label: 'Save the source', word: startWord },
        { label: 'Review the scene plan', word: startWord + 4 },
        { label: 'Export the approved result', word: startWord + 10 },
      ],
    };
    const parsed = parseLongformSceneSpec(raw, words, { clipStart: 0, clipEnd: duration });
    assert.ok(parsed);
    plan.scenes.push({
      id: longformSceneId('checklist', raw.startWord, raw.endWord),
      kind: 'checklist',
      startWord: raw.startWord,
      endWord: raw.endWord,
      startTime: parsed.startTime,
      endTime: parsed.endTime,
      sectionId: 'section-fixture',
      presentation: 'speaker-side',
      sourceSpec: raw,
      label: 'Save, review, export',
      purpose: 'Authored local ordinary-scene control',
    });
  }
  plan.sourceDuration = duration;
  plan.sourceFingerprint = longformSourceFingerprint(words, duration);
  Object.assign(plan.sections[0], {
    endWord: words.length - 1,
    endTime: required(words.at(-1), 'last word').end,
  });
  const saved: unknown = JSON.parse(JSON.stringify(plan));
  const validated = validateSceneFirstLongformPlan(saved, words, duration);
  assert.ok(validated.ok, validated.ok ? '' : validated.error);
  return {
    words,
    duration,
    plan: validated.value.plan,
    compiled: validated.value.scenes,
    timeline: buildLongformSceneTimeline(validated.value.plan, validated.value.scenes),
  };
}
export function nodeCount(value: unknown): number {
  return (
    1 +
    (value && typeof value === 'object'
      ? Object.values(value).reduce<number>((s, v) => s + nodeCount(v), 0)
      : 0)
  );
}
