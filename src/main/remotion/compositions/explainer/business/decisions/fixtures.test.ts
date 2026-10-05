import { describe, expect, it } from 'vitest';
import {
  parseMeasurementFrameScene,
  parseStagedDecisionScene,
  parseUncertaintyAlbumScene,
} from '../../../../../ai/explainer/business-decisions-contract';
import type { Rec } from '../../../../../ai/explainer/kind-spec';
import { diagramPose } from '../../diagrams/motion';
import { businessTextWidth } from '../text-width';
import {
  DECISIONS_ACCEPTED_VARIANTS,
  DECISIONS_SOURCE_FIXTURES,
  type DecisionsSourceFixture,
  decisionsSourceContext,
  decisionsSourceWindow,
} from './fixtures';
import {
  decisionAlbumHeaders,
  decisionAlbumHeadersFit,
  decisionDetailWindows,
  decisionLines,
  decisionPageIndex,
  decisionPages,
  decisionPresentationFits,
  decisionRows,
  DECISIONS_ALBUM_HEADER as H,
  DECISIONS_RAIL as R,
} from './presentation';

function parse(fixture: DecisionsSourceFixture, raw: Rec = fixture.raw) {
  const ctx = decisionsSourceContext(fixture);
  const scene =
    raw.kind === 'staged-decision'
      ? parseStagedDecisionScene(raw, ctx)
      : raw.kind === 'measurement-frame'
        ? parseMeasurementFrameScene(raw, ctx)
        : parseUncertaintyAlbumScene(raw, ctx);
  expect(scene, ctx.issues.join('; ')).not.toBeNull();
  if (!scene) throw Error('scene');
  return scene;
}
const fixtures = [...DECISIONS_SOURCE_FIXTURES, ...DECISIONS_ACCEPTED_VARIANTS];
describe('decisions source-authored fixture and page guarantees', () => {
  it('owns exactly the frozen five recipes', () => {
    expect(DECISIONS_SOURCE_FIXTURES.map((f) => f.id)).toEqual([
      'OP-73',
      'OP-76',
      'OP-77',
      'OP-78',
      'OP-79',
    ]);
    expect(DECISIONS_SOURCE_FIXTURES.map((f) => f.raw.preset)).toEqual([
      'contingent-commitment',
      'planned-observed',
      'firms-functions-workers',
      'original-and-surviving-cohorts',
      'alternatives-or-source-distribution',
    ]);
    expect(new Set(fixtures.map((f) => f.fixtureId)).size).toBe(fixtures.length);
  });
  it.each(
    fixtures,
  )('$fixtureId has real bounded five-beat speech and a protected final hold', (fixture) => {
    const win = decisionsSourceWindow(fixture),
      scene = parse(fixture);
    expect(win.endTime - win.startTime).toBeGreaterThanOrEqual(5);
    expect(win.endTime - win.startTime).toBeLessThanOrEqual(12);
    const beats = [scene.setupAt, scene.actionAt, scene.responseAt, scene.checkAt, scene.resolveAt];
    [0.4, 1.5, 3, 7, 10.2].forEach((expected, i) => {
      expect(beats[i]).toBeCloseTo(expected, 9);
    });
    expect(win.endTime - scene.resolveAt).toBeGreaterThanOrEqual(0.8);
    for (let i = 0; i < fixture.words.length; i++) {
      const word = fixture.words[i];
      expect(Number.isFinite(word.start) && Number.isFinite(word.end)).toBe(true);
      expect(word.end).toBeGreaterThan(word.start);
      if (i) expect(word.start).toBeGreaterThan(fixture.words[i - 1].end);
    }
  });
  it.each(
    fixtures,
  )('$fixtureId displays every full authored row at fixed 24px after actual handoff', (fixture) => {
    for (const mode of fixture.raw.modelSource === null ? ['diagram'] : ['diagram', 'hybrid']) {
      const scene = parse(fixture, { ...fixture.raw, visualMode: mode }),
        pages = decisionPages(scene),
        windows = decisionDetailWindows(scene);
      expect(R.fontSize).toBeGreaterThanOrEqual(24);
      expect(decisionPresentationFits(scene, decisionsSourceWindow(fixture).endTime)).toBe(true);
      expect(pages.flatMap((page) => page.rows)).toEqual(decisionRows(scene));
      for (const window of windows) {
        expect(window.end - window.start).toBeGreaterThanOrEqual(1.5);
        const handoff = diagramPose(window.start, scene);
        expect(handoff.setup).toBe(1);
        if (mode === 'hybrid') expect(handoff.diagramOpacity).toBe(1);
        expect(window.page.lines).toBeLessThanOrEqual(R.bodyLines);
        for (const row of window.page.rows) {
          for (const text of [row.text, `${row.label} · ${row.state}`]) {
            const lines = decisionLines(text);
            expect(lines.join(' ')).toBe(text);
            for (const line of lines)
              expect(businessTextWidth(line, R.fontSize)).toBeLessThanOrEqual(
                R.width - 2 * R.padding,
              );
          }
        }
      }
    }
  });
  it.each(
    fixtures,
  )('$fixtureId page boundaries, 30fps, repeated/reverse/shuffled seeks and final holds are deterministic', (fixture) => {
    const scene = parse(fixture),
      before = structuredClone(scene),
      windows = decisionDetailWindows(scene),
      times = [
        -1,
        0,
        ...windows.flatMap((w) => [w.start - 1 / 30, w.start, w.start + 1 / 30, w.end - 1 / 30]),
        scene.resolveAt,
        scene.resolveAt + 0.8,
        ...Array.from({ length: 361 }, (_, i) => i / 30),
      ],
      expected = times.map((t) => decisionPageIndex(scene, t));
    expect(
      [...times]
        .reverse()
        .map((t) => decisionPageIndex(scene, t))
        .reverse(),
    ).toEqual(expected);
    const order = times
      .map((_, i) => i)
      .sort((a, b) => ((a * 17) % times.length) - ((b * 17) % times.length));
    for (const index of order) expect(decisionPageIndex(scene, times[index])).toBe(expected[index]);
    for (let i = 0; i < windows.length; i++)
      expect(decisionPageIndex(scene, windows[i].start)).toBe(i);
    expect(decisionPageIndex(scene, scene.resolveAt)).toBe(windows.length - 1);
    expect(decisionPageIndex(scene, scene.resolveAt + 0.8)).toBe(windows.length - 1);
    expect(scene).toEqual(before);
    expect(Object.isFrozen(scene)).toBe(true);
  });
  it('retains unknown/negative/pending/conditional clauses rather than invented amounts', () => {
    for (const state of ['unknown', 'negative', 'pending', 'conditional']) {
      const fixture = fixtures.find((f) => f.fixtureId === `OP-76:planned:${state}`);
      if (!fixture) throw Error('fixture');
      const scene = parse(fixture);
      if (scene.preset !== 'planned-observed') throw Error('preset');
      expect(scene.observed.state).toBe(state);
      expect(scene.observed.value).toBe(state === 'conditional' ? 6 : null);
      expect(scene.observed.text).toMatch(
        state === 'negative'
          ? /not supplied/u
          : state === 'conditional'
            ? /If Review passes, Owner may report/u
            : new RegExp(state),
      );
      expect(decisionRows(scene).some((row) => row.text === scene.observed.text)).toBe(true);
    }
  });
  it('album headers keep equal widths and complete fixed-font names/versions; reject overflowing four-card labels', () => {
    const scene = parse(DECISIONS_SOURCE_FIXTURES[4]);
    if (scene.preset !== 'alternatives-or-source-distribution') throw Error('album');
    const headers = decisionAlbumHeaders(scene);
    expect(new Set(headers.map((header) => header.width)).size).toBe(1);
    expect(H.fontSize).toBeGreaterThanOrEqual(24);
    expect(decisionAlbumHeadersFit(scene)).toBe(true);
    for (const header of headers) {
      expect(header.lines.join(' ')).toBe(header.text);
      expect(header.lines.length).toBeLessThanOrEqual(H.maxLines);
    }
    const dense = {
      ...scene,
      alternatives: Array.from({ length: 4 }, (_, i) => ({
        ...scene.alternatives[0],
        entry: {
          ...scene.alternatives[0].entry,
          identity: {
            ...scene.alternatives[0].entry.identity,
            id: `option-${i}`,
            label: 'W'.repeat(28),
          },
          version: 'W'.repeat(20),
        },
      })),
    };
    expect(decisionAlbumHeadersFit(dense)).toBe(false);
    expect(decisionPresentationFits(dense, 12)).toBe(false);
  });
  it('rejects truly unreadable timing/density instead of shrinking or dropping rows', () => {
    const fixture = DECISIONS_SOURCE_FIXTURES[3],
      scene = parse(fixture),
      end = decisionsSourceWindow(fixture).endTime;
    expect(decisionPresentationFits({ ...scene, resolveAt: scene.responseAt + 0.8 }, end)).toBe(
      false,
    );
    expect(decisionPresentationFits(scene, scene.resolveAt + 0.79)).toBe(false);
    expect(
      decisionPresentationFits(
        {
          ...scene,
          outcome: 'W'.repeat(10000),
          factEvidence: { ...scene.factEvidence, label: 'W'.repeat(10000) },
        },
        end,
      ),
    ).toBe(false);
  });
});
