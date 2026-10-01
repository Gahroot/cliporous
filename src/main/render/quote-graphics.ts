/**
 * Quote graphics — an animated prop on the fullscreen-quote card.
 *
 * The quote card (flat sand backdrop, the spoken words burned in one at a
 * time at the frame centre by the caption pass) stays as it is. For each
 * quote segment whose words name something in the hero-prop catalog
 * ("idea" → lightbulb, "money" → coins, …), a `QuoteGraphic` render replaces
 * the flat backdrop: same sand colour, plus that prop popping in at the top
 * centre on the word that named it. No match → the plain card, unchanged.
 *
 * Deterministic (no model call): the catalog's transcript triggers pick the
 * prop, the earliest match wins. Any render failure keeps the plain card.
 * Sound cues are returned in SOURCE time for the post-concat SFX mix.
 */

import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PlanningObserver } from '../ai/explainer/planning-diagnostics';
import { log } from '../logger';
import {
  HERO_CATALOG,
  heroHasDownTone,
  heroImpactSec,
} from '../remotion/compositions/explainer/hero-catalog';
import {
  QUOTE_GRAPHIC_COMPOSITION_ID,
  QUOTE_GRAPHIC_HEIGHT,
  QUOTE_GRAPHIC_WIDTH,
  type QuoteGraphicProps,
} from '../remotion/compositions/explainer/quote-graphic';
import {
  EXPLAINER_FPS,
  HERO_PROPS,
  type HeroProp,
  type HeroTone,
  type SceneCue,
} from '../remotion/compositions/explainer/types';
import type { ResolvedSegment } from './segment-render';

/** Quote cards shorter than this stay plain — a prop would only flash. */
export const QUOTE_GRAPHIC_MIN_SEC = 1.2;
/** Earliest pop-in after the card appears (lets the cut land first). */
const MIN_APPEAR_SEC = 0.15;
/** Latest pop-in, as seconds before the card ends (room for the impact). */
const MIN_TAIL_SEC = 0.6;

/** Words that flip a prop to its reversed action (battery drains, lock opens). */
const DOWN_TONE_WORDS: Partial<Record<HeroProp, RegExp>> = {
  battery: /\b(drain|burn|tired|exhaust|empty)\w*/,
  lock: /\b(unlock|open)\w*/,
};

export interface QuoteWord {
  text: string;
  start: number;
  end: number;
}

export interface QuotePropPick {
  prop: HeroProp;
  /** Source time of the word that named the prop. */
  wordStart: number;
  tone?: HeroTone;
}

/**
 * Pick the prop for one quote window: the catalog trigger that matches
 * earliest in the window's words (catalog order breaks ties). Pure.
 */
export function pickQuoteProp(
  words: readonly QuoteWord[],
  window: { startTime: number; endTime: number },
  observe?: PlanningObserver,
): QuotePropPick | null {
  const inWindow = words.filter((w) => w.start >= window.startTime && w.start < window.endTime);
  if (inWindow.length === 0) return null;

  // Lowercased text with each word's char offset, so a (possibly
  // multi-word) match maps back to the word it starts in.
  let text = ' ';
  const offsets: number[] = [];
  for (const w of inWindow) {
    offsets.push(text.length);
    text += `${w.text.toLowerCase().replace(/[\u2018\u2019]/g, "'")} `;
  }

  let best: { prop: HeroProp; index: number; match: string } | null = null;
  for (const prop of HERO_PROPS) {
    const m = HERO_CATALOG[prop].triggers.exec(text);
    if (m && (best === null || m.index < best.index)) {
      best = { prop, index: m.index, match: m[0] };
    }
  }
  if (!best) return null;

  let wordIdx = 0;
  for (let i = 0; i < offsets.length; i++) {
    const off = offsets[i];
    if (off !== undefined && off <= best.index) wordIdx = i;
  }
  const word = inWindow[wordIdx];
  if (!word) return null;

  const down = DOWN_TONE_WORDS[best.prop];
  const tone: HeroTone | undefined =
    down && heroHasDownTone(best.prop) && down.test(best.match) ? 'down' : undefined;
  observe?.({
    stage: 'quote-prop',
    action: 'accepted',
    reason: 'deterministic-keyword',
    prop: best.prop,
  });
  return { prop: best.prop, wordStart: word.start, ...(tone ? { tone } : {}) };
}

/** Pop-in time relative to the card start, clamped inside the card. Pure. */
export function quotePropAppearSec(
  wordStart: number,
  window: { startTime: number; endTime: number },
): number {
  const dur = window.endTime - window.startTime;
  const latest = Math.max(MIN_APPEAR_SEC, dur - MIN_TAIL_SEC);
  const rel = wordStart - window.startTime;
  return Math.round(Math.min(latest, Math.max(MIN_APPEAR_SEC, rel)) * 1000) / 1000;
}

