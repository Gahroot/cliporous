/**
 * v3 story & people kinds (quote, headline, journey, search, code) as planner
 * specs. Mirrors the structure of kinds-core.ts.
 */

import type { CodeLineTone, SceneCue } from '../../remotion/compositions/explainer/types';
import { type AnyKindSpec, type KindSpec, num, parseTimedList } from './kind-spec';
import { after } from './kinds-ideas';

const L = {
  quoteText: 90,
  quoteAuthor: 22,
  quoteRole: 22,
  outlet: 16,
  headline: 64,
  journeyLabel: 14,
  query: 36,
  result: 34,
  codeTitle: 18,
  codeLine: 34,
} as const;

export const quoteSpec: KindSpec<'quote'> = {
  kind: 'quote',
  describe:
    'they quote a named person or a famous saying ("as Naval says…", "my mentor told me…", "Buffett said"). A quote card with big quotation marks, the line, then the author (+ optional role).',
  schema:
    '{"kind":"quote","text":"...","author":"...","role":"..." or null,"word":N,"authorWord":N}',
  limits: `text ≤ ${L.quoteText}, author ≤ ${L.quoteAuthor}, role ≤ ${L.quoteRole}`,
  layouts: ['stack', 'over', 'takeover'],
  durationSec: [3, 9],
  family: 'words',
  triggers: [
    /\b(said|says|quote|told me|once said|famous|as \w+ (said|says|puts it)|in the words of|mentor)\b/,
  ],
  avoid: 'a text message or email (chat)',
  parse: (raw, ctx) => {
    const text = ctx.str(raw.text, L.quoteText);
    const author = ctx.str(raw.author, L.quoteAuthor);
    const w = ctx.inWin(raw.word);
    const authorW = ctx.inWin(raw.authorWord);
    if (!text || !author || w === null) return null;
    const at = ctx.at(w);
    const authorAt = after(ctx, authorW === null ? at + 1 : ctx.at(authorW), at, 0.6);
    const role =
      raw.role === null || raw.role === undefined ? null : ctx.str(raw.role, L.quoteRole);
    return { kind: 'quote', text, author, ...(role ? { role } : {}), at, authorAt };
  },
  cues: (s) => [
    { kind: 'slide', at: s.at, gain: 0.7 },
    { kind: 'tick', at: s.authorAt, gain: 0.7 },
  ],
};

export const headlineSpec: KindSpec<'headline'> = {
  kind: 'headline',
  describe:
    'they mention news, a headline, an announcement or something that "went viral" ("it was all over the news", "the headline said…"). A newspaper-style headline card slams in.',
  schema: '{"kind":"headline","outlet":"...","headline":"...","word":N}',
  limits: `outlet ≤ ${L.outlet}, headline ≤ ${L.headline}`,
  layouts: ['over', 'stack', 'takeover'],
  durationSec: [2.5, 6],
  family: 'words',
  triggers: [
    /\b(news|headline|headlines|article|announced|announcement|went viral|reported|breaking|press|journalist)\b/,
  ],
  avoid: 'a research finding with a source (study)',
  parse: (raw, ctx) => {
    const outlet = ctx.str(raw.outlet, L.outlet);
    const headline = ctx.str(raw.headline, L.headline);
    const w = ctx.inWin(raw.word);
    if (!outlet || !headline || w === null) return null;
    return { kind: 'headline', outlet, headline, at: ctx.at(w) };
  },
  cues: (s) => [
    { kind: 'whoosh', at: Math.max(0, s.at - 0.15), gain: 0.5 },
    { kind: 'thump', at: s.at + 0.2, gain: 0.55 },
  ],
};

export const journeySpec: KindSpec<'journey'> = {
  kind: 'journey',
  describe:
    'they tell a personal story with ups and downs ("I was broke, then it took off, then I lost it all, now…"). A curve draws through 3-5 moments at levels -2 (rock bottom) to 2 (peak).',
  schema: '{"kind":"journey","points":[{"label":"...","level":-2|-1|0|1|2,"word":N}]}',
  limits: `point label ≤ ${L.journeyLabel} (3-5 points, levels -2..2)`,
  layouts: ['stack', 'pip', 'takeover'],
  durationSec: [4, 12],
  family: 'story',
  triggers: [
    /\b(rock bottom|broke|lost everything|hit a wall|turning point|comeback|ups and downs|struggl\w*|breakthrough|my story|when i started)\b/,
  ],
  avoid: 'neutral steps in order (timeline) or climbing to a goal (stairs)',
  parse: (raw, ctx) => {
    const points = parseTimedList(
      raw.points,
      ctx,
      (p) => {
        const label = ctx.str(p.label, L.journeyLabel);
        const level = num(p.level, -2, 2);
        return label && level !== null ? { label, level: Math.round(level) } : null;
      },
      [3, 5],
    );
    if (!points) return null;
    // A flat line tells no story.
    if (new Set(points.map((p) => p.level)).size < 2) return null;
    return {
      kind: 'journey',
      points: points.map((p) => ({ label: p.label, level: p.level, at: p.t })),
    };
  },
  cues: (s) =>
    s.points.map(
      (p, i): SceneCue =>
        i > 0 && p.level < (s.points[i - 1]?.level ?? 0)
          ? { kind: 'thump', at: p.at, gain: 0.35 }
          : { kind: 'tick', at: p.at, gain: 0.8 },
    ),
};

