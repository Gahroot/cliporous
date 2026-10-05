import { deepStrictEqual, ok } from 'node:assert';
import { describe, expect, it } from 'vitest';
import {
  rankingCalendarFields,
  rankingCalendarPages,
  rankingCalendarPose,
  rankingCalendarRecords,
  rankingRankTracks,
  rankStatus,
} from './ranking-calendar-poses';
import {
  acceptedRankingCalendar,
  maximumRankingCalendar,
  packet,
  rankingCalendarCases,
} from './ranking-calendar-test-fixtures';

describe('ranking/calendar pure production poses', () => {
  it('projects actual supplied rank changes on a common axis without changing identity or choosing tied winners', () => {
    const scene = acceptedRankingCalendar(packet.stories[0]);
    if (scene.storyId !== '21') throw new Error('Expected rank route');
    const tracks = rankingRankTracks(scene);
    expect(tracks.map((t) => t.actorId)).toEqual(scene.entities.map((e) => e.id));
    expect(tracks.map((t) => t.points.map((p) => p.y))).toEqual([
      [320, 100],
      [100, 320],
    ]);
    expect(tracks.map((t) => t.points.map((p) => p.record.id))).toEqual(
      scene.entities.map((e) =>
        scene.states.map((s) => s.records.find((r) => r.actorId === e.id)?.id),
      ),
    );
    const max = acceptedRankingCalendar(maximumRankingCalendar('21', 'W'));
    if (max.storyId !== '21') throw new Error('Expected max rank route');
    const retained = rankingRankTracks(max);
    expect(retained[0].points[0].tied).toBe(true);
    expect(retained[0].points[0].y).toBe(retained[1].points[0].y);
    expect(retained[2].points[0].record.unrankedEvidence).toBeDefined();
    expect(retained[2].points[0].y).toBe(354);
    expect(retained[4].points[0].record.rank).toBeUndefined();
    expect(retained[4].points[0].y).toBe(354);
  });
  it('accepts max real payloads and retains every full source string, identity and status', () => {
    for (const scene of rankingCalendarCases()) {
      const records = rankingCalendarRecords(scene);
      const pages = rankingCalendarPages(scene);
      for (let i = 0; i < records.length; i++) {
        expect(
          pages
            .filter((p) => p.record === i)
            .flatMap((p) => p.lines)
            .join(''),
        ).toBe(rankingCalendarFields(scene, i).join(''));
      }
      if (scene.storyId === '21') {
        expect(scene.states[0].records.map((r) => r.actorId)).toEqual(
          scene.states[1].records.map((r) => r.actorId),
        );
        if (records.length === 12) {
          expect(rankStatus(scene.states[0].records[0], scene.states[0].records)).toContain('tied');
          expect(rankStatus(scene.states[0].records[2], scene.states[0].records)).toBe(
            'unranked; unknown',
          );
        }
      }
    }
  });
  it('is bounded and immutable for all frames, reverse/shuffled/repeated/nonfinite seeks and final hold', () => {
    for (const scene of rankingCalendarCases()) {
      const before = structuredClone(scene);
      const frames = Array.from({ length: 901 }, (_, i) => i / 30);
      const expected = frames.map((t) => rankingCalendarPose(scene, t));
      const visited = new Set(expected.map((p) => p.page));
      expect(visited.size).toBe(expected[0].pages.length);
      for (const i of frames
        .map((_, i) => i)
        .sort((a, b) => ((a * 137) % 901) - ((b * 137) % 901))) {
        // Compare the entire pose/page tree, without thousands of Vitest deep-matcher wrappers.
        deepStrictEqual(rankingCalendarPose(scene, frames[i]), expected[i]);
        const p = expected[i];
        for (const key of ['reveal', 'action', 'response', 'check', 'resolve'] as const) {
          ok(p[key] >= 0 && p[key] <= 1, `${key} out of bounds at frame ${i}: ${p[key]}`);
        }
      }
      for (const t of [NaN, Infinity, -Infinity])
        expect(rankingCalendarPose(scene, t).page).toBe(0);
      expect(rankingCalendarPose(scene, scene.resolveAt + 0.3)).toEqual(
        rankingCalendarPose(scene, 100),
      );
      expect(scene).toEqual(before);
    }
  });
});
