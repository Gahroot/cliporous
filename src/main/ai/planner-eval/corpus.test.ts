import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CORPUS_LIMITS, type CorpusManifest, importPrivateClips, parseCorpus } from './corpus';

function manifest(): CorpusManifest {
  return {
    version: 1,
    id: 'unit-corpus',
    description: 'Synthetic unit-test transcript and timings, not a recording.',
    clips: [
      {
        id: 'unit-clip',
        provenance: 'synthetic',
        sourceGroup: 'unit-source',
        topicGroup: 'unit-topic',
        split: 'discovery',
        bounds: { start: 10, end: 14 },
        words: [
          { text: 'Ordinary', start: 10.2, end: 10.6 },
          { text: 'speech.', start: 10.6, end: 11.1 },
        ],
        hookLeadSec: 1,
        mediaRef: 'unit-media',
        expectations: {
          animation: 'optional',
          quote: 'forbidden',
          takeaway: 'forbidden',
          requiredKinds: [],
          forbiddenKinds: ['quote'],
          notes: 'Do not promote ordinary speech into a quotation or takeaway.',
        },
      },
    ],
  };
}

function failure(raw: unknown, message: string): void {
  const result = parseCorpus(raw);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('Expected invalid corpus');
  expect(result.error).toContain(message);
}

function privateProject(words: unknown = manifest().clips[0].words) {
  return {
    clips: {
      'unit-source': [
        {
          id: 'unit-clip',
          sourceId: 'unit-source',
          startTime: 10,
          endTime: 14,
          wordTimestamps: words,
          text: 'This plain text must not be used to invent timings.',
          thumbnail: 'data:private-image',
          aiEditPlan: { private: true },
          overrides: { geminiApiKey: 'fake-clip-secret' },
        },
      ],
    },
    transcriptions: {},
    sources: [{ path: 'C:/private/not-opened.mp4' }],
    settings: { geminiApiKey: 'fake-project-secret', arbitrary: 'not-retained' },
  };
}

