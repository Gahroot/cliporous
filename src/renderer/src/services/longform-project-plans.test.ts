import { longformSourceFingerprint, type SceneFirstLongformPlan } from '@shared/longform-scenes';
import { getPaletteById } from '@shared/palettes';
import { describe, expect, it } from 'vitest';
import type { LongformPlanRecord } from '../store/longform-slice';
import type { SourceVideo, TranscriptionData } from '../store/types';
import { restoreLongformPlans } from './longform-project-plans';

function fixture(): {
  record: LongformPlanRecord;
  source: SourceVideo;
  transcript: TranscriptionData;
} {
  const words = Array.from({ length: 30 }, (_, index) => ({
    text: index === 6 ? 'battery' : `word${index}`,
    start: index * 0.5,
    end: index * 0.5 + 0.4,
  }));
  const source: SourceVideo = {
    id: 'source',
    name: 'source.mp4',
    path: '/videos/source.mp4',
    duration: 15,
    width: 1920,
    height: 1080,
    origin: 'file',
  };
  const transcript: TranscriptionData = {
    words,
    text: words.map((word) => word.text).join(' '),
    segments: [],
    formattedForAI: '',
  };
  const plan: SceneFirstLongformPlan = {
    schemaVersion: 2,
    mode: 'scene-first',
    parserVersion: 1,
    sourceDuration: source.duration,
    sourceFingerprint: longformSourceFingerprint(words, source.duration),
    blocks: [],
    phrases: [],
    cards: [],
    reasoning: 'Explain the battery.',
    generatedAt: 100,
    scenes: [
      {
        id: 'scene-hero-4-20',
        kind: 'hero',
        startWord: 4,
        endWord: 20,
        startTime: 1.75,
        endTime: 10.75,
        sectionId: 'section-0',
        presentation: 'full-frame',
        sourceSpec: {
          kind: 'hero',
          prop: 'battery',
          label: 'battery',
          startWord: 4,
          endWord: 20,
          word: 6,
          layout: 'takeover',
        },
        label: 'Battery',
        purpose: 'Show the spoken battery example.',
      },
    ],
    sections: [
      {
        id: 'section-0',
        startWord: 0,
        endWord: 29,
        startTime: 0,
        endTime: 15,
        status: 'planned',
        diagnostics: [],
      },
    ],
  };
  const palette = getPaletteById('brand');
  return {
    source,
    transcript,
    record: {
      plan,
      skin: 'editorial',
      paletteId: 'brand',
      palette,
      status: 'accepted',
      activeVersionId: 'version-1',
      approvedVersionId: 'version-1',
      versions: [
        {
          id: 'version-1',
          plan: structuredClone(plan),
          skin: 'editorial',
          paletteId: 'brand',
          palette: { ...palette },
          origin: 'accepted',
          createdAt: 100,
        },
      ],
    },
  };
}

