import { Agent, request } from 'node:https';

export const LIMITS = Object.freeze({
  requestBytes: 768 * 1024,
  metadataBytes: 512 * 1024,
  responseBytes: 4 * 1024 * 1024,
  textBytes: 512 * 1024,
  stdoutBytes: 1024 * 1024,
  requestMs: 85_000,
  metadataMs: 15_000,
  loginMs: 120_000,
});
export const ENDPOINTS = Object.freeze({
  token: 'https://auth.openai.com/oauth/token',
  usage: 'https://chatgpt.com/backend-api/wham/usage',
  models: 'https://chatgpt.com/backend-api/codex/models?client_version=0.159.3',
  responses: 'https://chatgpt.com/backend-api/codex/responses',
});

export class ClientError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
export function errorCode(error) {
  return error instanceof ClientError ? error.code : 'client-failed';
}
export function tokenCount(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 10_000_000)
    throw new ClientError('invalid-usage');
  return value;
}

function wireUsage(raw) {
  if (!raw || typeof raw !== 'object') throw new ClientError('invalid-usage');
  const input = tokenCount(raw.input_tokens);
  const output = tokenCount(raw.output_tokens);
  const cached = tokenCount(raw.input_tokens_details?.cached_tokens ?? 0);
  const written = tokenCount(raw.input_tokens_details?.cache_write_tokens ?? 0);
  const reasoning = raw.output_tokens_details?.reasoning_tokens;
  if (cached + written > input || (reasoning !== undefined && tokenCount(reasoning) > output))
    throw new ClientError('invalid-usage');
  return { input, output, cached, written, ...(reasoning === undefined ? {} : { reasoning }) };
}

