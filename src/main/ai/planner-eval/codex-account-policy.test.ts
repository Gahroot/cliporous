import { describe, expect, it, vi } from 'vitest';
import {
  CODEX_ACCOUNT_POLICY,
  type CodexAccountBlocker,
  type CodexAccountPolicyOptions,
  type CodexAccountPreflight,
  evaluateCodexAccountPolicy,
} from './codex-account-policy';

const selection: CodexAccountPolicyOptions = Object.freeze({
  selectedModel: 'model-a',
  selectedReasoning: 'high',
  automaticCreditReloadDisabledAttestation: true,
});

function metadata(): CodexAccountPreflight {
  return {
    policyVersion: 'batchclip-gg-chatgpt-v1',
    upstreamRevision: 'd7f3e960f03544554a6dbff3bc1c1ac9cf27c374',
    authMode: 'chatgpt',
    ordinaryUsageAllowed: true,
    credits: { hasCredits: false, unlimited: false, balance: '0' },
    models: [{ id: 'model-a', reasoningLevels: ['low', 'high'] }],
    toolCount: 0,
    isolation: {
      userConfig: false,
      projectConfig: false,
      instructions: false,
      hooks: false,
      plugins: false,
      mcp: false,
      skills: false,
    },
    serviceTier: 'default',
  };
}

function check(raw: unknown, options: CodexAccountPolicyOptions = selection) {
  return evaluateCodexAccountPolicy(JSON.stringify(raw), options);
}

function expectBlocked(raw: unknown, blocker: CodexAccountBlocker) {
  const result = check(raw);
  expect(result.ready).toBe(false);
  expect(result.blockers).toContain(blocker);
  expect(Object.keys(result).sort()).toEqual(['blockers', 'ready']);
}

