/**
 * Pure scene-canvas geometry: panel placement on the world strip, connector paths, the camera
 * shot list and a seeded handheld drift. No React and no clock — every value derives from the
 * validated panel timing, so any frame renders identically in isolation.
 *
 * Camera grammar (lead into the beat, exact rests, never fully still, pull back to show the
 * accumulated board) follows the MIT-licensed GG Motion camera rig in KenKaiii/gg-framework.
 */

import {
  collectSceneTimes,
  EXPLAINER_STAGE_HEIGHT,
  EXPLAINER_STAGE_WIDTH,
} from '../explainer/types';
import { boundedZoom, type CameraPose, cameraAt, seeded } from '../storyboard/camera';
import { textAdvance, wrapBoardText } from '../storyboard/text-layout';
import type { CameraShot, Pt } from '../storyboard/types';
import { SCENE_CANVAS_LIMITS, type SceneCanvasNote, type SceneCanvasPanel } from './types';

export const CANVAS_VIEW = { width: 1920, height: 1080 } as const;
/** Space between a panel's stage and its drawn frame. */
export const PANEL_PAD = 44;
const PANEL_GAP = 420;
const MAX_WANDER = 130;
/** The camera arrives this long before the panel's first spoken beat. */
export const ARRIVE_LEAD_SEC = 0.35;
const TRAVEL_SEC = 1.15;
const MIN_TRAVEL_SEC = 0.6;
const OVERVIEW_MOVE_SEC = 1.3;
const FADE_SEC = 0.35;
/** Rests at least this long get a slow push-in so a finished panel never sits still. */
const CREEP_MIN_SEC = 2;
const CREEP_ZOOM = 1.1;
/** Largest sideways re-frame during a rest, in screen pixels. */
const CREEP_PAN = 44;
/** Beat re-frames: how long each move takes and how close two may be. */
const BEAT_STEP_SEC = 1.1;
const BEAT_STEP_MIN_SEC = 1.6;
/** A drawing counts as finished this long after its beat (3D impacts land, viewer reads). */
const SETTLE_AFTER_LAST_BEAT_SEC = 1.8;
/** The board is back this long before a beat so the viewer sees it being drawn. */
const BEAT_LEAD_SEC = 0.5;
/** Idle board time: hold the overview briefly, then dissolve to the live speaker underneath. */
const OVERVIEW_HOLD_SEC = 0.8;
const BREAK_FADE_SEC = 0.5;
const MIN_SPEAKER_BREAK_SEC = 2.5;
/** Shorter idle stretches skip the overview and dissolve straight to the speaker. */
const MIN_DIRECT_BREAK_SEC = 1.2;
/** The board opens late (speaker first) only when its first drawing is at least this far in. */
const LATE_OPEN_MIN_SEC = 0.8;
/** Board notes: text size/wrap, spacing from the panel frame, sticky-note size. */
const NOTE_SIZE = 70;
const NOTE_WIDTH = 640;
const NOTE_GAP = 70;
const NOTE_TIER = 230;
/** Clear space kept between two notes (beyond their own ring/marker padding). */
const NOTE_CLEARANCE = 28;
const STICKY_WIDTH = 420;
const STICKY_MIN_HEIGHT = 260;
const STICKY_TEXT_SIZE = 46;
/** Sticky-note padding: top (under the tape) + bottom, and left + right. */
const STICKY_PAD = { v: 50, h: 40 } as const;
const STICKY_MAX_CHARS = 32;
/** A note this close before a panel starts already belongs to that panel. */
const NOTE_ANCHOR_LEAD_SEC = 1.6;
/** Camera widens onto a note slightly before it is written, then lets it be read. */
const NOTE_LEAD_SEC = 0.35;
const NOTE_MOVE_SEC = 0.9;
const NOTE_SETTLE_SEC = 2.4;