export const searchSpec: KindSpec<'search'> = {
  kind: 'search',
  describe:
    'they say to search/google/look something up, or describe what people search for ("just google it", "people search \'how to…\'"). A search bar types the query; optional 1-3 short result lines drop in.',
  schema: '{"kind":"search","query":"...","typeWord":N,"results":["..."],"resultsWord":N or null}',
  limits: `query ≤ ${L.query}, each result ≤ ${L.result} (0-3 results)`,
  layouts: ['over', 'stack', 'pip'],
  durationSec: [2.5, 7],
  family: 'story',
  triggers: [
    /\b(google|googled|search|searched|searching|look it up|looked up|youtube it|type in|ask chatgpt)\b/,
  ],
  parse: (raw, ctx) => {
    const query = ctx.str(raw.query, L.query);
    const typeW = ctx.inWin(raw.typeWord);
    if (!query || typeW === null) return null;
    const typeAt = ctx.at(typeW);
    const results = (Array.isArray(raw.results) ? raw.results : [])
      .map((r) => ctx.str(r, L.result))
      .filter((r): r is string => r !== null)
      .slice(0, 3);
    const resultsW = ctx.inWin(raw.resultsWord);
    const scene = { kind: 'search' as const, query, typeAt, results: [] as string[] };
    if (results.length === 0) return scene;
    // Results land after the query has finished typing (~0.045 s per char).
    const typed = typeAt + 0.2 + query.length * 0.045;
    const resultsAt = after(ctx, resultsW === null ? typed + 0.3 : ctx.at(resultsW), typed, 0.2);
    return { ...scene, results, resultsAt };
  },
  cues: (s) => [
    { kind: 'tick', at: s.typeAt, gain: 0.55 },
    ...(s.resultsAt === undefined ? [] : [{ kind: 'slide' as const, at: s.resultsAt, gain: 0.6 }]),
  ],
};

const TONES: readonly CodeLineTone[] = ['plain', 'add', 'remove'];

export const codeSpec: KindSpec<'code'> = {
  kind: 'code',
  describe:
    'they talk about code, prompts, commands or a technical change ("I wrote one line of code", "run this command", "change this setting"). A dark editor/terminal window; 1-5 short lines type in; "add"/"remove" tint diff lines green/red.',
  schema:
    '{"kind":"code","title":"...","lines":[{"text":"...","tone":"plain|add|remove","word":N}]}',
  limits: `title ≤ ${L.codeTitle}, line ≤ ${L.codeLine} (1-5 lines)`,
  layouts: ['stack', 'over', 'pip'],
  durationSec: [3, 9],
  family: 'story',
  triggers: [
    /\b(code|coding|command|terminal|script|prompt|api|function|python|javascript|deploy|bug|developer|programm\w*)\b/,
  ],
  parse: (raw, ctx) => {
    const title = ctx.str(raw.title, L.codeTitle);
    const lines = parseTimedList(
      raw.lines,
      ctx,
      (l) => {
        const text = ctx.str(l.text, L.codeLine);
        const tone = TONES.find((t) => t === l.tone) ?? 'plain';
        return text ? { text, tone } : null;
      },
      [1, 5],
    );
    if (!title || !lines) return null;
    return {
      kind: 'code',
      title,
      lines: lines.map((l) => ({ text: l.text, tone: l.tone, at: l.t })),
    };
  },
  cues: (s) => s.lines.map((l): SceneCue => ({ kind: 'tick', at: l.at, gain: 0.55 })),
};

export const STORY_KIND_SPECS: readonly AnyKindSpec[] = [
  quoteSpec,
  headlineSpec,
  journeySpec,
  searchSpec,
  codeSpec,
];
