import type { Palette } from '@shared/palettes';
import { beforeEach, describe, expect, it, type vi } from 'vitest';
import { installApiStub, resetStore } from '@/components/__tests__/test-utils';
import {
  createCreatorProfile,
  deleteCreatorProfile,
  getCreatorProfiles,
  updateCreatorProfile,
} from '@/services/creator-profiles';
import { useStore } from '@/store';
import type { ClipCandidate } from '@/store/types';
import {
  buildPromoRenderOptions,
  resolveShortformPalette,
  startApprovedRender,
} from './render-service';

const CUSTOM_PALETTE: Palette = {
  id: 'studio-sunrise',
  name: 'Studio Sunrise',
  background: '#111111',
  foreground: '#FFFFFF',
  accent: '#FFAA00',
  builtin: false,
};

function makeClip(id: string, status: ClipCandidate['status']): ClipCandidate {
  return {
    id,
    sourceId: 'source-1',
    startTime: 10,
    endTime: 20,
    duration: 10,
    text: `${status} clip`,
    score: 80,
    hookText: `${status} hook`,
    reasoning: 'Test fixture',
    status,
  };
}

beforeEach(() => {
  resetStore();
  installApiStub();
  for (const profile of getCreatorProfiles()) deleteCreatorProfile(profile.id);
  useStore.setState((state) => {
    state.sources = [
      {
        id: 'source-1',
        path: '/virtual/source.mp4',
        name: 'source.mp4',
        duration: 120,
        width: 1920,
        height: 1080,
        origin: 'file',
        mediaStatus: 'online',
      },
    ];
    state.activeSourceId = 'source-1';
    state.clips = {
      'source-1': [
        makeClip('approved', 'approved'),
        makeClip('pending', 'pending'),
        makeClip('rejected', 'rejected'),
      ],
    };
    state.settings.outputDirectory = '/virtual/output';
    state.settings.customPalettes = [];
    state.settings.longformPaletteId = 'brand';
  });
});