export interface PanelBox {
  id: string;
  /** Stage origin (top-left of the 1080×960 stage) in world pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasConnector {
  from: Pt;
  to: Pt;
  at: number;
  dur: number;
}

export interface CanvasLayout {
  panels: PanelBox[];
  connectors: CanvasConnector[];
  shots: CameraShot[];
  /** Seconds each frame starts sketching on, by panel index. */
  frameAt: number[];
  fadeIn: { at: number; dur: number };
  fadeOut: { at: number; dur: number };
  /** Board dissolves out at `out` and back in at `in`, revealing the speaker in between. */
  breaks: { out: number; in: number; dur: number }[];
  notes: PlacedNote[];
}

/** A board note laid out in world pixels, written on at `at` (canvas-local seconds). */
export interface PlacedNote {
  id: string;
  text: string;
  at: number;
  /** Index of the panel the note is drawn beside. */
  anchor: number;
  /** Handwriting with a marker swipe, ringed accent text, or a taped sticky note. */
  style: 'write' | 'circled' | 'sticky';
  /** Top-left of the note's text block (sticky: the paper) in world pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Text size; sticky notes use their own smaller paper text. */
  size: number;
  /** Short hand-drawn arrow from the note to its panel's frame. */
  arrow: { from: Pt; to: Pt };
}

const W = EXPLAINER_STAGE_WIDTH;
const H = EXPLAINER_STAGE_HEIGHT;

function centre(box: PanelBox): Pt {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Pose that frames one panel with its drawn border and a little breathing room. */
export function focusPose(box: PanelBox): CameraPose {
  const zoom = Math.min(
    CANVAS_VIEW.width / (box.width + PANEL_PAD * 2 + 120),
    CANVAS_VIEW.height / (box.height + PANEL_PAD * 2 + 70),
  );
  return { ...centre(box), zoom: boundedZoom(Math.min(1, zoom)) };
}

/** Pose that shows every listed panel at once. */
export function overviewPose(boxes: readonly PanelBox[]): CameraPose {
  const first = boxes[0];
  if (!first) return { x: 0, y: 0, zoom: 1 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const b of boxes) {
    minX = Math.min(minX, b.x - PANEL_PAD);
    minY = Math.min(minY, b.y - PANEL_PAD);
    maxX = Math.max(maxX, b.x + b.width + PANEL_PAD);
    maxY = Math.max(maxY, b.y + b.height + PANEL_PAD);
  }
  const zoom = Math.min(
    (CANVAS_VIEW.width * 0.9) / (maxX - minX),
    (CANVAS_VIEW.height * 0.86) / (maxY - minY),
  );
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, zoom: boundedZoom(Math.min(1, zoom)) };
}

/** Left→right strip on a gently wandering, seeded baseline — never a rigid grid. */
export function placePanels(panels: readonly Pick<SceneCanvasPanel, 'id'>[]): PanelBox[] {
  const seed = panels.map((p) => p.id).join('|');
  return panels.map((p, i) => ({
    id: p.id,
    x: i * (W + PANEL_PAD * 2 + PANEL_GAP),
    y: i === 0 ? 0 : Math.round((seeded(seed, i) * 2 - 1) * MAX_WANDER),
    width: W,
    height: H,
  }));
}

function shot(at: number, dur: number, pose: CameraPose): CameraShot {
  return { at, dur, x: pose.x, y: pose.y, zoom: pose.zoom };
}

/** Panels must be sorted, non-overlapping and inside [0, durationSec]. */
export function sceneCanvasProblem(
  panels: readonly SceneCanvasPanel[],
  durationSec: number,
): string | null {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 'Invalid canvas duration.';
  if (panels.length < 1 || panels.length > SCENE_CANVAS_LIMITS.maxPanels)
    return 'Invalid canvas panel count.';
  let previousEnd = 0;
  for (const p of panels) {
    if (
      !Number.isFinite(p.startSec) ||
      !Number.isFinite(p.endSec) ||
      p.startSec < previousEnd - 1e-6 ||
      p.endSec <= p.startSec ||
      p.endSec > durationSec + 1e-6
    )
      return `Canvas panel ${p.id} has invalid timing.`;
    previousEnd = p.endSec;
  }
  return null;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function panelRect(box: PanelBox): Rect {
  return {
    x: box.x - PANEL_PAD,
    y: box.y - PANEL_PAD,
    w: box.width + PANEL_PAD * 2,
    h: box.height + PANEL_PAD * 2,
  };
}

/** Pose that fits every rect with a margin. */
function boundsPose(rects: readonly Rect[]): CameraPose {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, zoom: 1 };
  const zoom = Math.min(
    (CANVAS_VIEW.width * 0.9) / (maxX - minX),
    (CANVAS_VIEW.height * 0.86) / (maxY - minY),
  );
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, zoom: boundedZoom(Math.min(1, zoom)) };
}

