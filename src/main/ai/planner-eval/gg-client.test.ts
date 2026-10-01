import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseCodexCompletion } from './codex-transport';

// No real auth stores, browser listeners or provider connections are opened.
// Dynamic paths keep this opt-in nested package out of the app's TS dependencies.
const directory = resolve('scripts/planner-eval/gg-client');
const helper = (name: string) => pathToFileURL(resolve(directory, `${name}.mjs`)).href;
const networkApi = await import(helper('network'));
const auth = await import(helper('auth'));
const generation = await import(helper('generation'));
const { ENDPOINTS, LIMITS } = networkApi;
const originalFetch = globalThis.fetch;
const forbiddenFetch = vi.fn(async () => {
  throw new Error('offline-test-unexpected-fetch');
});
const active: { close(): Promise<void> }[] = [];

beforeAll(() => {
  globalThis.fetch = forbiddenFetch;
});
afterEach(async () => {
  for (const network of active.splice(0).reverse()) await network.close();
  vi.useRealTimers();
  expect(globalThis.fetch).toBe(forbiddenFetch);
  expect(forbiddenFetch).not.toHaveBeenCalled();
});
afterAll(() => {
  globalThis.fetch = originalFetch;
});

type Frame = Record<string, unknown>;
type Wire = {
  method: string;
  headers: Headers;
  body?: string | Uint8Array;
  signal: AbortSignal;
  redirect: string;
};
function credentials(patch: Frame = {}) {
  return {
    accessToken: 'synthetic.oauth.token',
    refreshToken: 'synthetic-refresh',
    accountId: 'synthetic-account',
    expiresAt: Date.now() + 3_600_000,
    ...patch,
  };
}
function store(creds: ReturnType<typeof credentials> | undefined = credentials()) {
  return {
    getCredentials: vi.fn(async (): Promise<ReturnType<typeof credentials> | undefined> => creds),
    resolveCredentials: vi.fn(
      async (): Promise<ReturnType<typeof credentials> | undefined> => creds,
    ),
  };
}
function included(allowed: unknown = true) {
  return {
    rate_limit: { allowed, primary_window: { used_percent: 100 } },
    credits: { has_credits: false, unlimited: false, balance: '0.00' },
  };
}
const models = {
  models: [
    {
      slug: 'gpt-5.4',
      supported_reasoning_levels: [
        { effort: 'medium', description: 'discard' },
        { effort: 'none' },
      ],
    },
  ],
};
const rawUsage = {
  input_tokens: 100,
  output_tokens: 30,
  input_tokens_details: { cached_tokens: 20, cache_write_tokens: 10 },
  output_tokens_details: { reasoning_tokens: 12 },
};
const plan = '{"scenes":[]}';
function frames(text = plan): Frame[] {
  return [
    { type: 'response.created', response: { status: 'in_progress' } },
    {
      type: 'response.output_item.added',
      item: {
        id: 'synthetic-message',
        type: 'message',
        role: 'assistant',
        status: 'in_progress',
        content: [],
      },
    },
    {
      type: 'response.output_text.delta',
      item_id: 'synthetic-message',
      content_index: 0,
      delta: text,
    },
    {
      type: 'response.output_item.done',
      item: {
        id: 'synthetic-message',
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text }],
      },
    },
    {
      type: 'response.completed',
      response: { status: 'completed', usage: structuredClone(rawUsage), service_tier: 'default' },
    },
  ];
}
function sse(events: Frame[]) {
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
}
function streamResponse(text: string) {
  return new Response(text, { headers: { 'content-type': 'text/event-stream' } });
}
function bounded(transport: (url: string, init: Wire) => Promise<Response>, signal?: AbortSignal) {
  const network = networkApi.installBoundedFetch({ transport, signal });
  active.push(network);
  return network;
}
function harness(
  options: {
    usage?: unknown;
    models?: unknown;
    response?: () => Response;
    creds?: ReturnType<typeof credentials>;
  } = {},
) {
  const calls: { url: string; init: Wire }[] = [];
  const managed = store(options.creds);
  const send = vi.fn(async (url: string, init: Wire) => {
    calls.push({ url, init });
    if (url === ENDPOINTS.models) return Response.json(options.models ?? models);
    if (url === ENDPOINTS.usage) return Response.json(options.usage ?? included());
    if (url === ENDPOINTS.responses) return options.response?.() ?? streamResponse(sse(frames()));
    throw new Error('offline-test-unexpected-route');
  });
  const network = bounded(send);
  return {
    network,
    managed,
    send,
    calls,
    run: (patch: Frame = {}) =>
      generation.generate({
        prompt: 'Build the requested plan.',
        model: 'gpt-5.4',
        reasoning: 'medium',
        autoReloadDisabled: true,
        store: managed,
        network,
        ...patch,
      }),
  };
}

