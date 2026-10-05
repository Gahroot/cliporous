import { describe, expect, it } from 'vitest';
import {
  parseWorkFixture,
  WORK_SOURCE_FIXTURES,
  type WorkSourceFixture,
} from '../../remotion/compositions/explainer/business/work/fixtures';
import { WORK_RECIPE_IDS } from '../../remotion/compositions/explainer/business/work/types';
import { isRec, type Rec } from './kind-spec';

function fixture(id: string): WorkSourceFixture {
  const value = WORK_SOURCE_FIXTURES.find((entry) => entry.id === id);
  if (!value) throw new Error(`Missing ${id}`);
  return structuredClone(value);
}
function firstRow(raw: Rec, field: string): Rec {
  const value = raw[field];
  if (!Array.isArray(value) || !isRec(value[0])) throw new Error(`Missing ${field} row`);
  return value[0];
}

describe('work source fixtures through the real three parsers', () => {
  it('covers exactly all eleven frozen recipe ids', () => {
    expect(WORK_SOURCE_FIXTURES.map((value) => value.id)).toEqual(WORK_RECIPE_IDS);
  });
  it.each(WORK_SOURCE_FIXTURES)('accepts $id raw source and derives all five beats', (value) => {
    const before = structuredClone(value);
    const { scene, issues } = parseWorkFixture(value);
    expect(issues).toEqual([]);
    expect(scene).not.toBeNull();
    if (!scene) throw new Error(`${value.id}: ${issues.join('; ')}`);
    expect(scene.recipeId).toBe(value.id);
    expect(scene.kind).toBe(value.raw.kind);
    const beats = [scene.setupAt, scene.actionAt, scene.responseAt, scene.checkAt, scene.resolveAt];
    expect(beats.every(Number.isFinite)).toBe(true);
    expect(beats).toEqual([...beats].sort((a, b) => a - b));
    expect(value.window.endTime - scene.resolveAt).toBeGreaterThanOrEqual(1);
    expect(scene.factEvidence.source.fromWord).toBeGreaterThanOrEqual(value.window.startWord);
    expect(scene.factEvidence.source.toWord).toBeLessThanOrEqual(value.window.endWord);
    expect(value).toEqual(before);
    expect(parseWorkFixture(value)).toEqual({ scene, issues });
  });
  it('OP-01 supports a desk inbox only through explicit pending paperwork evidence', () => {
    const value = fixture('OP-01');
    const { scene, issues } = parseWorkFixture(value);
    expect(issues).toEqual([]);
    if (scene?.kind !== 'task-map' || scene.preset !== 'task-split')
      throw new Error('Missing task split');
    expect(scene.holds).toHaveLength(1);
    const hold = scene.holds[0];
    expect(hold).toMatchObject({ actorId: 'ada', taskId: 'review', state: 'pending' });
    const source = value.words
      .slice(hold.source.fromWord, hold.source.toWord + 1)
      .map((word) => word.text)
      .join(' ');
    expect(source).toBe('Review is pending for Ada. Review paperwork is pending for Ada.');
    const links =
      scene.ownership.reduce((count, row) => count + 2 + (row.approverId === null ? 0 : 1), 0) +
      scene.splits.length +
      scene.holds.length;
    expect(links).toBe(9);
    expect(links).toBeLessThanOrEqual(12);
    delete value.raw.holds;
    expect(parseWorkFixture(value).scene?.holds).toEqual([]);
  });
  it('OP-01 rejects a pending hold when its source says filed instead', () => {
    const value = fixture('OP-01');
    value.words = value.words.map((word) => ({
      ...word,
      text: word.text === 'pending' ? 'filed' : word.text,
    }));
    expect(parseWorkFixture(value).scene).toBeNull();
  });
  it.each(WORK_SOURCE_FIXTURES)('rejects asset directives on $id', (value) => {
    const { scene, issues } = parseWorkFixture({ ...value, raw: { ...value.raw, asset: 'A-04' } });
    expect(scene).toBeNull();
    expect(issues.length).toBeGreaterThan(0);
  });
  it('preserves conditional, unknown capability and pending review facts', () => {
    const cross = parseWorkFixture(fixture('OP-03')).scene;
    if (cross?.kind !== 'coordination-map' || cross.preset !== 'cross-function')
      throw new Error('Missing cross-function');
    expect(cross.handoffs[0].state).toBe('conditional');
    expect(cross.handoffs[0].condition?.label).toBe('If review clears');
    const capacity = parseWorkFixture(fixture('OP-07')).scene;
    if (capacity?.kind !== 'coordination-map' || capacity.preset !== 'supervised-fanout')
      throw new Error('Missing fanout');
    expect(capacity.reviewCapacity).toMatchObject({ state: 'unknown', value: null, basis: null });
    const pending = parseWorkFixture(fixture('OP-32')).scene;
    if (pending?.kind !== 'coordination-map' || pending.preset !== 'approval-load')
      throw new Error('Missing queue');
    expect(pending.queue.state).toBe('pending');
    expect(pending.reviews[0].state).toBe('pending');
    expect(pending.load).toMatchObject({ state: 'unknown', value: null, basis: null });
    const capability = parseWorkFixture(fixture('OP-02')).scene;
    if (capability?.kind !== 'task-map' || capability.preset !== 'capability-boundary')
      throw new Error('Missing capabilities');
    expect(capability.capabilities.map((row) => row.state)).toEqual([
      'tested',
      'unavailable',
      'unknown',
    ]);
  });
  it.each([
    ['OP-01', 'ownership', { performerId: 'bo' }],
    ['OP-03', 'handoffs', { state: 'observed' }],
    ['OP-04', 'ownership', { accountableOwnerId: 'ada' }],
    ['OP-06', 'allocations', { actorId: 'other-worker' }],
    ['OP-07', 'reviews', { performerId: 'dee' }],
    ['OP-32', 'reviews', { state: 'observed' }],
  ])('rejects role/state substitution on %s', (id, field, patch) => {
    if (typeof id !== 'string' || typeof field !== 'string' || !isRec(patch))
      throw new Error('Invalid negative case');
    const value = fixture(id);
    Object.assign(firstRow(value.raw, field), patch);
    expect(parseWorkFixture(value).scene).toBeNull();
  });
  it('rejects hybrid OP-02 and measured load without its source basis', () => {
    const capability = fixture('OP-02');
    capability.raw.visualMode = 'hybrid';
    expect(parseWorkFixture(capability).scene).toBeNull();
    const load = fixture('OP-08');
    if (!isRec(load.raw.load)) throw new Error('Missing load');
    load.raw.load.basis = null;
    expect(parseWorkFixture(load).scene).toBeNull();
  });
  it.each(['OP-05', 'OP-18'])('rejects unapproved or wrong-revision use on %s', (id) => {
    const value = fixture(id);
    if (!isRec(value.raw.use) || !isRec(value.raw.approval)) throw new Error('Missing playbook');
    value.raw.use.version = 'v2';
    expect(parseWorkFixture(value).scene).toBeNull();
    value.raw.use.version = 'v1';
    value.raw.approval.source = isRec(value.raw.capture) ? value.raw.capture.source : null;
    expect(parseWorkFixture(value).scene).toBeNull();
  });
  it('does not release a bottleneck merely by changing its configured state', () => {
    const value = fixture('OP-80');
    if (!isRec(value.raw.after)) throw new Error('Missing constraint');
    value.raw.after.state = 'released';
    expect(parseWorkFixture(value).scene).toBeNull();
  });
  it.each([
    ['OP-04', 'ownership', 4],
    ['OP-02', 'capabilities', 5],
    ['OP-03', 'handoffs', 5],
    ['OP-07', 'reviews', 5],
    ['OP-32', 'holds', 3],
  ])('bounds native-readable %s %s', (id, field, count) => {
    if (typeof id !== 'string' || typeof field !== 'string' || typeof count !== 'number')
      throw new Error('Invalid bound case');
    const value = fixture(id);
    const row = firstRow(value.raw, field);
    value.raw[field] = Array.from({ length: count }, () => structuredClone(row));
    const result = parseWorkFixture(value);
    expect(result.scene).toBeNull();
    expect(result.issues.join(' ')).toMatch(/three|four|two|3|4|2/iu);
  });
  it.each(['OP-01', 'OP-04'])('does not treat peer review as approval authority on %s', (id) => {
    const value = fixture(id);
    value.words = value.words.map((word) => ({
      ...word,
      text: word.text === 'approves' ? 'reviews' : word.text,
    }));
    expect(parseWorkFixture(value).scene).toBeNull();
  });
  it.each(['approval', 'approver'])('OP-32 requires explicitly sourced %s authority', (token) => {
    const value = fixture('OP-32');
    value.words = value.words.map((word) => ({
      ...word,
      text: word.text === token ? 'peer-review' : word.text,
    }));
    const result = parseWorkFixture(value);
    expect(result.scene).toBeNull();
    expect(result.issues.join(' ')).toMatch(/approval queue|approval authority/iu);
  });
});