describe('Codex account policy: metadata-only subscription boundary', () => {
  it('requires the pinned GG helper contract and every independent permission', () => {
    expect(CODEX_ACCOUNT_POLICY.policyVersion).toBe('batchclip-gg-chatgpt-v1');
    expect(CODEX_ACCOUNT_POLICY.upstreamRevision).toBe('d7f3e960f03544554a6dbff3bc1c1ac9cf27c374');
    expect(check(metadata())).toEqual({ ready: true, blockers: [] });
    expect(evaluateCodexAccountPolicy(JSON.stringify(metadata(), null, 2), selection)).toEqual({
      ready: true,
      blockers: [],
    });
  });

  it.each([
    '0',
    '0.0',
    '0.00000000',
    `0.${'0'.repeat(62)}`,
  ])('accepts only explicitly empty wallet evidence (zero format %s)', (balance) => {
    expect(
      check({ ...metadata(), credits: { hasCredits: false, unlimited: false, balance } }),
    ).toEqual({ ready: true, blockers: [] });
  });

  it.each([
    'none',
    'apikey',
  ])('rejects %s authentication despite other safe metadata', (authMode) => {
    expectBlocked({ ...metadata(), authMode }, 'chatgpt-auth-required');
  });

  it.each([
    [false, 'ordinary-usage-denied'],
    [null, 'ordinary-usage-unavailable'],
  ] as const)('does not infer ordinary usage permission from %s', (ordinaryUsageAllowed, blocker) => {
    expectBlocked({ ...metadata(), ordinaryUsageAllowed }, blocker);
  });

  it.each([
    ['hasCredits', null, 'credit-wallet-unavailable'],
    ['unlimited', null, 'credit-wallet-unavailable'],
    ['balance', null, 'credit-wallet-unavailable'],
    ['hasCredits', true, 'credit-wallet-funded'],
    ['unlimited', true, 'credit-wallet-unlimited'],
    ['balance', '1', 'credit-wallet-funded'],
    ['balance', '0.00000000000000000000000000000000000001', 'credit-wallet-funded'],
    ['balance', '99999999999999999999999999999999999999', 'credit-wallet-funded'],
  ] as const)('blocks wallet %s=%s', (field, value, blocker) => {
    expectBlocked({ ...metadata(), credits: { ...metadata().credits, [field]: value } }, blocker);
  });

  it.each([
    '',
    ' ',
    ' 0',
    '0 ',
    '-0',
    '-1',
    '+0',
    '00',
    '.0',
    '0.',
    '0e0',
    '1e-999',
    'NaN',
    'Infinity',
    '0 USD',
    '0\n',
    '０',
    0,
    false,
    '0'.repeat(65),
  ])('does not coerce malformed balance %j', (balance) => {
    expectBlocked(
      { ...metadata(), credits: { ...metadata().credits, balance } },
      'invalid-preflight',
    );
  });

  it.each([
    undefined,
    false,
  ])('requires a separate explicit user attestation (%s)', (attestation) => {
    const options = { ...selection, automaticCreditReloadDisabledAttestation: attestation };
    expect(check(metadata(), options)).toEqual({
      ready: false,
      blockers: ['automatic-credit-reload-attestation-required'],
    });
    const { automaticCreditReloadDisabledAttestation: _, ...missing } = selection;
    expect(check(metadata(), missing).ready).toBe(false);
  });

  it('does not accept a native assertion in place of the user attestation', () => {
    expectBlocked(
      { ...metadata(), automaticCreditReloadDisabledAttestation: true },
      'invalid-preflight',
    );
  });

  it.each(['priority', 'fast', 'flex'])('does not authorize service tier %s', (serviceTier) => {
    expectBlocked({ ...metadata(), serviceTier }, 'default-service-tier-required');
  });

  it.each([1, 2, 1024])('rejects nonzero tool count %s', (toolCount) => {
    expectBlocked({ ...metadata(), toolCount }, 'tools-not-disabled');
  });

  it.each(Object.keys(metadata().isolation))('rejects inherited %s', (surface) => {
    expectBlocked(
      { ...metadata(), isolation: { ...metadata().isolation, [surface]: true } },
      'isolation-not-enforced',
    );
  });

  it('rejects unpinned policy and revision', () => {
    expectBlocked(
      { ...metadata(), policyVersion: 'batchclip-text-only-v2' },
      'unsupported-policy-version',
    );
    expectBlocked(
      { ...metadata(), upstreamRevision: '0'.repeat(40) },
      'unsupported-upstream-revision',
    );
  });

  it('reports independent failures in a stable order without echoing metadata', () => {
    const bad = {
      ...metadata(),
      authMode: 'apikey',
      ordinaryUsageAllowed: false,
      credits: { hasCredits: true, unlimited: true, balance: '1' },
      toolCount: 1,
      isolation: { ...metadata().isolation, hooks: true },
      serviceTier: 'priority',
      models: [],
    };
    const result = check(bad, { ...selection, automaticCreditReloadDisabledAttestation: false });
    expect(result).toEqual({
      ready: false,
      blockers: [
        'chatgpt-auth-required',
        'ordinary-usage-denied',
        'credit-wallet-funded',
        'credit-wallet-unlimited',
        'tools-not-disabled',
        'isolation-not-enforced',
        'default-service-tier-required',
        'selected-model-unavailable',
        'automatic-credit-reload-attestation-required',
      ],
    });
    expect(check(bad, { ...selection, automaticCreditReloadDisabledAttestation: false })).toEqual(
      result,
    );
  });
});