/** Where a note's slot sits relative to its panel; cycles around the panel, then tiers out. */
const NOTE_SLOTS = [
  { v: 'below', h: 'left' },
  { v: 'above', h: 'right' },
  { v: 'below', h: 'right' },
  { v: 'above', h: 'left' },
] as const;

/** Sticky paper text wraps with conservative monospace advances so every skin fits. */
export function stickyLines(text: string): string[] {
  return wrapBoardText(text, STICKY_TEXT_SIZE, STICKY_WIDTH - STICKY_PAD.h, true);
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Most tiers tried before a note may sit anywhere free; beyond that it stacks outward. */

/**
 * Board notes: short source phrases drawn around the panel they belong to, in order. Every note
 * takes the first free slot around its panel (then further out), so a later note never covers
 * an earlier one or a panel and the closing overview still reads.
 */
export function placeCanvasNotes(
  panels: readonly SceneCanvasPanel[],
  boxes: readonly PanelBox[],
  notes: readonly SceneCanvasNote[],
): PlacedNote[] {
  const perAnchor = new Map<number, number>();
  const taken: Rect[] = boxes.map(panelRect);
  const ordered = [...notes].sort((a, b) => a.startSec - b.startSec || a.id.localeCompare(b.id));
  return ordered.flatMap((note, index): PlacedNote[] => {
    let anchor = 0;
    for (const [i, p] of panels.entries())
      if (note.startSec >= p.startSec - NOTE_ANCHOR_LEAD_SEC) anchor = i;
    const box = boxes[anchor];
    if (!box) return [];
    const k = perAnchor.get(anchor) ?? 0;
    perAnchor.set(anchor, k + 1);
    const sticky = index % 3 === 2 && note.text.length <= STICKY_MAX_CHARS;
    const style: PlacedNote['style'] = sticky ? 'sticky' : index % 3 === 1 ? 'circled' : 'write';
    const size = sticky ? STICKY_TEXT_SIZE : style === 'circled' ? NOTE_SIZE * 1.1 : NOTE_SIZE;
    const lines = sticky ? stickyLines(note.text) : wrapBoardText(note.text, size, NOTE_WIDTH);
    const w = sticky
      ? STICKY_WIDTH
      : Math.ceil(Math.max(...lines.map((line) => textAdvance(line, size))));
    const h = sticky
      ? Math.max(STICKY_MIN_HEIGHT, Math.ceil(STICKY_PAD.v + lines.length * size * 1.2))
      : Math.ceil(lines.length * size * 1.2);
    const jitter = (seeded(note.id, 5) * 2 - 1) * 40;
    const candidate = (s: number, tier: number) => {
      const slot = NOTE_SLOTS[(k + s) % NOTE_SLOTS.length] ?? NOTE_SLOTS[0];
      const x = slot.h === 'left' ? box.x + 30 + jitter : box.x + box.width - w - 30 + jitter;
      const offset = NOTE_GAP + tier * NOTE_TIER;
      const y =
        slot.v === 'below'
          ? box.y + box.height + PANEL_PAD + offset
          : box.y - PANEL_PAD - offset - h;
      return { slot, x, y };
    };
    const clear = (c: { x: number; y: number }): boolean => {
      const r = noteRect({ style, x: c.x, y: c.y, w, h });
      const grown = {
        x: r.x - NOTE_CLEARANCE,
        y: r.y - NOTE_CLEARANCE,
        w: r.w + NOTE_CLEARANCE * 2,
        h: r.h + NOTE_CLEARANCE * 2,
      };
      return !taken.some((t) => rectsOverlap(grown, t));
    };
    let spot = candidate(0, Math.floor(k / NOTE_SLOTS.length));
    // Finite occupied rectangles guarantee a free tier farther out; never use an unchecked slot.
    search: for (let tier = 0; ; tier++)
      for (let s = 0; s < NOTE_SLOTS.length; s++) {
        const c = candidate(s, tier);
        if (clear(c)) {
          spot = c;
          break search;
        }
      }
    const { slot, x, y } = spot;
    taken.push(noteRect({ style, x, y, w, h }));
    const cx = x + w / 2;
    const toward = (seeded(note.id, 6) * 2 - 1) * 60;
    const arrow =
      slot.v === 'below'
        ? {
            from: { x: cx, y: y - 16 },
            to: { x: cx + toward, y: box.y + box.height + PANEL_PAD + 12 },
          }
        : { from: { x: cx, y: y + h + 16 }, to: { x: cx + toward, y: box.y - PANEL_PAD - 12 } };
    // A note never starts before its own canvas; its marks follow the handwriting.
    return [
      {
        id: note.id,
        text: note.text,
        at: Math.max(0, note.startSec),
        anchor,
        style,
        x,
        y,
        w,
        h,
        size,
        arrow,
      },
    ];
  });
}

function noteRect(n: Pick<PlacedNote, 'style' | 'x' | 'y' | 'w' | 'h'>): Rect {
  // Circled notes need room for the ring that loops around them.
  const pad = n.style === 'circled' ? 40 : 16;
  return { x: n.x - pad, y: n.y - pad, w: n.w + pad * 2, h: n.h + pad * 2 };
}

export function buildCanvasLayout(
  panels: readonly SceneCanvasPanel[],
  durationSec: number,
  notes: readonly SceneCanvasNote[] = [],
  /** The board must be gone by this canvas-local time (a speaker overlay starts there). */
  closeBySec = durationSec,
): CanvasLayout {
  const problem = sceneCanvasProblem(panels, durationSec);
  if (problem) throw new Error(problem);
  const boxes = placePanels(panels);
  const first = boxes[0];
  if (!first) throw new Error('Canvas has no panels.');
  const placed = placeCanvasNotes(panels, boxes, notes);
  const seed = panels.map((p) => p.id).join('|');
  const shots: CameraShot[] = [shot(0, 0, focusPose(first))];
  const connectors: CanvasConnector[] = [];
  const breaks: CanvasLayout['breaks'] = [];
  const frameAt: number[] = [0];
  // Absolute beat times per panel: the camera re-frames as each new item is drawn.
  const beatsOf = (i: number): number[] => {
    const p = panels[i];
    if (!p) return [];
    return collectSceneTimes(p.scene).map((t) => p.startSec + t);
  };
  const notesOf = (i: number): PlacedNote[] => placed.filter((n) => n.anchor === i);
  let rest: { pose: CameraPose; at: number; scale: number; beats: number[] } | null = {
    pose: focusPose(first),
    at: 0,
    scale: CREEP_ZOOM,
    beats: beatsOf(0),
  };
  /**
   * A long rest never holds still: a short re-frame on each spaced-out beat, each one a little
   * tighter and to the other side, then a slow push-in through whatever hold remains.
   */
  const flushRest = (until: number): void => {
    const r = rest;
    rest = null;
    if (!r || until - r.at < CREEP_MIN_SEC) return;
    const steps: number[] = [];
    for (const beat of r.beats) {
      const lastStep = steps[steps.length - 1] ?? r.at;
      if (beat > r.at + 0.4 && beat < until - 1.2 && beat - lastStep >= BEAT_STEP_MIN_SEC)
        steps.push(beat);
    }
    const n = steps.length + 1;
    const side = seeded(seed, 20 + shots.length) < 0.5 ? -1 : 1;
    const poseAt = (k: number): CameraPose => ({
      x: r.pose.x + (k % 2 === 0 ? side : -side) * (CREEP_PAN / r.pose.zoom) * (0.5 + k / n / 2),
      y: r.pose.y,
      zoom: boundedZoom(r.pose.zoom * r.scale ** (k / n)),
    });
    let at = r.at;
    for (const [k, beat] of steps.entries()) {
      // Re-frame toward the beat, landing just after the item appears.
      const moveAt = Math.max(at, beat - 0.25);
      shots.push(shot(moveAt, Math.min(BEAT_STEP_SEC, until - moveAt), poseAt(k + 1)));
      at = moveAt + BEAT_STEP_SEC;
    }
    if (until - at >= 1) shots.push(shot(at, until - at, poseAt(n)));
  };
  const push = (s: CameraShot, scale = CREEP_ZOOM, beats: number[] = []): void => {
    flushRest(s.at);
    const last = shots[shots.length - 1];
    const at = Math.max(s.at, last ? last.at : 0);
    shots.push({ ...s, at });
    rest = { pose: { x: s.x, y: s.y, zoom: s.zoom }, at: at + s.dur, scale, beats };
  };
  /**
   * When the board around panel `i` has nothing left to draw: its own last beat plus time to
   * land, or its last note plus time to read, whichever is later.
   */
  const doneAt = (i: number): number => {
    const p = panels[i];
    if (!p) return 0;
    const beats = beatsOf(i);
    const lastBeat = beats[beats.length - 1];
    const own =
      lastBeat === undefined
        ? p.endSec
        : Math.min(p.endSec, Math.max(p.startSec + 1, lastBeat + SETTLE_AFTER_LAST_BEAT_SEC));
    const lastNote = notesOf(i).at(-1);
    return lastNote ? Math.max(own, lastNote.at + NOTE_SETTLE_SEC) : own;
  };
  /** Everything drawn so far, for overview poses. */
  const storyRects = (upTo: number, at: number): Rect[] => [
    ...boxes.slice(0, upTo + 1).map(panelRect),
    ...placed.filter((n) => n.anchor <= upTo && n.at <= at + 1e-6).map(noteRect),
  ];
  /** Pull back to the story so far, then dissolve to the live speaker; returns the fade-out time. */
  const overviewThenOut = (from: number, i: number): number => {
    push(shot(from, OVERVIEW_MOVE_SEC, boundsPose(storyRects(i - 1, from))), 1.04);
    return from + OVERVIEW_MOVE_SEC + OVERVIEW_HOLD_SEC;
  };
  /**
   * Walk one panel's drawings (beats and notes) in order. The camera widens onto each new note.
   * Whenever nothing new is drawn for a while the board hands back to the live speaker (after a
   * pull-back to the story so far when there is time), then returns just before the next drawing.
   */
  const visitPanel = (i: number): void => {
    const box = boxes[i];
    if (!box) return;
    const own = notesOf(i);
    const beats = beatsOf(i);
    const marks = [
      ...beats.map((t) => ({ t, note: undefined as PlacedNote | undefined })),
      ...own.map((note) => ({ t: note.at, note })),
    ].sort((a, b) => a.t - b.t);
    let written = 0;
    const poseNow = (): CameraPose =>
      boundsPose([panelRect(box), ...own.slice(0, written).map(noteRect)]);
    let busyUntil: number | null = null;
    for (const mark of marks) {
      const back = mark.t - (mark.note ? NOTE_LEAD_SEC : BEAT_LEAD_SEC);
      const inAt = back - BREAK_FADE_SEC;
      if (busyUntil !== null) {
        const idle = busyUntil;
        const overviewOut = idle + OVERVIEW_MOVE_SEC + OVERVIEW_HOLD_SEC;
        const story = storyRects(i, idle);
        if (story.length > 1 && inAt - (overviewOut + BREAK_FADE_SEC) >= MIN_SPEAKER_BREAK_SEC) {
          breaks.push({ out: overviewThenOut(idle, i + 1), in: inAt, dur: BREAK_FADE_SEC });
          // Zoom back in from the overview as the board returns.
          if (!mark.note) push(shot(inAt, back - inAt + 0.5, poseNow()), CREEP_ZOOM, beats);
        } else if (inAt - (idle + BREAK_FADE_SEC) >= MIN_DIRECT_BREAK_SEC)
          breaks.push({ out: idle, in: inAt, dur: BREAK_FADE_SEC });
      }
      if (mark.note) {
        written++;
        push(shot(mark.note.at - NOTE_LEAD_SEC, NOTE_MOVE_SEC, poseNow()), 1.05, beats);
      }
      const settled = mark.t + (mark.note ? NOTE_SETTLE_SEC : SETTLE_AFTER_LAST_BEAT_SEC);
      busyUntil = Math.max(busyUntil ?? settled, settled);
    }
  };
  for (let i = 1; i < panels.length; i++) {
    const prev = panels[i - 1];
    const cur = panels[i];
    const box = boxes[i];
    const prevBox = boxes[i - 1];
    if (!prev || !cur || !box || !prevBox) continue;
    visitPanel(i - 1);
    const firstBeat = collectSceneTimes(cur.scene)[0] ?? 0;
    const latestArrive = cur.endSec - 1;
    // With the speaker on screen nothing is waiting, so land right as the first drawing starts.
    const firstNoteAt = Math.min(
      ...placed.filter((note) => note.anchor === i).map((note) => note.at - NOTE_LEAD_SEC),
    );
    const breakArrive = Math.min(
      latestArrive,
      cur.startSec + Math.max(-ARRIVE_LEAD_SEC, firstBeat - 0.5),
      firstNoteAt,
    );
    const idleFrom = doneAt(i - 1);
    const breakOut = idleFrom + OVERVIEW_MOVE_SEC + OVERVIEW_HOLD_SEC;
    const breakIn = breakArrive - TRAVEL_SEC - 0.3 - BREAK_FADE_SEC;
    let travelAt: number;
    let travelDur: number;
    if (breakIn - (breakOut + BREAK_FADE_SEC) >= MIN_SPEAKER_BREAK_SEC) {
      // Nothing left to draw here: show the story so far, then hand back to the speaker.
      breaks.push({ out: overviewThenOut(idleFrom, i), in: breakIn, dur: BREAK_FADE_SEC });
      travelDur = TRAVEL_SEC;
      travelAt = breakArrive - travelDur;
    } else if (breakIn - (idleFrom + BREAK_FADE_SEC) >= MIN_DIRECT_BREAK_SEC) {
      // Too short for the overview: dissolve straight to the speaker and back.
      breaks.push({ out: idleFrom, in: breakIn, dur: BREAK_FADE_SEC });
      travelDur = TRAVEL_SEC;
      travelAt = breakArrive - travelDur;
    } else {
      // Arrive as the panel's first drawing appears, not seconds early onto an empty frame.
      const arriveBy = Math.max(prev.endSec - 0.3, breakArrive);
      travelDur = Math.min(TRAVEL_SEC, Math.max(MIN_TRAVEL_SEC, arriveBy - (prev.endSec - 0.3)));
      travelAt = arriveBy - travelDur;
    }
    push(shot(travelAt, travelDur, focusPose(box)), CREEP_ZOOM, beatsOf(i));
    const settled = shots[shots.length - 1];
    const moveAt = settled ? settled.at : travelAt;
    const a = centre(prevBox);
    const b = centre(box);
    connectors.push({
      from: { x: prevBox.x + prevBox.width + PANEL_PAD + 24, y: a.y },
      to: { x: box.x - PANEL_PAD - 24, y: b.y },
      at: moveAt,
      dur: Math.max(0.45, travelDur * 0.8),
    });
    frameAt.push(Math.max(moveAt + travelDur * 0.35, cur.startSec - 0.6));
  }
  const lastIndex = panels.length - 1;
  visitPanel(lastIndex);
  // Open on the speaker until the first drawing (or note) is about to start.
  const firstBeat0 = collectSceneTimes(panels[0]?.scene ?? { kind: 'statement', words: [] })[0];
  const firstMark = Math.min(
    firstBeat0 ?? Number.POSITIVE_INFINITY,
    (placed[0]?.at ?? Number.POSITIVE_INFINITY) - (panels[0]?.startSec ?? 0),
  );
  const fadeInAt =
    Number.isFinite(firstMark) && firstMark - 0.9 >= LATE_OPEN_MIN_SEC ? firstMark - 0.9 : 0;
  const last = panels[lastIndex];
  const tail = last ? durationSec - last.endSec : 0;
  const closeBy = Math.min(durationSec, Math.max(0, closeBySec));
  let fadeOutAt = Math.max(0, closeBy - FADE_SEC);
  let fadeOutDur = FADE_SEC;
  const finalIdle = doneAt(lastIndex);
  if (
    panels.length > 1 &&
    fadeOutAt - (finalIdle + OVERVIEW_MOVE_SEC + OVERVIEW_HOLD_SEC) >= MIN_SPEAKER_BREAK_SEC
  ) {
    // The board finished early: close on the story, then leave the speaker on screen.
    fadeOutAt = overviewThenOut(finalIdle, panels.length);
    fadeOutDur = BREAK_FADE_SEC;
  } else if (panels.length > 1 && tail >= 0.9)
    push(
      shot(
        durationSec - tail,
        Math.min(OVERVIEW_MOVE_SEC, tail),
        boundsPose(storyRects(lastIndex, durationSec)),
      ),
      1.04,
    );
  // Nothing on screen after the board leaves; only rest motion up to there matters.
  flushRest(Math.min(durationSec, fadeOutAt + fadeOutDur));
  return {
    panels: boxes,
    connectors,
    shots,
    frameAt,
    fadeIn: { at: fadeInAt, dur: FADE_SEC },
    fadeOut: { at: fadeOutAt, dur: fadeOutDur },
    breaks,
    notes: placed,
  };
}

/** Seeded low-frequency handheld drift so a resting board is never frozen. */
export function handheld(pose: CameraPose, t: number, seed: string): CameraPose {
  const p1 = seeded(seed, 11) * Math.PI * 2;
  const p2 = seeded(seed, 12) * Math.PI * 2;
  const p3 = seeded(seed, 13) * Math.PI * 2;
  const amp = 9 / Math.max(0.2, pose.zoom);
  return {
    x: pose.x + amp * (Math.sin(t * 0.41 + p1) * 0.7 + Math.sin(t * 0.97 + p2) * 0.3),
    y: pose.y + amp * 0.6 * Math.sin(t * 0.33 + p3),
    zoom: pose.zoom * (1 + 0.006 * Math.sin(t * 0.27 + p1)),
  };
}

export function canvasCameraAt(layout: CanvasLayout, t: number, seed: string): CameraPose {
  return handheld(cameraAt(layout.shots, t), t, seed);
}

/** Smoothstep envelope for the whole board over the source underlay. */
export function canvasOpacity(
  layout: Pick<CanvasLayout, 'fadeIn' | 'fadeOut' | 'breaks'>,
  t: number,
): number {
  const p = (at: number, dur: number): number =>
    dur <= 0 ? Number(t >= at) : Math.min(1, Math.max(0, (t - at) / dur));
  const s = (v: number): number => v * v * (3 - 2 * v);
  let opacity =
    s(p(layout.fadeIn.at, layout.fadeIn.dur)) * (1 - s(p(layout.fadeOut.at, layout.fadeOut.dur)));
  for (const b of layout.breaks) opacity *= 1 - s(p(b.out, b.dur)) * (1 - s(p(b.in, b.dur)));
  return opacity;
}

/** True when the panel (with its frame) intersects the viewport, plus a margin. */
export function panelInView(box: PanelBox, cam: CameraPose, margin = 120): boolean {
  const halfW = CANVAS_VIEW.width / 2 / cam.zoom + margin;
  const halfH = CANVAS_VIEW.height / 2 / cam.zoom + margin;
  return (
    box.x + box.width + PANEL_PAD > cam.x - halfW &&
    box.x - PANEL_PAD < cam.x + halfW &&
    box.y + box.height + PANEL_PAD > cam.y - halfH &&
    box.y - PANEL_PAD < cam.y + halfH
  );
}
