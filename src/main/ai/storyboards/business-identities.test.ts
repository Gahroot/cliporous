import { describe, expect, it } from 'vitest';
import type { BusinessExplanationIdentityLink } from '../../../shared/business-explanation-source';
import {
  type BusinessSourceFixture,
  businessSourceFixture,
  businessSourceFixtures,
} from '../../remotion/compositions/explainer/business/source-fixtures';
import { parseBusinessExplanationSource } from './business-adapters';
import { APPROVAL_GATE_IDENTITY_SLOTS, businessExplanationIdentities } from './business-identities';

const context = { clipStart: 0, clipEnd: 90 };
const fixtures = businessSourceFixtures();
function input(f: BusinessSourceFixture, identityLinks: BusinessExplanationIdentityLink[] = []) {
  return { sourceVersion: 1, recipe: f.id, sourceChoices: structuredClone(f.raw), identityLinks };
}
function fixture(id: `OP-${string}`) {
  const f = businessSourceFixture(id, 'hybrid');
  if (!f) throw Error('fixture');
  return f;
}
function reconstructed(f: BusinessSourceFixture) {
  const result = parseBusinessExplanationSource(input(f), f.words, context);
  expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
  if (!result.ok) throw Error('reconstruction');
  return result.value;
}
describe('concrete source identity vocabulary and links', () => {
  it.each(
    fixtures,
  )('$fixtureId keeps native IDs/labels/spans and permits only concrete semantic roles', (f) => {
    const value = reconstructed(f),
      before = structuredClone(value);
    expect(new Set(value.identities.map((entry) => entry.identity.id)).size).toBe(
      value.identities.length,
    );
    for (const entry of value.identities) {
      const { id, source } = entry.identity;
      for (const role of entry.roles) {
        const link = {
          localId: id,
          sharedId: `board-${id}`,
          role,
          startWord: source.fromWord,
          endWord: source.toWord,
        };
        const result = parseBusinessExplanationSource(input(f, [link]), f.words, context);
        expect(result).toMatchObject({ ok: true });
        if (result.ok)
          expect(
            result.value.identities.find((identity) => identity.identity.id === id)?.link,
          ).toEqual(link);
      }
      const wrongRole = (['subject', 'actor', 'task', 'asset', 'claim'] as const).find(
        (role) => !entry.roles.includes(role),
      );
      if (wrongRole)
        expect(
          parseBusinessExplanationSource(
            input(f, [
              {
                localId: id,
                sharedId: 'bad-role',
                role: wrongRole,
                startWord: source.fromWord,
                endWord: source.toWord,
              },
            ]),
            f.words,
            context,
          ),
        ).toMatchObject({ ok: false, diagnostics: [{ code: 'identity' }] });
      expect(
        parseBusinessExplanationSource(
          input(f, [
            {
              localId: id,
              sharedId: 'bad-evidence',
              role: entry.roles[0],
              startWord: source.fromWord,
              endWord: source.toWord - 1,
            },
          ]),
          f.words,
          context,
        ).ok,
      ).toBe(false);
    }
    expect(value).toEqual(before);
  });
  it('OP-10 supplies code-owned agent/human/task/tool slots with complete independently supported clauses', () => {
    const f = fixture('OP-10'),
      value = reconstructed(f);
    expect(value.identities.map((entry) => entry.identity.id)).toEqual(
      APPROVAL_GATE_IDENTITY_SLOTS,
    );
    expect(value.identities.every((entry) => entry.origin === 'semantic-slot')).toBe(true);
    const wordsOf = (id: string) => {
      const entry = value.identities.find((entry) => entry.identity.id === id);
      if (!entry) throw Error('slot');
      return f.words
        .slice(entry.identity.source.fromWord, entry.identity.source.toWord + 1)
        .map((word) => word.text)
        .join(' ');
    };
    expect(wordsOf('agent')).toBe('Agent receives the monthly report.');
    expect(wordsOf('human-approver')).toBe('Human approves the task.');
    expect(wordsOf('task')).toBe(wordsOf('agent'));
    expect(wordsOf('tool')).toBe('Agent calls Report tool.');
    expect(value.identities.find((entry) => entry.identity.id === 'agent')?.roles).toEqual([
      'actor',
    ]);
    expect(value.identities.find((entry) => entry.identity.id === 'task')?.roles).toEqual([
      'subject',
      'task',
    ]);
    expect(() => businessExplanationIdentities(value.planned.scene)).toThrow(/authoritative raw/u);
  });
  it.each([
    'Agent',
    'Unknown human',
    'Human may',
    'Human never',
    'Another human',
  ])('OP-10 rejects swapped/proposed/negative approval actor: %s', (actor) => {
    const f = fixture('OP-10'),
      index = Number(f.raw.checkWord);
    f.words[index].text = actor;
    expect(parseBusinessExplanationSource(input(f), f.words, context).ok).toBe(false);
  });
  it('OP-58 firms retain authoritative dependencyLens source IDs/spans, not legacy holding aliases', () => {
    const f = fixture('OP-58'),
      value = reconstructed(f),
      scene = value.planned.scene;
    if (scene.kind !== 'portfolio-exposure' || !scene.dependencyLens) throw Error('lens');
    expect(value.identities.map((entry) => entry.identity.id)).toEqual(
      scene.dependencyLens.firms.map((firm) => firm.identity.id),
    );
    for (const firm of scene.dependencyLens.firms) {
      expect(
        value.identities.find((entry) => entry.identity.id === firm.identity.id)?.identity,
      ).toEqual(firm.identity);
      const link = {
        localId: firm.identity.id,
        sharedId: 'company',
        role: 'asset' as const,
        startWord: firm.holdingSource.fromWord,
        endWord: firm.holdingSource.toWord,
      };
      expect(parseBusinessExplanationSource(input(f, [link]), f.words, context)).toMatchObject({
        ok: false,
        diagnostics: [{ code: 'identity' }],
      });
    }
    const fundId = scene.funds[0].id;
    expect(
      parseBusinessExplanationSource(
        input(f, [
          { localId: fundId, sharedId: 'fund', role: 'subject', startWord: 0, endWord: 2 },
        ]),
        f.words,
        context,
      ),
    ).toMatchObject({ ok: false, diagnostics: [{ code: 'identity' }] });
  });
  it('rejects unresolved local IDs and shared-ID collapse instead of label-based equivalence', () => {
    const f = fixture('OP-73'),
      value = reconstructed(f),
      entries = value.identities.slice(0, 2);
    expect(
      parseBusinessExplanationSource(
        input(f, [
          { localId: 'absent', sharedId: 'owner', role: 'actor', startWord: 0, endWord: 1 },
        ]),
        f.words,
        context,
      ),
    ).toMatchObject({ ok: false, diagnostics: [{ code: 'identity' }] });
    const links = entries.map((entry) => ({
      localId: entry.identity.id,
      sharedId: 'same-business',
      role: entry.roles[0],
      startWord: entry.identity.source.fromWord,
      endWord: entry.identity.source.toWord,
    }));
    expect(parseBusinessExplanationSource(input(f, links), f.words, context)).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'identity' }],
    });
  });
});
