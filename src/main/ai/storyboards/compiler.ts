import {
  STORYBOARD_LIMITS as L,
  type StoryboardResult,
  type StoryboardSourceSpec,
} from '../../../shared/storyboards';
import type { WordTimestamp } from '../../../shared/types';
import type { SceneCue } from '../../remotion/compositions/explainer/types';
import type { BoardElement, StoryBoardSpec } from '../../remotion/compositions/storyboard/types';
import { BOARD_MODELS, BOARD_LAYOUT as G } from './catalog';
import {
  type ParsedStoryboard,
  parseStoryboardSpec,
  type StoryboardParseContext,
} from './contract';

export interface CompiledStoryboard {
  sourceSpec: StoryboardSourceSpec;
  startTime: number;
  endTime: number;
  board: StoryBoardSpec;
  cues: SceneCue[];
}

/** Conservative wrapping estimate. No font measurement, randomness, viewport or clock dependency. */
function textSize(text: string, width: number, height: number, preferred: number): number | null {
  for (let size = preferred; size >= 30; size -= 2) {
    const capacity = width / size;
    let line = 0;
    let lines = 1;
    for (const word of text.split(/\s+/)) {
      // Wide Latin glyphs and non-Latin scripts get a whole em; ordinary letters 0.65 em.
      const advance = [...word].reduce(
        (n, c) => n + (/[MW@#%\u0080-\uffff]/.test(c) ? 1 : 0.65),
        0,
      );
      if (advance > capacity) {
        lines = Infinity;
        break;
      }
      if (line && line + 0.4 + advance > capacity) {
        lines++;
        line = 0;
      }
      line += (line ? 0.4 : 0) + advance;
    }
    if (lines * size * 1.2 <= height) return size;
  }
  return null;
}

/** Compile only validated source choices into authored left-to-right geometry.
 * Every at/…At remains an ABSOLUTE source time, including camera and dissolves.
 * Past panels persist; completed prop actions freeze at actionEndAt. */
export function compileStoryboard(parsed: ParsedStoryboard): StoryboardResult<CompiledStoryboard> {
  const { spec, panels: clocks, startTime, endTime, overviewAt } = parsed;
  const elements: BoardElement[] = [];
  const props: StoryBoardSpec['props'] = [];
  const panels: NonNullable<StoryBoardSpec['panels']> = [];
  const shots: StoryBoardSpec['shots'] = [];
  const cues: SceneCue[] = [];
  const diagnostics: Extract<StoryboardResult<never>, { ok: false }>['diagnostics'] = [];
  const width = spec.panels.length * G.panelWidth + (spec.panels.length - 1) * G.panelGap;
  const worldBounds = { x: 0, y: 0, width, height: G.panelHeight };
  const text = (
    id: string,
    value: string,
    x: number,
    y: number,
    w: number,
    h: number,
    at: number,
    preferred = 48,
  ) => {
    const size = textSize(value, w, h, preferred);
    if (size === null) {
      diagnostics.push({
        code: 'budget',
        message: 'Source label does not fit the authored readable content bounds.',
        panelId: id.split(':')[0],
        repairable: true,
      });
      return;
    }
    elements.push({ kind: 'text', id, text: value, x, y, width: w, size, tone: 'ink', at });
  };
  spec.panels.forEach((panel, index) => {
    const clock = clocks[index];
    const x = index * (G.panelWidth + G.panelGap);
    const id = (part: string) => `${panel.id}:${part}`;
    panels.push({
      id: panel.id,
      kind: panel.kind,
      title: panel.title.text,
      x,
      y: 0,
      width: G.panelWidth,
      height: G.panelHeight,
      at: clock.revealAt,
    });
    shots.push({
      at: index ? clock.moveAt : startTime,
      dur: index ? G.panSec : 0,
      x: x + G.panelWidth / 2,
      y: G.panelHeight / 2,
      zoom: 1.1,
    });
    cues.push({ kind: index ? 'slide' : 'tick', at: clock.revealAt, gain: 0.35 });
    // Notes already have cards; omit the redundant outer frame to keep five full panels <=48 elements.
    if (panel.kind !== 'notes')
      elements.push({
        kind: 'frame',
        id: id('frame'),
        at: clock.revealAt,
        x,
        y: 0,
        w: G.panelWidth,
        h: G.panelHeight,
      });
    text(
      id('title'),
      panel.title.text,
      x + G.inset,
      96,
      G.panelWidth - G.inset * 2,
      210,
      clock.labelsAt[0],
      60,
    );
    const contentWidth = panel.prop ? 830 : G.panelWidth - G.inset * 2;
    const left = x + G.inset;
    switch (panel.kind) {
      case 'statement':
        text(id('body'), panel.body.text, left, 350, contentWidth, 350, clock.labelsAt[1], 56);
        break;
      case 'hero':
        text(
          id('caption'),
          panel.caption.text,
          left,
          350,
          contentWidth,
          350,
          clock.labelsAt[1],
          52,
        );
        break;
      case 'comparison': {
        const cell = (contentWidth - 48) / 2;
        for (const [i, label] of [panel.left, panel.right].entries()) {
          const cx = left + i * (cell + 48);
          elements.push({
            kind: 'frame',
            id: id(`side-${i}`),
            at: clock.labelsAt[i + 1],
            x: cx,
            y: 330,
            w: cell,
            h: 380,
          });
          // Neutral comparison: no invented winner, magnitude, inequality or direction.
          text(
            id(`label-${i}`),
            label.text,
            cx + 24,
            410,
            cell - 48,
            265,
            clock.labelsAt[i + 1],
            44,
          );
        }
        break;
      }
      case 'process':
        panel.items.forEach((item, i) => {
          const y = 330 + i * 102;
          text(
            id(`item-${i}`),
            item.text,
            left + 35,
            y,
            contentWidth - 80,
            84,
            clock.labelsAt[i + 1],
            40,
          );
          if (i)
            elements.push({
              kind: 'arrow',
              id: id(`link-${i}`),
              from: { x: left + 10, y: y - 28 },
              to: { x: left + 10, y: y + 22 },
              bend: 0,
              dur: G.revealSec,
              tone: 'accent',
              at: clock.labelsAt[i + 1],
            });
        });
        break;
      case 'notes': {
        const cell = (contentWidth - 28) / 2;
        panel.items.forEach((item, i) => {
          const w = cell - 48;
          const size = textSize(item.text, w, 158, 36);
          // Note's renderer uses its authored fixed type size. Use wrapping text over the card.
          if (size === null)
            diagnostics.push({
              code: 'budget',
              message: 'Note exceeds readable wrapping bounds.',
              panelId: panel.id,
              repairable: true,
            });
          const nx = left + (i % 2) * (cell + 28);
          const ny = 330 + Math.floor(i / 2) * 220;
          elements.push({
            kind: 'note',
            id: id(`note-${i}`),
            title: '',
            x: nx,
            y: ny,
            rot: 0,
            width: cell,
            height: 200,
            at: clock.labelsAt[i + 1],
          });
          text(id(`item-${i}`), item.text, nx + 24, ny + 20, w, 158, clock.labelsAt[i + 1], 36);
        });
        break;
      }
      case 'quantity': {
        const size = textSize(`${panel.value} ${panel.unit.text}`, contentWidth, 160, 60);
        if (size === null)
          diagnostics.push({
            code: 'budget',
            message: 'Exact quantity and unit exceed the readable counter bounds.',
            panelId: panel.id,
            repairable: true,
          });
        else
          elements.push({
            kind: 'counter',
            id: id('value'),
            value: panel.value,
            unit: panel.unit.text,
            x: left,
            y: 350,
            width: contentWidth,
            size,
            at: Math.max(clock.labelsAt[1], clock.labelsAt[2]),
          });
        text(
          id('evidence'),
          panel.evidence.text,
          left,
          530,
          contentWidth,
          210,
          clock.labelsAt[1],
          42,
        );
        break;
      }
    }
    if (panel.prop && clock.propAt !== undefined) {
      const prop = panel.prop;
      props.push({
        id: id(`prop-${prop.id}`),
        semanticId: prop.id,
        model: prop.model,
        action: prop.action,
        at: clock.propAt,
        actionEndAt: clock.actionEndAt,
        x: x + 1_130,
        y: 505,
        size: 290,
      });
      if (prop.action !== 'reveal') cues.push({ kind: 'pop', at: clock.propAt, gain: 0.3 });
    }
  });
  if (overviewAt !== undefined) {
    const zoom = Math.min(1.1, 1_720 / width, 900 / G.panelHeight);
    const unreadable = elements.find(
      (element) =>
        (element.kind === 'text' || element.kind === 'counter') &&
        (element.size ?? 60) * zoom <
          (element.id.endsWith(':title') ? G.minOverviewTitlePx : G.minOverviewTextPx),
    );
    if (unreadable) {
      diagnostics.push({
        code: 'budget',
        message:
          'The full overview makes source text too small to read. Omit the optional overview; keep all panels and source facts.',
        panelId: unreadable.id.split(':')[0],
        repairable: true,
      });
    } else {
      shots.push({ at: overviewAt, dur: G.panSec, x: width / 2, y: G.panelHeight / 2, zoom });
      cues.push({ kind: 'whoosh', at: overviewAt, gain: 0.25 });
    }
  }
  const meshes = spec.panels.reduce(
    (sum, panel) => sum + (panel.prop ? BOARD_MODELS[panel.prop.model].meshes : 0),
    0,
  );
  if (
    elements.length > L.maxElements ||
    props.length > L.maxProps ||
    meshes > L.maxModelMeshes ||
    width > L.maxWorldWidth ||
    G.panelHeight > L.maxWorldHeight ||
    width * G.panelHeight > L.maxWorldArea ||
    shots.some((shot) => shot.zoom < L.minZoom || shot.zoom > L.maxZoom) ||
    cues.length > L.maxCues
  ) {
    diagnostics.push({
      code: 'budget',
      message: 'Compiled board exceeds authored resource bounds.',
      repairable: false,
    });
  }
  if (diagnostics.length) return { ok: false, diagnostics };
  return {
    ok: true,
    value: {
      sourceSpec: structuredClone(spec),
      startTime,
      endTime,
      board: {
        durationSec: endTime - startTime,
        panels,
        worldBounds,
        shots,
        elements,
        props,
        boardIn: { at: startTime, dur: G.fadeSec },
        boardOut: { at: endTime - G.fadeSec, dur: G.fadeSec },
      },
      cues: cues.sort((a, b) => a.at - b.at),
    },
  };
}

/** Public raw JSON → revalidation → deterministic compiler entry point. */
export function compileStoryboardSpec(
  input: unknown,
  words: readonly WordTimestamp[],
  context: StoryboardParseContext,
): StoryboardResult<CompiledStoryboard> {
  const parsed = parseStoryboardSpec(input, words, context);
  return parsed.ok ? compileStoryboard(parsed.value) : parsed;
}