describe('parseCorpus', () => {
  it('accepts versioned objects and JSON, returning fresh allowlisted data', () => {
    const raw = manifest();
    expect(parseCorpus(JSON.stringify(raw))).toEqual({ ok: true, value: raw });
    const result = parseCorpus(raw);
    expect(result).toEqual({ ok: true, value: raw });
    if (!result.ok) throw new Error(result.error);
    expect(result.value).not.toBe(raw);
    expect(result.value.clips[0].words[0]).not.toBe(raw.clips[0].words[0]);
    expect(result.value.clips[0].expectations).not.toBe(raw.clips[0].expectations);
  });

  it('allows omitted hook lead and media reference without inventing them', () => {
    const raw = manifest();
    delete raw.clips[0].hookLeadSec;
    delete raw.clips[0].mediaRef;
    expect(parseCorpus(raw)).toEqual({ ok: true, value: raw });
  });

  it.each([
    null,
    [],
    1,
    'not JSON',
    { version: 2 },
    { version: '1' },
  ])('rejects malformed roots or unsupported versions: %j', (raw) =>
    expect(parseCorpus(raw).ok).toBe(false));

  it('bounds serialized size in bytes, including UTF-8 input and object input', () => {
    failure(`"${'é'.repeat(CORPUS_LIMITS.maxBytes / 2)}"`, 'size');
    failure({ ...manifest(), description: 'x'.repeat(CORPUS_LIMITS.maxBytes) }, 'size');
  });

  it('bounds clip and word counts instead of truncating data', () => {
    failure({ ...manifest(), clips: [] }, 'clips');
    const raw = manifest();
    failure({ ...raw, clips: Array(CORPUS_LIMITS.maxClips + 1).fill(raw.clips[0]) }, 'clips');
    raw.clips[0].words = [];
    failure(raw, 'words');
    raw.clips[0].words = Array(CORPUS_LIMITS.maxWordsPerClip + 1).fill({
      text: 'word',
      start: 10,
      end: 11,
    });
    failure(raw, 'words');
  });

  it.each([
    ['negative', -1, 14],
    ['reversed', 14, 10],
    ['empty', 10, 10],
    ['NaN', Number.NaN, 14],
    ['infinite', 10, Number.POSITIVE_INFINITY],
    ['numeric string', '10', 14],
  ])('rejects %s bounds', (_label, start, end) => {
    const raw = manifest();
    Object.assign(raw.clips[0].bounds, { start, end });
    failure(raw, 'bounds');
  });

  it.each([
    ['nonfinite start', [{ text: 'word', start: Number.NaN, end: 11 }]],
    ['nonfinite end', [{ text: 'word', start: 10, end: Number.POSITIVE_INFINITY }]],
    ['zero duration', [{ text: 'word', start: 11, end: 11 }]],
    ['reversed', [{ text: 'word', start: 12, end: 11 }]],
    ['before bounds', [{ text: 'word', start: 9.9, end: 11 }]],
    ['after bounds', [{ text: 'word', start: 13, end: 14.1 }]],
    ['empty text', [{ text: '  ', start: 10, end: 11 }]],
    [
      'out of order',
      [
        { text: 'a', start: 12, end: 13 },
        { text: 'b', start: 10, end: 11 },
      ],
    ],
    [
      'overlapping',
      [
        { text: 'a', start: 10, end: 12 },
        { text: 'b', start: 11, end: 13 },
      ],
    ],
  ])('rejects %s words', (_label, words) => {
    const raw = manifest();
    raw.clips[0].words = words;
    failure(raw, 'words');
  });

  it('accepts touching word boundaries and containment at both clip edges', () => {
    const raw = manifest();
    raw.clips[0].words = [
      { text: 'a', start: 10, end: 12 },
      { text: 'b', start: 12, end: 14 },
    ];
    expect(parseCorpus(raw).ok).toBe(true);
  });

  it.each([-1, 4, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid hook lead %s', (lead) => {
    const raw = manifest();
    raw.clips[0].hookLeadSec = lead;
    failure(raw, 'hookLeadSec');
  });

  it('accepts opaque media IDs, not paths or URLs that could carry private information', () => {
    const raw = manifest();
    for (const ref of ['C:/private/video.mp4', '../video.mp4', 'https://example.invalid/video']) {
      raw.clips[0].mediaRef = ref;
      failure(raw, 'mediaRef');
    }
  });

  it('rejects unknown settings at every manifest level', () => {
    const mutations: Array<(raw: CorpusManifest) => void> = [
      (raw) => Object.assign(raw, { settings: { apiKey: 'fake-secret' } }),
      (raw) => Object.assign(raw.clips[0], { settings: { outputMode: 'longform' } }),
      (raw) => Object.assign(raw.clips[0].bounds, { settings: {} }),
      (raw) => Object.assign(raw.clips[0].words[0], { settings: {} }),
      (raw) => Object.assign(raw.clips[0].expectations, { settings: {} }),
    ];
    for (const mutate of mutations) {
      const raw = manifest();
      mutate(raw);
      failure(raw, 'unknown field');
    }
  });

  it('rejects duplicate IDs and invalid split/provenance labels', () => {
    const raw = manifest();
    raw.clips.push(structuredClone(raw.clips[0]));
    failure(raw, 'duplicate');
    raw.clips.pop();
    Object.assign(raw.clips[0], { split: 'train' });
    failure(raw, 'split');
    Object.assign(raw.clips[0], { split: 'discovery', provenance: 'real' });
    failure(raw, 'provenance');
  });

  it.each(['sourceGroup', 'topicGroup'] as const)('rejects %s leakage across partitions', (key) => {
    const raw = manifest();
    raw.clips.push({
      ...structuredClone(raw.clips[0]),
      id: 'other-clip',
      sourceGroup: 'other-source',
      topicGroup: 'other-topic',
      split: 'holdout',
    });
    raw.clips[1][key] = raw.clips[0][key];
    failure(raw, key);
  });

  it('permits multiple clips from a group only within the same partition', () => {
    const raw = manifest();
    raw.clips.push({ ...structuredClone(raw.clips[0]), id: 'other-clip' });
    expect(parseCorpus(raw).ok).toBe(true);
  });

  it('requires explicit, consistent expectations', () => {
    const raw = manifest();
    Object.assign(raw.clips[0], { expectations: {} });
    failure(raw, 'expectations');
    raw.clips[0].expectations = manifest().clips[0].expectations;
    raw.clips[0].expectations.requiredKinds = ['quote'];
    failure(raw, 'expectations');
    raw.clips[0].expectations.requiredKinds = ['flow'];
    raw.clips[0].expectations.animation = 'none';
    failure(raw, 'expectations');
    raw.clips[0].expectations.animation = 'required';
    raw.clips[0].expectations.minConsecutiveScenes = 1.5;
    failure(raw, 'expectations');
  });
});

