import { describe, expect, it } from 'vitest';
import type {
  CommercialFactState,
  CommercialStageState,
  FounderDependency,
} from '../../remotion/compositions/explainer/business/commercial/types';
import {
  parseBackOfficeBlueprint,
  parseOwnerDependencyBlueprint,
  parseServiceLifecycleBlueprint,
  parseServiceSlotsBlueprint,
} from './business-commercial-contract';
import { makeParseContext } from './kind-spec';

function story(preset: 'back-office' | 'service-slots', action: string, condition?: string) {
  const phases = [
    preset === 'back-office'
      ? 'Atlas back office offers Repair.'
      : 'Atlas offers Repair service slots.',
    action,
    'Repair records remain separate.',
    'Atlas checks its records carefully.',
    'Support remains separately stated.',
  ];
  const words: { text: string; start: number; end: number }[] = [];
  const starts: number[] = [];
  const times = [0, 1.5, 3.5, 5.5, 7.5];
  phases.forEach((phase, p) => {
    starts.push(words.length);
    const tokens = phase.split(' ');
    tokens.forEach((text, i) => {
      words.push({
        text,
        start: times[p] + i / tokens.length,
        end: times[p] + (i + 0.8) / tokens.length,
      });
    });
  });
  const setup = { fromWord: starts[0], toWord: starts[1] - 1 };
  const source = { fromWord: starts[1], toWord: starts[2] - 1 };
  const ctx = makeParseContext(words, {
    startWord: 0,
    endWord: words.length - 1,
    startTime: 0,
    endTime: 10,
  });
  return {
    ctx,
    source,
    raw: {
      kind: 'business-blueprint',
      preset,
      visualMode: 'diagram',
      evidence: 'source-stated',
      label: preset === 'back-office' ? 'back office' : 'service slots',
      subject: 'Atlas',
      outcome: 'Support remains separately stated',
      setupWord: starts[0],
      actionWord: starts[1],
      responseWord: starts[2],
      checkWord: starts[3],
      resolveWord: starts[4],
      factEvidence: {
        state: 'source-stated',
        label: 'Support remains separately stated',
        source: { fromWord: starts[4], toWord: words.length - 1 },
      },
      business: { id: 'atlas', label: 'Atlas', source: { ...setup } },
      service: { id: 'repair', label: 'Repair', source: { ...setup } },
      ...(condition ? { condition } : {}),
    },
  };
}

function backOffice(
  action = 'Atlas handles Payroll for Repair.',
  state: CommercialFactState = 'source-stated',
  condition?: string,
) {
  const fixture = story('back-office', action, condition);
  return {
    ctx: fixture.ctx,
    raw: {
      ...fixture.raw,
      tasks: [
        {
          task: { id: 'payroll', label: 'Payroll', source: { ...fixture.source } },
          state,
          source: { ...fixture.source },
        },
      ],
    },
  };
}

function slots(
  action = 'Atlas reserves 2 slots for Repair during July per 10 clients.',
  condition?: string,
) {
  const fixture = story('service-slots', action, condition);
  return {
    ctx: fixture.ctx,
    raw: {
      ...fixture.raw,
      reserved: {
        state: 'source-stated',
        count: 2,
        basis: {
          subjectId: 'atlas',
          population: 'clients',
          unit: 'slots',
          period: 'July',
          denominator: 10,
          source: { ...fixture.source },
        },
        source: { ...fixture.source },
      },
      used: null,
      available: null,
    },
  };
}

describe('back-office blueprint contract', () => {
  it.each([
    ['Atlas handles Payroll for Repair.', 'source-stated', undefined],
    ['Atlas does not handle Payroll for Repair.', 'negative', undefined],
    ['Whether Atlas handles Payroll for Repair is unknown.', 'unknown', undefined],
    ['If approved, Atlas will handle Payroll for Repair.', 'conditional', 'If approved'],
  ] satisfies [
    string,
    CommercialFactState,
    string | undefined,
  ][])('retains the state of %s', (action, state, condition) => {
    const { raw, ctx } = backOffice(action, state, condition);
    expect(parseBackOfficeBlueprint(raw, ctx)?.tasks[0].state).toBe(state);
  });

  it('rejects an unsupported root or nested field', () => {
    const { raw, ctx } = backOffice();
    expect(parseBackOfficeBlueprint({ ...raw, geometry: {} }, ctx)).toBeNull();
    expect(
      parseBackOfficeBlueprint({ ...raw, tasks: [{ ...raw.tasks[0], asset: 'invented' }] }, ctx),
    ).toBeNull();
  });

  it('does not upgrade negative support or crop off a condition', () => {
    const negative = backOffice('Atlas does not handle Payroll for Repair.');
    expect(parseBackOfficeBlueprint(negative.raw, negative.ctx)).toBeNull();
    const conditional = backOffice(
      'If approved, Atlas handles Payroll for Repair.',
      'source-stated',
      'If approved',
    );
    conditional.raw.tasks[0].source.fromWord += 2;
    expect(parseBackOfficeBlueprint(conditional.raw, conditional.ctx)).toBeNull();
  });
});