// GG currently treats unknown terminal statuses as success and ignores some server-tool
// events. Inspect the bounded raw SSE as well as the public stream result, fail closed.
function sseInspector() {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let pending = '';
  let terminal;
  let sentinel = false;
  // IDs and positions bind every text snapshot to its own accumulator. The raw
  // 4 MiB response cap remains in force; also bound retained text and identities.
  const items = new Map();
  const positions = new Map();
  let textBytes = 0;
  function index(value, limit) {
    if (!Number.isSafeInteger(value) || value < 0 || value >= limit)
      throw new ClientError('invalid-identity');
    return value;
  }
  function bind(id, position) {
    if (typeof id !== 'string' || !/^[\x21-\x7e]{1,256}$/.test(id))
      throw new ClientError('invalid-identity');
    let state = items.get(id);
    if (!state) {
      if (items.size >= 128) throw new ClientError('response-limit');
      state = { id, parts: new Map(), added: false, done: false };
      items.set(id, state);
    }
    if (position !== undefined) {
      index(position, 128);
      if (
        (state.position !== undefined && state.position !== position) ||
        (positions.has(position) && positions.get(position) !== id)
      )
        throw new ClientError('invalid-identity');
      state.position = position;
      positions.set(position, id);
    }
    return state;
  }
  function textPart(state, position) {
    index(position, 64);
    if (state.contentLength !== undefined && position >= state.contentLength)
      throw new ClientError('text-mismatch');
    if (state.type !== undefined && state.type !== 'message')
      throw new ClientError('invalid-identity');
    let content = state.parts.get(position);
    if (!content) {
      content = { text: '', added: false, finals: new Set() };
      state.parts.set(position, content);
    }
    return content;
  }
  function setText(content, text) {
    if (typeof text !== 'string') throw new ClientError('invalid-text');
    const nextBytes = textBytes + Buffer.byteLength(text) - Buffer.byteLength(content.text);
    if (nextBytes > LIMITS.textBytes) throw new ClientError('output-limit');
    textBytes = nextBytes;
    content.text = text;
  }
  function finalText(content, text, source) {
    if (content.finals.has(source)) throw new ClientError('duplicate-identity');
    if (
      typeof text !== 'string' ||
      !text.startsWith(content.text) ||
      (content.finals.size && text !== content.text)
    )
      throw new ClientError('text-mismatch');
    setText(content, text);
    content.finals.add(source);
  }
  function snapshot(value, position, source) {
    const state = bind(value.id, position);
    if (
      (state.type !== undefined && state.type !== value.type) ||
      (state.parts.size && value.type !== 'message')
    )
      throw new ClientError('invalid-identity');
    state.type = value.type;
    if (source === 'added') {
      if (state.added || state.done) throw new ClientError('duplicate-identity');
      state.added = true;
    } else if (source === 'output_item.done') {
      if (state.done) throw new ClientError('duplicate-identity');
      state.done = true;
    }
    if (value.type !== 'message') return state;
    if (!Array.isArray(value.content) || value.content.length > 64)
      throw new ClientError('invalid-text');
    if (source !== 'added') {
      if (state.contentLength !== undefined && state.contentLength !== value.content.length)
        throw new ClientError('text-mismatch');
      state.contentLength = value.content.length;
    }
    for (const [position, part] of value.content.entries()) {
      if (part.type !== 'output_text') throw new ClientError('non-text-response');
      const content = textPart(state, position);
      if (source !== 'added') finalText(content, part.text, source);
      else if (part.text) {
        if (
          !part.text.startsWith(content.text) ||
          (content.finals.size && part.text !== content.text)
        )
          throw new ClientError('text-mismatch');
        setText(content, part.text);
      }
    }
    if (
      source !== 'added' &&
      [...state.parts.keys()].some((position) => position >= value.content.length)
    )
      throw new ClientError('text-mismatch');
    return state;
  }
  function finalOutput(output) {
    const seen = new Set();
    if (output.length > 128) throw new ClientError('response-limit');
    for (const [position, value] of output.entries()) {
      if (seen.has(value.id)) throw new ClientError('duplicate-identity');
      seen.add(value.id);
      snapshot(value, position, 'terminal');
    }
    if ([...items.keys()].some((id) => !seen.has(id))) throw new ClientError('text-mismatch');
  }
  function completedText() {
    const ordered = [...items.values()];
    // Terminal output or indexed events define canonical order. Otherwise retain
    // first-seen order and let generation verify it against actual SDK emission.
    if (ordered.every((state) => state.position !== undefined))
      ordered.sort((a, b) => a.position - b.position);
    let text = '';
    for (const state of ordered) {
      if (!state.type) throw new ClientError('invalid-identity');
      const contents = [...state.parts.entries()].sort(([a], [b]) => a - b);
      for (const [expected, [position, content]] of contents.entries()) {
        if (position !== expected || !content.finals.size)
          throw new ClientError('incomplete-response');
        text += content.text;
      }
    }
    return text;
  }
  const types = new Set([
    'response.created',
    'response.in_progress',
    'response.output_item.added',
    'response.output_item.done',
    'response.content_part.added',
    'response.content_part.done',
    'response.output_text.delta',
    'response.output_text.done',
    'response.reasoning_summary_part.added',
    'response.reasoning_summary_part.done',
    'response.reasoning_summary_text.delta',
    'response.reasoning_summary_text.done',
    'response.reasoning_summary.delta',
    'response.reasoning_summary.done',
    'response.reasoning_text.delta',
    'response.reasoning_text.done',
    'response.reasoning.delta',
    'response.reasoning.done',
    'response.completed',
    'response.done',
  ]);
  function flags(value) {
    if (
      !value ||
      value.error ||
      value.incomplete_details ||
      (value.truncated !== undefined && value.truncated !== false) ||
      (value.finish_reason !== undefined && value.finish_reason !== 'stop')
    )
      throw new ClientError('invalid-status');
  }
  function part(value) {
    flags(value);
    if (!value || !['output_text', 'summary_text', 'reasoning_text'].includes(value.type))
      throw new ClientError('non-text-response');
  }
  function item(value, completed = false) {
    flags(value);
    if (!value || !['message', 'reasoning'].includes(value.type))
      throw new ClientError('non-text-response');
    if (value.type === 'message' && value.role !== 'assistant')
      throw new ClientError('non-text-response');
    if (
      value.status !== undefined &&
      !(completed ? ['completed'] : ['in_progress', 'completed']).includes(value.status)
    )
      throw new ClientError('invalid-status');
    for (const field of ['content', 'summary']) {
      if (value[field] !== undefined) {
        if (!Array.isArray(value[field])) throw new ClientError('invalid-events');
        for (const content of value[field]) part(content);
      }
    }
  }
  function event(block) {
    const lines = block.split('\n');
    const data = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data) {
      if (lines.some((line) => line && !line.startsWith(':')))
        throw new ClientError('invalid-events');
      return;
    }
    if (data === '[DONE]') {
      if (!terminal || sentinel) throw new ClientError('invalid-events');
      sentinel = true;
      return;
    }
    if (terminal || sentinel) throw new ClientError('invalid-events');
    let value;
    try {
      value = JSON.parse(data);
    } catch {
      throw new ClientError('invalid-events');
    }
    if (!types.has(value?.type)) throw new ClientError('invalid-events');
    flags(value);
    const name = lines
      .find((line) => line.startsWith('event:'))
      ?.slice(6)
      .trim();
    if (name && name !== value.type) throw new ClientError('invalid-events');
    const done = ['response.completed', 'response.done'].includes(value.type);
    if (value.response !== undefined) {
      flags(value.response);
      if (
        !value.response ||
        !(done ? ['completed'] : ['queued', 'in_progress']).includes(value.response.status)
      )
        throw new ClientError('invalid-status');
      if (value.response.error || value.response.incomplete_details)
        throw new ClientError('invalid-status');
      if (value.response.service_tier !== undefined && value.response.service_tier !== 'default')
        throw new ClientError('default-service-tier-required');
      if (value.response.output !== undefined) {
        if (!Array.isArray(value.response.output)) throw new ClientError('invalid-events');
        for (const output of value.response.output) item(output, done);
        if (done) finalOutput(value.response.output);
      }
    }
    if (value.type.startsWith('response.output_item.')) {
      item(value.item, value.type.endsWith('.done'));
      snapshot(
        value.item,
        value.output_index,
        value.type.endsWith('.done') ? 'output_item.done' : 'added',
      );
    }
    if (
      value.type.startsWith('response.content_part.') ||
      value.type.startsWith('response.reasoning_summary_part.')
    )
      part(value.part);
    if (
      value.type.startsWith('response.output_text.') ||
      value.type.startsWith('response.content_part.')
    ) {
      const state = bind(value.item_id, value.output_index);
      const content = textPart(state, value.content_index);
      if (value.type === 'response.output_text.delta') {
        if (state.done || content.finals.size) throw new ClientError('text-mismatch');
        if (typeof value.delta !== 'string') throw new ClientError('invalid-text');
        setText(content, content.text + value.delta);
      } else if (value.type === 'response.content_part.added') {
        if (state.done || content.added || content.finals.size)
          throw new ClientError('duplicate-identity');
        if (value.part.type !== 'output_text') throw new ClientError('non-text-response');
        content.added = true;
        if (value.part.text) {
          if (!value.part.text.startsWith(content.text)) throw new ClientError('text-mismatch');
          setText(content, value.part.text);
        }
      } else {
        if (value.part && value.part.type !== 'output_text')
          throw new ClientError('non-text-response');
        finalText(
          content,
          value.type === 'response.output_text.done' ? value.text : value.part.text,
          value.type,
        );
      }
    }
    if (done) {
      if (value.response?.status !== 'completed') throw new ClientError('invalid-status');
      terminal = { ...wireUsage(value.response.usage), text: completedText() };
    }
  }
  function drain() {
    pending = pending.replace(/\r\n/g, '\n');
    let normalized = '';
    while (true) {
      const end = pending.indexOf('\n\n');
      if (end === -1) break;
      const block = pending.slice(0, end);
      event(block);
      normalized += `${block}\n\n`;
      pending = pending.slice(end + 2);
    }
    return normalized;
  }
  return {
    push(bytes) {
      pending += decoder.decode(bytes, { stream: true });
      // GG normalizes CRLF per chunk, losing delimiters when CR/LF split. Send
      // validated complete LF frames; retain byte accounting on the RAW chunks.
      return new TextEncoder().encode(drain());
    },
    finish() {
      pending += decoder.decode();
      drain();
      if (pending.trim() || !terminal) throw new ClientError('incomplete-response');
      return terminal;
    },
  };
}

