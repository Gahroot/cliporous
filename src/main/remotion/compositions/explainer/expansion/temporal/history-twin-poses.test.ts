import { expect, it } from 'vitest';
import {
  historyTwinNumericPositions,
  historyTwinPages,
  historyTwinPose,
} from './history-twin-poses';
import {
  historyTwinCases,
  historyTwinFixtures,
  historyTwinStressFixtures,
  parseHistoryTwin,
  quantities47,
  quantities48,
} from './history-twin-test-fixtures';

it('real parser both modes preserve facts, qualifications, IDs, represented data times and immutable sources', () => {
  for (const fixture of [
    ...historyTwinFixtures,
    quantities47(),
    quantities48(),
    ...historyTwinStressFixtures(),
  ]) {
    const before = structuredClone(fixture),
      diagram = parseHistoryTwin(fixture),
      hybrid = parseHistoryTwin(fixture, 'hybrid');
    expect(hybrid).toEqual({ ...diagram, visualMode: 'hybrid' });
    expect(parseHistoryTwin(fixture)).toEqual(diagram);
    expect(fixture).toEqual(before);
    expect(historyTwinPages(hybrid)).toEqual(historyTwinPages(diagram));
  }
});
it('all authored frames seek identically shuffled/repeated/nonfinite; five finite beats and final hold; every full source page visited', () => {
  for (const scene of historyTwinCases()) {
    const before = structuredClone(scene),
      pages = historyTwinPages(scene),
      visited = new Set<number>();
    const poses = Array.from({ length: 361 }, (_, f) => historyTwinPose(scene, f / 30));
    for (let f = 360; f >= 0; f--) {
      const pose = historyTwinPose(scene, f / 30);
      expect(pose).toEqual(poses[f]);
      visited.add(pose.page);
      expect(Object.values(pose).every(Number.isFinite)).toBe(true);
      expect(historyTwinPose(scene, f / 30)).toEqual(pose);
      const shuffled = (f * 137) % 361;
      expect(historyTwinPose(scene, shuffled / 30)).toEqual(poses[shuffled]);
    }
    expect(visited.size).toBe(pages.length);
    for (const time of [NaN, Infinity, -Infinity])
      expect(historyTwinPose(scene, time)).toEqual(historyTwinPose(scene, scene.setupAt - 1));
    expect(historyTwinPose(scene, 12)).toEqual(historyTwinPose(scene, 100));
    const facts = new Map<string, string[]>();
    for (const page of pages)
      facts.set(page.factId, [...(facts.get(page.factId) ?? []), ...page.lines]);
    for (const page of pages) expect(facts.get(page.factId)?.join('')).toBe(page.text);
    expect(scene).toEqual(before);
  }
});
it('exact rational extrema and signed thresholds retain ordering; absence never becomes zero', () => {
  const scene = parseHistoryTwin(quantities47());
  if (scene.storyId !== '47') throw new Error('Wrong fixture');
  const q = scene.thresholds[0].quantity;
  const numeric = (numerator: number, denominator: number): typeof q => ({
    ...q,
    state: 'known',
    amount: { kind: 'rational', value: { numerator, denominator } },
  });
  expect(
    historyTwinNumericPositions([
      numeric(-1000000000, 1),
      numeric(0, 1),
      numeric(1000000000, 1),
      scene.thresholds[1].quantity,
    ]),
  ).toEqual([0, 0.5, 1, null]);
  expect(
    historyTwinNumericPositions([numeric(999999999, 1000000000), numeric(1000000000, 999999999)]),
  ).toEqual([0, 1]);
  expect(historyTwinNumericPositions([numeric(-1, 3), numeric(-1, 3)])).toEqual([0.5, 0.5]);
});