describe('model and configurable reasoning selection', () => {
  it('validates reasoning against the selected model, not a fixed hard-coded level', () => {
    const raw = metadata();
    raw.models.push({ id: 'model-b', reasoningLevels: ['future-level', 'none'] });
    expect(
      check(raw, { ...selection, selectedModel: 'model-b', selectedReasoning: 'future-level' }),
    ).toEqual({ ready: true, blockers: [] });
    expect(
      check(raw, { ...selection, selectedModel: 'model-b', selectedReasoning: 'none' }).ready,
    ).toBe(true);
    expect(check(raw, { ...selection, selectedModel: 'model-b' })).toEqual({
      ready: false,
      blockers: ['selected-reasoning-unavailable'],
    });
  });

  it.each([
    { models: [] },
    { models: [{ id: 'other-model', reasoningLevels: ['high'] }] },
  ])('requires the model to be listed', ({ models }) => {
    expectBlocked({ ...metadata(), models }, 'selected-model-unavailable');
  });

  it.each([
    { reasoningLevels: [] },
    { reasoningLevels: ['low'] },
    { reasoningLevels: ['HIGH'] },
  ])('requires the exact listed reasoning level %j', ({ reasoningLevels }) => {
    expectBlocked(
      { ...metadata(), models: [{ id: 'model-a', reasoningLevels }] },
      'selected-reasoning-unavailable',
    );
  });

  it.each(
    [
      undefined,
      null,
      {},
      [],
      { ...selection, selectedModel: '' },
      { ...selection, selectedModel: 'model-a\n' },
      { ...selection, selectedModel: 'm'.repeat(129) },
      { ...selection, selectedReasoning: '' },
      { ...selection, selectedReasoning: ' high' },
      { ...selection, selectedReasoning: 'r'.repeat(33) },
      { ...selection, automaticCreditReloadDisabledAttestation: 'true' },
      { ...selection, automaticCreditReloadDisabledAttestation: null },
      { ...selection, automaticCreditReloadDisabledAttestation: 1 },
      { ...selection, allowPaidCredits: true },
      Object.create(selection),
    ].map((options) => ({ options })),
  )('fails closed on invalid or absent caller options #%#', ({ options }) => {
    const result = evaluateCodexAccountPolicy(
      JSON.stringify(metadata()),
      options as CodexAccountPolicyOptions,
    );
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain('invalid-policy-options');
  });

  it('does not execute caller getters or coerce non-string preflight values', () => {
    const getter = vi.fn(() => true);
    const options = { ...selection };
    Object.defineProperty(options, 'automaticCreditReloadDisabledAttestation', { get: getter });
    expect(check(metadata(), options).blockers).toEqual(['invalid-policy-options']);
    const toJSON = vi.fn(() => metadata());
    expect(evaluateCodexAccountPolicy({ toJSON }, selection).blockers).toEqual([
      'invalid-preflight',
    ]);
    expect(getter).not.toHaveBeenCalled();
    expect(toJSON).not.toHaveBeenCalled();
  });

  it('never treats an Object.prototype value as an explicit user attestation', () => {
    const key = 'automaticCreditReloadDisabledAttestation';
    const original = Object.getOwnPropertyDescriptor(Object.prototype, key);
    try {
      Object.defineProperty(Object.prototype, key, { configurable: true, value: true });
      expect(check(metadata(), { selectedModel: 'model-a', selectedReasoning: 'high' })).toEqual({
        ready: false,
        blockers: ['automatic-credit-reload-attestation-required'],
      });
    } finally {
      if (original) Object.defineProperty(Object.prototype, key, original);
      else Reflect.deleteProperty(Object.prototype, key);
    }
  });
});

