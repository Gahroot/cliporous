import { describe, expect, it } from 'vitest';
import type { ExplainerLayout } from '../../remotion/compositions/explainer/types';
import { applyVarietyRules, type VarietyScene } from './variety';

const BOUNDS = { minStart: 0, maxEnd: 100 };

function s(
  startTime: number,
  endTime: number,
  kind: VarietyScene['kind'],
  layout: ExplainerLayout = 'stack',
  extra: Partial<VarietyScene> = {},
): VarietyScene {
  return {
    startTime,
    endTime,
    kind,
    layout,
    layouts: ['stack', 'over', 'takeover', 'pip'],
    chained: false,
    ...extra,
  };
}

describe('applyVarietyRules', () => {
  it('drops the same kind back to back', () => {
    const out = applyVarietyRules(
      [s(0, 4, 'number'), s(8, 12, 'number'), s(16, 20, 'chart')],
      BOUNDS,
    );
    expect(out.map((o) => o.kind)).toEqual(['number', 'chart']);
  });

  it('enforces the talking gap except for chains', () => {
    const out = applyVarietyRules(
      [s(0, 4, 'number'), s(4.5, 8, 'chart'), s(8, 12, 'notes', 'stack', { chained: true })],
      BOUNDS,
    );
    expect(out.map((o) => o.kind)).toEqual(['number', 'notes']);
    expect(out[1]?.chained).toBe(false);
  });

  it('keeps a chained scene on the previous layout', () => {
    const out = applyVarietyRules(
      [s(10, 14, 'number', 'over'), s(14, 19, 'chart', 'stack', { chained: true })],
      BOUNDS,
    );
    expect(out.map((o) => [o.layout, o.chained])).toEqual([
      ['over', false],
      ['over', true],
    ]);
  });

  it('varies the layout between separate moments', () => {
    const out = applyVarietyRules([s(0, 4, 'number'), s(10, 14, 'chart')], BOUNDS);
    expect(out.map((o) => o.layout)).toEqual(['stack', 'over']);
  });

  it('limits takeover length and frequency', () => {
    const out = applyVarietyRules(
      [
        s(0, 3, 'statement', 'takeover'),
        s(8, 11, 'stamp', 'takeover'),
        s(20, 26, 'hero', 'takeover'),
        s(40, 43, 'statement', 'takeover'),
      ],
      BOUNDS,
    );
    // 2nd: too soon → demoted; 3rd: too long → demoted, then varied off 'stack'.
    expect(out.map((o) => o.layout)).toEqual(['takeover', 'stack', 'over', 'takeover']);
  });

  it('caps total coverage', () => {
    const out = applyVarietyRules(
      [s(0, 14, 'notes'), s(16, 30, 'chart'), s(32, 46, 'loop'), s(48, 62, 'network')],
      { minStart: 0, maxEnd: 70 },
    );
    // 55% of 70s = 38.5s → only two 14s scenes fit.
    expect(out).toHaveLength(2);
  });
});

describe('applyVarietyRules — families', () => {
  it('drops the third separate moment in a row from one family', () => {
    const out = applyVarietyRules(
      [
        s(0, 4, 'versus', 'stack', { family: 'compare' }),
        s(10, 14, 'myth-fact', 'stack', { family: 'compare' }),
        s(20, 24, 'balance', 'stack', { family: 'compare' }),
        s(30, 34, 'checklist', 'stack', { family: 'list' }),
      ],
      { minStart: 0, maxEnd: 200 },
    );
    expect(out.map((o) => o.kind)).toEqual(['versus', 'myth-fact', 'checklist']);
  });

  it('allows the same family again after a different one', () => {
    const out = applyVarietyRules(
      [
        s(0, 4, 'versus', 'stack', { family: 'compare' }),
        s(10, 14, 'checklist', 'stack', { family: 'list' }),
        s(20, 24, 'balance', 'stack', { family: 'compare' }),
      ],
      { minStart: 0, maxEnd: 200 },
    );
    expect(out.map((o) => o.kind)).toEqual(['versus', 'checklist', 'balance']);
  });
});
