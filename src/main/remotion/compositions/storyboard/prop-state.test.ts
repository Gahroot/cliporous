import { describe, expect, it } from 'vitest';
import { STORYBOARD_MODEL_ACTIONS, STORYBOARD_MODELS } from '../../../../shared/storyboards';
import {
  actionClock,
  actionEnd,
  boardCanvasCount,
  propPose,
  supportedModel,
  visibleBoardProps,
} from './prop-state';
import type { BoardProp } from './types';

const prop: BoardProp = {
  id: 'subject-1',
  semanticId: 'battery',
  model: 'battery',
  action: 'activate',
  at: 2,
  actionEndAt: 4,
  x: 0,
  y: 0,
  size: 200,
};
const cam = { x: 0, y: 0, zoom: 1 };
const visible = (props: BoardProp[], t = 3) => visibleBoardProps(props, [], cam, t, 1920, 1080);

describe('shared stage resource/clock contract', () => {
  it('has zero canvases for 2D, hidden and fully culled boards, one for up to six props', () => {
    expect(boardCanvasCount(visible([]))).toBe(0);
    expect(boardCanvasCount(visible([prop], 1))).toBe(0);
    expect(boardCanvasCount(visible([{ ...prop, x: 10000 }]))).toBe(0);
    const six = Array.from({ length: 6 }, (_, i) => ({ ...prop, id: `subject-${i}`, x: i * 100 }));
    expect(visible(six)).toHaveLength(6);
    expect(boardCanvasCount(visible(six))).toBe(1);
    expect(() => visible([...six, prop])).toThrow(/budget/);
  });
  it('culls full silhouettes, not centres, and returns a held pose after revisiting', () => {
    expect(visible([{ ...prop, x: 1000 }])).toHaveLength(1);
    const before = visible([prop], 8);
    visibleBoardProps([prop], [], { x: 10000, y: 0, zoom: 1 }, 10, 1920, 1080);
    expect(visible([prop], 30)).toEqual(before);
  });
  it('bounds every allowed action, repeats seeks and freezes every completed model clock', () => {
    for (const model of STORYBOARD_MODELS)
      for (const action of STORYBOARD_MODEL_ACTIONS[model]) {
        const p = { ...prop, model, action };
        expect(actionClock(p, 1, 30).frame).toBe(0);
        const final = actionClock(p, 4, 30);
        for (const t of [40, 6, 15, 4]) {
          expect(actionClock(p, t, 30)).toEqual(final);
          expect(propPose(p, [], t)).toEqual(propPose(p, [], 4));
        }
        expect(actionClock(p, 3, 30)).toEqual(actionClock(p, 3, 30));
        if (action === 'reveal') expect(final.frame).toBe(0);
        else expect(final.frame).toBeGreaterThan(0);
        expect(final.tone).toBe(action === 'deactivate' ? 'down' : 'up');
      }
  });
  it('holds default/proof flight, glow and shake clocks without endless settling', () => {
    const p: BoardProp = {
      ...prop,
      model: 'lightbulb',
      actionEndAt: undefined,
      glowAt: 6,
      shakeAt: 5,
      flight: { from: { x: -300, y: 0 }, via: { x: -100, y: -50 }, dur: 1 },
    };
    const end = actionEnd(p);
    expect(propPose(p, [], end)).toEqual(propPose(p, [], 100));
    expect(propPose(p, [], end).glow).toBe(1);
    expect(propPose({ ...p, action: 'deactivate' }, [], end).glow).toBe(0);
  });
  it('rejects unsupported models and model/action combinations', () => {
    expect(() => supportedModel({ ...prop, model: 'bulb' })).toThrow(/Unsupported/);
    expect(() => supportedModel({ ...prop, model: 'gears', action: 'deactivate' })).toThrow(
      /Unsupported/,
    );
  });
});
