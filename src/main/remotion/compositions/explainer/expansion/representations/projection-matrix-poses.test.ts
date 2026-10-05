import { expect, it } from 'vitest';
import { parseExpansionMatrixProduct } from '../../../../../ai/explainer/expansion-representations-projection-matrix-contract';
import { makeParseContext } from '../../../../../ai/explainer/kind-spec';
import { compare, rationalPosition } from '../value-logic';
import {
  exactText,
  projectionMatrixPages,
  projectionMatrixPose,
  wrapSource,
} from './projection-matrix-poses';
import { accepted, cases, maximum, packet } from './projection-matrix-test-fixtures';

it('accepts both raw stories/modes without modifying source or meaning', () => {
  for (const story of packet.stories) {
    const before = JSON.stringify(story);
    const diagram = accepted(story),
      hybrid = accepted(story, 'hybrid');
    expect({ ...hybrid, visualMode: 'diagram' }).toEqual(diagram);
    expect(JSON.stringify(story)).toBe(before);
    expect(projectionMatrixPages(hybrid)).toEqual(projectionMatrixPages(diagram));
  }
});
it('establishes real accepted caps and rejects overflow rather than truncating', () => {
  const projection = accepted(maximum('53'));
  expect(projection.entities).toHaveLength(5);
  expect(projection.records).toHaveLength(12);
  expect(projection.relations).toHaveLength(16);
  if (projection.storyId === '53') expect(projection.frames).toHaveLength(8);
  const matrix = accepted(maximum('54'));
  expect(matrix.records).toHaveLength(12);
  expect(matrix.relations).toHaveLength(16);
  if (matrix.storyId === '54')
    for (const record of matrix.records) {
      expect(record.rows).toHaveLength(4);
      expect(record.columns).toHaveLength(4);
      expect(record.cells).toHaveLength(16);
    }
  const overflow = maximum('54');
  const records = overflow.proposal.records as unknown[];
  records.push(structuredClone(records[0]));
  const ctx = makeParseContext(overflow.words, overflow.window);
  expect(parseExpansionMatrixProduct(overflow.proposal, ctx)).toBeNull();
  expect(ctx.issues.length).toBeGreaterThan(0);
});
it('preserves exact results, unresolved operands, zero and subpixel positives', () => {
  const scene = accepted(packet.stories[1]);
  if (scene.storyId !== '54' || scene.products[0].state !== 'derived')
    throw new Error('Expected worked product');
  expect(exactText(scene.products[0].cells[0].result)).toBe('-4');
  for (const state of ['unknown', 'missing', 'disputed']) {
    const absent = accepted(maximum('54', 3, state));
    if (absent.storyId !== '54') throw new Error('Expected matrix');
    expect(absent.records.every((m) => m.cells.length === 0)).toBe(true);
    expect(absent.products.every((p) => p.state === 'unavailable' && p.cells.length === 0)).toBe(
      true,
    );
    expect(
      projectionMatrixPages(absent).some((p) => p.lines.join('').includes('unresolved-operands')),
    ).toBe(true);
  }
  const zero = { numerator: 0, denominator: 1 },
    small = { numerator: 1, denominator: 1000000000 },
    one = { numerator: 1, denominator: 1 };
  expect(compare(zero, small)).toEqual({ ok: true, value: -1 });
  expect(rationalPosition(zero, zero, one)).toEqual({ ok: true, value: 0 });
  const position = rationalPosition(small, zero, one);
  expect(position.ok).toBe(true);
  if (position.ok) {
    expect(position.value).toBeGreaterThan(0);
    expect(position.value * 1000).toBeLessThan(1);
  }
  expect(exactText(small)).toBe('1/1000000000');
});
it('all frames, shuffled/repeated seeks, nonfinite input and final holds are pure finite poses', () => {
  for (const scene of cases()) {
    const before = JSON.stringify(scene);
    const pages = projectionMatrixPages(scene);
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.length).toBeLessThanOrEqual(4096);
    for (const page of pages) {
      expect(page.lines.length).toBeLessThanOrEqual(14);
      expect(page.lines.every((l) => Array.from(l).length <= 18)).toBe(true);
    }
    const reference = Array.from({ length: 361 }, (_, f) =>
      projectionMatrixPose(scene, f / 30, pages),
    );
    for (let i = 0; i <= 360; i++) {
      const f = (i * 137) % 361;
      const pose = projectionMatrixPose(scene, f / 30, pages);
      expect(pose).toEqual(reference[f]);
      expect(projectionMatrixPose(scene, f / 30, pages)).toEqual(pose);
      expect(
        [pose.reveal, pose.action, pose.response, pose.check, pose.resolve, pose.page].every(
          Number.isFinite,
        ),
      ).toBe(true);
    }
    for (const t of [NaN, Infinity, -Infinity])
      expect(projectionMatrixPose(scene, t, pages)).toEqual(
        projectionMatrixPose(scene, scene.setupAt, pages),
      );
    expect(projectionMatrixPose(scene, 100, pages)).toEqual(
      projectionMatrixPose(scene, 200, pages),
    );
    expect(JSON.stringify(scene)).toBe(before);
    expect(wrapSource('W'.repeat(96)).join('')).toBe('W'.repeat(96));
  }
});
