import { describe, expect, it } from 'vitest';
import { isRec } from '../../../../../ai/explainer/kind-spec';
import { BUSINESS_RECIPES } from '../catalog';
import type { BusinessClock } from '../motion';
import {
  AUTHORITY_RAW_FIXTURES,
  type AuthorityRawFixture,
  parseAuthorityFixture,
} from './fixtures';
import {
  AUTHORITY_BODY,
  authorityFacts,
  authorityLines,
  authorityPages,
  sampleBusinessAuthority,
} from './poses';
import { AUTHORITY_MIN_READING_HOLD, authorityReadability } from './readability';
import type { AuthorityBusinessScene } from './types';

function parsed(fixture: AuthorityRawFixture): AuthorityBusinessScene {
  const result = parseAuthorityFixture(fixture);
  if (!result.scene) throw new Error(`${fixture.recipeId}: ${result.issues.join('; ')}`);
  return result.scene;
}
function clock(scene: AuthorityBusinessScene, seconds: number): BusinessClock {
  return { frame: seconds * 30, fps: 30, beats: scene };
}
function numbers(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(numbers);
  if (value && typeof value === 'object') return Object.values(value).flatMap(numbers);
  return [];
}
function stateVariant(recipeId: string, field: string, state: string): AuthorityBusinessScene {
  const fixture = AUTHORITY_RAW_FIXTURES.find((entry) => entry.recipeId === recipeId);
  if (!fixture) throw new Error('Missing authored fixture');
  const raw = structuredClone(fixture.raw);
  if (!isRec(raw[field])) throw new Error('Missing declared state');
  raw[field].state = state;
  if (typeof raw.outcome !== 'string') throw new Error('Missing outcome');
  raw.outcome = raw.outcome.replace(/\bpending\b/gu, state);
  return parsed({
    ...fixture,
    raw,
    words: fixture.words.map((word) => ({
      ...word,
      text: word.text.replace(/^pending\.$/u, `${state}.`),
    })),
  });
}

