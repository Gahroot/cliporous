// ---------------------------------------------------------------------------
// Long-Form Edit Plan — Hormozi-style 16:9 talking-head edit planning
//
// Analyzes a full-video transcript and produces two edit layers anchored to
// ABSOLUTE source-video timestamps:
//
//   1. Phrase emphasis — punchy 2–6 word beats shown as large floating text
//   2. Content blocks  — full-frame skinned data graphics at high-value moments
//
// Long videos are processed in windows (default 5 minutes) so the prompt stays
// within a comfortable size; per-window timestamps are already absolute
// because we feed the model absolute word times.
// ---------------------------------------------------------------------------

import { GoogleGenAI } from '@google/genai';
import {
  EDIT_CADENCE_PRESETS,
  type EditCadence,
  editCadenceGuidance,
  resolveEditCadence,
} from '@shared/edit-cadence';
import {
  MAX_LONGFORM_BLOCK_SECONDS,
  resolveLongformPlanOverlaps,
} from '@shared/longform-plan-timing';
import type {
  BlockPlacement,
  DelosCardKind,
  DelosCardPlacement,
  LongformBlockKind,
  LongformEditPlan,
  PhraseEmphasis,
  WordTimestamp,
} from '@shared/types';
import { log } from '../logger';
import { callGeminiWithRetry, type GeminiCall, MODELS } from './gemini-client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Window size (seconds) the transcript is chunked into for the AI call. */
const WINDOW_SECONDS = 300;

// ── Content-block cadence ──────────────────────────────────────────────────
// Blocks keep the video visually engaging — business viewers aren't goldfish,
// but a long talking head with nothing to look at loses them. The target is a
// block every ~8s of speech, with a quicker open. These numbers are the AI-side
// cap (an UPPER bound on what the model may emit per window); the timeline
// assembler in longform-pipeline.ts enforces the hard minimum gap between
// accepted blocks, so the model should over-supply candidates and let the
// assembler thin them to cadence.

/** Target one content block per this many seconds of speech (~one per 8s). */
const SECONDS_PER_BLOCK = 8;

// ── Intro phrase cadence ───────────────────────────────────────────────────
// Phrase overlays (floating lower-third emphasis text) only need punchy spoken
// words — not structured data — so they're the one density lever that works on
// a plain talking-head open. We push the model to over-supply phrases inside
// the intro window; downstream snap-zoom punches piggyback on phrase beats, so
// a denser intro automatically reads as more "cuts" too. Mirrors the block
// INTRO HOOK in render/longform-pipeline.ts (INTRO_SECONDS = 60).

/** Opening window (seconds, from video start) that runs the denser phrase pace. */
const INTRO_PHRASE_SECONDS = 60;
/** Target one intro phrase per this many seconds of speech (~one per 3.5s). */
const INTRO_SECONDS_PER_PHRASE = 3.5;
/** Never ask for fewer than this many blocks in a full-size window. */
const MIN_BLOCKS_PER_WINDOW = 2;
/** Never ask for more than this many blocks in a single window (anti-spam ceiling). */
const MAX_BLOCKS_PER_WINDOW = 36;

/**
 * Per-window upper bound on content blocks the model may emit. Scales with the
 * window's real duration (short trailing windows get fewer) at the target
 * cadence, then clamps to [MIN, MAX] so density stays sensible regardless of
 * window size. Deterministic: a given duration always yields the same cap.
 */
function maxBlocksForWindow(windowDurationSec: number): number {
  const target = Math.round(windowDurationSec / SECONDS_PER_BLOCK);
  // A very short trailing window can legitimately warrant a single block; only
  // apply the MIN floor once the window is long enough to host two at cadence.
  const floor =
    windowDurationSec >= SECONDS_PER_BLOCK * MIN_BLOCKS_PER_WINDOW ? MIN_BLOCKS_PER_WINDOW : 1;
  return Math.min(MAX_BLOCKS_PER_WINDOW, Math.max(floor, target));
}

