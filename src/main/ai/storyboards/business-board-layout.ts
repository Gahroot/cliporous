import { STORYBOARD_LIMITS as L, type StoryboardResult } from '../../../shared/storyboards';
import { BUSINESS_HYBRID_LAYOUT as H } from '../../remotion/compositions/storyboard/business-panel-layout';
import { textAdvance, wrapBoardText } from '../../remotion/compositions/storyboard/text-layout';
import type { BoardElement } from '../../remotion/compositions/storyboard/types';
import type { BusinessPanelProjection } from './business-diagrams';
import { businessParagraphGroups } from './business-paragraph-groups';
import { BOARD_LAYOUT as G } from './catalog';

export interface BusinessDiagramLayoutInput {
  panelId: string;
  panelX: number;
  revealAt: number;
  projection: BusinessPanelProjection;
  /** Compiler-selected presentation, never source-authored geometry. */
  hybrid?: boolean;
}

/** Content stays below the compiler's title rail and above its bottom inset.
 * Seven content elements plus outer frame/title fit five panels within 48 elements.
 * Separators are neutral punctuation, not invented relationships or outcomes.
 */
const SEPARATOR = ' · ';
const MAX_CONTENT_ELEMENTS = Math.floor(L.maxElements / L.maxPanels) - 2;
const MAX_CELL_CHARS = 512;

/** Reserve the renderer's exact seekable line breaks without shrinking or clipping text.
 * Indivisible over-wide source tokens still fail closed. Native pixels remain a separate proof.
 */
function estimatedLines(text: string, width: number, size: number, legacy = false): number {
  if (!legacy) {
    if (text.split(/\s+/u).some((word) => textAdvance(word, size) > width)) return Infinity;
    return Math.max(1, wrapBoardText(text, size, width).length);
  }
  const capacity = Math.floor(width / size);
  let lines = 1;
  let used = 0;
  for (const word of text.split(/\s+/u)) {
    const advance = [...word].reduce(
      (sum, char) => sum + (/[MW@#%]|[^\u0020-\u007e]/u.test(char) ? 1 : 0.8),
      0,
    );
    if (advance > capacity) return Infinity;
    if (used && used + 1 + advance > capacity) {
      lines++;
      used = 0;
    }
    used += (used ? 1 : 0) + advance;
  }
  return lines;
}

/** Atomic, pure content compilation; the caller owns frame/title, timing and board budgets. */
export function compileBusinessDiagramLayout(
  input: BusinessDiagramLayoutInput,
): StoryboardResult<{ elements: BoardElement[] }> {
  const { panelId, panelX, revealAt, projection: p } = input;
  const panelWidth = input.hybrid ? H.width : G.panelWidth;
  const panelHeight = input.hybrid ? H.height : G.panelHeight;
  const minimumFont = input.hybrid ? H.minimumFont : G.contentMinFont;
  const fail = (code: 'budget' | 'shape', message: string): StoryboardResult<never> => ({
    ok: false,
    diagnostics: [{ code, message, panelId, repairable: true }],
  });
  if (
    !panelId.trim() ||
    !Number.isFinite(panelX) ||
    panelX < 0 ||
    panelX + panelWidth > L.maxWorldWidth ||
    !Number.isFinite(revealAt) ||
    revealAt < 0
  ) {
    return fail(
      'shape',
      'Panel identity, finite source clock and existing world canvas rails are required.',
    );
  }
  if (
    p.headings.length > 8 ||
    (p.layoutGroups ? p.layoutGroups.length : p.rows.length) > L.maxItems ||
    p.rows.some((row) => row.cells.length === 0 || row.cells.length > 8)
  ) {
    return fail(
      'budget',
      'Projection exceeds authored heading/row/cell/note limits; retain facts in source, not clipped graphics.',
    );
  }
  if (
    new Set(p.rows.map((row) => row.id)).size !== p.rows.length ||
    p.rows.some((row) => !row.id.trim())
  ) {
    return fail('shape', 'Projection rows require distinct nonempty source IDs.');
  }
  if (
    p.layoutGroups &&
    JSON.stringify(p.layoutGroups) !== JSON.stringify(businessParagraphGroups(p.rows))
  )
    return fail(
      'shape',
      'Native paragraph membership must preserve every exact authored row once in order.',
    );
  const labels = [...p.headings, ...p.rows.flatMap((row) => [...row.cells]), ...p.notes];
  if (
    labels.some(
      (label) =>
        !label.trim() ||
        label.length > MAX_CELL_CHARS ||
        [...label].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127),
    )
  ) {
    return fail(
      'budget',
      'Complete labels must be nonempty bounded single paragraphs; no silent removal or truncation.',
    );
  }
  const paragraphs = [
    ...(p.headings.length ? [{ id: 'headings', text: p.headings.join(SEPARATOR) }] : []),
    ...(p.layoutGroups
      ? p.layoutGroups.map((group) => ({
          id: `row:${group.id}`,
          text: group.rowIds
            .map((id) => p.rows.find((row) => row.id === id)?.cells.join(SEPARATOR) ?? '')
            .join('; '),
        }))
      : p.rows.map((row) => ({ id: `row:${row.id}`, text: row.cells.join(SEPARATOR) }))),
    ...(p.notes.length ? [{ id: 'notes', text: p.notes.join('; ') }] : []),
  ];
  if (!paragraphs.length || paragraphs.length > MAX_CONTENT_ELEMENTS) {
    return fail(
      'budget',
      'Content exceeds the per-panel element reservation for five panels on the unchanged 48-element board.',
    );
  }
  const width = input.hybrid ? H.textWidth : G.panelWidth - G.inset * 2;
  const height = panelHeight - G.inset - G.contentTop;
  for (let size: number = G.contentPreferredFont; size >= minimumFont; size -= 2) {
    const heights = paragraphs.map(
      ({ text }) => estimatedLines(text, width, size, p.sourceVersion === 1) * size * 1.2,
    );
    if (heights.reduce((sum, h) => sum + h, 0) + G.contentGap * (paragraphs.length - 1) > height)
      continue;
    let y: number = G.contentTop;
    const elements: BoardElement[] = paragraphs.map((paragraph, index) => {
      const element: BoardElement = {
        kind: 'text',
        id: `${panelId}:business:${paragraph.id}`,
        text: paragraph.text,
        x: panelX + G.inset,
        y,
        width,
        size,
        tone: 'ink',
        at: revealAt,
      };
      y += heights[index] + G.contentGap;
      return element;
    });
    return { ok: true, value: { elements } };
  }
  return fail(
    'budget',
    `Complete headings, cells, bases and qualifiers do not fit the authored content rails at readable type (minimum ${minimumFont}).`,
  );
}