describe('authored corpus fixture', () => {
  it('contains six synthetic discovery cases and two independently grouped holdout controls', () => {
    const result = parseCorpus(
      readFileSync(
        new URL('../../../../scripts/planner-eval/fixtures/authored-v1.json', import.meta.url),
        'utf8',
      ),
    );
    if (!result.ok) throw new Error(result.error);
    const { clips, description } = result.value;
    expect(description).toMatch(/synthetic/i);
    expect(clips).toHaveLength(8);
    expect(clips.filter((clip) => clip.split === 'discovery')).toHaveLength(6);
    expect(clips.filter((clip) => clip.split === 'holdout')).toHaveLength(2);
    expect(clips.every((clip) => clip.provenance === 'synthetic')).toBe(true);
    expect(clips.every((clip) => clip.mediaRef === undefined)).toBe(true);
    expect(
      clips.find((clip) => clip.id === 'three-processes')?.expectations.minConsecutiveScenes,
    ).toBe(3);
    expect(clips.find((clip) => clip.id === 'ordinary-speech')?.expectations.quote).toBe(
      'forbidden',
    );
    expect(clips.find((clip) => clip.id === 'grounded-takeaway')?.expectations.takeaway).toBe(
      'required',
    );
    expect(clips.find((clip) => clip.id === 'no-animation')?.expectations.animation).toBe('none');
    expect(
      clips.find((clip) => clip.id === 'specialized-agent-plan')?.expectations.requiredKinds,
    ).toContain('agent-plan');
    expect(
      clips.find((clip) => clip.id === 'business-model-control')?.expectations.forbiddenKinds,
    ).toContain('model-training');
  });
});

describe('importPrivateClips', () => {
  it('is read-only and retains only explicitly allowlisted timed clip data', () => {
    const raw = privateProject([{ ...manifest().clips[0].words[0], settings: { secret: true } }]);
    const before = structuredClone(raw);
    const result = importPrivateClips(raw);
    expect(result).toEqual({
      ok: true,
      value: {
        clips: [
          {
            id: 'unit-clip',
            provenance: 'private-import',
            sourceGroup: 'unit-source',
            bounds: { start: 10, end: 14 },
            words: [{ text: 'Ordinary', start: 10.2, end: 10.6 }],
          },
        ],
        skipped: [],
      },
    });
    expect(raw).toEqual(before);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.clips[0].words[0]).not.toBe(
      (raw.clips['unit-source'][0].wordTimestamps as unknown[])[0],
    );
    expect(JSON.stringify(result)).not.toMatch(
      /secret|thumbnail|aiEditPlan|settings|private\/|mediaRef/,
    );
  });

  it('does not even read unknown settings or media properties', () => {
    const raw = privateProject();
    for (const key of ['settings', 'sources']) {
      Object.defineProperty(raw, key, {
        get: () => {
          throw new Error('must not read');
        },
      });
    }
    expect(importPrivateClips(raw).ok).toBe(true);
  });

  it('uses actual source words when clip wordTimestamps are absent, without rebasing or clipping', () => {
    const raw = privateProject(undefined);
    Object.assign(raw.clips['unit-source'][0], { wordTimestamps: undefined });
    raw.transcriptions = {
      'unit-source': {
        words: [
          { text: 'before', start: 9, end: 9.5 },
          ...manifest().clips[0].words,
          { text: 'after', start: 14, end: 15 },
        ],
      },
    };
    const result = importPrivateClips(raw);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.clips[0].words).toEqual(manifest().clips[0].words);
    expect(result.value.skipped).toEqual([]);
  });

  it('skips eleven untimed clips with a missing timed transcript diagnostic, not invented words', () => {
    const raw = privateProject();
    raw.clips['unit-source'] = Array.from({ length: 11 }, (_, index) => ({
      ...raw.clips['unit-source'][0],
      id: `clip-${index}`,
      wordTimestamps: undefined,
    }));
    const result = importPrivateClips(raw);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.clips).toEqual([]);
    expect(result.value.skipped).toHaveLength(11);
    expect(result.value.skipped.every((skip) => skip.reason === 'missing timed transcript')).toBe(
      true,
    );
  });

  it('does not expand untimed text or segment timestamps into word timestamps', () => {
    const raw = privateProject([]);
    Object.assign(raw.clips['unit-source'][0], {
      segments: [{ text: 'Untimed words', start: 10, end: 14 }],
    });
    raw.transcriptions = {
      'unit-source': { text: 'Untimed words', words: [], segments: [{ start: 10, end: 14 }] },
    };
    const result = importPrivateClips(raw);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.clips).toEqual([]);
    expect(result.value.skipped[0].reason).toBe('missing timed transcript');
  });

  it('skips invalid timing instead of repairing it or silently falling back', () => {
    const raw = privateProject([{ text: 'bad', start: 11, end: Number.POSITIVE_INFINITY }]);
    raw.transcriptions = { 'unit-source': { words: manifest().clips[0].words } };
    const result = importPrivateClips(raw);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.clips).toEqual([]);
    expect(result.value.skipped[0].reason).toBe('invalid timed transcript');
  });

  it('skips invalid clip bounds and rejects malformed snapshot roots', () => {
    const raw = privateProject();
    raw.clips['unit-source'][0].endTime = 9;
    const result = importPrivateClips(raw);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.clips).toEqual([]);
    expect(result.value.skipped[0].reason).toBe('invalid clip metadata');
    expect(importPrivateClips(null).ok).toBe(false);
    expect(importPrivateClips({ clips: [] }).ok).toBe(false);
  });
});