// NOTE: 'callout' is intentionally omitted. It rendered as a full-frame text
// sentence on a dark backdrop — a text slate that read as "the screen went
// black." Text emphasis is now carried by the bottom lower-third PhraseOverlay,
// so the AI never emits a callout block. The composition stays registered for
// preview but is unreachable from a render.
const VALID_BLOCK_KINDS = new Set<LongformBlockKind>([
  'bar-chart',
  'comparison',
  'comparison-table',
  'stat-grid',
  'icon-stat-grid',
  'icon-row',
  'numbered-list',
  'checklist',
  'stat-hero',
  'progress-bars',
  'kpi-ticker',
  'quote-card',
  'portrait-quote',
  'tweet-card',
  'definition-card',
  'timeline',
  'timeline-cards',
  'feature-grid',
  'leaderboard',
  'donut',
  'funnel',
  'map',
]);

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildLongformPrompt(
  formattedTranscript: string,
  windowDurationSec: number,
  windowStart: number,
  feedback: readonly string[] = [],
): string {
  const baseMaxPhrases = Math.max(2, Math.round((windowDurationSec / 120) * 5));
  const maxBlocks = maxBlocksForWindow(windowDurationSec);

  // The intro window (the chunk that contains video time 0) gets an extra
  // phrase allowance sized to the denser intro pace, on top of the body quota
  // for the rest of the window. Only the first window can host intro time.
  const introCoverage =
    windowStart < INTRO_PHRASE_SECONDS
      ? Math.min(INTRO_PHRASE_SECONDS, windowStart + windowDurationSec) - windowStart
      : 0;
  const introPhraseBoost =
    introCoverage > 0 ? Math.round(introCoverage / INTRO_SECONDS_PER_PHRASE) : 0;
  const maxPhrases = baseMaxPhrases + introPhraseBoost;

  const introPhraseHint =
    introCoverage > 0
      ? `\n  - INTRO PHRASES: pack the first ${INTRO_PHRASE_SECONDS} seconds (any phrase with start < ${INTRO_PHRASE_SECONDS}) with emphasis text — aim for a NEW phrase roughly every ${INTRO_SECONDS_PER_PHRASE} seconds of speech (target ~${Math.round(
          Math.min(30, introCoverage) / INTRO_SECONDS_PER_PHRASE,
        )} phrases in the first 30s), then ease to the body pace. The open decides whether viewers stay, so give it the most emphasis text. Every phrase must still be real spoken words, 2-6 words, punchy.`
      : '';

  const feedbackInstructions = feedback.length
    ? `\nCREATOR FEEDBACK TO APPLY:\n${feedback
        .slice(0, 20)
        .map((item, index) => `  ${index + 1}. ${item.slice(0, 500)}`)
        .join(
          '\n',
        )}\nApply these notes where they are relevant to this transcript window. Keep every visual grounded in spoken evidence.\n`
    : '';

  return `You are a senior YouTube editor specializing in Alex Hormozi-style talking head videos.

Given this transcript window, produce an edit plan with two layers. All timestamps you return MUST be absolute seconds copied from the transcript word times below (do not invent times).${feedbackInstructions}

TRANSCRIPT (format: [absolute_start_sec|absolute_end_sec|word_text]):
${formattedTranscript}

PRODUCE:

1. PHRASE EMPHASIS — key phrases to display as large floating text over the speaker.
   - Select high-impact phrases that already appear in the speech.
   - Phrases should be 2-6 words, punchy, attention-grabbing.
   - start/end must bracket the spoken phrase (absolute seconds).

2. CONTENT BLOCKS — full-frame data graphics shown over the narration when the
   speech contains genuinely STRUCTURED content. Only emit a block when the
   words actually describe a list, comparison, set of numbers/stats, steps,
   timeline, definition, or quote. Do not invent data. When a numeric magnitude
   is not stated verbatim, estimate it as a normalized 0-1 value ("value").
   Every block needs: kind, start, end (absolute seconds, 3-6s span), a short
   uppercase "kicker" (2-4 words), and a "heading" (3-6 words). Pick the kind
   whose fields fit the spoken content:
   - "bar-chart": bars:[{label, value(0-1), valueLabel}] (3-5). Use for
     quantities compared across categories (revenue by quarter, etc.).
   - "stat-grid": stats:[{value, label}] (exactly 4). Use for 4 headline metrics.
   - "icon-stat-grid": items:[{icon, value, label}] (4). icon = a PascalCase
     lucide name (Users, DollarSign, Clock, Repeat). Like stat-grid w/ icons.
   - "icon-row": items:[{icon, label}] (3-4). Use for a short set of pillars.
   - "numbered-list": items:[{text, detail?}] (3-5). Use for ordered steps.
   - "checklist": items:[{text, done?}] (3-5). Use for a list of requirements.
   - "stat-hero": value(number), label, prefix?, suffix?, decimals?,
     trend?("up"|"down"), delta?. Use for ONE hero number. prefix "$" is for
     MONEY ONLY and combines with a magnitude suffix like "M"/"B" ("$1.2M") —
     never with a unit like "%" (percent), "s" (seconds), or "kg". Pick the
     unit that fits the value; do not mix a currency prefix with a unit suffix.
   - "progress-bars": bars:[{label, value(0-1), valueLabel}] (3-4). Use for
     proportions of a whole (how time/budget is split).
   - "donut": slices:[{label, value(0-1), valueLabel}] (2-4). Use for a
     proportional split of a whole shown as a ring (market share, budget
     allocation); values are normalized 0-1 shares that should sum to ~1.
   - "funnel": stages:[{label, value(0-1), valueLabel}] (3-5). Use for a
     narrowing funnel / hierarchy (audience→customers, sales pipeline); value
     drives each stage width and should DESCEND from top (1) to bottom.
   - "kpi-ticker": items:[{value, label, delta?, trend?}] (3-4). KPI strip.
   - "comparison" / "comparison-table": leftTitle, rightTitle,
     leftItems:[string] (2-4), rightItems:[string] (2-4),
     positiveSide:("left"|"right"). Use for X vs Y. positiveSide MUST identify
     the recommended, improved, or desirable side that receives green checks;
     the other side receives red X marks and muted styling. For a traditional/current
     way on the left versus a better way on the right, positiveSide is "right".
   - "quote-card": quote, name, role?. Use for a strong attributed quote.
   - "portrait-quote": quote, name, role?. A large pull-quote beside a portrait of the speaker (initials shown when no image). Use for a marquee attributed quote that deserves a face.
   - "definition-card": term, definition, partOfSpeech?. Use to define a term.
   - "timeline": steps:[{title, detail?}] (3-4). Use for a sequence over time.
   - "timeline-cards": steps:[{icon, title, detail?}] (3-4). Timeline w/ icons.
   - "feature-grid": items:[{icon, title, description}] (4). Use for features.
   - "leaderboard": rows:[{rank?, label, value}] (3-5). Use for a ranked Top-N
     (e.g. top channels by revenue); value is the display figure per row.
   - "tweet-card": name, handle, body, verified?, replies?, reposts?, likes?.
   - "map": pins:[{label, x(0-1), y(0-1), valueLabel?}] (1-6). Use when the speech references places, markets, or expansion ("we shipped to 30 countries"). x/y are NORMALIZED 0-1 positions on a stylized world map (x: 0=far left/Americas → 1=far right/Asia-Pacific; y: 0=top → 1=bottom), NOT real latitude/longitude coordinates.

CONSTRAINTS:
  - phrases: max ${maxPhrases} for this window.${introPhraseHint}
  - blocks: max ${maxBlocks} for this window. Aim to keep the viewer with
    something to look at roughly every 8 seconds of speech — be GENEROUS, the
    assembler thins blocks that land too close together, so over-supply rather
    than under-supply candidates. Favor VARIETY — across the video, reach for
    different block kinds rather than repeating one. Still anchor every block to
    real spoken content (a weak block is worse than none).
  - INTRO HOOK: pack the first 30 seconds (any block with start < 30) hard —
    aim for a NEW content block roughly every 5 seconds (target ~6 blocks in the
    first 30s), then keep the rest of the first 60s denser than the body. These
    viewers decide whether to keep watching in the opening seconds, so give the
    intro the most visual beats. CRITICAL: make every intro block a DIFFERENT
    kind — a downstream variety pass DROPS same-kind blocks that land close
    together, so two stat-heros (or two of any one kind) back-to-back in the
    intro will collapse to one. Rotate kinds (e.g. stat-hero → quote-card →
    icon-row → numbered-list → definition-card → comparison) so the dense open
    actually survives. Still anchor each to real spoken content in the hook.

Return ONLY a valid JSON object matching this exact schema (no markdown fences, no explanation):
{
  "phrases": [
    {"text": "FIRST $100,000", "start": 12.4, "end": 14.1}
  ],
  "blocks": [
    {"kind": "numbered-list", "start": 120.0, "end": 125.0, "kicker": "THE PLAYBOOK", "heading": "Three Steps To Start", "items": [{"text": "Validate the pain", "detail": "Ten conversations first"}, {"text": "Pre-sell the offer"}, {"text": "Ship the ugly version"}]},
    {"kind": "stat-hero", "start": 200.0, "end": 205.0, "kicker": "ONE YEAR IN", "heading": "Annual Revenue", "value": 1.2, "decimals": 1, "prefix": "$", "suffix": "M", "label": "Up from $310K", "trend": "up", "delta": "+287%"}
  ]
}`;
}

