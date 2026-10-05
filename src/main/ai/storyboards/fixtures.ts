import {
  longformSceneId,
  longformSourceFingerprint,
  type SceneFirstLongformPlan,
} from '../../../shared/longform-scenes';
import { storyboardDefinitionFixture } from '../../../shared/storyboard-fixtures';
import type {
  LegacyStoryboardPanelKind,
  LegacyStoryboardSourceSpec,
  StoryboardAction,
  StoryboardLabel,
  StoryboardModel,
  StoryboardSourceSpec,
} from '../../../shared/storyboards';
import type { WordTimestamp } from '../../../shared/types';
import { compileStoryboardSpec } from './compiler';

/** Deterministic raw fixture inputs; no model calls or compiled snapshots. */
export function sourceLabel(
  words: readonly WordTimestamp[],
  text: string,
  offset = 0,
): StoryboardLabel {
  const tokens = text.split(' ');
  const startWord = words.findIndex(
    (_, i) => i >= offset && tokens.every((t, n) => words[i + n]?.text === t),
  );
  if (startWord < 0) throw new Error(`Missing fixture phrase: ${text}`);
  return { text, startWord, endWord: startWord + tokens.length - 1 };
}
export function boardFixture(
  kind: LegacyStoryboardPanelKind = 'statement',
  model: StoryboardModel = 'battery',
  action: StoryboardAction = 'reveal',
  offset = 17,
) {
  if (kind === 'statement') {
    const fixture = storyboardDefinitionFixture();
    return {
      ...fixture,
      words: fixture.words.map((w) => ({ ...w, start: w.start + offset, end: w.end + offset })),
      duration: fixture.duration + offset,
    };
  }
  const actions: Record<StoryboardModel, string> = {
    lightbulb: 'lights up',
    battery: 'charges',
    laptop: 'opens',
    hourglass: 'drains',
    clapperboard: 'claps',
    gears: 'turn',
    book: 'opens',
  };
  const actionText =
    action === 'deactivate' ? (model === 'battery' ? 'drains' : 'turns off') : actions[model];
  const sentences: Record<Exclude<LegacyStoryboardPanelKind, 'statement'>, string> = {
    comparison: 'System compares intake versus delivery while both retain their own source context',
    process: 'System intake then review then delivery then archive follows this source sequence',
    notes: 'System notes intake review delivery archive within this source explanation',
    quantity: 'System contains exactly 12 minutes of work in this source explanation',
    hero: `The ${model} ${actionText} during this source explanation`,
  };
  const text = `${sentences[kind]} with more spoken context for reading and the completed final hold`;
  const words = text
    .split(' ')
    .map((text, i) => ({ text, start: offset + 0.5 + i * 0.5, end: offset + 0.9 + i * 0.5 }));
  const label = (text: string) => sourceLabel(words, text);
  const endWord = words.length - 1;
  const base = {
    id: 'panel',
    startWord: 0,
    endWord,
    title: label(kind === 'hero' ? `The ${model}` : 'System'),
    revealWord: 0,
    moveWord: 0,
  };
  const prop = { id: 'object', model, action, atWord: 1, evidence: { startWord: 1, endWord: 1 } };
  const extras =
    kind === 'hero'
      ? { kind, caption: label(`${model} ${actionText}`), prop }
      : kind === 'quantity'
        ? { kind, value: 12, unit: label('minutes'), evidence: label('12 minutes') }
        : kind === 'comparison'
          ? {
              kind,
              left: label('intake'),
              right: label('delivery'),
              evidence: { startWord: 2, endWord: 4 },
            }
          : kind === 'process'
            ? {
                kind,
                items: ['intake', 'review', 'delivery', 'archive'].map(label),
                relationship: 'sequence' as const,
                evidence: { startWord: 1, endWord: 7 },
              }
            : { kind, items: ['intake', 'review', 'delivery', 'archive'].map(label) };
  const spec: StoryboardSourceSpec = {
    kind: 'storyboard',
    specVersion: 1,
    startWord: 0,
    endWord,
    subject: label(kind === 'hero' ? model : 'System'),
    panels: [{ ...base, ...extras }],
  };
  return { words, duration: words[endWord].end + 1, spec };
}

export function multiPanelFixture(count = 5, overview = false) {
  const words: WordTimestamp[] = [];
  const panels: LegacyStoryboardSourceSpec['panels'] = [];
  for (let p = 0; p < count; p++) {
    const startWord = words.length;
    'System notes intake review delivery archive battery remains visible while more source context continues'
      .split(' ')
      .forEach((text, i) => {
        words.push({ text, start: 20.5 + p * 7 + i * 0.4, end: 20.8 + p * 7 + i * 0.4 });
      });
    const label = (text: string) => sourceLabel(words, text, startWord);
    const battery = label('battery');
    panels.push({
      id: `p${p}`,
      kind: 'notes',
      startWord,
      endWord: words.length - 1,
      title: label('System notes'),
      revealWord: startWord,
      moveWord: startWord,
      items: ['intake', 'review', 'delivery', 'archive'].map(label),
      prop: {
        id: `battery${p}`,
        model: 'battery',
        action: 'reveal',
        atWord: battery.startWord,
        evidence: { startWord: battery.startWord, endWord: battery.endWord },
      },
    });
  }
  if (overview) {
    words.push(
      { text: 'System', start: 20.5 + count * 7, end: 20.8 + count * 7 },
      { text: 'recap', start: 23 + count * 7, end: 23.3 + count * 7 },
    );
    panels[panels.length - 1].endWord = words.length - 1;
  }
  const spec: StoryboardSourceSpec = {
    kind: 'storyboard',
    specVersion: 1,
    startWord: 0,
    endWord: words.length - 1,
    subject: sourceLabel(words, 'System'),
    panels,
    ...(overview ? { overview: { atWord: words.length - 2 } } : {}),
  };
  return { words, duration: words[words.length - 1].end + 1, spec };
}

export function savedBoardFixture(fixture = boardFixture()): SceneFirstLongformPlan {
  const { words, duration, spec } = fixture;
  const compiled = compileStoryboardSpec(JSON.parse(JSON.stringify(spec)), words, {
    clipStart: 0,
    clipEnd: duration,
  });
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
  return {
    schemaVersion: 2,
    parserVersion: 2,
    storyboardStyle: 'ink',
    mode: 'scene-first',
    sourceFingerprint: longformSourceFingerprint(words, duration),
    sourceDuration: duration,
    blocks: [],
    cards: [],
    phrases: [],
    generatedAt: 1,
    reasoning: 'Offline raw fixture',
    sections: [
      {
        id: 'section-fixture',
        startWord: 0,
        endWord: words.length - 1,
        startTime: words[0].start,
        endTime: words[words.length - 1].end,
        status: 'planned',
        diagnostics: [],
      },
    ],
    scenes: [
      {
        id: longformSceneId('storyboard', spec.startWord, spec.endWord),
        kind: 'storyboard',
        startWord: spec.startWord,
        endWord: spec.endWord,
        startTime: compiled.value.startTime,
        endTime: compiled.value.endTime,
        sectionId: 'section-fixture',
        presentation: 'full-frame',
        sourceSpec: JSON.parse(JSON.stringify(spec)),
        label: spec.subject.text,
        purpose: 'Explain this source',
      },
    ],
  };
}