describe('service-slot blueprint contract', () => {
  it('keeps sourced counts, identical facts in both modes, and unmeasured availability null', () => {
    const { raw, ctx } = slots(
      'Atlas reserves 2 slots for Repair during July per 10 clients; Atlas uses 1 slots for Repair during July per 10 clients.',
    );
    const input = { ...raw, used: { ...structuredClone(raw.reserved), count: 1 } };
    const scene = parseServiceSlotsBlueprint(input, ctx);
    expect(scene?.reserved?.count).toBe(2);
    expect(scene?.used?.count).toBe(1);
    expect(scene?.available).toBeNull();
    expect(parseServiceSlotsBlueprint({ ...input, visualMode: 'hybrid' }, ctx)).toEqual({
      ...scene,
      visualMode: 'hybrid',
    });
  });

  it.each([
    ['Atlas has 3 slots available for Repair during July per 10 clients.', 'atlas'],
    ['Repair has 3 slots available at Atlas during July per 10 clients.', 'repair'],
  ])('accepts only explicitly stated availability: %s', (action, subjectId) => {
    const { raw, ctx } = slots(action);
    const available = {
      ...raw.reserved,
      count: 3,
      basis: { ...raw.reserved.basis, subjectId },
    };
    expect(
      parseServiceSlotsBlueprint({ ...raw, reserved: null, available }, ctx)?.available?.count,
    ).toBe(3);
  });

  it.each([
    ['Atlas does not reserve slots for Repair.', 'negative'],
    ["Atlas's reserved slots for Repair are unknown.", 'unknown'],
  ])('keeps %s null rather than zero', (action, state) => {
    const { raw, ctx } = slots(action);
    const input = { ...raw, reserved: { ...raw.reserved, state, count: null, basis: null } };
    expect(parseServiceSlotsBlueprint(input, ctx)?.reserved).toMatchObject({
      state,
      count: null,
      basis: null,
    });
    expect(
      parseServiceSlotsBlueprint({ ...input, reserved: { ...input.reserved, count: 0 } }, ctx),
    ).toBeNull();
  });

  it('keeps a sourced conditional quantity conditional', () => {
    const { raw, ctx } = slots(
      'If approved, Atlas reserves 2 slots for Repair during July per 10 clients.',
      'If approved',
    );
    expect(
      parseServiceSlotsBlueprint(
        { ...raw, reserved: { ...raw.reserved, state: 'conditional' } },
        ctx,
      )?.reserved?.state,
    ).toBe('conditional');
    expect(parseServiceSlotsBlueprint(raw, ctx)).toBeNull();
  });

  it('does not compare conditional reservations with source-stated usage', () => {
    const { raw, ctx } = slots(
      'If approved, Atlas reserves 2 slots for Repair during July per 10 clients; Atlas uses 1 slots for Repair during July per 10 clients.',
      'If approved',
    );
    const reserved = { ...raw.reserved, state: 'conditional' };
    const used = { ...structuredClone(raw.reserved), count: 1 };
    expect(parseServiceSlotsBlueprint({ ...raw, reserved, used }, ctx)).toBeNull();
  });

  it('accepts a stated zero and absent measurements, not invented availability', () => {
    const zero = slots('Atlas reserves 0 slots for Repair during July per 10 clients.');
    expect(
      parseServiceSlotsBlueprint(
        { ...zero.raw, reserved: { ...zero.raw.reserved, count: 0 } },
        zero.ctx,
      )?.reserved?.count,
    ).toBe(0);
    const fixture = slots();
    const { reserved: _reserved, used: _used, available: _available, ...unmeasured } = fixture.raw;
    expect(parseServiceSlotsBlueprint(unmeasured, fixture.ctx)).toMatchObject({
      reserved: null,
      used: null,
      available: null,
    });
  });

  it('rejects unsafe, ungrounded or incompatible numeric quantities', () => {
    const { raw, ctx } = slots();
    for (const count of [-1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1, 3]) {
      expect(
        parseServiceSlotsBlueprint({ ...raw, reserved: { ...raw.reserved, count } }, ctx),
      ).toBeNull();
    }
    for (const basis of [
      { ...raw.reserved.basis, unit: 'bookings' },
      { ...raw.reserved.basis, subjectId: 'other' },
      { ...raw.reserved.basis, denominator: null },
    ])
      expect(
        parseServiceSlotsBlueprint({ ...raw, reserved: { ...raw.reserved, basis } }, ctx),
      ).toBeNull();
    const different = slots(
      'Atlas reserves 2 slots for Repair during July per 10 clients; Atlas uses 1 slots for Repair during August per 10 clients.',
    );
    const used = {
      ...structuredClone(different.raw.reserved),
      count: 1,
      basis: { ...structuredClone(different.raw.reserved.basis), period: 'August' },
    };
    expect(parseServiceSlotsBlueprint({ ...different.raw, used }, different.ctx)).toBeNull();
  });

  it('rejects arbitrary keys at the root, quantity, basis and evidence span', () => {
    const { raw, ctx } = slots();
    for (const input of [
      { ...raw, capacity: 10 },
      { ...raw, reserved: { ...raw.reserved, style: 'custom' } },
      { ...raw, reserved: { ...raw.reserved, basis: { ...raw.reserved.basis, total: 10 } } },
      { ...raw, reserved: { ...raw.reserved, source: { ...raw.reserved.source, geometry: {} } } },
    ])
      expect(parseServiceSlotsBlueprint(input, ctx)).toBeNull();
  });
});

