/**
 * v1 scene kinds (checklist, versus, stamp, flow, stack) as planner specs.
 * Also the reference implementation new kinds should mirror.
 */

import type { SceneCue } from '../../remotion/compositions/explainer/types';
import { type AnyKindSpec, type KindSpec, parseTimedList } from './kind-spec';

const L = {
  checklistTitle: 22,
  checklistLabel: 26,
  versusLabel: 18,
  stampWord: 10,
  flowLabel: 10,
  flowText: 16,
  engineLabel: 8,
  stackLabel: 18,
} as const;

export const checklistSpec: KindSpec<'checklist'> = {
  kind: 'checklist',
  describe:
    'they list steps/tasks/items (2-5). Each item ticks off on the word where they say it. Optional short title (e.g. "Human calls").',
  schema:
    '{"kind":"checklist","title":"..." or null,"items":[{"label":"...","icon":"Icon","word":N}]}',
  limits: `title ≤ ${L.checklistTitle}, item label ≤ ${L.checklistLabel}`,
  layouts: ['stack', 'stack-flipped', 'pip'],
  durationSec: [4, 12],
  family: 'list',
  general: true,
  triggers: [/\b(first|second|third|steps?|things|tips|list|checklist|need to|make sure)\b/],
  parse: (raw, ctx) => {
    const items = parseTimedList(
      raw.items,
      ctx,
      (it) => {
        const label = ctx.str(it.label, L.checklistLabel);
        return label ? { label, icon: ctx.icon(it.icon) } : null;
      },
      [2, 5],
    );
    if (!items) return null;
    const title = ctx.str(raw.title, L.checklistTitle);
    return {
      kind: 'checklist',
      ...(title ? { title } : {}),
      items: items.map((it) => ({ label: it.label, icon: it.icon, doneAt: it.t })),
    };
  },
  cues: (s) => [
    { kind: 'slide', at: 0.05, gain: 0.7 },
    ...s.items.map((it): SceneCue => ({ kind: 'tick', at: it.doneAt })),
  ],
};

export const versusSpec: KindSpec<'versus'> = {
  kind: 'versus',
  describe: 'they contrast two things (A vs B, AI vs people, before vs after).',
  schema:
    '{"kind":"versus","left":{"label":"...","icon":"Icon","word":N},"right":{"label":"...","icon":"Icon","word":N}}',
  limits: `side label ≤ ${L.versusLabel}`,
  layouts: ['stack', 'over', 'stack-flipped', 'pip'],
  durationSec: [3, 8],
  family: 'compare',
  triggers: [/\b(vs|versus|compared to|instead of|rather than|difference between|better than)\b/],
  avoid: 'old way → new way over time (before-after) or weighing two things (balance)',
  parse: (raw, ctx) => {
    const side = (
      s: unknown,
    ): { label: string; icon: ReturnType<typeof ctx.icon>; at: number } | null => {
      if (typeof s !== 'object' || s === null) return null;
      const r = s as Record<string, unknown>;
      const label = ctx.str(r.label, L.versusLabel);
      const w = ctx.inWin(r.word);
      return label && w !== null ? { label, icon: ctx.icon(r.icon), at: ctx.at(w) } : null;
    };
    const left = side(raw.left);
    const right = side(raw.right);
    if (!left || !right) return null;
    return { kind: 'versus', left, right: { ...right, at: Math.max(right.at, left.at) } };
  },
  cues: (s) => [
    { kind: 'slide', at: s.left.at, gain: 0.8 },
    { kind: 'slide', at: s.right.at, gain: 0.8 },
  ],
};

