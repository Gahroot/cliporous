import {
  parseAuthorityHandoff,
  parseConstraintCheck,
  parseDelegationScope,
} from '../../../../../ai/explainer/business-authority-contract';
import type {
  ParseContext,
  PlannerWord,
  Rec,
  SceneWindow,
} from '../../../../../ai/explainer/kind-spec';
import type { BusinessIdentity, BusinessWordSpan } from '../types';
import type { AuthorityBusinessScene } from './types';

export type AuthorityRecipeId =
  | 'OP-09'
  | 'OP-11'
  | 'OP-12'
  | 'OP-13'
  | 'OP-14'
  | 'OP-15'
  | 'OP-16'
  | 'OP-74';
export interface AuthorityRawFixture {
  recipeId: AuthorityRecipeId;
  raw: Rec;
  words: PlannerWord[];
  window: SceneWindow;
}
interface Sentence {
  key: string;
  text: string;
}
interface Blocks {
  action: Sentence[];
  response: Sentence[];
  check: Sentence[];
}
interface Sources {
  span: (key: string) => BusinessWordSpan;
  identity: (id: string, label: string, key?: string) => BusinessIdentity;
}

/** Authored raw payloads plus literal transcript words, not prevalidated scene bodies. */
function fixture(
  recipeId: AuthorityRecipeId,
  kind: AuthorityBusinessScene['kind'],
  preset: AuthorityBusinessScene['preset'],
  evidence: 'source-stated' | 'illustrative',
  outcome: string,
  blocks: Blocks,
  payload: (sources: Sources) => Rec,
): AuthorityRawFixture {
  const words: PlannerWord[] = [];
  const spans = new Map<string, BusinessWordSpan>();
  function part(sentences: Sentence[], at: number, until: number): number {
    const first = words.length;
    const count = sentences.reduce((n, sentence) => n + sentence.text.split(/\s+/u).length, 0);
    const step = (until - at - 0.1) / count;
    let index = 0;
    for (const sentence of sentences) {
      const fromWord = words.length;
      for (const text of sentence.text.split(/\s+/u)) {
        const start = at + index++ * step;
        words.push({ text, start, end: start + step * 0.8 });
      }
      if (spans.has(sentence.key)) throw new Error(`Duplicate source key ${sentence.key}`);
      spans.set(sentence.key, { fromWord, toWord: words.length - 1 });
    }
    return first;
  }
  const setupWord = part(
    [
      {
        key: 'intro',
        text: `Bot Lead Owner Analyst Send report Release funds Authority report.${evidence === 'illustrative' ? ' Illustrative authority.' : ''}`,
      },
      { key: 'record', text: 'Bot Send report uses Playbook revision R1.' },
    ],
    0.35,
    1.1,
  );
  const actionWord = part(blocks.action, 1.1, 2.1);
  const responseWord = part(blocks.response, 2.1, 3);
  const checkWord = part(blocks.check, 3.2, 10.2);
  const resolveWord = part([{ key: 'final', text: `Bot Send report ${outcome}.` }], 10.2, 11.4);
  const span = (key: string): BusinessWordSpan => {
    const value = spans.get(key);
    if (!value) throw new Error(`Missing authored source ${key}`);
    return { ...value }; // Separate JSON nodes; the bounded parser rejects aliasing/cycles.
  };
  const sources: Sources = {
    span,
    identity: (id, label, key = 'intro') => ({ id, label, source: span(key) }),
  };
  const window: SceneWindow = {
    startWord: 0,
    endWord: words.length - 1,
    startTime: 0,
    endTime: 11.7,
  };
  return {
    recipeId,
    words,
    window,
    raw: {
      kind,
      preset,
      visualMode: 'diagram',
      label: 'Authority report',
      subject: 'Bot',
      outcome,
      evidence,
      startWord: window.startWord,
      endWord: window.endWord,
      layout: 'stack',
      setupWord,
      actionWord,
      responseWord,
      checkWord,
      resolveWord,
      factEvidence: {
        state: evidence,
        label: evidence === 'illustrative' ? 'Illustrative authority' : 'Authority report',
        source: span('intro'),
      },
      ...payload(sources),
    },
  };
}
function basis(source: BusinessWordSpan, unit = 'reports'): Rec {
  return {
    subjectId: 'send',
    population: 'requests',
    unit,
    period: 'June',
    denominator: 10,
    source,
  };
}
function roles(s: Sources): Rec {
  return {
    taskId: 'send',
    performerId: 'bot',
    approverId: 'lead',
    accountableOwnerId: 'owner',
    source: s.span('roles'),
  };
}
function version(s: Sources): Rec {
  return {
    identity: s.identity('playbook', 'Playbook', 'record'),
    version: 'R1',
    source: s.span('record'),
  };
}
const roleSentence = {
  key: 'roles',
  text: 'Bot performs Send report. Lead approves Send report. Owner remains accountable for Send report.',
};