describe('scene-first project restore without destructive migration', () => {
  it('round trips the accepted version and source specification without editing it', () => {
    const { record, source, transcript } = fixture();
    const serialized = JSON.stringify({ source: record });
    const restored = restoreLongformPlans(JSON.parse(serialized), [source], { source: transcript });
    expect(restored.source).toEqual(record);
    expect(restored.source?.approvedVersionId).toBe('version-1');
  });

  it('keeps parser-1 plans byte-for-byte through repeated read/save without adding style', () => {
    const { record, source, transcript } = fixture();
    const original = JSON.stringify(record);
    let restored = record;
    for (let index = 0; index < 3; index++) {
      restored = restoreLongformPlans(JSON.parse(JSON.stringify({ source: restored })), [source], {
        source: transcript,
      }).source;
      expect(JSON.stringify(restored)).toBe(original);
    }
    expect(restored.plan).not.toHaveProperty('storyboardStyle');
  });

  it('round trips mixed parser versions, styles and palette snapshots without collapsing history', () => {
    const { record, source, transcript } = fixture();
    const oldVersion = structuredClone(record.versions?.[0]);
    if (!oldVersion) throw new Error('Expected historical version');
    const polishPlan = {
      ...oldVersion.plan,
      parserVersion: 2,
      storyboardStyle: 'polish',
    } as SceneFirstLongformPlan;
    const inkPlan = { ...polishPlan, storyboardStyle: 'ink' } as SceneFirstLongformPlan;
    const palette = {
      ...getPaletteById('brand'),
      id: 'custom-deleted',
      builtin: false,
      accent: '#123456',
    };
    record.plan = inkPlan;
    record.paletteId = palette.id;
    record.palette = palette;
    record.activeVersionId = 'ink';
    record.approvedVersionId = 'ink';
    record.versions = [
      oldVersion,
      { ...oldVersion, id: 'polish', plan: polishPlan },
      {
        ...oldVersion,
        id: 'ink',
        plan: structuredClone(inkPlan),
        paletteId: palette.id,
        palette: { ...palette },
      },
    ];
    const restored = restoreLongformPlans(
      JSON.parse(JSON.stringify({ source: record })),
      [source],
      { source: transcript },
    );
    expect(restored.source).toEqual(record);
    expect(restored.source.versions?.[0]).toEqual(oldVersion);
    expect(restored.source.palette).toEqual(palette);
  });

  it.each([
    { parserVersion: 99, storyboardStyle: 'polish' },
    { parserVersion: 2 },
    { parserVersion: 2, storyboardStyle: 'future' },
    { parserVersion: 2, storyboardStyle: null },
    { parserVersion: 2, storyboardStyle: { value: 'ink' } },
  ])('retains and blocks unsupported parser/style %j through repeated saves', (patch) => {
    const { record, source, transcript } = fixture();
    const raw = { ...record, plan: { ...record.plan, ...patch } };
    let restored = restoreLongformPlans({ source: raw }, [source], { source: transcript }).source;
    expect(restored.status).toBe('draft');
    expect(restored.approvedVersionId).toBeNull();
    expect(restored.validationProblem).toBeTruthy();
    expect(restored.preservedPlanData).toEqual(raw);
    restored = restoreLongformPlans(JSON.parse(JSON.stringify({ source: restored })), [source], {
      source: transcript,
    }).source;
    expect(restored.preservedPlanData).toEqual(raw);
    expect(restored.approvedVersionId).toBeNull();
  });

  it('retains a missing custom palette ID and blocks approval instead of substituting Brand', () => {
    const { record, source, transcript } = fixture();
    record.paletteId = 'custom-missing';
    delete record.palette;
    const restored = restoreLongformPlans({ source: record }, [source], {
      source: transcript,
    }).source;
    expect(restored.paletteId).toBe('custom-missing');
    expect(restored.palette).toBeUndefined();
    expect(restored.approvedVersionId).toBeNull();
    expect(restored.preservedPlanData).toEqual(record);
  });

  it('keeps source-mismatched plans but revokes approval', () => {
    const { record, source, transcript } = fixture();
    transcript.words[0].text = 'Changed';
    const restored = restoreLongformPlans({ source: record }, [source], { source: transcript });
    expect(restored.source?.plan).toEqual(record.plan);
    expect(restored.source?.approvedVersionId).toBeNull();
    expect(restored.source?.validationProblem).toContain('no longer matches');
    expect(restored.source?.preservedPlanData).toEqual(record);
    expect(record.approvedVersionId).toBe('version-1');
  });

  it('retains an unsupported future payload instead of silently converting and losing it', () => {
    const { record, source, transcript } = fixture();
    const future = {
      ...record,
      plan: { ...record.plan, schemaVersion: 99, futureFeature: { authorData: 'keep exactly' } },
    };
    const restored = restoreLongformPlans({ source: future }, [source], { source: transcript });
    expect(restored.source?.preservedPlanData).toEqual(future);
    expect(restored.source?.validationProblem).toContain('Unsupported');
    expect(restored.source?.status).toBe('draft');
    expect(restored.source?.approvedVersionId).toBeNull();
  });

  it('also retains unsupported historical payloads when the active version is valid', () => {
    const { record, source, transcript } = fixture();
    const input = {
      ...record,
      versions: [
        {
          id: 'future-history',
          plan: { schemaVersion: 99, notes: 'do not lose history' },
          origin: 'generated',
          createdAt: 1,
        },
        ...(record.versions ?? []),
      ],
    };
    const restored = restoreLongformPlans({ source: input }, [source], { source: transcript });
    expect(restored.source?.preservedPlanData).toEqual(input);
    expect(restored.source?.approvedVersionId).toBe('version-1');
    expect(restored.source?.versions?.[0]?.validationProblem).toContain('Unsupported');
  });

  it.each([
    'missing',
    'divergent',
    'duplicate',
    'invalid',
    'palette',
  ] as const)('revokes approval for a %s snapshot without losing saved data', (change) => {
    const { record, source, transcript } = fixture();
    if (change === 'missing') record.versions = [];
    if (change === 'divergent' && record.plan.mode === 'scene-first')
      record.plan.scenes[0].presentation = 'speaker-side';
    if (change === 'duplicate' && record.versions?.[0])
      record.versions.push(structuredClone(record.versions[0]));
    if (change === 'invalid' && record.versions?.[0])
      record.versions[0].validationProblem = 'Unsupported saved version';
    if (change === 'palette' && record.palette)
      record.palette = { ...record.palette, accent: '#ffffff' };
    const restored = restoreLongformPlans({ source: record }, [source], { source: transcript });
    expect(restored.source?.approvedVersionId).toBeNull();
    expect(restored.source?.validationProblem).toMatch(/approved|approval|snapshot/i);
    expect(restored.source?.preservedPlanData).toEqual(record);
  });

  it('preserves legacy plans without adding a new mode or requiring a transcript fingerprint', () => {
    const { record, source } = fixture();
    const legacy: LongformPlanRecord = {
      ...record,
      plan: { blocks: [], phrases: [], reasoning: 'Existing saved plan', generatedAt: 1 },
      versions: undefined,
    };
    const restored = restoreLongformPlans({ source: legacy }, [source], {});
    expect(restored.source).toEqual(legacy);
    expect(restored.source?.plan.mode).toBeUndefined();
  });
});