// Direct HTTPS with an owned Agent: no environment/global-dispatcher proxies, SDK
// keys, redirects, DNS overrides or user endpoint configuration. Response bytes are
// uncompressed on the wire; unexpected content encoding is refused, not expanded.
function httpsTransport(agent) {
  return (url, init) =>
    new Promise((resolve, reject) => {
      const req = request(
        url,
        {
          method: init.method,
          headers: Object.fromEntries(init.headers),
          signal: init.signal,
          agent,
          rejectUnauthorized: true,
        },
        (res) => {
          const headers = new Headers();
          for (const [key, value] of Object.entries(res.headers)) {
            if (value !== undefined)
              headers.set(key, Array.isArray(value) ? value.join(', ') : value);
          }
          const iterator = res[Symbol.asyncIterator]();
          const body = new ReadableStream({
            async pull(controller) {
              try {
                const next = await iterator.next();
                if (next.done) controller.close();
                else controller.enqueue(new Uint8Array(next.value));
              } catch {
                controller.error(new ClientError('network-failed'));
              }
            },
            cancel() {
              res.destroy();
            },
          });
          resolve({ status: res.statusCode ?? 0, headers, body });
        },
      );
      req.once('error', () =>
        reject(new ClientError(init.signal.aborted ? 'request-aborted' : 'network-failed')),
      );
      req.end(init.body);
    });
}