export const AUTHORITY_RAW_FIXTURES: readonly AuthorityRawFixture[] = [
  fixture(
    'OP-09',
    'delegation-scope',
    'permissions',
    'source-stated',
    'Permissions stated',
    {
      action: [
        {
          key: 'send',
          text: 'Bot can perform Send report. Bot is permitted to perform Send report.',
        },
        {
          key: 'release',
          text: 'Bot can perform Release funds. Bot is denied permission to perform Release funds.',
        },
      ],
      response: [
        {
          key: 'scope',
          text: 'Bot scope for Send report is Reporting. Bot scope for Release funds is Reporting.',
        },
      ],
      check: [
        {
          key: 'expiry',
          text: 'Bot authority expiry for Send report is unknown. Bot authority expiry for Release funds is unknown.',
        },
      ],
    },
    (s) => ({
      actor: s.identity('bot', 'Bot'),
      scope: { label: 'Reporting', source: s.span('scope') },
      expiry: { state: 'unknown', value: null, source: s.span('expiry') },
      permissions: [
        {
          action: s.identity('send', 'Send report'),
          capability: 'capable',
          permission: 'permitted',
          source: s.span('send'),
        },
        {
          action: s.identity('release', 'Release funds'),
          capability: 'capable',
          permission: 'denied',
          source: s.span('release'),
        },
      ],
    }),
  ),
  fixture(
    'OP-11',
    'delegation-scope',
    'action-limits',
    'source-stated',
    'Limits stated',
    {
      action: [
        {
          key: 'decision',
          text: 'Bot can perform Send report. Bot permission to perform Send report is pending.',
        },
      ],
      response: [
        { key: 'scope', text: 'Bot scope for Send report is Reporting.' },
        { key: 'condition', text: 'Bot condition Approval for Send report is pending.' },
        {
          key: 'cap',
          text: 'Bot sets Send report Cap to at most 2 reports for requests during June per 10 requests.',
        },
        {
          key: 'budget',
          text: 'Bot sets Send report Budget to at most 1.25 USD for requests during June per 10 requests.',
        },
      ],
      check: [{ key: 'expiry', text: 'Bot authority for Send report expires 30 June 2026.' }],
    },
    (s) => ({
      actor: s.identity('bot', 'Bot'),
      action: s.identity('send', 'Send report'),
      capability: 'capable',
      permission: 'pending',
      decisionSource: s.span('decision'),
      scope: { label: 'Reporting', source: s.span('scope') },
      actionCondition: { ...s.identity('approval', 'Approval', 'condition'), state: 'pending' },
      expiry: { state: 'stated', value: '30 June 2026', source: s.span('expiry') },
      limits: [
        {
          ...s.identity('cap', 'Cap', 'cap'),
          operator: 'at-most',
          measurement: { kind: 'count', value: 2, basis: basis(s.span('cap')) },
        },
        {
          ...s.identity('budget', 'Budget', 'budget'),
          operator: 'at-most',
          measurement: {
            kind: 'money',
            amount: { minorUnits: 125, currency: 'USD' },
            basis: basis(s.span('budget'), 'USD'),
          },
        },
      ],
    }),
  ),
  fixture(
    'OP-12',
    'authority-handoff',
    'exception-review',
    'illustrative',
    'Review pending',
    {
      action: [roleSentence],
      response: [{ key: 'review', text: 'Lead review of Escalation for Send report is pending.' }],
      check: [
        {
          key: 'reviewCost',
          text: 'Lead review cost for Send report is 1.25 USD for requests during June per 10 requests.',
        },
        {
          key: 'retryCost',
          text: 'Bot retry cost for Send report is 2 USD for requests during June per 10 requests.',
        },
      ],
    },
    (s) => ({
      actors: [s.identity('bot', 'Bot'), s.identity('lead', 'Lead'), s.identity('owner', 'Owner')],
      action: s.identity('send', 'Send report'),
      roles: roles(s),
      exception: s.identity('escalation', 'Escalation', 'review'),
      review: { state: 'pending', source: s.span('review') },
      reviewCost: {
        state: 'known',
        amount: { minorUnits: 125, currency: 'USD' },
        basis: basis(s.span('reviewCost'), 'USD'),
        source: s.span('reviewCost'),
      },
      retryCost: {
        state: 'known',
        amount: { minorUnits: 200, currency: 'USD' },
        basis: basis(s.span('retryCost'), 'USD'),
        source: s.span('retryCost'),
      },
    }),
  ),
  fixture(
    'OP-13',
    'authority-handoff',
    'declared-audit-chain',
    'illustrative',
    'Declared chain',
    {
      action: [
        {
          key: 'submitted',
          text: 'Bot declares Submitted for Send report in Playbook revision R1.',
        },
      ],
      response: [
        { key: 'checked', text: 'Bot reviews Checked for Send report in Playbook revision R1.' },
        { key: 'noted', text: 'Bot records Noted for Send report in Playbook revision R1.' },
      ],
      check: [
        { key: 'retained', text: 'Bot records Retained for Send report in Playbook revision R1.' },
      ],
    },
    (s) => ({
      actors: [s.identity('bot', 'Bot')],
      action: s.identity('send', 'Send report'),
      record: version(s),
      events: [
        { ...s.identity('submitted', 'Submitted', 'submitted'), actorId: 'bot', verb: 'declares' },
        { ...s.identity('checked', 'Checked', 'checked'), actorId: 'bot', verb: 'reviews' },
        { ...s.identity('noted', 'Noted', 'noted'), actorId: 'bot', verb: 'records' },
        { ...s.identity('retained', 'Retained', 'retained'), actorId: 'bot', verb: 'records' },
      ],
    }),
  ),
  fixture(
    'OP-14',
    'authority-handoff',
    'action-consequences',
    'source-stated',
    'Irreversibility stated',
    {
      action: [{ key: 'reversibility', text: 'Bot performing Send report is irreversible.' }],
      response: [
        { key: 'consequence', text: 'Bot consequence of Send report is External delivery.' },
      ],
      check: [{ key: 'hold', text: 'External delivery remains source-stated.' }],
    },
    (s) => ({
      actors: [s.identity('bot', 'Bot')],
      action: s.identity('send', 'Send report'),
      performerId: 'bot',
      reversibility: { state: 'irreversible', source: s.span('reversibility') },
      consequence: {
        state: 'source-stated',
        label: 'External delivery',
        source: s.span('consequence'),
      },
    }),
  ),
  fixture(
    'OP-15',
    'authority-handoff',
    'accountable-transfer',
    'source-stated',
    'Transfer pending',
    {
      action: [roleSentence],
      response: [{ key: 'transfer', text: 'Bot transfer of Send report to Analyst is pending.' }],
      check: [{ key: 'hold', text: 'Owner remains accountable for Send report.' }],
    },
    (s) => ({
      actors: [
        s.identity('bot', 'Bot'),
        s.identity('lead', 'Lead'),
        s.identity('owner', 'Owner'),
        s.identity('analyst', 'Analyst'),
      ],
      action: s.identity('send', 'Send report'),
      roles: roles(s),
      fromId: 'bot',
      toId: 'analyst',
      transfer: { state: 'pending', source: s.span('transfer') },
    }),
  ),
  fixture(
    'OP-16',
    'constraint-check',
    'conflicting-limits',
    'source-stated',
    'Conflict unresolved',
    {
      action: [
        {
          key: 'cap',
          text: 'Bot sets Send report Cap to at most 2 reports for requests during June per 10 requests.',
        },
      ],
      response: [
        {
          key: 'floor',
          text: 'Bot sets Send report Floor to at least 3 reports for requests during June per 10 requests.',
        },
      ],
      check: [
        {
          key: 'collision',
          text: 'Bot Send report Cap conflicts with Floor. Bot Send report remains unresolved.',
        },
      ],
    },
    (s) => ({
      actor: s.identity('bot', 'Bot'),
      action: s.identity('send', 'Send report'),
      requirements: [
        {
          ...s.identity('cap', 'Cap', 'cap'),
          operator: 'at-most',
          measurement: { kind: 'count', value: 2, basis: basis(s.span('cap')) },
        },
        {
          ...s.identity('floor', 'Floor', 'floor'),
          operator: 'at-least',
          measurement: { kind: 'count', value: 3, basis: basis(s.span('floor')) },
        },
      ],
      collision: { state: 'unresolved', source: s.span('collision') },
    }),
  ),
  fixture(
    'OP-74',
    'constraint-check',
    'dated-conditions',
    'source-stated',
    'Dates remain pending',
    {
      action: [
        { key: 'approval', text: 'Bot condition Approval for Send report is pending.' },
        { key: 'approvalDate', text: 'Bot Send report Approval date is 20 June 2026.' },
        { key: 'delivery', text: 'Bot condition Delivery for Send report is pending.' },
        { key: 'deliveryDate', text: 'Bot Send report Delivery date is 30 June 2026.' },
      ],
      response: [
        { key: 'receipt', text: 'Bot condition Receipt for Send report is unknown.' },
        { key: 'receiptDate', text: 'Bot Send report Receipt date is unknown.' },
        { key: 'archive', text: 'Bot condition Archive for Send report is blocked.' },
        { key: 'archiveDate', text: 'Bot Send report Archive date is 31 December 2026.' },
      ],
      check: [
        {
          key: 'relationship',
          text: 'Bot Send report Approval with Delivery with Receipt with Archive are unresolved.',
        },
      ],
    },
    (s) => ({
      actor: s.identity('bot', 'Bot'),
      action: s.identity('send', 'Send report'),
      policy: version(s),
      conditions: [
        {
          ...s.identity('approval', 'Approval', 'approval'),
          state: 'pending',
          date: { state: 'stated', value: '20 June 2026', source: s.span('approvalDate') },
        },
        {
          ...s.identity('delivery', 'Delivery', 'delivery'),
          state: 'pending',
          date: { state: 'stated', value: '30 June 2026', source: s.span('deliveryDate') },
        },
        {
          ...s.identity('receipt', 'Receipt', 'receipt'),
          state: 'unknown',
          date: { state: 'unknown', value: null, source: s.span('receiptDate') },
        },
        {
          ...s.identity('archive', 'Archive', 'archive'),
          state: 'blocked',
          date: { state: 'stated', value: '31 December 2026', source: s.span('archiveDate') },
        },
      ],
      relationship: { state: 'unresolved', source: s.span('relationship') },
    }),
  ),
];

