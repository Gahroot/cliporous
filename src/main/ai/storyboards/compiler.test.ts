import { describe, expect, it } from 'vitest';
import { isLongformSourceSpec } from '../../../shared/longform-scenes';
import { STORYBOARD_LIMITS as L } from '../../../shared/storyboards';
import { BOARD_LAYOUT } from './catalog';
import { compileStoryboardSpec } from './compiler';
import { boardFixture, multiPanelFixture, sourceLabel } from './fixtures';

function compile(f = multiPanelFixture(5)) {
  const result = compileStoryboardSpec(JSON.parse(JSON.stringify(f.spec)), f.words, {
    clipStart: 0,
    clipEnd: f.duration,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.value;
}
function nodes(value: unknown): number {
  return (
    1 +
    (value && typeof value === 'object'
      ? Object.values(value).reduce<number>((sum, v) => sum + nodes(v), 0)
      : 0)
  );
}

describe('authored storyboard compiler', () => {
  it('is deterministic, left-to-right, bounded and absolute, with readable arrival/final holds', () => {
    const f = multiPanelFixture(5);
    const a = compile(f);
    expect(compile(f)).toEqual(a);
    const { board } = a;
    expect(a.startTime).toBe(20.25);
    expect(a.endTime).toBeCloseTo(f.words[f.words.length - 1].end + 0.35);
    expect(board.durationSec).toBe(a.endTime - a.startTime);
    expect(board.boardIn?.at).toBe(a.startTime);
    expect(board.boardOut?.at).toBe(a.endTime - 0.25);
    expect(board.panels?.map((p) => p.x)).toEqual([0, 1500, 3000, 4500, 6000]);
    expect(board.elements.length).toBe(45);
    expect(board.props).toHaveLength(5);
    expect(board.worldBounds).toEqual({ x: 0, y: 0, width: 7400, height: 820 });
    for (const shot of board.shots) {
      expect(shot.at).toBeGreaterThanOrEqual(a.startTime);
      expect(shot.zoom).toBeGreaterThanOrEqual(L.minZoom);
      expect(shot.zoom).toBeLessThanOrEqual(L.maxZoom);
    }
    for (const [i, p] of (board.panels ?? []).entries()) {
      const shot = board.shots[i];
      const title = board.elements.find((e) => e.id === `${p.id}:title`);
      expect(title?.at).toBeLessThanOrEqual(i ? shot.at : shot.at + 0.25);
      const next = board.shots[i + 1];
      if (next) expect(next.at - shot.at - shot.dur).toBeGreaterThanOrEqual(L.minHoldSec);
      const text = board.elements.filter((e) => e.id.startsWith(`${p.id}:`) && e.kind === 'text');
      expect(
        text.every(
          (e) => e.kind === 'text' && e.width && e.x >= p.x && e.x + e.width <= p.x + p.width,
        ),
      ).toBe(true);
    }
    for (const prop of board.props) {
      expect(prop.at).toBeGreaterThan(a.startTime);
      expect(prop.actionEndAt).toBeLessThan(a.endTime);
      expect(prop).not.toHaveProperty('goneAt'); // completed panels are never erased
    }
    const last = board.shots.at(-1);
    expect(last && a.endTime - 0.25 - last.at - last.dur).toBeGreaterThanOrEqual(
      L.minOverviewHoldSec,
    );
    expect(board.shots).toHaveLength(5);
    expect(a.cues.some((cue) => cue.kind === 'whoosh')).toBe(false);
    expect(a.cues.every((c) => c.at >= a.startTime && c.at < a.endTime)).toBe(true);
  });
  it('keeps a readable two-panel overview with a full hold', () => {
    const { board, endTime } = compile(multiPanelFixture(2, true));
    const overview = board.shots.at(-1);
    expect(board.shots).toHaveLength(3);
    if (!overview || !board.worldBounds) throw new Error('overview fixture');
    expect(board.worldBounds.width * overview.zoom).toBeLessThanOrEqual(1720);
    expect(endTime - 0.25 - overview.at - overview.dur).toBeGreaterThanOrEqual(
      L.minOverviewHoldSec,
    );
    for (const element of board.elements) {
      if (element.kind !== 'text' && element.kind !== 'counter') continue;
      const minimum = element.id.endsWith(':title')
        ? BOARD_LAYOUT.minOverviewTitlePx
        : BOARD_LAYOUT.minOverviewTextPx;
      expect((element.size ?? 60) * overview.zoom).toBeGreaterThanOrEqual(minimum);
    }
  });
  it('rejects miniature recaps with a repair diagnostic instead of silently dropping source facts', () => {
    const f = multiPanelFixture(5, true);
    const before = structuredClone(f.spec);
    const result = compileStoryboardSpec(f.spec, f.words, { clipStart: 0, clipEnd: f.duration });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreadable recap accepted');
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'budget',
        panelId: 'p0',
        repairable: true,
        message: expect.stringContaining('Omit the optional overview'),
      }),
    );
    expect(f.spec).toEqual(before);
    const repaired = { ...f, spec: structuredClone(f.spec) };
    delete repaired.spec.overview;
    const compiled = compile(repaired);
    expect(compiled.sourceSpec.panels).toEqual(before.panels);
    expect(compiled.board.elements).toHaveLength(45);
  });
  it('sizes an exact counter plus long unit into <=160px, above its evidence region', () => {
    const f = boardFixture('quantity');
    const p = f.spec.panels[0];
    if (p.kind !== 'quantity') throw new Error('fixture');
    const unit = Array.from({ length: 13 }, () => 'WWWWW').join(' ');
    f.words[p.unit.startWord].text = unit;
    p.unit.text = unit;
    p.evidence.text = `12 ${unit}`;
    // Add a literal prop in later source context, forcing the narrow 830px content region.
    const atWord = p.endWord - 5;
    f.words[atWord].text = 'battery';
    p.prop = {
      id: 'battery',
      model: 'battery',
      action: 'reveal',
      atWord,
      evidence: { startWord: atWord, endWord: atWord },
    };
    const result = compileStoryboardSpec(f.spec, f.words, { clipStart: 0, clipEnd: f.duration });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    const counter = result.value.board.elements.find((e) => e.kind === 'counter');
    expect(counter?.kind).toBe('counter');
    if (counter?.kind !== 'counter') return;
    expect(counter.size).toBeLessThan(60);
    const charsPerLine = Math.floor((counter.width ?? 0) / ((counter.size ?? 60) * 5.4));
    const rows = Math.ceil(14 / charsPerLine);
    expect(rows * (counter.size ?? 60) * 1.2).toBeLessThanOrEqual(160);
  });
  it('fails closed rather than overflowing a long unbreakable label', () => {
    const f = boardFixture();
    f.words[0].text = 'W'.repeat(90);
    f.spec.panels[0].title = sourceLabel(f.words, 'W'.repeat(90));
    const result = compileStoryboardSpec(f.spec, f.words, { clipStart: 0, clipEnd: f.duration });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics.some((d) => d.message.includes('bounds'))).toBe(true);
  });
  it('measures maximum structural source fixture through the frozen shared guard', () => {
    const f = multiPanelFixture(5);
    // Largest readable source fixture: five 4-item process panels, each with a prop, no miniature recap.
    for (const panel of f.spec.panels) {
      if (panel.kind !== 'notes') throw new Error('fixture');
      const start = panel.startWord;
      [
        'System',
        'intake',
        'then',
        'review',
        'then',
        'delivery',
        'then',
        'archive',
        'battery',
        'waits',
        'while',
        'more',
        'context',
        'continues',
      ].forEach((text, i) => {
        f.words[start + i].text = text;
      });
      Object.assign(panel, {
        kind: 'process',
        title: sourceLabel(f.words, 'System', start),
        items: ['intake', 'review', 'delivery', 'archive'].map((s) =>
          sourceLabel(f.words, s, start),
        ),
        relationship: 'sequence',
        evidence: { startWord: start + 1, endWord: start + 7 },
        prop: {
          id: `battery${start}`,
          model: 'battery',
          action: 'reveal',
          atWord: start + 8,
          evidence: { startWord: start + 8, endWord: start + 8 },
        },
      });
    }
    const compiled = compile(f);
    const measure = {
      nodes: nodes(f.spec),
      bytes: Buffer.byteLength(JSON.stringify(f.spec), 'utf8'),
      elements: compiled.board.elements.length,
      props: compiled.board.props.length,
    };
    console.info('Maximum structural storyboard fixture:', JSON.stringify(measure));
    expect(measure.nodes).toBe(210);
    expect(measure.bytes).toBeLessThan(L.maxSpecBytes);
    expect(isLongformSourceSpec(f.spec)).toBe(true);
    expect(compiled.board.elements.length).toBeLessThanOrEqual(48);
  });
});