// Keep one real pinned gg-ai stream on every generation path. Only HTTPS and the
// managed-storage boundary are mocked; no mock SDK result can hide dispatch bugs.
describe('GG real SDK text-only seam (offline)', () => {
  it('uses fresh messages/session, no tools/API fallback, and normalizes real SDK usage', async () => {
    const one = harness();
    const jsonl = await one.run();
    const completion = parseCodexCompletion(jsonl);
    expect(JSON.parse(completion.text)).toEqual({ plan_json: plan });
    expect(completion).toMatchObject({
      inputTokens: 100,
      cachedInputTokens: 20,
      outputTokens: 30,
      reasoningTokens: 12,
    });
    expect(one.calls.map((call) => call.url)).toEqual([
      ENDPOINTS.models,
      ENDPOINTS.usage,
      ENDPOINTS.responses,
    ]);
    expect(one.managed.getCredentials).toHaveBeenCalledTimes(2);
    expect(one.managed.resolveCredentials).toHaveBeenNthCalledWith(2, 'openai', {
      storageKeys: ['openai'],
    });
    const first = one.calls[2].init;
    const body = JSON.parse(String(first.body));
    expect(body).toMatchObject({
      model: 'gpt-5.4',
      stream: true,
      store: false,
      tool_choice: 'none',
      reasoning: { effort: 'medium' },
    });
    // Pinned SDK omits the tools wire member when its tools:[] option is empty.
    expect(body.tools ?? []).toEqual([]);
    expect(body.instructions).toMatch(/JSON object/);
    expect(body.instructions).not.toMatch(/plan_json/);
    expect(body.input).toEqual([
      { role: 'user', content: [{ type: 'input_text', text: 'Build the requested plan.' }] },
    ]);
    expect(body).not.toHaveProperty('previous_response_id');
    expect(body).not.toHaveProperty('service_tier');
    expect(first.headers.get('authorization')).toBe('Bearer synthetic.oauth.token');
    expect(first.headers.get('chatgpt-account-id')).toBe('synthetic-account');
    expect(first.headers.get('session_id')).toMatch(/^[a-f0-9-]{36}$/);
    expect(first.redirect).toBe('error');
    expect(first.headers.get('accept-encoding')).toBe('identity');
    expect(jsonl).not.toMatch(/synthetic|Bearer|reasoning\.encrypted_content/);
    await one.network.close();
    const two = harness();
    await two.run();
    expect(two.calls[2].init.headers.get('session_id')).not.toBe(first.headers.get('session_id'));
    expect(JSON.parse(String(two.calls[2].init.body)).prompt_cache_key).toBe(body.prompt_cache_key);
  });

  it('preserves the text-only contract for planner-size compressed requests', async () => {
    const test = harness();
    const prompt = 'Source-backed planner instructions. '.repeat(2_000);
    const completion = parseCodexCompletion(await test.run({ prompt }));
    expect(JSON.parse(completion.text)).toEqual({ plan_json: plan });
    const wire = test.calls.find((call) => call.url === ENDPOINTS.responses)?.init;
    expect(wire?.headers.get('content-encoding')).toBe('zstd');
    if (!(wire?.body instanceof Uint8Array)) throw new Error('Expected compressed SDK request');
    const codec = await import(
      pathToFileURL(resolve(directory, 'node_modules/@bokuweb/zstd-wasm/dist/common/index.node.js'))
        .href
    );
    await codec.init();
    const body = JSON.parse(new TextDecoder().decode(codec.decompress(wire.body)));
    expect(body.tools ?? []).toEqual([]);
    expect(body.tool_choice).toBe('none');
    expect(body.store).toBe(false);
    expect(body).not.toHaveProperty('service_tier');
    expect(body).not.toHaveProperty('previous_response_id');
    expect(body.input).toEqual([{ role: 'user', content: [{ type: 'input_text', text: prompt }] }]);
    expect(test.calls.filter((call) => call.url === ENDPOINTS.responses)).toHaveLength(1);
  });

  it.each([
    ['no account', { accountId: undefined }],
    ['empty account', { accountId: '' }],
    ['API key', { accessToken: 'sk-synthetic', refreshToken: '' }],
    ['no refresh grant', { refreshToken: '' }],
    ['custom endpoint', { baseUrl: 'https://api.openai.com/v1' }],
  ])('refuses %s before refresh or dispatch', async (_name, patch) => {
    const test = harness({ creds: credentials(patch) });
    await expect(test.run()).rejects.toMatchObject({ code: 'chatgpt-oauth-required' });
    expect(test.send).not.toHaveBeenCalled();
    expect(test.managed.resolveCredentials).not.toHaveBeenCalled();
  });

  it('requires explicit attestation before any credential or metadata access', async () => {
    const test = harness();
    for (const flag of [false, undefined, 'true']) {
      await expect(test.run({ autoReloadDisabled: flag })).rejects.toMatchObject({
        code: 'automatic-credit-reload-attestation-required',
      });
    }
    expect(test.managed.getCredentials).not.toHaveBeenCalled();
    expect(test.send).not.toHaveBeenCalled();
  });

  it.each([
    ['denied', included(false)],
    ['unknown permission', { ...included(), rate_limit: {} }],
    ['missing wallet', { rate_limit: { allowed: true } }],
    ['funded', { ...included(), credits: { has_credits: true, unlimited: false, balance: '0' } }],
    [
      'tiny funded',
      {
        ...included(),
        credits: { has_credits: false, unlimited: false, balance: '0.0000000000000000001' },
      },
    ],
    [
      'unlimited',
      { ...included(), credits: { has_credits: false, unlimited: true, balance: '0' } },
    ],
  ])('does not generate with %s preflight', async (_name, usage) => {
    const test = harness({ usage });
    await expect(test.run()).rejects.toBeInstanceOf(networkApi.ClientError);
    expect(test.calls.every((call) => call.init.method === 'GET')).toBe(true);
  });

  it('rechecks credentials and denies account changes after catalog fetch', async () => {
    const test = harness();
    test.managed.resolveCredentials
      .mockResolvedValueOnce(credentials())
      .mockResolvedValueOnce(credentials({ accountId: 'changed-account' }));
    await expect(test.run()).rejects.toMatchObject({ code: 'account-changed' });
    expect(test.calls.map((call) => call.url)).toEqual([ENDPOINTS.models]);
  });

  it('requires a fresh included-usage check on the next invocation', async () => {
    const first = harness();
    await first.run();
    await first.network.close();
    const second = harness({ usage: included(false) });
    await expect(second.run()).rejects.toMatchObject({ code: 'ordinary-usage-unavailable' });
    expect(second.calls.some((call) => call.url === ENDPOINTS.responses)).toBe(false);
  });

  it.each(['unlisted', 'high'])('rejects unavailable selection %s', async (value) => {
    const test = harness();
    await expect(
      test.run(value === 'high' ? { reasoning: value } : { model: value }),
    ).rejects.toBeInstanceOf(networkApi.ClientError);
    expect(test.calls).toHaveLength(2);
  });

  const invalidFrames: [string, () => string][] = [
    ['missing terminal', () => sse(frames().slice(0, -1))],
    ['partial terminal bytes', () => sse(frames()).slice(0, -1)],
    [
      'incomplete',
      () =>
        sse([
          ...frames().slice(0, -1),
          { type: 'response.incomplete', response: { status: 'incomplete', usage: rawUsage } },
        ]),
    ],
    [
      'unknown status',
      () =>
        sse([
          ...frames().slice(0, -1),
          { type: 'response.completed', response: { status: 'unexpected', usage: rawUsage } },
        ]),
    ],
    ['missing status', () => sse([{ type: 'response.completed', response: { usage: rawUsage } }])],
    ['error', () => sse([{ type: 'error', error: { message: 'secret-provider-payload' } }])],
    [
      'failure',
      () => sse([{ type: 'response.failed', error: { message: 'secret-provider-payload' } }]),
    ],
    [
      'function call',
      () =>
        sse([
          {
            type: 'response.output_item.added',
            item: { type: 'function_call', id: 'private-id', name: 'shell' },
          },
          ...frames(),
        ]),
    ],
    [
      'server tool',
      () =>
        sse([
          {
            type: 'response.output_item.done',
            item: { type: 'web_search_call', status: 'completed' },
          },
          ...frames(),
        ]),
    ],
    [
      'tool only in terminal',
      () =>
        sse([
          ...frames().slice(0, -1),
          {
            type: 'response.completed',
            response: { status: 'completed', usage: rawUsage, output: [{ type: 'function_call' }] },
          },
        ]),
    ],
    ['unknown event', () => sse([{ type: 'response.surprise' }, ...frames()])],
    ['duplicate terminal', () => sse([...frames(), frames().at(-1) as Frame])],
    [
      'priority tier',
      () =>
        sse([
          ...frames().slice(0, -1),
          {
            type: 'response.completed',
            response: { status: 'completed', usage: rawUsage, service_tier: 'priority' },
          },
        ]),
    ],
    ['empty text', () => sse(frames(''))],
    ['invalid JSON', () => sse(frames('not JSON'))],
    [
      'truncated flag',
      () =>
        sse([
          ...frames().slice(0, -1),
          {
            type: 'response.completed',
            response: { status: 'completed', truncated: true, usage: rawUsage },
          },
        ]),
    ],
  ];
  it.each(invalidFrames)('rejects %s without retry or raw diagnostics', async (_name, fixture) => {
    const test = harness({ response: () => streamResponse(fixture()) });
    const error = await test.run().then(
      () => undefined,
      (failure: unknown) => failure,
    );
    expect(error).toBeInstanceOf(networkApi.ClientError);
    expect(networkApi.errorCode(error)).not.toMatch(/secret-provider-payload|private-id/);
    expect(test.calls.filter((call) => call.url === ENDPOINTS.responses)).toHaveLength(1);
  });

  it.each([
    { input_tokens: -1 },
    { input_tokens: 1.5 },
    { input_tokens: '100' },
    { output_tokens: 10_000_001 },
    { input_tokens: 1e100 },
    { input_tokens_details: { cached_tokens: 101 } },
    { output_tokens_details: { reasoning_tokens: 31 } },
  ])('rejects malformed real-stream usage %j', async (patch) => {
    const test = harness({
      response: () =>
        streamResponse(
          sse([
            ...frames().slice(0, -1),
            {
              type: 'response.completed',
              response: { status: 'completed', usage: { ...rawUsage, ...patch } },
            },
          ]),
        ),
    });
    await expect(test.run()).rejects.toBeInstanceOf(networkApi.ClientError);
  });

  it('discards current encrypted reasoning rather than printing or reusing it', async () => {
    const test = harness({
      response: () =>
        streamResponse(
          sse([
            {
              type: 'response.output_item.done',
              item: {
                type: 'reasoning',
                id: 'reasoning-id',
                encrypted_content: 'opaque-secret',
                summary: [],
              },
            },
            ...frames(),
          ]),
        ),
    });
    expect(await test.run()).not.toContain('opaque-secret');
  });

  it('never retries a provider rejection, including encrypted-history retry codes', async () => {
    const test = harness({
      response: () =>
        Response.json(
          { error: { code: 'invalid_encrypted_content', message: 'secret-provider-payload' } },
          { status: 400 },
        ),
    });
    await expect(test.run()).rejects.toMatchObject({ code: 'http-refused' });
    expect(test.calls.filter((call) => call.url === ENDPOINTS.responses)).toHaveLength(1);
  });
});