type StageRole = 'lead' | 'booking' | 'delivery';
function lifecycle(
  change?: { role: StageRole; state: CommercialStageState; claim: string },
  condition?: string,
  reuseBooking = false,
  identityClaim?: string,
  bookingFirst = false,
) {
  const claims = {
    lead: 'Atlas received Inquiry as a lead for Repair',
    booking: `Atlas booked ${reuseBooking ? 'Inquiry' : 'Reservation'} for Repair`,
    delivery: 'Atlas delivered Package for Repair',
  };
  if (change) claims[change.role] = change.claim.replace(/[.;]$/u, '');
  const clauses = [
    bookingFirst ? claims.booking : claims.lead,
    bookingFirst ? claims.lead : claims.booking,
    claims.delivery,
    ...(identityClaim ? [identityClaim] : []),
  ];
  const fixture = story('back-office', `${clauses.join('; ')}.`, condition);
  let fromWord = fixture.source.fromWord;
  const sources = clauses.map((claim) => {
    const span = { fromWord, toWord: fromWord + claim.split(' ').length - 1 };
    fromWord = span.toWord + 1;
    return span;
  });
  function stage(role: StageRole, index: number, id: string, label: string) {
    return {
      identity: { id, label, source: { ...sources[index] } },
      state: change?.role === role ? change.state : 'observed',
      source: { ...sources[index] },
    };
  }
  return {
    ctx: fixture.ctx,
    identitySource: sources[3],
    raw: {
      ...fixture.raw,
      preset: 'service-lifecycle',
      lead: stage('lead', bookingFirst ? 1 : 0, 'inquiry', 'Inquiry'),
      booking: stage(
        'booking',
        bookingFirst ? 0 : 1,
        reuseBooking ? 'inquiry' : 'reservation',
        reuseBooking ? 'Inquiry' : 'Reservation',
      ),
      delivery: stage('delivery', 2, 'package', 'Package'),
    },
  };
}