// ---------------------------------------------------------------------------
// Transcript formatting
// ---------------------------------------------------------------------------

function formatWindow(words: WordTimestamp[]): string {
  return words.map((w) => `[${w.start.toFixed(2)}|${w.end.toFixed(2)}|${w.text}]`).join('\n');
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

function parseWindowResponse(
  raw: string,
  windowStart: number,
  windowEnd: number,
): {
  phrases: PhraseEmphasis[];
  blocks: BlockPlacement[];
} {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { phrases: [], blocks: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return { phrases: [], blocks: [] };
  }
  const obj = parsed as Record<string, unknown>;

  const inRange = (start: number, end: number): boolean =>
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    end > start &&
    start >= windowStart - 1 &&
    start <= windowEnd + 1;

  // ---- Phrases -------------------------------------------------------------
  const phrases: PhraseEmphasis[] = [];
  for (const item of Array.isArray(obj.phrases) ? obj.phrases : []) {
    if (typeof item !== 'object' || item === null) continue;
    const p = item as Record<string, unknown>;
    const text = String(p.text ?? '').trim();
    const start = Number(p.start);
    const end = Number(p.end);
    if (text.length === 0 || !inRange(start, end)) continue;
    phrases.push({ text, startTime: start, endTime: end });
  }

  // ---- Content blocks ------------------------------------------------------
  const blocks = parseBlocks(obj.blocks, inRange);

  return { phrases, blocks };
}

// ---------------------------------------------------------------------------
// Block parsing — strict per-kind validation. Malformed items are dropped so a
// weak plan degrades to "fewer blocks", never a render crash.
// ---------------------------------------------------------------------------

function str(v: unknown): string {
  return v == null ? '' : String(v).trim();
}

function strList(v: unknown, max: number): string[] {
  return Array.isArray(v)
    ? v
        .map((x) => str(x))
        .filter((x) => x.length > 0)
        .slice(0, max)
    : [];
}

/** Clamp a number into [0,1]; returns 0 for non-finite input. */
function norm01(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Suffixes that legitimately combine with a currency prefix — magnitude
 * multipliers like "$1.2M", "$5B", "$90K". Any OTHER suffix is a real unit
 * ("%", "s", "kg", "mi", …) which a currency prefix contradicts, so a stray
 * currency prefix must be dropped from those.
 */
const CURRENCY_COMPATIBLE_SUFFIXES = new Set([
  'm',
  'b',
  'k',
  't',
  'bn',
  'mm',
  'million',
  'billion',
  'thousand',
  'trillion',
]);

/**
 * Resolve a stat-hero prefix/suffix pair, dropping a currency prefix that
 * contradicts a unit suffix. Examples: "$90%" → ("", "%"), "$5s" → ("", "s"),
 * "$1.2M" → ("$", "M"), "$90" → ("$", "").
 */
function resolveStatHeroUnits(
  prefix: string,
  suffix: string,
): {
  prefix: string;
  suffix: string;
} {
  const isCurrency = /^[$€£¥₹]/.test(prefix);
  if (!isCurrency || suffix.trim().length === 0) return { prefix, suffix };
  const firstToken = suffix.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  return CURRENCY_COMPATIBLE_SUFFIXES.has(firstToken) ? { prefix, suffix } : { prefix: '', suffix };
}

function parseBlocks(
  raw: unknown,
  inRange: (start: number, end: number) => boolean,
): BlockPlacement[] {
  const out: BlockPlacement[] = [];
  if (!Array.isArray(raw)) return out;

  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const b = item as Record<string, unknown>;
    const kind = str(b.kind) as LongformBlockKind;
    const start = Number(b.start);
    const end = Number(b.end);
    if (!VALID_BLOCK_KINDS.has(kind) || !inRange(start, end)) continue;

    const kicker = str(b.kicker);
    const heading = str(b.heading);
    // Most blocks require a heading; `callout` is hero-on-body, heading optional.
    if (heading.length === 0 && kind !== 'callout') continue;
    const accentColor = str(b.accentColor);
    const common = {
      startTime: start,
      // A malformed model response must be bounded before overlap resolution;
      // otherwise one early block can suppress every later edit in the window.
      endTime: Math.min(end, start + MAX_LONGFORM_BLOCK_SECONDS),
      kicker,
      heading,
      ...(accentColor ? { accentColor } : {}),
    };

    switch (kind) {
      case 'bar-chart':
      case 'progress-bars': {
        const bars = (Array.isArray(b.bars) ? b.bars : [])
          .map((x) => {
            const o = (x ?? {}) as Record<string, unknown>;
            return { label: str(o.label), value: norm01(o.value), valueLabel: str(o.valueLabel) };
          })
          .filter((x) => x.label.length > 0)
          .slice(0, 5);
        if (bars.length < 2) continue;
        out.push({ kind, ...common, bars });
        break;
      }
      case 'stat-grid': {
        const stats = (Array.isArray(b.stats) ? b.stats : [])
          .map((x) => {
            const o = (x ?? {}) as Record<string, unknown>;
            return { value: str(o.value), label: str(o.label) };
          })
          .filter((x) => x.value.length > 0)
          .slice(0, 4);
        if (stats.length < 2) continue;
        out.push({ kind, ...common, stats });
        break;
      }
      case 'icon-stat-grid': {
        const items = (Array.isArray(b.items) ? b.items : [])
          .map((x) => {
            const o = (x ?? {}) as Record<string, unknown>;
            return { icon: str(o.icon), value: str(o.value), label: str(o.label) };
          })
          .filter((x) => x.value.length > 0)
          .slice(0, 4);
        if (items.length < 2) continue;
        out.push({ kind, ...common, items });
        break;
      }
      case 'icon-row': {
        const items = (Array.isArray(b.items) ? b.items : [])
          .map((x) => {
            const o = (x ?? {}) as Record<string, unknown>;
            return { icon: str(o.icon), label: str(o.label) };
          })
          .filter((x) => x.label.length > 0)
          .slice(0, 4);
        if (items.length < 2) continue;
        out.push({ kind, ...common, items });
        break;
      }
      case 'numbered-list': {
        const items = (Array.isArray(b.items) ? b.items : [])
          .map((x) => {
            const o = (x ?? {}) as Record<string, unknown>;
            const detail = str(o.detail);
            return { text: str(o.text), ...(detail ? { detail } : {}) };
          })
          .filter((x) => x.text.length > 0)
          .slice(0, 5);
        if (items.length < 2) continue;
        out.push({ kind, ...common, items });
        break;
      }
      case 'checklist': {
        const items = (Array.isArray(b.items) ? b.items : [])
          .map((x) => {
            const o = (x ?? {}) as Record<string, unknown>;
            return { text: str(o.text), done: o.done === true };
          })
          .filter((x) => x.text.length > 0)
          .slice(0, 5);
        if (items.length < 2) continue;
        out.push({ kind, ...common, items });
        break;
      }
      case 'stat-hero': {
        const value = Number(b.value);
        const label = str(b.label);
        if (!Number.isFinite(value) || label.length === 0) continue;
        const decimals = Number.isFinite(Number(b.decimals)) ? Number(b.decimals) : undefined;
        const suffix = str(b.suffix);
        // A currency prefix only makes sense for money: it combines with a bare
        // number or a magnitude suffix ("$1.2M", "$5B"), but contradicts any real
        // unit ("%", "s", "kg", …). Drop the stray currency prefix in that case.
        const { prefix, suffix: resolvedSuffix } = resolveStatHeroUnits(str(b.prefix), suffix);
        const delta = str(b.delta);
        const trend = b.trend === 'up' || b.trend === 'down' ? b.trend : undefined;
        out.push({
          kind,
          ...common,
          value,
          label,
          ...(decimals != null ? { decimals } : {}),
          ...(prefix ? { prefix } : {}),
          ...(resolvedSuffix ? { suffix: resolvedSuffix } : {}),
          ...(trend ? { trend } : {}),
          ...(delta ? { delta } : {}),
        });
        break;
      }
      case 'kpi-ticker': {
        const items = (Array.isArray(b.items) ? b.items : [])
          .map((x) => {
            const o = (x ?? {}) as Record<string, unknown>;
            const delta = str(o.delta);
            const trend: 'up' | 'down' | undefined =
              o.trend === 'up' || o.trend === 'down' ? o.trend : undefined;
            return {
              value: str(o.value),
              label: str(o.label),
              ...(delta ? { delta } : {}),
              ...(trend ? { trend } : {}),
            };
          })
          .filter((x) => x.value.length > 0)
          .slice(0, 4);
        if (items.length < 2) continue;
        out.push({ kind, ...common, items });
        break;
      }
      case 'comparison':
      case 'comparison-table': {
        const leftTitle = str(b.leftTitle);
        const rightTitle = str(b.rightTitle);
        const leftItems = strList(b.leftItems, 4);
        const rightItems = strList(b.rightItems, 4);
        if (leftTitle.length === 0 || rightTitle.length === 0) continue;
        if (leftItems.length === 0 || rightItems.length === 0) continue;
        const positiveSide =
          b.positiveSide === 'left' || b.positiveSide === 'right' ? b.positiveSide : undefined;
        out.push({
          kind,
          ...common,
          leftTitle,
          rightTitle,
          leftItems,
          rightItems,
          ...(positiveSide ? { positiveSide } : {}),
        });
        break;
      }
      case 'quote-card': {
        const quote = str(b.quote);
        const name = str(b.name);
        if (quote.length === 0 || name.length === 0) continue;
        const role = str(b.role);
        out.push({ kind, ...common, quote, name, ...(role ? { role } : {}) });
        break;
      }
      case 'portrait-quote': {
        const quote = str(b.quote);
        const name = str(b.name);
        if (quote.length === 0 || name.length === 0) continue;
        const role = str(b.role);
        const imageUrl = str(b.imageUrl);
        out.push({
          kind,
          ...common,
          quote,
          name,
          ...(role ? { role } : {}),
          ...(imageUrl ? { imageUrl } : {}),
        });
        break;
      }
      case 'tweet-card': {
        const name = str(b.name);
        const handle = str(b.handle).replace(/^@/, '');
        const body = str(b.body);
        if (name.length === 0 || handle.length === 0 || body.length === 0) continue;
        const replies = str(b.replies);
        const reposts = str(b.reposts);
        const likes = str(b.likes);
        out.push({
          kind,
          ...common,
          name,
          handle,
          body,
          verified: b.verified === true,
          ...(replies ? { replies } : {}),
          ...(reposts ? { reposts } : {}),
          ...(likes ? { likes } : {}),
        });
        break;
      }
      case 'definition-card': {
        const term = str(b.term);
        const definition = str(b.definition);
        if (term.length === 0 || definition.length === 0) continue;
        const partOfSpeech = str(b.partOfSpeech);
        out.push({
          kind,
          ...common,
          term,
          definition,
          ...(partOfSpeech ? { partOfSpeech } : {}),
        });
        break;
      }
      case 'timeline': {
        const steps = (Array.isArray(b.steps) ? b.steps : [])
          .map((x) => {
            const o = (x ?? {}) as Record<string, unknown>;
            const detail = str(o.detail);
            return { title: str(o.title), ...(detail ? { detail } : {}) };
          })
          .filter((x) => x.title.length > 0)
          .slice(0, 4);
        if (steps.length < 2) continue;
        out.push({ kind, ...common, steps });
        break;
      }
      case 'timeline-cards': {
        const steps = (Array.isArray(b.steps) ? b.steps : [])
          .map((x) => {
            const o = (x ?? {}) as Record<string, unknown>;
            const detail = str(o.detail);
            return { icon: str(o.icon), title: str(o.title), ...(detail ? { detail } : {}) };
          })
          .filter((x) => x.title.length > 0)
          .slice(0, 4);
        if (steps.length < 2) continue;
        out.push({ kind, ...common, steps });
        break;
      }
      case 'feature-grid': {
        const items = (Array.isArray(b.items) ? b.items : [])
          .map((x) => {
            const o = (x ?? {}) as Record<string, unknown>;
            return { icon: str(o.icon), title: str(o.title), description: str(o.description) };
          })
          .filter((x) => x.title.length > 0)
          .slice(0, 4);
        if (items.length < 2) continue;
        out.push({ kind, ...common, items });
        break;
      }
      case 'leaderboard': {
        const rows = (Array.isArray(b.rows) ? b.rows : [])
          .map((x) => {
            const o = (x ?? {}) as Record<string, unknown>;
            const rank = Number(o.rank);
            return {
              label: str(o.label),
              value: str(o.value),
              ...(Number.isFinite(rank) ? { rank } : {}),
            };
          })
          .filter((x) => x.label.length > 0 && x.value.length > 0)
          .slice(0, 5);
        if (rows.length < 2) continue;
        out.push({ kind, ...common, rows });
        break;
      }
      case 'donut': {
        const slices = (Array.isArray(b.slices) ? b.slices : [])
          .map((x) => {
            const o = (x ?? {}) as Record<string, unknown>;
            return { label: str(o.label), value: norm01(o.value), valueLabel: str(o.valueLabel) };
          })
          .filter((x) => x.label.length > 0)
          .slice(0, 4);
        if (slices.length < 2) continue;
        out.push({ kind, ...common, slices });
        break;
      }
      case 'funnel': {
        const stages = (Array.isArray(b.stages) ? b.stages : [])
          .map((x) => {
            const o = (x ?? {}) as Record<string, unknown>;
            return { label: str(o.label), value: norm01(o.value), valueLabel: str(o.valueLabel) };
          })
          .filter((x) => x.label.length > 0)
          .slice(0, 5);
        if (stages.length < 2) continue;
        out.push({ kind, ...common, stages });
        break;
      }
      case 'callout': {
        const body = str(b.body);
        if (body.length === 0) continue;
        const attribution = str(b.attribution);
        out.push({ kind, ...common, body, ...(attribution ? { attribution } : {}) });
        break;
      }
      case 'map': {
        const pins = (Array.isArray(b.pins) ? b.pins : [])
          .map((x) => {
            const o = (x ?? {}) as Record<string, unknown>;
            const valueLabel = str(o.valueLabel);
            return {
              label: str(o.label),
              x: norm01(o.x),
              y: norm01(o.y),
              ...(valueLabel ? { valueLabel } : {}),
            };
          })
          .filter((x) => x.label.length > 0)
          .slice(0, 6);
        if (pins.length < 1) continue;
        out.push({ kind, ...common, pins });
        break;
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Post-merge variety pass
//
// Per-window prompting only asks for variety WITHIN a 5-minute window, so once
// the windows are merged the same block kind can cluster across boundaries
// (e.g. three bar-charts back-to-back). `diversifyBlocks` is a pure, deterministic
// pass that thins out same-kind clusters: a block of a given kind is only kept
// when it sits far enough (in time) from the previously kept block of that same
// kind, and the required spacing GROWS with how often that kind has already been
// used — so over-used kinds are penalized and the overall mix stays varied.
//
// It is conservative: it only ever DROPS blocks, never invents or reorders them,
// and a different kind always passes immediately. The first block of any kind is
// always kept, so the plan can never be emptied by this pass.
// ---------------------------------------------------------------------------

/** Base spacing (seconds) two blocks of the SAME kind must keep apart. */
const MIN_SAME_KIND_GAP_SECONDS = 20;

export function diversifyBlocks(blocks: BlockPlacement[]): BlockPlacement[] {
  if (blocks.length <= 1) return blocks;

  // Chronological order is the contract; sort defensively (stable on ties).
  const sorted = [...blocks].sort((a, b) => a.startTime - b.startTime);

  const kept: BlockPlacement[] = [];
  /** How many blocks of each kind we've already accepted. */
  const usesByKind = new Map<LongformBlockKind, number>();
  /** startTime of the last accepted block of each kind. */
  const lastStartByKind = new Map<LongformBlockKind, number>();

  for (const block of sorted) {
    const lastStart = lastStartByKind.get(block.kind);

    if (lastStart != null) {
      const uses = usesByKind.get(block.kind) ?? 0;
      // Required gap escalates with prior uses: 2nd needs 2×, 3rd needs 3×, …
      // This both blocks immediate same-kind succession (small real gaps) and
      // gently penalizes kinds that have already appeared several times.
      const requiredGap = MIN_SAME_KIND_GAP_SECONDS * (uses + 1);
      if (block.startTime - lastStart < requiredGap) {
        // Too close to the previous block of this kind — drop the weaker (later,
        // closer) one. The earlier block is always retained.
        continue;
      }
    }

    kept.push(block);
    usesByKind.set(block.kind, (usesByKind.get(block.kind) ?? 0) + 1);
    lastStartByKind.set(block.kind, block.startTime);
  }

  return kept;
}

// ---------------------------------------------------------------------------
// Deterministic pacing + opening variety
// ---------------------------------------------------------------------------

/** Evidence remains one ingredient, never a long uninterrupted sequence. */
export const MAX_CONSECUTIVE_EVIDENCE_CARDS = 2;

interface TimedBeat {
  startTime: number;
  endTime: number;
}

function buildTranscriptPhrase(
  words: readonly WordTimestamp[],
  rangeStart: number,
  rangeEnd: number,
): PhraseEmphasis | null {
  if (rangeEnd <= rangeStart) return null;
  let low = 0;
  let high = words.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (words[middle].start < rangeStart) low = middle + 1;
    else high = middle;
  }
  while (low < words.length && words[low].end <= words[low].start) low++;
  const anchorIndex = low;
  if (!words[anchorIndex] || words[anchorIndex].start >= rangeEnd) return null;

  const phraseWords: WordTimestamp[] = [];
  for (let index = anchorIndex; index < words.length && phraseWords.length < 5; index++) {
    const word = words[index];
    if (!word || word.start >= rangeEnd) break;
    const previous = phraseWords.at(-1);
    if (previous && word.start - previous.end > 0.8) break;
    if (word.text.trim()) phraseWords.push(word);
  }
  if (phraseWords.length < 2) return null;

  const first = phraseWords[0];
  const last = phraseWords.at(-1);
  if (!first || !last) return null;
  return {
    text: phraseWords
      .map((word) => word.text.trim())
      .join(' ')
      .replace(/\s+/g, ' ')
      .toUpperCase(),
    startTime: first.start,
    endTime: last.end,
  };
}

/**
 * Fill genuinely empty stretches with short transcript-grounded phrase beats.
 * This is deterministic insurance for sparse or partially failed AI windows;
 * authored blocks/phrases remain untouched and always take priority.
 */
export function addPacingPhraseFallbacks(
  phrases: PhraseEmphasis[],
  blocks: readonly TimedBeat[],
  words: readonly WordTimestamp[],
  videoDuration: number,
  editCadence?: EditCadence,
): PhraseEmphasis[] {
  const policy = EDIT_CADENCE_PRESETS[resolveEditCadence(editCadence)];
  const fallbackPhrases: PhraseEmphasis[] = [];
  const occupied: TimedBeat[] = [...blocks, ...phrases].sort(
    (left, right) => left.startTime - right.startTime || left.endTime - right.endTime,
  );
  let cursor = 0;
  let occupiedIndex = 0;

  while (cursor < videoDuration && phrases.length + fallbackPhrases.length < 2_000) {
    while (occupiedIndex < occupied.length && occupied[occupiedIndex].endTime <= cursor)
      occupiedIndex++;
    const current = occupied[occupiedIndex];
    const covering = current && current.startTime <= cursor ? current : undefined;
    if (covering) {
      cursor = covering.endTime;
      continue;
    }

    const next = occupied[occupiedIndex];
    const maxGap = cursor < INTRO_PHRASE_SECONDS ? policy.openingGap : policy.bodyGap;
    if (next && next.startTime - cursor <= maxGap) {
      cursor = Math.max(cursor + 0.05, next.endTime);
      continue;
    }

    const target = cursor + maxGap;
    const searchEnd = Math.min(videoDuration, target + 4, next?.startTime ?? videoDuration);
    const candidate = buildTranscriptPhrase(words, Math.max(cursor, target - 1), searchEnd);
    if (
      candidate &&
      (!next || Math.ceil(candidate.endTime * 30 - 1e-6) <= Math.floor(next.startTime * 30 + 1e-6))
    ) {
      fallbackPhrases.push(candidate);
      // Candidates are chronological; moving the cursor replaces inserting/sorting each one.
      cursor = candidate.endTime;
    } else {
      cursor = target;
    }
  }

  return [...phrases, ...fallbackPhrases].sort(
    (left, right) => left.startTime - right.startTime || left.endTime - right.endTime,
  );
}

/**
 * Break a card-only run with nearby spoken words. If no usable phrase exists,
 * drop the excess card rather than present an endless evidence-card sequence.
 */
export function enforceEvidenceCardVariety(
  plan: LongformEditPlan,
  words: readonly WordTimestamp[],
  maxConsecutiveCards: number = MAX_CONSECUTIVE_EVIDENCE_CARDS,
): LongformEditPlan {
  const beats = [
    ...plan.blocks.map((item) => ({ type: 'block' as const, item })),
    ...plan.phrases.map((item) => ({ type: 'phrase' as const, item })),
    ...(plan.cards ?? []).map((item) => ({ type: 'card' as const, item })),
  ].sort(
    (left, right) =>
      left.item.startTime - right.item.startTime || left.item.endTime - right.item.endTime,
  );

  const blocks: BlockPlacement[] = [];
  const phrases: PhraseEmphasis[] = [];
  const cards: DelosCardPlacement[] = [];
  let consecutiveCards = 0;
  let previousEnd = 0;

  for (const beat of beats) {
    if (beat.type === 'card' && consecutiveCards >= maxConsecutiveCards) {
      const interruption = buildTranscriptPhrase(words, previousEnd, beat.item.startTime);
      if (!interruption) continue;
      phrases.push(interruption);
      consecutiveCards = 0;
    }

    if (beat.type === 'block') blocks.push(beat.item);
    else if (beat.type === 'phrase') phrases.push(beat.item);
    else cards.push(beat.item);

    consecutiveCards = beat.type === 'card' ? consecutiveCards + 1 : 0;
    previousEnd = Math.max(previousEnd, beat.item.endTime);
  }

  return resolveLongformPlanOverlaps({ ...plan, blocks, phrases, cards });
}

// ---------------------------------------------------------------------------
// Delos pop-up card placement (approach A — transcript post-process)
//
// Cards are the additive lower-center overlay layer that keeps the speaker on
// screen while adding visual interest. We do NOT spend extra Gemini tokens on
// placement: we walk the transcript in fixed strides and emit one candidate
// card per stride, choosing the kind from cheap keyword signals. Content is
// filled later by `buildCardContent()` against each card's spoken window, and
// the final plan assembly rejects cards that overlap blocks or phrase overlays;
// the renderer keeps a defensive gate for older serialized plans.
// ---------------------------------------------------------------------------

/** Target spacing between card STARTS (seconds). Faster than the old 17s pace. */
export const SECONDS_PER_CARD = 12;
/** How long each card stays on screen (seconds). Short enough to keep the edit moving. */
export const CARD_DISPLAY_SECONDS = 4;
/** A card needs at least this many spoken words in its window to be worth it. */
const MIN_CARD_WORDS = 4;

/**
 * Text-forward card kinds, in rotation order. These distil the spoken words
 * into real on-screen text (findings / messages / labelled metrics / service
 * names), so they read as relevant rather than random. Pure-number cards
 * (`delos-biometric`, `delos-tracking-map`, `delos-matrix`) are intentionally
 * left OUT of the default rotation — their slots are decorative pseudo-data.
 */
const TEXT_FORWARD_KINDS: DelosCardKind[] = [
  'delos-scan-result',
  'delos-console',
  'delos-system-diagnostics',
  'delos-alert',
];

/** Hard default card kind (text-forward) used when rotation lookup is empty. */
const DEFAULT_CARD_KIND: DelosCardKind = 'delos-scan-result';

/**
 * Pick a card kind for a spoken window. Strong keyword signals win (so an
 * alert-sounding window gets an alert card, a numbers-heavy window gets a
 * console); otherwise rotate through the text-forward kinds for variety while
 * avoiding an immediate repeat of `prevKind`.
 */
export function selectCardKind(
  windowText: string,
  rotationIndex: number,
  prevKind?: DelosCardKind,
): DelosCardKind {
  const t = windowText.toLowerCase();

  let chosen: DelosCardKind | undefined;
  if (
    /\b(alert|critical|danger|warning|risk|threat|fail|failure|breach|emergency|problem|issue)\b/.test(
      t,
    )
  ) {
    chosen = 'delos-alert';
  } else if (
    /\b(system|status|health|uptime|online|offline|server|service|infrastructure|stack)\b/.test(t)
  ) {
    chosen = 'delos-system-diagnostics';
  } else if (
    /\b(percent|%|number|metric|rate|growth|revenue|profit|roi|conversion|data|stat|average)\b/.test(
      t,
    )
  ) {
    chosen = 'delos-console';
  } else if (
    /\b(step|first|second|third|next|then|process|checklist|list|result|finding|found|scan)\b/.test(
      t,
    )
  ) {
    chosen = 'delos-scan-result';
  }

  // Avoid repeating the previous kind back-to-back — fall through to rotation.
  if (!chosen || chosen === prevKind) {
    const n = TEXT_FORWARD_KINDS.length;
    const first = TEXT_FORWARD_KINDS[rotationIndex % n] ?? DEFAULT_CARD_KIND;
    const next = TEXT_FORWARD_KINDS[(rotationIndex + 1) % n] ?? DEFAULT_CARD_KIND;
    chosen = first === prevKind ? next : first;
  }
  return chosen;
}

/**
 * Walk the transcript in ~`SECONDS_PER_CARD` strides and emit one candidate
 * Delos card per stride that carries enough speech. Cards are anchored to the
 * first spoken word at/after each stride boundary and span `CARD_DISPLAY_SECONDS`
 * (clamped to the video). These are CANDIDATES only — final plan assembly drops
 * any that overlap a full-frame block or phrase overlay, so this pass stays
 * block-agnostic.
 */
export function planDelosCards(
  words: WordTimestamp[],
  videoDuration: number,
  secondsPerCard: number = SECONDS_PER_CARD,
  displaySeconds: number = CARD_DISPLAY_SECONDS,
): DelosCardPlacement[] {
  if (words.length === 0) return [];
  const totalDuration = Math.max(videoDuration, words[words.length - 1]?.end ?? 0);
  if (totalDuration <= 0) return [];

  const cards: DelosCardPlacement[] = [];
  let rotationIndex = 0;
  let prevKind: DelosCardKind | undefined;
  let lastEnd = -Infinity;

  for (let stride = 0; stride < totalDuration; stride += secondsPerCard) {
    // Anchor to the first word at/after the stride boundary so a card never
    // opens on silence.
    const anchor = words.find((w) => w.start >= stride && w.start < stride + secondsPerCard);
    if (!anchor) continue;

    const startTime = anchor.start;
    // Never overlap the previous card (defensive — strides are already spaced).
    if (startTime < lastEnd) continue;
    const endTime = Math.min(startTime + displaySeconds, totalDuration);
    if (endTime - startTime < 1) continue;

    const windowWords = words.filter((w) => w.end > startTime && w.start < endTime);
    if (windowWords.length < MIN_CARD_WORDS) continue;

    const sourceText = windowWords.map((w) => w.text).join(' ');
    const kind = selectCardKind(sourceText, rotationIndex, prevKind);

    cards.push({ kind, startTime, endTime, sourceText });
    prevKind = kind;
    rotationIndex++;
    lastEnd = endTime;
  }

  return cards;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export interface GenerateLongformEditPlanOptions {
  apiKey: string;
  /** Word-level transcript timestamps (absolute source-video seconds). */
  words: WordTimestamp[];
  /** Total video duration in seconds (used to bound the final window). */
  videoDuration: number;
  /** Focused creator feedback applied to each relevant transcript window. */
  feedback?: string[];
  /** Window size override in seconds (default 300). */
  windowSeconds?: number;
  /**
   * Invoked once per window before its Gemini call so the UI can advance with
   * "window N/total" granularity instead of freezing across the whole batch.
   */
  onProgress?: (progress: { window: number; total: number }) => void;
}

export interface LongformPhraseGenerationOptions {
  editCadence?: EditCadence;
  apiKey: string;
  words: readonly WordTimestamp[];
  videoDuration: number;
  /** Only speech starting inside these source-time ranges is sent to the model. */
  ranges: readonly { startTime: number; endTime: number }[];
  feedback?: readonly string[] | undefined;
  signal?: AbortSignal | undefined;
  windowSeconds?: number;
}

export interface LongformPhraseGeneration {
  phrases: PhraseEmphasis[];
  attemptedWindows: number;
  failedWindows: number;
}

/** Prompt marker; also lets offline tests route this request at the SDK boundary. */
export const LONGFORM_PHRASES_PROMPT_MARKER = 'LONGFORM_PHRASES_V1';

/**
 * Phrase emphasis selection from the legacy long-form planner, reused by the scene-first
 * planner. Same windows, prompt, model chain and parser; graphics are planned elsewhere, so
 * any returned blocks are discarded. Failed windows are skipped, never fatal.
 */
export async function generateLongformPhrases(
  options: LongformPhraseGenerationOptions,
): Promise<LongformPhraseGeneration> {
  const { words, videoDuration, signal } = options;
  const windowSeconds = options.windowSeconds ?? WINDOW_SECONDS;
  const inRanges = (time: number): boolean =>
    options.ranges.some((range) => time >= range.startTime && time < range.endTime);
  const ai = new GoogleGenAI({ apiKey: options.apiKey });
  const call: GeminiCall = {
    model: MODELS.BALANCED[0],
    fallbacks: MODELS.BALANCED.slice(1),
    config: { responseMimeType: 'application/json' },
    thinking: 'high',
  };
  const phrases: PhraseEmphasis[] = [];
  let attemptedWindows = 0;
  let failedWindows = 0;
  for (let windowStart = 0; windowStart < videoDuration; windowStart += windowSeconds) {
    signal?.throwIfAborted();
    const windowEnd = Math.min(windowStart + windowSeconds, videoDuration);
    const windowWords = words.filter(
      (word) => word.start >= windowStart && word.start < windowEnd && inRanges(word.start),
    );
    if (windowWords.length === 0) continue;
    attemptedWindows += 1;
    const prompt = `${LONGFORM_PHRASES_PROMPT_MARKER}\n${editCadenceGuidance(options.editCadence)}\nOnly PHRASE EMPHASIS is needed for this pass. Return "blocks": [] — animated graphics for this video are planned separately.\n${buildLongformPrompt(
      formatWindow(windowWords),
      windowEnd - windowStart,
      windowStart,
      [...(options.feedback ?? [])],
    )}`;
    const started = Date.now();
    try {
      const raw = await callGeminiWithRetry(ai, call, prompt, 'longform-phrases', signal);
      const parsed = parseWindowResponse(raw, windowStart, windowEnd).phrases;
      phrases.push(...parsed);
      log('info', 'longform-phrases', 'window planned', {
        windowStart,
        windowEnd,
        phrases: parsed.length,
        elapsedMs: Date.now() - started,
      });
    } catch (err) {
      signal?.throwIfAborted();
      failedWindows += 1;
      log('warn', 'longform-phrases', 'window failed, skipping', {
        windowStart,
        windowEnd,
        error: err instanceof Error ? err.message.slice(0, 300) : 'unknown',
        elapsedMs: Date.now() - started,
      });
    }
  }
  return { phrases, attemptedWindows, failedWindows };
}

/**
 * Generate a Hormozi-style long-form edit plan from a full-video transcript.
 *
 * Splits the transcript into time windows, runs one Gemini call per window,
 * and merges the results into a single plan with absolute timestamps and the
 * Hormozi accent colors applied.
 *
 * @throws When no API key is provided.
 */
export async function generateLongformEditPlan(
  options: GenerateLongformEditPlanOptions,
): Promise<LongformEditPlan> {
  const { apiKey, words, videoDuration } = options;
  const windowSeconds = options.windowSeconds ?? WINDOW_SECONDS;

  if (!apiKey) {
    throw new Error('Gemini API key is required to generate a long-form edit plan.');
  }

  const generatedAt = Date.now();

  if (words.length === 0) {
    return {
      phrases: [],
      blocks: [],
      cards: [],
      reasoning: 'No transcript words available.',
      generatedAt,
    };
  }

  const ai = new GoogleGenAI({ apiKey });
  const call: GeminiCall = {
    model: MODELS.BALANCED[0],
    fallbacks: MODELS.BALANCED.slice(1),
    config: { responseMimeType: 'application/json' },
    thinking: 'high',
  };

  const totalDuration = Math.max(videoDuration, words[words.length - 1]?.end ?? 0);
  const totalWindows = Math.ceil(totalDuration / windowSeconds);
  const allPhrases: PhraseEmphasis[] = [];
  const allBlocks: BlockPlacement[] = [];

  let windowIndex = 0;
  // Count windows we actually attempted (had speech) and how many threw, so a
  // single bad window (SAFETY block, spent rate-limit, malformed JSON) is
  // skipped instead of discarding every prior window's accumulated work.
  let attemptedWindows = 0;
  let failedWindows = 0;
  for (let windowStart = 0; windowStart < totalDuration; windowStart += windowSeconds) {
    windowIndex += 1;
    const windowEnd = Math.min(windowStart + windowSeconds, totalDuration);
    const windowWords = words.filter((w) => w.start >= windowStart && w.start < windowEnd);
    if (windowWords.length === 0) continue;

    options.onProgress?.({ window: windowIndex, total: totalWindows });
    attemptedWindows += 1;

    const prompt = buildLongformPrompt(
      formatWindow(windowWords),
      windowEnd - windowStart,
      windowStart,
      options.feedback ?? [],
    );
    try {
      const raw = await callGeminiWithRetry(ai, call, prompt, 'longform-edit-plan');
      const { phrases, blocks } = parseWindowResponse(raw, windowStart, windowEnd);
      allPhrases.push(...phrases);
      allBlocks.push(...blocks);
    } catch (err) {
      // Keep the accumulated phrases/blocks from prior windows and carry on; one
      // failed window must not sink the whole plan.
      failedWindows += 1;
      log(
        'warn',
        'longform-edit-plan',
        `window ${windowIndex}/${totalWindows} failed, skipping: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Every attempted window failed → there is no plan to salvage; surface it.
  if (attemptedWindows > 0 && failedWindows === attemptedWindows) {
    throw new Error(
      `Long-form edit plan failed: all ${attemptedWindows} window(s) errored during generation.`,
    );
  }

  // Sort everything chronologically. Blocks additionally pass through a global
  // variety pass so the same kind doesn't cluster across window boundaries
  // (diversifyBlocks already returns chronological order). No accent is stamped:
  // phrases and blocks inherit the brand palette downstream (no Hormozi gold).
  const byStart = <T extends { startTime: number }>(a: T, b: T): number =>
    a.startTime - b.startTime;

  const diversifiedBlocks = diversifyBlocks(allBlocks);

  // Resolve model-authored collisions first. Full-frame blocks win over phrase
  // overlays because the renderer cannot composite either layer concurrently.
  const authoredPlan = resolveLongformPlanOverlaps({
    phrases: [...allPhrases].sort(byStart),
    blocks: diversifiedBlocks,
    cards: [],
    reasoning: '',
    generatedAt,
  });

  // Sparse/failed AI windows receive transcript-grounded phrase beats before
  // deterministic cards are considered. Cards then fill only genuinely free
  // ranges, so review timing matches what the renderer can actually show.
  const pacedPhrases = addPacingPhraseFallbacks(
    authoredPlan.phrases,
    authoredPlan.blocks,
    words,
    totalDuration,
  );
  const cardCandidates = planDelosCards(words, totalDuration);
  const collisionFreePlan = resolveLongformPlanOverlaps({
    ...authoredPlan,
    phrases: pacedPhrases,
    cards: cardCandidates,
  });
  const finalPlan = enforceEvidenceCardVariety(collisionFreePlan, words);

  const partialNote =
    failedWindows > 0 ? ` ${failedWindows} of ${attemptedWindows} windows failed.` : '';

  return {
    ...finalPlan,
    reasoning: `Generated from ${words.length} words across ${Math.ceil(totalDuration / windowSeconds)} window(s). ${finalPlan.blocks.length} block(s), ${finalPlan.cards?.length ?? 0} card(s), ${finalPlan.phrases.length} phrase beat(s); timing conflicts resolved before review.${partialNote}`,
    generatedAt,
  };
}