describe('raw SSE authoritative text integrity (real SDK, offline)', () => {
  function message(text = plan, id = 'synthetic-message') {
    return {
      id,
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text }],
    };
  }
  function terminal(output: Frame[]) {
    return {
      type: 'response.completed',
      response: { status: 'completed', usage: rawUsage, output },
    };
  }
  function authoritative(source: string, streamed: string | undefined, text: string): Frame[] {
    const fixture = frames(text);
    const finals: Record<string, Frame> = {
      'output_text.done': {
        type: 'response.output_text.done',
        item_id: 'synthetic-message',
        content_index: 0,
        text,
      },
      'content_part.done': {
        type: 'response.content_part.done',
        item_id: 'synthetic-message',
        content_index: 0,
        part: { type: 'output_text', text },
      },
      'output_item.done': fixture[3],
      'terminal output': {
        type: 'response.completed',
        response: { status: 'completed', usage: rawUsage, output: [fixture[3].item] },
      },
    };
    return [
      ...fixture.slice(0, 2),
      ...(streamed === undefined
        ? []
        : [
            { ...fixture[2], delta: streamed.slice(0, -2) },
            { ...fixture[2], delta: streamed.slice(-2) },
          ]),
      finals[source],
      ...(source === 'terminal output' ? [] : [fixture[4]]),
    ];
  }

  it.each([
    'output_text.done',
    'content_part.done',
    'output_item.done',
    'terminal output',
  ])('rejects missing-middle-delta valid JSON that disagrees with %s', async (source) => {
    const complete = '{"scenes":[{"kind":"statement"}]}';
    expect(JSON.parse(plan)).toEqual({ scenes: [] });
    const test = harness({
      response: () => streamResponse(sse(authoritative(source, plan, complete))),
    });
    await expect(test.run()).rejects.toMatchObject({ code: 'text-mismatch' });
    expect(test.calls.filter((call) => call.url === ENDPOINTS.responses)).toHaveLength(1);
  });

  it.each([
    'output_text.done',
    'content_part.done',
    'output_item.done',
    'terminal output',
  ])('accepts consistent %s text with absent, partial, or complete deltas', async (source) => {
    for (const streamed of [undefined, plan.slice(0, -2), plan]) {
      const test = harness({
        response: () => streamResponse(sse(authoritative(source, streamed, plan))),
      });
      expect(JSON.parse(parseCodexCompletion(await test.run()).text)).toEqual({ plan_json: plan });
      expect(test.calls.filter((call) => call.url === ENDPOINTS.responses)).toHaveLength(1);
      await test.network.close();
    }
  });

  it('accepts all authoritative snapshots agreeing on ordered content parts', async () => {
    const parts = ['{"n":', '1}'];
    const output = { ...message(), content: parts.map((text) => ({ type: 'output_text', text })) };
    const test = harness({
      response: () =>
        streamResponse(
          sse([
            { ...frames()[1], output_index: 0 },
            ...parts.flatMap((text, content_index) => [
              {
                type: 'response.content_part.added',
                item_id: output.id,
                output_index: 0,
                content_index,
                part: { type: 'output_text', text: '' },
              },
              {
                type: 'response.output_text.delta',
                item_id: output.id,
                output_index: 0,
                content_index,
                delta: text,
              },
              {
                type: 'response.output_text.done',
                item_id: output.id,
                output_index: 0,
                content_index,
                text,
              },
              {
                type: 'response.content_part.done',
                item_id: output.id,
                output_index: 0,
                content_index,
                part: { type: 'output_text', text },
              },
            ]),
            { type: 'response.output_item.done', output_index: 0, item: output },
            terminal([output]),
          ]),
        ),
    });
    expect(JSON.parse(parseCodexCompletion(await test.run()).text)).toEqual({
      plan_json: '{"n":1}',
    });
  });

  it('accepts a terminal-only message without prior item/delta events', async () => {
    const test = harness({ response: () => streamResponse(sse([terminal([message()])])) });
    expect(JSON.parse(parseCodexCompletion(await test.run()).text)).toEqual({ plan_json: plan });
  });

  it('binds pending deltas to their later item declaration', async () => {
    const fixture = frames();
    const test = harness({
      response: () =>
        streamResponse(sse([fixture[0], fixture[2], fixture[1], fixture[3], fixture[4]])),
    });
    expect(JSON.parse(parseCodexCompletion(await test.run()).text)).toEqual({ plan_json: plan });
  });

  const identityFailures: [string, () => Frame[]][] = [
    ['duplicate item added', () => [frames()[0], frames()[1], ...frames().slice(1)]],
    ['duplicate item done', () => [...frames().slice(0, -1), frames()[3], frames()[4]]],
    [
      'duplicate text done',
      () => {
        const fixture = authoritative('output_text.done', plan, plan);
        return [...fixture.slice(0, -1), fixture[4], fixture[5]];
      },
    ],
    [
      'duplicate content part',
      () => {
        const added = {
          type: 'response.content_part.added',
          item_id: 'synthetic-message',
          content_index: 0,
          part: { type: 'output_text', text: '' },
        };
        return [...frames().slice(0, 2), added, added, ...frames().slice(2)];
      },
    ],
    ['duplicate terminal ID', () => [...frames().slice(0, -1), terminal([message(), message()])]],
    [
      'duplicate output index',
      () => [
        { ...frames()[1], output_index: 0 },
        {
          type: 'response.output_item.added',
          output_index: 0,
          item: { ...message('', 'other-message'), status: 'in_progress', content: [] },
        },
        ...frames().slice(2),
      ],
    ],
    [
      'rebound output index',
      () => [
        { ...frames()[1], output_index: 0 },
        { ...frames()[2], output_index: 1 },
        ...frames().slice(3),
      ],
    ],
    [
      'wrong delta item ID',
      () => [
        ...frames().slice(0, 2),
        { ...frames()[2], item_id: 'other-message' },
        ...frames().slice(3),
      ],
    ],
    [
      'wrong delta content index',
      () => [...frames().slice(0, 2), { ...frames()[2], content_index: 1 }, ...frames().slice(3)],
    ],
    [
      'missing item ID',
      () => [...frames().slice(0, 2), { ...frames()[2], item_id: undefined }, ...frames().slice(3)],
    ],
    [
      'changed item type',
      () => [
        ...frames().slice(0, 3),
        {
          type: 'response.output_item.done',
          item: { id: 'synthetic-message', type: 'reasoning', summary: [] },
        },
        frames()[4],
      ],
    ],
    ['missing terminal item', () => [...frames().slice(0, -1), terminal([])]],
    [
      'content appended after item done',
      () => [
        ...frames().slice(0, -1),
        terminal([
          { ...message(), content: [...message().content, { type: 'output_text', text: ' ' }] },
        ]),
      ],
    ],
    [
      'new content identity after item done',
      () => [
        ...frames().slice(0, -1),
        {
          type: 'response.output_text.done',
          item_id: 'synthetic-message',
          content_index: 1,
          text: ' ',
        },
        frames()[4],
      ],
    ],
    [
      'added snapshot changes an earlier text final',
      () => [
        {
          type: 'response.output_text.done',
          item_id: 'synthetic-message',
          content_index: 0,
          text: plan,
        },
        {
          type: 'response.output_item.added',
          item: { ...message(`${plan} `), status: 'in_progress' },
        },
        frames()[4],
      ],
    ],
    [
      'delta after final',
      () => {
        const fixture = authoritative('output_text.done', plan, plan);
        return [...fixture.slice(0, -1), frames()[2], fixture.at(-1) as Frame];
      },
    ],
    ['no authoritative final text', () => [...frames().slice(0, 3), frames()[4]]],
    [
      'conflicting content and item finals',
      () => [
        ...authoritative('content_part.done', undefined, plan).slice(0, -1),
        { type: 'response.output_item.done', item: message('{"scenes":[1]}') },
        frames()[4],
      ],
    ],
    [
      'extension after authoritative text done',
      () => [
        ...authoritative('output_text.done', undefined, plan).slice(0, -1),
        { type: 'response.output_item.done', item: message(`${plan} `) },
        frames()[4],
      ],
    ],
    [
      'conflicting item and terminal finals',
      () => [...frames().slice(0, -1), terminal([message('{"scenes":[1]}')])],
    ],
    [
      'final text shorter than emitted prefix',
      () => authoritative('output_text.done', `${plan} `, plan),
    ],
  ];
  it.each(
    identityFailures,
  )('rejects %s rather than silently repairing output', async (_name, fixture) => {
    const test = harness({ response: () => streamResponse(sse(fixture())) });
    await expect(test.run()).rejects.toBeInstanceOf(networkApi.ClientError);
    expect(test.calls.filter((call) => call.url === ENDPOINTS.responses)).toHaveLength(1);
  });

  it.each([
    -1,
    0.5,
    64,
    Number.MAX_SAFE_INTEGER,
  ])('refuses invalid content index %s', async (content_index) => {
    const test = harness({
      response: () =>
        streamResponse(
          sse([...frames().slice(0, 2), { ...frames()[2], content_index }, ...frames().slice(3)]),
        ),
    });
    await expect(test.run()).rejects.toMatchObject({ code: 'invalid-identity' });
  });

  it('checks emitted multi-part order against the authoritative content order', async () => {
    const output = {
      ...message(),
      content: [
        { type: 'output_text', text: '{"n":' },
        { type: 'output_text', text: '1}' },
      ],
    };
    const test = harness({
      response: () =>
        streamResponse(
          sse([
            frames()[1],
            { ...frames()[2], content_index: 1, delta: '1}' },
            { ...frames()[2], content_index: 0, delta: '{"n":' },
            { type: 'response.output_item.done', item: output },
            terminal([output]),
          ]),
        ),
    });
    await expect(test.run()).rejects.toMatchObject({ code: 'text-mismatch' });
  });

  it('bounds retained final-only text and identity state independently of delta emission', async () => {
    const text = `{"text":"${'x'.repeat(LIMITS.textBytes)}"}`;
    const oversized = harness({ response: () => streamResponse(sse([terminal([message(text)])])) });
    await expect(oversized.run()).rejects.toMatchObject({ code: 'output-limit' });
    await oversized.network.close();
    const many = harness({
      response: () =>
        streamResponse(
          sse([
            ...Array.from({ length: 129 }, (_, index) => ({
              type: 'response.output_item.added',
              item: { id: `reason-${index}`, type: 'reasoning', summary: [] },
            })),
            ...frames(),
          ]),
        ),
    });
    await expect(many.run()).rejects.toMatchObject({ code: 'response-limit' });
  });
});