describe('service-lifecycle blueprint contract', () => {
  it('retains three independent named artifacts and the same facts in both modes', () => {
    const { raw, ctx } = lifecycle();
    const scene = parseServiceLifecycleBlueprint(raw, ctx);
    expect(scene?.lead.identity.id).toBe('inquiry');
    expect(scene?.booking.identity.id).toBe('reservation');
    expect(scene?.delivery.identity.id).toBe('package');
    expect(parseServiceLifecycleBlueprint({ ...raw, visualMode: 'hybrid' }, ctx)).toEqual({
      ...scene,
      visualMode: 'hybrid',
    });
  });

  it.each([
    ['lead', 'pending', 'Atlas has Inquiry pending as a lead for Repair.', undefined],
    ['booking', 'pending', 'Atlas has Reservation as a pending booking for Repair.', undefined],
    ['delivery', 'pending', 'Atlas has Package pending as a delivery for Repair.', undefined],
    ['booking', 'negative', 'Atlas did not book Reservation for Repair.', undefined],
    ['delivery', 'negative', 'Atlas did not deliver Package for Repair.', undefined],
    ['booking', 'unknown', "Atlas's booking Reservation for Repair is unknown.", undefined],
    ['delivery', 'unknown', 'Whether Atlas delivered Package for Repair is unknown.', undefined],
    [
      'booking',
      'conditional',
      'If approved, Atlas will book Reservation for Repair.',
      'If approved',
    ],
    [
      'delivery',
      'conditional',
      'If approved, Atlas may deliver Package for Repair.',
      'If approved',
    ],
  ] satisfies [
    StageRole,
    CommercialStageState,
    string,
    string | undefined,
  ][])('keeps %s %s', (role, state, claim, condition) => {
    const { raw, ctx } = lifecycle({ role, state, claim }, condition);
    expect(parseServiceLifecycleBlueprint(raw, ctx)?.[role].state).toBe(state);
  });

  it.each([
    ['booking', 'Atlas promises to book Reservation for Repair.', undefined],
    ['booking', 'Atlas received Reservation as a lead for Repair.', undefined],
    ['delivery', 'Atlas booked Package for Repair.', undefined],
    ['delivery', 'Atlas paid Package for Repair.', undefined],
    ['delivery', 'Atlas did not deliver Package for Repair.', undefined],
    ['booking', 'If approved, Atlas will book Reservation for Repair.', 'If approved'],
    ['booking', 'Reservation Atlas Repair booking.', undefined],
    ['booking', 'Other booked Reservation for Repair.', undefined],
    ['booking', 'Atlas booked Reservation for Other.', undefined],
  ] satisfies [
    StageRole,
    string,
    string | undefined,
  ][])('does not upgrade unsupported %s evidence: %s', (role, claim, condition) => {
    const { raw, ctx } = lifecycle({ role, state: 'observed', claim }, condition);
    expect(parseServiceLifecycleBlueprint(raw, ctx)).toBeNull();
  });

  it('rejects missing states and unsupported keys throughout the lifecycle payload', () => {
    const { raw, ctx } = lifecycle();
    const { state: _state, ...missingState } = raw.delivery;
    for (const input of [
      { ...raw, events: [] },
      { ...raw, delivery: missingState },
      { ...raw, booking: { ...raw.booking, paid: true } },
      { ...raw, lead: { ...raw.lead, identity: { ...raw.lead.identity, asset: 'invented' } } },
      { ...raw, delivery: { ...raw.delivery, source: { ...raw.delivery.source, geometry: {} } } },
    ])
      expect(parseServiceLifecycleBlueprint(input, ctx)).toBeNull();
  });

  it('requires the source facts to support the declared lifecycle order', () => {
    const { raw, ctx } = lifecycle(undefined, undefined, false, undefined, true);
    expect(parseServiceLifecycleBlueprint(raw, ctx)).toBeNull();
    expect(ctx.issues.join(' ')).toContain('order');
  });

  it('requires explicit stable identity evidence instead of equal labels or reused IDs', () => {
    const ungrounded = lifecycle(undefined, undefined, true);
    ungrounded.raw.booking.identity.source = { ...ungrounded.raw.lead.identity.source };
    expect(parseServiceLifecycleBlueprint(ungrounded.raw, ungrounded.ctx)).toBeNull();
    const renamedId = lifecycle(undefined, undefined, true);
    renamedId.raw.booking.identity.id = 'another-inquiry';
    expect(parseServiceLifecycleBlueprint(renamedId.raw, renamedId.ctx)).toBeNull();
    const stable = lifecycle(
      undefined,
      undefined,
      true,
      "Atlas retains Inquiry as the same artifact for Repair's lead and booking",
    );
    stable.raw.lead.identity.source = { ...stable.identitySource };
    stable.raw.booking.identity.source = { ...stable.identitySource };
    expect(parseServiceLifecycleBlueprint(stable.raw, stable.ctx)?.booking.identity.id).toBe(
      'inquiry',
    );
  });

  it('does not crop a condition away to claim an observed delivery', () => {
    const { raw, ctx } = lifecycle(
      {
        role: 'delivery',
        state: 'observed',
        claim: 'If approved, Atlas delivers Package for Repair.',
      },
      'If approved',
    );
    raw.delivery.source.fromWord += 2;
    expect(parseServiceLifecycleBlueprint(raw, ctx)).toBeNull();
  });
});