export const stampSpec: KindSpec<'stamp'> = {
  kind: 'stamp',
  describe:
    'a strong verdict or rule ("never", "yes, but", "stop", "always"). A hero icon plus a stamped word; optionally the icon gets crossed out.',
  schema: '{"kind":"stamp","icon":"Icon","word":"NEVER","stampWord":N,"strikeWord":N or null}',
  limits: `stamp word ≤ ${L.stampWord}`,
  layouts: ['stack', 'takeover', 'over'],
  durationSec: [2.5, 6],
  family: 'words',
  general: true,
  triggers: [/\b(never|always|stop|don't|wrong|must|rule|forbidden)\b/],
  parse: (raw, ctx) => {
    const word = ctx.str(raw.word, L.stampWord);
    const stampW = ctx.inWin(raw.stampWord);
    if (!word || stampW === null) return null;
    const stampAt = ctx.at(stampW);
    const strikeW = raw.strikeWord === null ? null : ctx.inWin(raw.strikeWord);
    return {
      kind: 'stamp',
      icon: ctx.icon(raw.icon),
      word: word.toUpperCase(),
      stampAt,
      ...(strikeW === null ? {} : { strikeAt: Math.max(stampAt, ctx.at(strikeW)) }),
    };
  },
  cues: (s) => [
    { kind: 'rise', at: Math.max(0, s.stampAt - 0.9), gain: 0.6 },
    { kind: 'thump', at: s.stampAt + 0.1 },
    ...(s.strikeAt === undefined ? [] : [{ kind: 'slide' as const, at: s.strikeAt, gain: 0.6 }]),
  ],
};

export const flowSpec: KindSpec<'flow'> = {
  kind: 'flow',
  describe:
    'an input goes through a system/process and comes out as something else (prompt -> AI -> answer, lead -> call -> deal). 3D.',
  schema:
    '{"kind":"flow","inputLabel":"Prompt","inputText":"...","engineLabel":"AI","outputLabel":"Answer","outputText":"...","inputWord":N,"outputWord":N}',
  limits: `flow labels ≤ ${L.flowLabel}, flow texts ≤ ${L.flowText}, engine label ≤ ${L.engineLabel}`,
  layouts: ['stack', 'takeover', 'pip', 'stack-flipped'],
  durationSec: [3.5, 10],
  family: 'process',
  triggers: [
    /\b(input|output|turns? (it |them |that )?into|feed it|becomes|generates?|converts?|transforms?)\b/,
  ],
  parse: (raw, ctx) => {
    const inputLabel = ctx.str(raw.inputLabel, L.flowLabel);
    const inputText = ctx.str(raw.inputText, L.flowText);
    const engineLabel = ctx.str(raw.engineLabel, L.engineLabel);
    const outputLabel = ctx.str(raw.outputLabel, L.flowLabel);
    const outputText = ctx.str(raw.outputText, L.flowText);
    const inW = ctx.inWin(raw.inputWord);
    const outW = ctx.inWin(raw.outputWord);
    if (!inputLabel || !inputText || !engineLabel || !outputLabel || !outputText) return null;
    if (inW === null || outW === null) return null;
    const inputAt = ctx.at(inW);
    // The engine needs ~1s between input and output for its spin to read.
    const outputAt = Math.min(ctx.lastBeat, Math.max(ctx.at(outW), inputAt + 1));
    if (outputAt - inputAt < 0.6) return null;
    return {
      kind: 'flow',
      inputLabel,
      inputText,
      engineLabel,
      outputLabel,
      outputText,
      inputAt,
      outputAt,
    };
  },
  cues: (s) => [
    { kind: 'slide', at: s.inputAt, gain: 0.7 },
    { kind: 'whoosh', at: s.inputAt + 0.35, gain: 0.6 },
    { kind: 'pop', at: s.outputAt, gain: 0.8 },
  ],
};

export const stackSpec: KindSpec<'stack'> = {
  kind: 'stack',
  describe: 'layers or levels that build on each other (2-4 layers, listed bottom to top). 3D.',
  schema: '{"kind":"stack","layers":[{"label":"...","word":N}],"dimWord":N or null}',
  limits: `layer label ≤ ${L.stackLabel}`,
  layouts: ['stack', 'takeover', 'pip'],
  durationSec: [3.5, 10],
  family: 'framework',
  triggers: [/\b(layers?|foundation|built on|on top of|stack|pyramid|levels?)\b/],
  avoid: 'a ranked list (ranking) or hidden depth under the surface (iceberg)',
  parse: (raw, ctx) => {
    const layers = parseTimedList(
      raw.layers,
      ctx,
      (l) => {
        const label = ctx.str(l.label, L.stackLabel);
        return label ? { label } : null;
      },
      [2, 4],
    );
    if (!layers) return null;
    const dimW = raw.dimWord === null ? null : ctx.inWin(raw.dimWord);
    const lastLayer = layers[layers.length - 1]?.t ?? ctx.win.startTime;
    return {
      kind: 'stack',
      layers: layers.map((l) => ({ label: l.label, at: l.t })),
      ...(dimW === null ? {} : { dimAt: Math.max(lastLayer + 0.4, ctx.at(dimW)) }),
    };
  },
  cues: (s) => [
    ...s.layers.map((l): SceneCue => ({ kind: 'tick', at: l.at + 0.25, gain: 0.9 })),
    ...(s.dimAt === undefined ? [] : [{ kind: 'whoosh' as const, at: s.dimAt, gain: 0.5 }]),
  ],
};

export const CORE_KIND_SPECS: readonly AnyKindSpec[] = [
  checklistSpec,
  versusSpec,
  stampSpec,
  flowSpec,
  stackSpec,
];
