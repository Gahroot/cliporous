import { expect, it } from 'vitest';
import {
  parseExpansionDelayThroughput,
  parseExpansionPeriodicPhase,
} from '../../../../../ai/explainer/expansion-temporal-delay-phase-contract';
import { makeParseContext } from '../../../../../ai/explainer/kind-spec';
import {
  delayPhaseAmount,
  delayPhaseExtent,
  delayPhasePages,
  delayPhasePose,
  delayPhaseSignal,
} from './delay-phase-poses';
import {
  delayPhaseCases,
  delayPhaseRaw,
  delayPhaseStressSeed,
  parseDelayPhase,
} from './delay-phase-test-fixtures';

it('real source parser, both modes, all raw rejection cases and parser-owned stable IDs', () => {
  for (const seed of delayPhaseRaw) {
    const parser = seed.id === '45' ? parseExpansionDelayThroughput : parseExpansionPeriodicPhase;
    for (const visualMode of ['diagram', 'hybrid'] as const) {
      const ctx = makeParseContext(seed.words, seed.window);
      const a = parser({ ...seed.proposal, visualMode }, ctx);
      expect(a).not.toBeNull();
      expect(ctx.issues).toEqual([]);
      expect(a).toEqual(
        parser({ ...seed.proposal, visualMode }, makeParseContext(seed.words, seed.window)),
      );
      for (const negative of seed.negatives ?? []) {
        const context = makeParseContext(
          negative.words ?? seed.words,
          negative.window ?? seed.window,
        );
        expect(
          parser(
            {
              ...negative.proposal,
              visualMode: negative.proposal.visualMode === '3d' ? '3d' : visualMode,
            },
            context,
          ),
          negative.name,
        ).toBeNull();
      }
    }
  }
});
it('finite analytic poses: every frame, shuffled/repeated, nonfinite fallback, all five beats/final hold; domain data immutable', () => {
  for (const scene of delayPhaseCases()) {
    const original = JSON.stringify(scene);
    const sequential = Array.from({ length: 361 }, (_, frame) => delayPhasePose(scene, frame / 30));
    const seen = new Set(sequential.map((p) => p.page));
    expect(seen.size).toBe(delayPhasePages(scene).length);
    for (let frame = 0; frame <= 360; frame++) {
      const shuffled = (frame * 137) % 361;
      expect(delayPhasePose(scene, shuffled / 30)).toEqual(sequential[shuffled]);
      expect(delayPhasePose(scene, frame / 30)).toEqual(sequential[frame]);
      expect(Object.values(sequential[frame]).every(Number.isFinite)).toBe(true);
    }
    for (const t of [NaN, Infinity, -Infinity])
      expect(delayPhasePose(scene, t)).toEqual(delayPhasePose(scene, 0));
    const end = delayPhasePose(scene, scene.resolveAt + 1);
    expect(end).toMatchObject({ reveal: 1, action: 1, response: 1, check: 1, resolve: 1 });
    expect(delayPhasePose(scene, 100000)).toEqual(end);
    expect(JSON.stringify(scene)).toBe(original);
  }
});
it('zero is a zero marker, absent/disputed is not zero; no reciprocal/rate/winner', () => {
  for (const scene of delayPhaseCases())
    if (scene.storyId === '45') {
      for (const r of scene.records) {
        const extent = delayPhaseExtent(scene, r.id),
          value = delayPhaseAmount(r.quantity);
        if (!value) expect(extent).toBeNull();
        else {
          expect(extent).not.toBeNull();
          if (value.numerator === 0) expect(extent).toMatchObject({ zero: true, width: 0 });
        }
      }
      expect(scene.meaning).toBe('latency-and-throughput-independent');
    }
});
it('analytic sine/pulse teaching samples reverse time, retaining signed phase and matching the dial angular convention', () => {
  for (const mode of ['diagram', 'hybrid'] as const)
    for (const template of ['sine', 'pulse'] as const)
      for (const direction of ['clockwise', 'counterclockwise'] as const)
        for (const phase of [-45, 0, 45]) {
          const scene = parseDelayPhase(
            delayPhaseStressSeed('46', template, phase, direction),
            mode,
          );
          if (scene.storyId !== '46') throw new Error('Expected phase story');
          const r = scene.records.find(
            (r) => r.dimension === 'phase' && r.quantity.state === 'known',
          );
          if (!r || r.dimension !== 'phase') throw new Error('Missing sourced phase');
          const sign = direction === 'clockwise' ? 1 : -1;
          const data = delayPhaseSignal(scene, r.actorId, scene.actionAt, r.id);
          if (!data) throw new Error('Missing grounded teaching signal');
          expect(data.phase.numerator).toBe(phase);
          expect(data.angle).toBe((sign * phase * Math.PI) / 180);
          for (const [index, point] of data.points.split(' ').entries()) {
            const [x, y] = point.split(',').map(Number);
            const directedCycles = (sign * 2 * index) / 63;
            const value = Math.sin(2 * Math.PI * directedCycles + (sign * phase * Math.PI) / 180);
            const illustrated = template === 'pulse' ? (value >= 0 ? 1 : -1) : value;
            expect(x).toBeCloseTo(100 + (index / 63) * 700, 10);
            // Exact pulse threshold crossings have no measurement or invented amplitude: ±1 is the authored teaching carrier.
            if (template === 'sine' || Math.abs(value) > 1e-12)
              expect(y).toBeCloseTo(88 - illustrated * 48, 10);
          }
          for (const t of [
            scene.checkAt,
            scene.responseAt,
            scene.actionAt,
            scene.responseAt,
            scene.resolveAt + 1,
          ]) {
            const p = delayPhaseSignal(scene, r.actorId, t, r.id);
            const expectedElapsed = Math.min(delayPhasePose(scene, t).elapsed, 120);
            expect(p?.angle).toBeCloseTo(
              sign * ((2 * Math.PI * expectedElapsed) / 60 + (phase * Math.PI) / 180),
              12,
            );
            expect(p?.points).toBe(data.points);
            expect(p?.phase).toEqual(data.phase);
          }
        }
});
it('signed source phase and reference retained; absent phase never aligned zero; teaching waves bounded to 64 samples', () => {
  for (const scene of delayPhaseCases())
    if (scene.storyId === '46') {
      for (const entity of scene.entities) {
        const pose = delayPhaseSignal(scene, entity.id, scene.actionAt);
        const r = scene.records.find((r) => r.actorId === entity.id && r.dimension === 'phase');
        if (!r || !delayPhaseAmount(r.quantity)) expect(pose).toBeNull();
        if (pose) {
          expect(r?.dimension === 'phase' && r.referenceId).toBe(pose.referenceId);
          expect(pose.phase).toEqual(r && delayPhaseAmount(r.quantity));
          const s = scene.signals.find((s) => s.actorId === entity.id);
          const phaseRadians =
            (pose.phase.numerator / pose.phase.denominator) *
            (r?.quantity.basis.unit === 'degree' ? Math.PI / 180 : 1);
          expect(pose.angle).toBe((s?.direction === 'clockwise' ? 1 : -1) * phaseRadians);
          for (const t of [scene.checkAt, 0, scene.responseAt, scene.checkAt, NaN, Infinity]) {
            const expected = delayPhaseSignal(scene, entity.id, Number.isFinite(t) ? t : 0);
            expect(delayPhaseSignal(scene, entity.id, t)).toEqual(expected);
          }
          expect(pose.points.split(' ')).toHaveLength(64);
          expect(pose.points).not.toMatch(/NaN|Infinity/);
          expect(delayPhaseSignal(scene, entity.id, 100000)).toEqual(
            delayPhaseSignal(scene, entity.id, scene.resolveAt + 1),
          );
        }
      }
    }
});