// Real parser -> pure poses. CPU layout arithmetic, not measured fonts/GPU/rendered proof.
describe('authority frame poses and lossless native detail layout', () => {
  it.each(
    AUTHORITY_RAW_FIXTURES,
  )('$recipeId validates real D/H visibility, every >=1.5s slot and rejected insufficient holds', (fixture) => {
    const recipe = BUSINESS_RECIPES.find((entry) => entry.id === fixture.recipeId);
    if (!recipe) throw new Error('Missing catalog recipe');
    for (const visualMode of recipe.modes) {
      const input: AuthorityRawFixture = {
        ...fixture,
        raw: { ...structuredClone(fixture.raw), visualMode },
      };
      const scene = parsed(input);
      const reading = authorityReadability(scene);
      expect(reading.issue).toBeNull();
      expect(reading.readingStart).toBeCloseTo(
        visualMode === 'hybrid'
          ? scene.responseAt + Math.min(0.7, scene.checkAt - scene.responseAt)
          : scene.setupAt + 0.35,
      );
      expect(reading.secondsPerPage).toBeGreaterThanOrEqual(AUTHORITY_MIN_READING_HOLD);
      expect(
        sampleBusinessAuthority(scene, clock(scene, reading.readingStart - 0.01)).pageIndex,
      ).toBe(0);
      for (let page = 0; page < reading.pages.length; page++) {
        const start = reading.readingStart + page * reading.secondsPerPage;
        const last = start + reading.secondsPerPage - 0.001;
        expect(sampleBusinessAuthority(scene, clock(scene, start + 0.001)).pageIndex).toBe(page);
        expect(sampleBusinessAuthority(scene, clock(scene, last)).pageIndex).toBe(page);
      }
      expect(reading.layout.panelHeight).toBeGreaterThan(0);
      expect(sampleBusinessAuthority(scene, clock(scene, scene.resolveAt)).status).toContain(
        scene.subject,
      );
      expect(authorityFacts(scene).map((fact) => fact.label)).not.toContain('Evidence');
      expect(authorityFacts(scene).map((fact) => fact.label)).not.toContain('Subject');
      // Shorten only the checked/final source phases, preserving all words and monotone timing.
      const target = reading.readingStart + reading.requiredSeconds - 0.001;
      if (typeof input.raw.checkWord !== 'number' || typeof input.raw.resolveWord !== 'number')
        throw new Error('Missing source beats');
      const checkWord = input.raw.checkWord;
      const resolveWord = input.raw.resolveWord;
      const ratio = (target - scene.checkAt) / (scene.resolveAt - scene.checkAt);
      const short = parseAuthorityFixture({
        ...input,
        words: input.words.map((word, index) => {
          if (index < checkWord) return word;
          if (index < resolveWord)
            return {
              ...word,
              start: scene.checkAt + (word.start - scene.checkAt) * ratio,
              end: scene.checkAt + (word.end - scene.checkAt) * ratio,
            };
          return {
            ...word,
            start: word.start + target - scene.resolveAt,
            end: word.end + target - scene.resolveAt,
          };
        }),
      });
      expect(short.scene).toBeNull();
      if (target < scene.checkAt + 1) {
        // Minimal two-page diagrams hit the earlier beat guard before page readability.
        expect(short.issues[0]).toBe(
          'resolveWord must be at least 1s after checkWord; phases are too compressed',
        );
      } else {
        expect(short.issues.join(' ')).toContain('after full');
        expect(short.issues.join(' ')).toContain('split');
      }
    }
  });

  it('rejects an oversized persistent header plus detail rails rather than shrinking text', () => {
    const fixture = AUTHORITY_RAW_FIXTURES.find((entry) => entry.recipeId === 'OP-74');
    if (!fixture) throw new Error('Missing source');
    const scene = parsed(fixture);
    const reading = authorityReadability({ ...scene, subject: 'Oversized '.repeat(40) });
    expect(reading.issue).toContain('fixed-font rails');
    expect(reading.issue).toContain('split');
  });
  it.each(
    AUTHORITY_RAW_FIXTURES,
  )('$recipeId is finite, bounded, repeatable and backward/shuffle seekable', (fixture) => {
    const scene = parsed(fixture);
    const times = [
      -2,
      0,
      scene.setupAt,
      scene.actionAt,
      scene.responseAt,
      scene.checkAt,
      (scene.checkAt + scene.resolveAt) / 2,
      scene.resolveAt,
      scene.resolveAt + 10,
    ];
    const original = JSON.stringify(scene);
    const reference = new Map(
      times.map((t) => [t, sampleBusinessAuthority(scene, clock(scene, t))]),
    );
    for (const t of [
      ...times,
      ...[...times].reverse(),
      scene.checkAt,
      0,
      scene.resolveAt,
      scene.setupAt,
    ]) {
      const pose = sampleBusinessAuthority(scene, clock(scene, t));
      expect(pose).toEqual(reference.get(t));
      expect(numbers(pose).every(Number.isFinite)).toBe(true);
      for (const value of [
        pose.opacity,
        pose.binderOpen,
        pose.gateAccepted,
        ...pose.cards.map((card) => card.focus),
      ]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      expect(pose.pageIndex).toBeGreaterThanOrEqual(0);
      expect(pose.pageIndex).toBeLessThan(pose.pages.length);
      expect(pose.observedExecution).toBe(false);
    }
    expect(JSON.stringify(scene)).toBe(original);
    for (const frame of [NaN, Infinity, -Infinity, Number.MAX_VALUE]) {
      for (const fps of [0, -30, NaN, Infinity, 30, Number.MIN_VALUE]) {
        expect(
          numbers(sampleBusinessAuthority(scene, { frame, fps, beats: scene })).every(
            Number.isFinite,
          ),
        ).toBe(true);
      }
    }
  });

  it.each(
    AUTHORITY_RAW_FIXTURES,
  )('$recipeId settles by resolveAt, retaining every source status and all detail text in final hold', (fixture) => {
    const scene = parsed(fixture);
    const final = sampleBusinessAuthority(scene, clock(scene, scene.resolveAt));
    for (const after of [1 / 30, 1, 10, 100]) {
      expect(sampleBusinessAuthority(scene, clock(scene, scene.resolveAt + after))).toEqual(final);
    }
    expect(final.binderRevision).toBe(0); // One stated guidance identity, not invented versions/retraining.
    expect(final.observedExecution).toBe(false);
    for (const t of [scene.setupAt, scene.actionAt, scene.responseAt, scene.checkAt]) {
      const pose = sampleBusinessAuthority(scene, clock(scene, t));
      expect(pose.status).toBe(final.status);
      expect(pose.declaration).toBe(final.declaration);
      expect(pose.pages).toEqual(final.pages);
      expect(pose.cards.map((card) => [card.id, card.permission, card.state])).toEqual(
        final.cards.map((card) => [card.id, card.permission, card.state]),
      );
    }
  });

  it.each(
    AUTHORITY_RAW_FIXTURES,
  )('$recipeId keeps every fact and uses bounded fixed-font continuation panels', (fixture) => {
    const scene = parsed(fixture);
    const facts = authorityFacts(scene);
    const pages = authorityPages(facts);
    const pose = sampleBusinessAuthority(scene, clock(scene, scene.resolveAt));
    const headerHeight =
      authorityLines(pose.status, AUTHORITY_BODY.columns).length * AUTHORITY_BODY.lineHeight + 16;
    const footerTop =
      AUTHORITY_BODY.height -
      authorityLines(pose.declaration, AUTHORITY_BODY.columns).length * AUTHORITY_BODY.lineHeight -
      8;
    for (const fact of facts) {
      const visible = pages
        .flat()
        .filter((panel) => panel.label === fact.label)
        .flatMap((panel) => panel.lines)
        .join('');
      expect(visible.replace(/\s/gu, '')).toBe(fact.value.replace(/\s/gu, ''));
    }
    for (const page of pages) {
      expect(page.length).toBeLessThanOrEqual(2);
      for (const panel of page) {
        expect(panel.lines.length).toBeLessThanOrEqual(3);
        expect(panel.lines.every((line) => line.length <= 14)).toBe(true);
        const labels = authorityLines(panel.label, 14);
        const baseline =
          headerHeight + 44 + (labels.length + panel.lines.length - 1) * AUTHORITY_BODY.lineHeight;
        expect(baseline + 8).toBeLessThanOrEqual(footerTop - 12);
      }
    }
    expect(14 * AUTHORITY_BODY.fontSize * 1.1).toBeLessThanOrEqual(444 - 40);
    expect(authorityLines('X'.repeat(200), 14).join('')).toBe('X'.repeat(200));
  });

  it('keeps capable-but-denied permission separate and never uses it to open a gate', () => {
    const fixture = AUTHORITY_RAW_FIXTURES.find((entry) => entry.recipeId === 'OP-09');
    if (!fixture) throw new Error('Missing permission source');
    const scene = parsed(fixture);
    if (scene.preset !== 'permissions') throw new Error('Wrong source');
    expect(scene.permissions.map((entry) => entry.capability)).toEqual(['capable', 'capable']);
    for (const seconds of [0, scene.checkAt, scene.resolveAt, scene.resolveAt + 100]) {
      const pose = sampleBusinessAuthority(scene, clock(scene, seconds));
      expect(pose.cards.map((card) => [card.permission, card.state])).toEqual([
        ['permitted', 'allowed'],
        ['denied', 'denied'],
      ]);
      expect(pose.gateAccepted).toBe(0);
      expect(pose.status).toContain('denied');
    }
  });

  it.each([
    'pending',
    'denied',
    'unknown',
  ])('keeps review and transfer %s distinct without completing or moving the gate', (state) => {
    for (const [recipe, field] of [
      ['OP-12', 'review'],
      ['OP-15', 'transfer'],
    ]) {
      const scene = stateVariant(recipe, field, state);
      for (const t of [0, scene.checkAt, scene.resolveAt, scene.resolveAt + 100]) {
        const pose = sampleBusinessAuthority(scene, clock(scene, t));
        expect(pose.status).toContain(state);
        expect(pose.gateAccepted).toBe(0);
        expect(pose.observedExecution).toBe(false);
      }
    }
  });

  it('source-accepted transfer and source approver do not establish observed execution', () => {
    const scene = stateVariant('OP-15', 'transfer', 'accepted');
    const pose = sampleBusinessAuthority(scene, clock(scene, scene.resolveAt));
    expect(pose.gateAccepted).toBe(1);
    expect(pose.observedExecution).toBe(false);
    expect(pose.status).toContain('Execution not evidenced');
    expect(authorityFacts(scene).find((fact) => fact.label === 'Approver')?.value).toBe('Lead');
  });

  it('retains exact source money, quantity bases, dates, pending conditions and unresolved collision', () => {
    for (const fixture of AUTHORITY_RAW_FIXTURES) {
      const scene = parsed(fixture);
      const text = authorityFacts(scene)
        .map((fact) => `${fact.label}: ${fact.value}`)
        .join('\n');
      if (scene.preset === 'action-limits') {
        expect(text).toContain('1.25 USD');
        expect(text).toContain('Max 2 reports / 10 requests / June');
        expect(text).toContain('30 June 2026');
        expect(text).toContain('Approval: pending');
        expect(sampleBusinessAuthority(scene, clock(scene, scene.resolveAt)).gateAccepted).toBe(0);
      }
      if (scene.preset === 'exception-review') expect(text).toContain('2 USD / 10 requests / June');
      if (scene.preset === 'dated-conditions') {
        expect(text).toContain('20 June 2026');
        expect(text).toContain('unknown; date unknown');
        expect(text).toContain('31 December 2026');
      }
      if (scene.preset === 'conflicting-limits') expect(text).toContain('Unresolved conflict');
    }
  });
});