/** Dedicated accepted-transfer source with explicitly no approval role. */
export const AUTHORITY_NO_APPROVER_TRANSFER_FIXTURE = fixture(
  'OP-15',
  'authority-handoff',
  'accountable-transfer',
  'source-stated',
  'Transfer accepted',
  {
    action: [
      {
        key: 'roles',
        text: 'Bot performs Send report. Send report requires no approval. Owner remains accountable for Send report.',
      },
    ],
    response: [{ key: 'transfer', text: 'Bot transfer of Send report to Analyst is accepted.' }],
    check: [{ key: 'hold', text: 'Owner remains accountable for Send report.' }],
  },
  (s) => ({
    actors: [
      s.identity('bot', 'Bot'),
      s.identity('owner', 'Owner'),
      s.identity('analyst', 'Analyst'),
    ],
    action: s.identity('send', 'Send report'),
    roles: { ...roles(s), approverId: null },
    fromId: 'bot',
    toId: 'analyst',
    transfer: { state: 'accepted', source: s.span('transfer') },
  }),
);

/** Unknown costs are explicit absence of quantities, not hidden invented zeros/bases. */
export const AUTHORITY_UNKNOWN_COST_FIXTURE = fixture(
  'OP-12',
  'authority-handoff',
  'exception-review',
  'illustrative',
  'Review pending',
  {
    action: [roleSentence],
    response: [{ key: 'review', text: 'Lead review of Escalation for Send report is pending.' }],
    check: [
      { key: 'reviewCost', text: 'Lead review cost for Send report is unknown.' },
      { key: 'retryCost', text: 'Bot retry cost for Send report is unknown.' },
    ],
  },
  (s) => ({
    actors: [s.identity('bot', 'Bot'), s.identity('lead', 'Lead'), s.identity('owner', 'Owner')],
    action: s.identity('send', 'Send report'),
    roles: roles(s),
    exception: s.identity('escalation', 'Escalation', 'review'),
    review: { state: 'pending', source: s.span('review') },
    reviewCost: { state: 'unknown', amount: null, source: s.span('reviewCost') },
    retryCost: { state: 'unknown', amount: null, source: s.span('retryCost') },
  }),
);