describe('strict bounded native JSON boundary', () => {
  it.each(
    [undefined, null, true, 0, {}, [], '', '{', 'null', '[]', 'true', '"secret-account"'].map(
      (raw) => ({ raw }),
    ),
  )('rejects invalid JSON input #%#', ({ raw }) => {
    expect(evaluateCodexAccountPolicy(raw, selection)).toEqual({
      ready: false,
      blockers: ['invalid-preflight'],
    });
  });

  it.each(Object.keys(metadata()))('requires field %s rather than defaulting it', (field) => {
    const raw: Record<string, unknown> = { ...metadata() };
    delete raw[field];
    expectBlocked(raw, 'invalid-preflight');
  });

  it.each([
    { authMode: 'apiKey' },
    { authMode: 'unknown' },
    { ordinaryUsageAllowed: 100 },
    { ordinaryUsageAllowed: 'true' },
    { credits: null },
    { credits: { hasCredits: false, unlimited: false } },
    { credits: { hasCredits: false, unlimited: false, balance: '0', autoReload: false } },
    { credits: { hasCredits: 0, unlimited: false, balance: '0' } },
    { models: null },
    { models: {} },
    { models: [null] },
    { models: [{ id: 'model-a', reasoningLevels: 'high' }] },
    { models: [{ id: 'model-a', reasoningLevels: ['high'], name: 'extra' }] },
    { models: [{ id: '', reasoningLevels: ['high'] }] },
    { models: [{ id: ' model-a', reasoningLevels: ['high'] }] },
    { models: [{ id: 'model-a\n', reasoningLevels: ['high'] }] },
    { models: [{ id: 'm'.repeat(129), reasoningLevels: ['high'] }] },
    { models: [{ id: 'model-a', reasoningLevels: ['high', 'high'] }] },
    { models: [{ id: 'model-a', reasoningLevels: [''] }] },
    { models: [{ id: 'model-a', reasoningLevels: ['r'.repeat(33)] }] },
    { models: [{ id: 'model-a', reasoningLevels: ['high\n'] }] },
    { models: [{ id: 'model-a', reasoningLevels: [1] }] },
    { models: [metadata().models[0], metadata().models[0]] },
    { toolCount: -1 },
    { toolCount: 0.1 },
    { toolCount: '0' },
    { toolCount: null },
    { toolCount: 1025 },
    { isolation: {} },
    { isolation: { ...metadata().isolation, hooks: null } },
    { isolation: { ...metadata().isolation, hooks: 'false' } },
    { isolation: { ...metadata().isolation, extra: false } },
    { serviceTier: null },
    { serviceTier: 'default\n' },
    { policyVersion: 'v'.repeat(65) },
    { upstreamRevision: 'not-a-revision' },
    { upstreamRevision: `${metadata().upstreamRevision}\n` },
    { accountId: 'private-account' },
    { sourcePath: 'private-source' },
    { usedPercent: 0 },
    { remainingPercent: 100 },
  ])('rejects unknown/malformed fields without semantic inference #%#', (patch) => {
    expectBlocked({ ...metadata(), ...patch }, 'invalid-preflight');
  });

  it('bounds model and reasoning list counts', () => {
    const models = Array.from({ length: 64 }, (_, index) => ({
      id: `model-${index}`,
      reasoningLevels: ['high'],
    }));
    expect(
      check({ ...metadata(), models }, { ...selection, selectedModel: 'model-63' }).ready,
    ).toBe(true);
    expectBlocked(
      { ...metadata(), models: [...models, { id: 'overflow', reasoningLevels: ['high'] }] },
      'invalid-preflight',
    );
    const reasoningLevels = Array.from({ length: 16 }, (_, index) => `level-${index}`);
    expect(
      check(
        { ...metadata(), models: [{ id: 'model-a', reasoningLevels }] },
        { ...selection, selectedReasoning: 'level-15' },
      ).ready,
    ).toBe(true);
    expectBlocked(
      {
        ...metadata(),
        models: [{ id: 'model-a', reasoningLevels: [...reasoningLevels, 'overflow'] }],
      },
      'invalid-preflight',
    );
  });

  it('bounds the complete UTF-8 message before parsing, including whitespace', () => {
    const json = JSON.stringify(metadata());
    const max = CODEX_ACCOUNT_POLICY.maxPreflightBytes;
    expect(evaluateCodexAccountPolicy(json.padEnd(max), selection).ready).toBe(true);
    expect(evaluateCodexAccountPolicy(json.padEnd(max + 1), selection)).toEqual({
      ready: false,
      blockers: ['preflight-size-limit'],
    });
    const multibyte = JSON.stringify({ extra: 'é'.repeat(max / 2) });
    expect(multibyte.length).toBeLessThan(max);
    expect(evaluateCodexAccountPolicy(multibyte, selection).blockers).toEqual([
      'preflight-size-limit',
    ]);
  });

  it.each([
    (json: string) => `diagnostic\n${json}`,
    (json: string) => `${json}\n${json}`,
    (json: string) =>
      json.replace(
        '"ordinaryUsageAllowed":true',
        '"ordinaryUsageAllowed":false,"ordinaryUsageAllowed":true',
      ),
    (json: string) => json.replace('"balance":"0"', '"balance":"1","bal\\u0061nce":"0"'),
    (json: string) => json.replace('"hooks":false', '"hooks":true,"hooks":false'),
    (json: string) =>
      json.replace(
        '"reasoningLevels":["low","high"]',
        '"reasoningLevels":["low"],"reasoningLevels":["high"]',
      ),
    (json: string) => json.replace('{', '{"__proto__":{},'),
  ])('rejects trailing output, duplicate fields and unknown prototype keys #%#', (change) => {
    expect(evaluateCodexAccountPolicy(change(JSON.stringify(metadata())), selection)).toEqual({
      ready: false,
      blockers: ['invalid-preflight'],
    });
  });

  it('never leaks source/account IDs or raw parse diagnostics in readiness', () => {
    const marker = 'PRIVATE_ACCOUNT_SOURCE_MARKER';
    for (const raw of [
      `{"accountId":"${marker}"`,
      JSON.stringify({ ...metadata(), accountId: marker }),
    ]) {
      const report = evaluateCodexAccountPolicy(raw, selection);
      expect(report).toEqual({ ready: false, blockers: ['invalid-preflight'] });
      expect(JSON.stringify(report)).not.toContain(marker);
    }
  });
});