function owner(
  claim = "Atlas's Payroll depends on Ada.",
  state: FounderDependency['state'] = 'dependent',
  condition?: string,
) {
  const fixture = story('back-office', claim, condition);
  const { service: _service, ...base } = fixture.raw;
  return {
    ctx: fixture.ctx,
    raw: {
      ...base,
      preset: 'owner-dependency',
      founder: { id: 'ada', label: 'Ada', source: { ...fixture.source } },
      task: { id: 'payroll', label: 'Payroll', source: { ...fixture.source } },
      dependency: { state, source: { ...fixture.source } },
    },
  };
}

describe('owner-dependency blueprint contract', () => {
  it.each([
    ['dependent', "Atlas's Payroll depends on Ada.", undefined],
    ['dependent', 'Atlas depends on Ada for Payroll.', undefined],
    ['removed', "Atlas removed Payroll's dependency on Ada.", undefined],
    ['removed', 'Atlas has eliminated the dependency of Payroll on Ada.', undefined],
    ['conditional', "If approved, Atlas's Payroll will depend on Ada.", 'If approved'],
    ['negative', "Atlas's Payroll does not depend on Ada.", undefined],
    ['unknown', "Atlas's Payroll dependency on Ada is unknown.", undefined],
  ] satisfies [
    FounderDependency['state'],
    string,
    string | undefined,
  ][])('retains %s from %s', (state, claim, condition) => {
    const { raw, ctx } = owner(claim, state, condition);
    expect(parseOwnerDependencyBlueprint(raw, ctx)?.dependency.state).toBe(state);
  });

  it('keeps identical facts across modes without deriving bottlenecks or job loss', () => {
    const { raw, ctx } = owner();
    const scene = parseOwnerDependencyBlueprint(raw, ctx);
    expect(scene?.task.id).toBe('payroll');
    expect(scene?.founder.id).toBe('ada');
    expect(parseOwnerDependencyBlueprint({ ...raw, visualMode: 'hybrid' }, ctx)).toEqual({
      ...scene,
      visualMode: 'hybrid',
    });
  });

  it.each([
    ['removed', "Atlas did not remove Payroll's dependency on Ada.", undefined],
    ['removed', 'Atlas handed Payroll to Ada.', undefined],
    ['removed', "Atlas will remove Payroll's dependency on Ada.", undefined],
    ['removed', "Atlas's Payroll does not depend on Ada.", undefined],
    ['dependent', "Atlas's Payroll does not depend on Ada.", undefined],
    ['dependent', "Other's Payroll depends on Ada.", undefined],
    ['dependent', "Atlas's Payroll depends on Bea. Ada separately appears.", undefined],
    ['dependent', "Atlas's Invoicing depends on Ada. Payroll separately appears.", undefined],
    ['dependent', 'Atlas Ada Payroll dependency.', undefined],
    ['conditional', "Atlas's Payroll may depend on Ada.", undefined],
    ['removed', "If approved, Atlas will remove Payroll's dependency on Ada.", 'If approved'],
  ] satisfies [
    FounderDependency['state'],
    string,
    string | undefined,
  ][])('rejects unsupported %s: %s', (state, claim, condition) => {
    const { raw, ctx } = owner(claim, state, condition);
    expect(parseOwnerDependencyBlueprint(raw, ctx)).toBeNull();
  });

  it('requires distinct business, founder and task identities', () => {
    const { raw, ctx } = owner();
    expect(
      parseOwnerDependencyBlueprint(
        { ...raw, founder: { ...raw.founder, id: raw.business.id } },
        ctx,
      ),
    ).toBeNull();
    expect(
      parseOwnerDependencyBlueprint(
        { ...raw, task: { ...raw.task, label: raw.founder.label } },
        ctx,
      ),
    ).toBeNull();
  });

  it('rejects missing states and arbitrary nested/root keys', () => {
    const { raw, ctx } = owner();
    const { state: _state, ...missingState } = raw.dependency;
    for (const input of [
      { ...raw, job: {} },
      { ...raw, dependency: missingState },
      { ...raw, dependency: { ...raw.dependency, success: true } },
      { ...raw, founder: { ...raw.founder, asset: 'arbitrary' } },
      { ...raw, task: { ...raw.task, geometry: {} } },
      {
        ...raw,
        dependency: { ...raw.dependency, source: { ...raw.dependency.source, code: 'arbitrary' } },
      },
    ])
      expect(parseOwnerDependencyBlueprint(input, ctx)).toBeNull();
  });

  it('does not crop a condition into an unconditional dependency', () => {
    const { raw, ctx } = owner(
      "If approved, Atlas's Payroll depends on Ada.",
      'dependent',
      'If approved',
    );
    raw.dependency.source.fromWord += 2;
    expect(parseOwnerDependencyBlueprint(raw, ctx)).toBeNull();
  });
});