export function authorityFixtureContext(fixture: AuthorityRawFixture): ParseContext {
  const { words, window: win } = fixture;
  return {
    words,
    win,
    issues: [],
    lastBeat: win.endTime - 0.3,
    inWin: (value) =>
      typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= win.startWord &&
      value <= win.endWord
        ? value
        : null,
    at: (index) =>
      Math.max(win.startTime + 0.3, Math.min(win.endTime - 0.3, words[index]?.start ?? NaN)),
    str: (value, max) => {
      if (typeof value !== 'string') return null;
      const text = value.replace(/\s+/gu, ' ').trim();
      return text.length > 0 && text.length <= max ? text : null;
    },
    icon: () => 'Circle',
  };
}
/** Real contracts; preserves diagnostics instead of manufacturing a typed scene. */
export function parseAuthorityFixture(fixture: AuthorityRawFixture): {
  scene: AuthorityBusinessScene | null;
  issues: string[];
} {
  const ctx = authorityFixtureContext(fixture);
  const scene =
    fixture.raw.kind === 'delegation-scope'
      ? parseDelegationScope(fixture.raw, ctx)
      : fixture.raw.kind === 'authority-handoff'
        ? parseAuthorityHandoff(fixture.raw, ctx)
        : fixture.raw.kind === 'constraint-check'
          ? parseConstraintCheck(fixture.raw, ctx)
          : null;
  return { scene, issues: ctx.issues };
}