/** Install only inside the isolated child; transport injection is for offline tests. */
export function installBoundedFetch({ signal, transport } = {}) {
  const previous = globalThis.fetch;
  const agent = transport ? undefined : new Agent({ keepAlive: false, maxSockets: 1 });
  const send = transport ?? httpsTransport(agent);
  const controllers = new Set();
  const readers = new Set();
  const counts = new Map();
  let permit;
  let closed = false;
  let completion;
  async function boundedFetch(input, init = {}) {
    if (closed || signal?.aborted) throw new ClientError('request-aborted');
    // SDK uses URL/string + an explicit body. Reject Request objects and exotic
    // bodies instead of consuming an unbounded stream before the byte check.
    if (!(typeof input === 'string' || input instanceof URL))
      throw new ClientError('request-denied');
    const url = String(input);
    const route = Object.keys(ENDPOINTS).find((key) => ENDPOINTS[key] === url);
    const method = init.method ?? 'GET';
    if (!route || method !== (['token', 'responses'].includes(route) ? 'POST' : 'GET'))
      throw new ClientError('request-denied');
    if (
      Object.keys(init).some(
        (key) => !['method', 'headers', 'body', 'signal', 'redirect'].includes(key),
      ) ||
      (init.redirect !== undefined && init.redirect !== 'error')
    )
      throw new ClientError('request-denied');
    const headers = new Headers(init.headers);
    for (const forbidden of [
      'host',
      'proxy-authorization',
      'proxy-connection',
      'cookie',
      'connection',
    ]) {
      if (headers.has(forbidden)) throw new ClientError('request-denied');
    }
    headers.set('accept-encoding', 'identity');
    let body = init.body;
    if (body instanceof URLSearchParams) body = body.toString();
    if (body !== undefined && typeof body !== 'string' && !(body instanceof Uint8Array))
      throw new ClientError('request-denied');
    if (
      body !== undefined &&
      Buffer.byteLength(body) > (route === 'token' ? 32 * 1024 : LIMITS.requestBytes)
    )
      throw new ClientError('request-limit');
    if (method === 'GET' && body !== undefined) throw new ClientError('request-denied');
    if (route === 'responses') {
      if (
        !permit ||
        headers.get('authorization') !== `Bearer ${permit.accessToken}` ||
        headers.get('chatgpt-account-id') !== permit.accountId
      )
        throw new ClientError('generation-not-authorized');
      permit = undefined;
    }
    const count = (counts.get(route) ?? 0) + 1;
    if (count > 1) throw new ClientError('request-count-limit');
    counts.set(route, count);
    const controller = new AbortController();
    controllers.add(controller);
    const combined = AbortSignal.any([controller.signal, ...[signal, init.signal].filter(Boolean)]);
    const timer = setTimeout(
      () => controller.abort(),
      route === 'responses' ? LIMITS.requestMs : LIMITS.metadataMs,
    );
    let reader;
    let abort;
    const cleanup = () => {
      clearTimeout(timer);
      if (abort) combined.removeEventListener('abort', abort);
      controllers.delete(controller);
      if (reader) readers.delete(reader);
    };
    try {
      const raw = await send(url, { method, headers, body, signal: combined, redirect: 'error' });
      if (combined.aborted) throw new ClientError('request-aborted');
      reader = raw.body?.getReader();
      if (reader) readers.add(reader);
      const maxBytes = route === 'responses' ? LIMITS.responseBytes : LIMITS.metadataBytes;
      const length = raw.headers.get('content-length');
      if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes))
        throw new ClientError('response-limit');
      if (raw.status < 200 || raw.status >= 300)
        throw new ClientError(
          raw.status === 429 || raw.status === 402 ? 'usage-limit' : 'http-refused',
        );
      if (!reader || !['', 'identity'].includes(raw.headers.get('content-encoding') ?? ''))
        throw new ClientError('invalid-response');
      if (
        route === 'responses' &&
        !/^text\/event-stream(?:;|$)/i.test(raw.headers.get('content-type') ?? '')
      )
        throw new ClientError('invalid-response');
      const inspector = route === 'responses' ? sseInspector() : undefined;
      let size = 0;
      let failed = false;
      const stream = new ReadableStream({
        start(out) {
          abort = () => {
            if (failed) return;
            failed = true;
            out.error(new ClientError('request-aborted'));
            void reader.cancel().catch(() => {});
            cleanup();
          };
          combined.addEventListener('abort', abort, { once: true });
          if (combined.aborted) abort();
        },
        async pull(out) {
          try {
            while (!failed) {
              const chunk = await reader.read();
              if (failed) return;
              if (chunk.done) {
                if (inspector) completion = inspector.finish();
                cleanup();
                out.close();
                return;
              }
              size += chunk.value.byteLength;
              if (size > maxBytes) throw new ClientError('response-limit');
              const bytes = inspector ? inspector.push(chunk.value) : chunk.value;
              if (bytes.byteLength) {
                out.enqueue(bytes);
                return;
              }
            }
          } catch (error) {
            if (failed) return;
            failed = true;
            out.error(error instanceof ClientError ? error : new ClientError('invalid-response'));
            cleanup();
            controller.abort();
            void reader.cancel().catch(() => {});
          }
        },
        cancel() {
          cleanup();
          controller.abort();
          return reader.cancel();
        },
      });
      return new Response(stream, { status: raw.status, headers: raw.headers });
    } catch (error) {
      cleanup();
      controller.abort();
      await reader?.cancel().catch(() => {});
      throw error instanceof ClientError ? error : new ClientError('network-failed');
    }
  }
  globalThis.fetch = boundedFetch;
  return {
    fetch: boundedFetch,
    authorizeGeneration(credentials) {
      if (
        closed ||
        permit ||
        counts.has('responses') ||
        !credentials.accountId ||
        !credentials.accessToken
      )
        throw new ClientError('generation-not-authorized');
      permit = { accountId: credentials.accountId, accessToken: credentials.accessToken };
    },
    get completion() {
      return completion;
    },
    async close() {
      closed = true;
      permit = undefined;
      if (globalThis.fetch === boundedFetch) globalThis.fetch = previous;
      for (const controller of controllers) controller.abort();
      await Promise.all([...readers].map((reader) => reader.cancel().catch(() => {})));
      controllers.clear();
      readers.clear();
      agent?.destroy();
    },
  };
}