describe('startApprovedRender', () => {
  it('renders explicit rejected and pending ids without changing review decisions', async () => {
    const api = window.api as unknown as { startBatchRender: ReturnType<typeof vi.fn> };

    const result = await startApprovedRender({ clipIds: ['pending', 'rejected'] });

    expect(result).toEqual({ started: true });
    const payload = api.startBatchRender.mock.calls[0]?.[0] as {
      jobs: Array<{ clipId: string }>;
    };
    expect(payload.jobs.map((job) => job.clipId)).toEqual(['pending', 'rejected']);
    expect(useStore.getState().clips['source-1']?.map((clip) => [clip.id, clip.status])).toEqual([
      ['approved', 'approved'],
      ['pending', 'pending'],
      ['rejected', 'rejected'],
    ]);
  });

  it('still renders only approved clips when no explicit ids are provided', async () => {
    const api = window.api as unknown as { startBatchRender: ReturnType<typeof vi.fn> };

    await startApprovedRender();

    const payload = api.startBatchRender.mock.calls[0]?.[0] as {
      jobs: Array<{ clipId: string }>;
    };
    expect(payload.jobs.map((job) => job.clipId)).toEqual(['approved']);
  });

  it('clears stale cancellation state when a new render starts', async () => {
    useStore.setState((state) => {
      state.renderCancellation = { status: 'cancelling', error: null };
    });

    await startApprovedRender();

    expect(useStore.getState().renderCancellation).toEqual({ status: 'idle', error: null });
  });

  it('blocks rendering while the active source is offline', async () => {
    const api = window.api as unknown as { startBatchRender: ReturnType<typeof vi.fn> };
    useStore.setState((state) => {
      const source = state.sources.find((candidate) => candidate.id === 'source-1');
      if (source) source.mediaStatus = 'offline';
    });

    const result = await startApprovedRender();

    expect(result).toEqual({ started: false, reason: 'source-offline' });
    expect(api.startBatchRender).not.toHaveBeenCalled();
    expect(useStore.getState().isRendering).toBe(false);
  });

  it('merges the selected Creator Profile assets into Promo render options', () => {
    const profile = createCreatorProfile('Launch Pack');
    updateCreatorProfile(
      profile.id,
      {
        evidenceAssetPaths: ['/virtual/product.png'],
        callToAction: { text: 'Join now', url: '', assetPaths: ['/virtual/cta.png'] },
      },
      ['evidenceAssets', 'cta'],
    );
    useStore.getState().setCreatorProfile(profile.id);
    useStore.getState().setPromoEnabled(true);
    useStore.getState().setPromoPlan({
      beats: [
        {
          id: 'proof',
          script: 'Creators doubled their output.',
          evidenceCategory: 'growth-stat',
          evidenceAssetPath: '/virtual/product.png',
        },
      ],
      ctaSource: 'profile',
      ctaAssetPath: '/virtual/cta.png',
    });

    expect(buildPromoRenderOptions(useStore.getState())).toMatchObject({
      enabled: true,
      forceCta: true,
      ctaAssetId: 'profile-cta',
      brandAssets: [
        {
          category: 'growth-stat',
          mediaPath: '/virtual/product.png',
        },
        {
          id: 'profile-cta',
          category: 'cta',
          mediaPath: '/virtual/cta.png',
        },
      ],
    });
  });

  it('sends the selected palette and custom palettes with a short-form batch', async () => {
    useStore.getState().addCustomPalette(CUSTOM_PALETTE);
    useStore.getState().setLongformPaletteId(CUSTOM_PALETTE.id);
    const api = window.api as unknown as { startBatchRender: ReturnType<typeof vi.fn> };

    await startApprovedRender();

    const payload = api.startBatchRender.mock.calls[0]?.[0] as {
      longformPaletteId?: string;
      customPalettes?: Palette[];
      outputProfile?: string;
    };
    expect(payload.outputProfile).toBeUndefined();
    expect(payload.longformPaletteId).toBe(CUSTOM_PALETTE.id);
    expect(payload.customPalettes).toEqual([CUSTOM_PALETTE]);
    expect(() => structuredClone(payload.customPalettes)).not.toThrow();
  });

  it('falls back to the default palette when the selected palette no longer exists', async () => {
    useStore.getState().setLongformPaletteId('deleted-palette');
    const api = window.api as unknown as { startBatchRender: ReturnType<typeof vi.fn> };

    const result = await startApprovedRender();

    expect(result).toEqual({ started: true });
    const payload = api.startBatchRender.mock.calls[0]?.[0] as { longformPaletteId?: string };
    expect(payload.longformPaletteId).toBe('brand');
    expect(resolveShortformPalette({ longformPaletteId: undefined })).toEqual({
      longformPaletteId: 'brand',
      customPalettes: [],
    });
  });

  it('keeps regular and stitched jobs in one explicit queue order', async () => {
    useStore.setState((state) => {
      state.stitchedClips['source-1'] = [
        {
          id: 'stitched',
          sourceId: 'source-1',
          sourceRanges: [
            { startTime: 0, endTime: 5, role: 'hook' },
            { startTime: 20, endTime: 25, role: 'main-payoff' },
          ],
          duration: 10,
          text: 'Connected story',
          score: 88,
          hookText: 'Stitched hook',
          reasoning: 'Two related moments',
          status: 'approved',
        },
      ];
    });
    const api = window.api as unknown as { startBatchRender: ReturnType<typeof vi.fn> };

    await startApprovedRender({ clipIds: ['stitched', 'approved'] });

    const payload = api.startBatchRender.mock.calls[0]?.[0] as {
      jobs: Array<{ clipId: string; stitchedSegments?: unknown[] }>;
    };
    expect(payload.jobs.map((job) => job.clipId)).toEqual(['stitched', 'approved']);
    expect(payload.jobs[0]?.stitchedSegments).toHaveLength(2);
    expect(useStore.getState().renderProgress.map((item) => item.kind)).toEqual([
      'stitched',
      'clip',
    ]);
  });
});
