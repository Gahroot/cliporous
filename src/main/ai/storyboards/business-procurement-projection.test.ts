import { describe, expect, it } from 'vitest';
import { compactBusinessSourceChoices } from '../../../shared/business-source-choices';
import { procurementSourceFixture } from '../../remotion/compositions/explainer/business/markets/fixtures';
import { marketsRows } from '../../remotion/compositions/explainer/business/markets/presentation';
import { formatMoney } from '../../remotion/compositions/explainer/finance/poses';
import { parseBusinessExplanationSource } from './business-adapters';
import { businessPanelProjection } from './business-diagrams';

const variants = [
  'pending',
  'paid',
  'shared-requester-delegate',
  'unknown-approver',
  'conditional-quote',
  'conditional-payment',
] as const;

describe('lossless board procurement role-context projection', () => {
  it.each(
    variants,
  )('%s preserves role mappings, unknowns and complete qualified money/actions', (variant) => {
    const fixture = procurementSourceFixture(variant);
    const compact = compactBusinessSourceChoices({ ...fixture.raw, visualMode: 'diagram' });
    if (!compact.ok) throw new Error(compact.message);
    const parsed = parseBusinessExplanationSource(
      { sourceVersion: 2, recipe: 'OP-47', sourceChoices: compact.choices, identityLinks: [] },
      fixture.words,
      { clipStart: 0, clipEnd: 90 },
    );
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.diagnostics));
    const scene = parsed.value.planned.scene;
    if (scene.kind !== 'procurement-commitment') throw new Error('Wrong concrete source kind');
    const before = JSON.stringify(scene);
    const projected = businessPanelProjection(scene);
    if (!projected.ok) throw new Error(JSON.stringify(projected.diagnostics));
    const rows = projected.value.rows;
    expect(rows.map((row) => row.id)).toEqual(
      marketsRows(scene)
        .filter(
          (row) =>
            row.id !== 'identities' ||
            !scene.actors.every((actor) =>
              Object.values(scene.roles).some((role) => role.actorId === actor.id),
            ),
        )
        .map((row) => row.id),
    );
    const visible = [
      ...projected.value.headings,
      ...rows.flatMap((row) => row.cells),
      ...projected.value.notes,
    ].join(' ');
    for (const identity of projected.value.identities) expect(visible).toContain(identity.label);
    for (const role of ['requester', 'delegate', 'approver', 'payee'] as const) {
      const actorId = scene.roles[role].actorId;
      const row = rows.find((entry) => entry.id === `role-${role}`);
      expect(row?.cells).toEqual([
        role,
        actorId === null ? 'unknown' : 'source-stated',
        actorId === null ? 'Unknown' : scene.actors.find((actor) => actor.id === actorId)?.label,
      ]);
    }
    expect(
      projected.value.notes.filter(
        (note) => note === `Task: ${scene.task.label} · item: ${scene.item.label}`,
      ),
    ).toHaveLength(1);
    const actorLabel = (role: 'requester' | 'delegate' | 'approver' | 'payee'): string =>
      scene.actors.find((actor) => actor.id === scene.roles[role].actorId)?.label ?? 'Unknown';
    for (const fact of marketsRows(scene)) {
      if (fact.id.startsWith('role-')) continue;
      const index = rows.findIndex((row) => row.id === fact.id);
      if (index < 0 && fact.id === 'identities') continue;
      expect(index).toBeGreaterThanOrEqual(0);
      expect(rows[index].cells.slice(0, 2)).toEqual([fact.label, fact.state]);
      if (fact.id === 'quote' || fact.id === 'payment') {
        const money = fact.id === 'quote' ? scene.quote : scene.payment;
        const text = rows[index].cells[2];
        expect(text).toContain(money.identity.label);
        expect(text).toContain(
          fact.id === 'quote'
            ? `${actorLabel('payee')}→${actorLabel('requester')}`
            : `${actorLabel('requester')}→${actorLabel('payee')}`,
        );
        expect(text).toContain(money.amount ? formatMoney(money.amount) : 'Amount unknown');
        if (money.basis) {
          expect(text).toContain(money.basis.unit);
          expect(text).toContain(String(money.basis.denominator ?? 'unknown'));
          expect(text).toContain(money.basis.population);
          expect(text).toContain(money.basis.period);
        } else expect(text).toContain('Basis unknown');
        if (money.state === 'conditional')
          expect(projected.value.notes).toContain(`Condition: ${scene.condition}`);
      } else if (fact.id === 'request' && scene.request.state === 'requested')
        expect(rows[index].cells[2]).toBe(`${actorLabel('requester')}→${actorLabel('delegate')}`);
      else if (fact.id === 'authority' && scene.authority.state === 'granted')
        expect(rows[index].cells[2]).toBe(`${actorLabel('approver')}→${actorLabel('delegate')}`);
      else if (fact.id === 'acceptance' && scene.acceptance.state === 'accepted')
        expect(rows[index].cells[2]).toBe(
          `${actorLabel('requester')}→${scene.quote.identity.label}`,
        );
      else expect(rows[index].cells[2]).toBe(fact.text);
    }
    expect(JSON.stringify(scene)).toBe(before);
    expect(projected.value.identities.map((identity) => identity.id)).toEqual(
      expect.arrayContaining([
        scene.task.id,
        scene.item.id,
        ...scene.actors.map((actor) => actor.id),
      ]),
    );
  });
});