describe('bounded network and protocol (offline)', () => {
  it.each([
    'https://api.openai.com/v1/responses',
    'https://other.invalid/backend-api/codex/responses',
    'https://chatgpt.com.evil.invalid/backend-api/wham/usage',
    'http://chatgpt.com/backend-api/wham/usage',
    `${ENDPOINTS.usage}#fragment`,
    `${ENDPOINTS.usage}?override=1`,
    'https://user:pass@chatgpt.com/backend-api/wham/usage',
  ])('never sends account headers to %s', async (url) => {
    const send = vi.fn(async () => Response.json({}));
    const network = bounded(send);
    await expect(
      network.fetch(url, {
        headers: { Authorization: 'Bearer synthetic', 'ChatGPT-Account-Id': 'synthetic' },
      }),
    ).rejects.toMatchObject({ code: 'request-denied' });
    expect(send).not.toHaveBeenCalled();
  });

  it('denies wrong methods, redirects, exotic bodies, proxy options and unauthorized generations', async () => {
    const send = vi.fn(async () => Response.json({}));
    const network = bounded(send);
    for (const init of [
      { method: 'POST' },
      { redirect: 'follow' },
      { method: 'GET', body: 'secret' },
      { dispatcher: {} },
      { headers: { 'proxy-authorization': 'secret' } },
    ])
      await expect(network.fetch(ENDPOINTS.usage, init)).rejects.toMatchObject({
        code: 'request-denied',
      });
    await expect(network.fetch(ENDPOINTS.responses, { method: 'POST' })).rejects.toMatchObject({
      code: 'generation-not-authorized',
    });
    await expect(
      network.fetch(ENDPOINTS.token, { method: 'POST', body: new ReadableStream() }),
    ).rejects.toMatchObject({ code: 'request-denied' });
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses redirects before reading their body and never follows their location', async () => {
    const cancelled = vi.fn();
    const send = vi.fn(
      async () =>
        new Response(new ReadableStream({ cancel: cancelled }), {
          status: 302,
          headers: { location: 'https://other.invalid' },
        }),
    );
    const network = bounded(send);
    await expect(network.fetch(ENDPOINTS.usage)).rejects.toMatchObject({ code: 'http-refused' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(cancelled).toHaveBeenCalled();
  });

  it('bounds the real core refresh endpoint with synthetic tokens and no account headers', async () => {
    const accessToken = `header.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-account' } })).toString('base64')}.signature`;
    const send = vi.fn(async () =>
      Response.json({
        access_token: accessToken,
        refresh_token: 'synthetic-rotated',
        expires_in: 3600,
      }),
    );
    bounded(send);
    const core = await import(
      pathToFileURL(resolve(directory, 'node_modules/@kenkaiiii/gg-core/dist/index.js')).href
    );
    const refreshed = await core.refreshOpenAIToken('synthetic-refresh');
    expect(refreshed.accountId).toBe('synthetic-account');
    expect(refreshed.refreshToken).toBe('synthetic-rotated');
    const [url, init] = send.mock.calls[0] as unknown as [string, Wire];
    expect(url).toBe(ENDPOINTS.token);
    expect(init.method).toBe('POST');
    expect(init.headers.has('authorization')).toBe(false);
    expect(init.headers.has('chatgpt-account-id')).toBe(false);
    expect(new URLSearchParams(String(init.body)).get('grant_type')).toBe('refresh_token');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('times out token exchange before headers without attempting a fallback', async () => {
    vi.useFakeTimers();
    const send = vi.fn(
      (_url: string, init: Wire) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('secret-network-payload')), {
            once: true,
          });
        }),
    );
    const network = bounded(send);
    const checked = expect(
      network.fetch(ENDPOINTS.token, { method: 'POST', body: 'grant_type=refresh_token' }),
    ).rejects.toBeInstanceOf(networkApi.ClientError);
    await vi.advanceTimersByTimeAsync(LIMITS.metadataMs);
    await checked;
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('allows at most one generation POST in a child', async () => {
    const test = harness();
    await test.run();
    expect(() => test.network.authorizeGeneration(credentials())).toThrow(
      'generation-not-authorized',
    );
    await expect(
      test.network.fetch(ENDPOINTS.responses, {
        method: 'POST',
        headers: test.calls[2].init.headers,
        body: '{}',
      }),
    ).rejects.toMatchObject({ code: 'generation-not-authorized' });
    expect(test.calls.filter((call) => call.url === ENDPOINTS.responses)).toHaveLength(1);
  });

  it('bounds encoded request bodies and uncompressed prompt JSON before sending', async () => {
    const test = harness();
    await expect(
      test.network.fetch(ENDPOINTS.token, { method: 'POST', body: 'x'.repeat(32 * 1024 + 1) }),
    ).rejects.toMatchObject({ code: 'request-limit' });
    await expect(test.run({ prompt: '\u0000'.repeat(200_000) })).rejects.toMatchObject({
      code: 'request-limit',
    });
    await expect(test.run({ prompt: 'x'.repeat(LIMITS.textBytes + 1) })).rejects.toMatchObject({
      code: 'input-limit',
    });
    expect(test.send).not.toHaveBeenCalled();
  });

  it('bounds response bytes even without content-length, including hidden thinking', async () => {
    const metadata = bounded(async () => new Response('x'.repeat(LIMITS.metadataBytes + 1)));
    await expect((await metadata.fetch(ENDPOINTS.usage)).text()).rejects.toMatchObject({
      code: 'response-limit',
    });
    await metadata.close();
    const test = harness({
      response: () =>
        streamResponse(
          sse([
            { type: 'response.reasoning_text.delta', delta: 'x'.repeat(LIMITS.responseBytes) },
            ...frames(),
          ]),
        ),
    });
    await expect(test.run()).rejects.toMatchObject({ code: 'response-limit' });
  });

  it('refuses oversized declared responses and compressed responses without expansion', async () => {
    const one = bounded(
      async () =>
        new Response('{}', { headers: { 'content-length': String(LIMITS.metadataBytes + 1) } }),
    );
    await expect(one.fetch(ENDPOINTS.usage)).rejects.toMatchObject({ code: 'response-limit' });
    await one.close();
    const two = bounded(
      async () => new Response('{}', { headers: { 'content-encoding': 'gzip' } }),
    );
    await expect(two.fetch(ENDPOINTS.usage)).rejects.toMatchObject({ code: 'invalid-response' });
  });

  it('times out stalled metadata bodies and cancels their readers', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const network = bounded(async () => new Response(new ReadableStream({ cancel })));
    const response = await network.fetch(ENDPOINTS.usage);
    const checked = expect(response.text()).rejects.toMatchObject({ code: 'request-aborted' });
    await vi.advanceTimersByTimeAsync(LIMITS.metadataMs);
    await checked;
    expect(cancel).toHaveBeenCalled();
  });

  it('bounds generation lifetime including a stalled thinking stream', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const test = harness({
      response: () =>
        new Response(
          new ReadableStream({
            start(out) {
              out.enqueue(
                new TextEncoder().encode(
                  sse([{ type: 'response.reasoning_text.delta', delta: 'hidden' }]),
                ),
              );
            },
            cancel,
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        ),
    });
    const checked = expect(test.run()).rejects.toBeInstanceOf(networkApi.ClientError);
    await vi.advanceTimersByTimeAsync(LIMITS.requestMs + 1);
    await checked;
    expect(cancel).toHaveBeenCalled();
  });

  it('cancels on parent abort and restores fetch on close', async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    const network = bounded(
      async () => new Response(new ReadableStream({ cancel })),
      controller.signal,
    );
    const response = await network.fetch(ENDPOINTS.usage);
    const checked = expect(response.text()).rejects.toMatchObject({ code: 'request-aborted' });
    controller.abort();
    await checked;
    await network.close();
    expect(cancel).toHaveBeenCalled();
    expect(globalThis.fetch).toBe(forbiddenFetch);
  });

  it('handles CRLF and UTF-8 split across raw chunks', async () => {
    const bytes = new TextEncoder().encode(
      sse(frames('{"label":"café"}')).replaceAll('\n', '\r\n'),
    );
    const test = harness({
      response: () =>
        new Response(
          new ReadableStream({
            start(out) {
              for (const byte of bytes) out.enqueue(Uint8Array.of(byte));
              out.close();
            },
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        ),
    });
    expect(JSON.parse(parseCodexCompletion(await test.run()).text)).toEqual({
      plan_json: '{"label":"café"}',
    });
  });

  it('sanitizes foreign errors and rejects invalid normalized counts', () => {
    expect(networkApi.errorCode(new Error('Bearer secret-payload'))).toBe('client-failed');
    for (const inputTokens of [-1, NaN, Infinity, 0.5, '1', 10_000_001]) {
      expect(() => generation.normalizeUsage({ inputTokens, outputTokens: 1 })).toThrow(
        'invalid-usage',
      );
    }
    expect(
      generation.normalizeUsage({
        inputTokens: 70,
        cacheRead: 20,
        cacheWrite: 10,
        outputTokens: 30,
      }),
    ).toEqual({ input_tokens: 100, cached_input_tokens: 20, output_tokens: 30 });
    expect(() => generation.protocolOutput('x'.repeat(LIMITS.textBytes), {})).toThrow(
      'output-limit',
    );
  });
});

describe('account metadata and CLI (offline)', () => {
  it('uses literal backend allowed, never percentages; missing credits stay unknown', () => {
    expect(auth.normalizeUsage(included(true)).ordinaryUsageAllowed).toBe(true);
    expect(
      auth.normalizeUsage({ rate_limit: { allowed: false, primary_window: { used_percent: 0 } } })
        .ordinaryUsageAllowed,
    ).toBe(false);
    for (const allowed of [undefined, null, 1, 'true'])
      expect(auth.normalizeUsage({ rate_limit: { allowed } }).ordinaryUsageAllowed).toBeNull();
    expect(auth.normalizeUsage({}).credits).toEqual({
      hasCredits: null,
      unlimited: null,
      balance: null,
    });
    expect(
      auth.normalizeUsage({ credits: { has_credits: false, unlimited: false, balance: 0 } }).credits
        .balance,
    ).toBeNull();
    expect(auth.normalizeModels(models)).toEqual([
      { id: 'gpt-5.4', reasoningLevels: ['medium', 'none'] },
    ]);
  });

  it('returns redacted no-auth metadata without any network or fallback', async () => {
    const send = vi.fn(async () => Response.json({}));
    const network = bounded(send);
    const managed = store();
    managed.getCredentials.mockResolvedValue(undefined);
    const checked = await auth.preflight({ store: managed, network });
    expect(checked.metadata).toMatchObject({
      ...auth.POLICY,
      authMode: 'none',
      ordinaryUsageAllowed: null,
      credits: { balance: null },
      models: [],
      toolCount: 0,
      serviceTier: 'default',
    });
    expect(Object.values(checked.metadata.isolation).every((value) => value === false)).toBe(true);
    expect(send).not.toHaveBeenCalled();
    expect(managed.resolveCredentials).not.toHaveBeenCalled();
  });

  it('imports CLI without auto-start and accepts only the exact bounded command contract', async () => {
    const before = globalThis.fetch;
    const cli = await import(helper('cli'));
    expect(globalThis.fetch).toBe(before);
    const args = [
      'planner-exec',
      '--model',
      'gpt-5.4',
      '--reasoning',
      'medium',
      '--auto-reload-disabled',
      'true',
      '-',
    ];
    expect(cli.parseArguments(args)).toMatchObject({
      command: 'planner-exec',
      autoReloadDisabled: true,
    });
    expect(cli.VERSION).toBe('batchclip-gg-chatgpt 5.67.1');
    for (const invalid of [
      [],
      [...args, '--extra'],
      args.slice(0, -1),
      args.map((arg) => (arg === 'true' ? 'false' : arg)),
      args.map((arg) => (arg === '--reasoning' ? '--model' : arg)),
      args.map((arg) => (arg === '--reasoning' ? '--output-schema' : arg)),
      ['login', 'paste-token'],
    ]) {
      expect(() => cli.parseArguments(invalid)).toThrow('invalid-arguments');
    }
    await expect(cli.readPrompt(Readable.from([Buffer.from([0xc3])]))).rejects.toMatchObject({
      code: 'invalid-input',
    });
    await expect(
      cli.readPrompt(Readable.from(['x'.repeat(LIMITS.textBytes + 1)])),
    ).rejects.toMatchObject({ code: 'input-limit' });
    expect(() => auth.dedicatedAuthPath(process.cwd())).toThrow('isolated-auth-path-required');
  });

  it.each([
    '..auth-home',
    '..private/nested',
  ])('refuses a dot-prefixed credential home inside the repository: %s', (relativeHome) => {
    expect(() => auth.dedicatedAuthPath(resolve(process.cwd(), relativeHome))).toThrow(
      'isolated-auth-path-required',
    );
  });

  it('keeps the dedicated credential path under an external home without opening a store', () => {
    const home = resolve(process.cwd(), '..', 'planner-auth-test-home');
    expect(auth.dedicatedAuthPath(home)).toBe(
      resolve(home, '.batchclip', 'planner-eval', 'gg-chatgpt-v1', 'auth.json'),
    );
  });

  it('prints only the version in an actual offline Node subprocess', () => {
    expect(
      execFileSync(process.execPath, [resolve(directory, 'cli.mjs'), '--version'], {
        encoding: 'utf8',
        timeout: 5_000,
        maxBuffer: 1024,
      }),
    ).toBe('batchclip-gg-chatgpt 5.67.1\n');
  });
});