/** Sound cues (source time) for a prop that appears at `sourceAt`. Pure. */
export function quotePropCues(pick: QuotePropPick, sourceAt: number, endTime: number): SceneCue[] {
  const cues: SceneCue[] = [{ kind: 'whoosh', at: sourceAt, gain: 0.5 }];
  const impact = HERO_CATALOG[pick.prop].impactCue;
  const impactAt = sourceAt + heroImpactSec(pick.prop, pick.tone);
  if (impact && impactAt < endTime - 0.05) {
    cues.push({ kind: impact.kind, at: impactAt, gain: impact.gain });
  }
  return cues;
}

export interface QuoteGraphicsOptions {
  onDiagnostic?: PlanningObserver;
  segments: ResolvedSegment[];
  words: readonly QuoteWord[];
  /** Everything in `QuoteGraphicProps` except the per-card prop/timing. */
  colors: Omit<QuoteGraphicProps, 'prop' | 'at' | 'tone'>;
  isCancelled?: () => boolean;
  onProgress?: (message: string, fraction: number) => void;
}

export interface QuoteGraphicsResult {
  segments: ResolvedSegment[];
  tempFiles: string[];
  cues: SceneCue[];
}

export async function applyQuoteGraphics(opts: QuoteGraphicsOptions): Promise<QuoteGraphicsResult> {
  const jobs: { index: number; props: QuoteGraphicProps; cues: SceneCue[] }[] = [];
  opts.segments.forEach((seg, index) => {
    if (seg.archetype !== 'fullscreen-quote') return;
    if (seg.endTime - seg.startTime < QUOTE_GRAPHIC_MIN_SEC) return;
    const pick = pickQuoteProp(opts.words, seg, opts.onDiagnostic);
    if (!pick) return;
    const at = quotePropAppearSec(pick.wordStart, seg);
    jobs.push({
      index,
      props: { ...opts.colors, prop: pick.prop, at, ...(pick.tone ? { tone: pick.tone } : {}) },
      cues: quotePropCues(pick, seg.startTime + at, seg.endTime),
    });
  });

  const segments = [...opts.segments];
  const tempFiles: string[] = [];
  const cues: SceneCue[] = [];
  if (jobs.length === 0) return { segments, tempFiles, cues };

  const { renderRemotionSegment } = await import('../remotion/render');
  for (let n = 0; n < jobs.length; n++) {
    const job = jobs[n];
    const seg = job ? segments[job.index] : undefined;
    if (!job || !seg || opts.isCancelled?.()) break;
    const durationSec = seg.endTime - seg.startTime;
    const outputPath = join(tmpdir(), `batchcontent-quote-${randomUUID()}.mp4`);
    const message = `Animating quote card ${n + 1}/${jobs.length} (${job.props.prop})…`;
    const started = Date.now();
    opts.onProgress?.(message, n / jobs.length);
    try {
      await renderRemotionSegment({
        compositionId: QUOTE_GRAPHIC_COMPOSITION_ID,
        inputProps: job.props as unknown as Record<string, unknown>,
        durationSec,
        fps: EXPLAINER_FPS,
        width: QUOTE_GRAPHIC_WIDTH,
        height: QUOTE_GRAPHIC_HEIGHT,
        transparent: false,
        outputPath,
        onProgress: (p) => opts.onProgress?.(message, (n + p) / jobs.length),
      });
      tempFiles.push(outputPath);
      segments[job.index] = { ...seg, videoPath: outputPath };
      cues.push(...job.cues);
      opts.onDiagnostic?.({
        stage: 'quote-prop',
        action: 'rendered',
        reason: 'deterministic-render-complete',
        prop: job.props.prop,
        index: job.index,
      });
      log(
        'info',
        'quote-graphic',
        `rendered ${job.props.prop} at +${job.props.at}s on quote ${seg.startTime.toFixed(2)}–` +
          `${seg.endTime.toFixed(2)}s in ${Date.now() - started}ms`,
      );
    } catch (err) {
      opts.onDiagnostic?.({
        stage: 'quote-prop',
        action: 'fallback',
        reason: 'deterministic-render-failed',
        prop: job.props.prop,
        index: job.index,
      });
      log(
        'warn',
        'quote-graphic',
        `render failed (${job.props.prop}), keeping the plain quote card: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
  return { segments, tempFiles, cues: cues.sort((a, b) => a.at - b.at) };
}
