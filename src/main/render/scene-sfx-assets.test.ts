import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mixSceneSfx } from './scene-sfx';

const mocks = vi.hoisted(() => ({ exists: vi.fn(), mixBed: vi.fn(), ffmpeg: vi.fn() }));
vi.mock('node:fs', async (original) => ({
  ...(await original<typeof import('node:fs')>()),
  existsSync: mocks.exists,
}));
vi.mock('./scene-sfx-bed', () => ({ mixSceneSfxBed: mocks.mixBed }));
vi.mock('../ffmpeg', () => ({ ffmpeg: mocks.ffmpeg }));
vi.mock('../logger', () => ({ log: vi.fn() }));
vi.mock('electron', () => ({ app: { isPackaged: false } }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.exists.mockReturnValue(true);
  mocks.mixBed.mockResolvedValue(null);
});

const cues = [
  { kind: 'tick' as const, at: 0.5 },
  { kind: 'pop' as const, at: 1 },
];
const options = { clipDuration: 6, outputPath: '/owned/mixed.mp4', bounded: true };

describe('scene SFX asset availability', () => {
  it.each([
    { missing: ['tick-1.mp3', 'pop-1.mp3'], error: 'pop-1.mp3, tick-1.mp3' },
    { missing: ['tick-1.mp3'], error: 'tick-1.mp3' },
  ])('rejects a bounded mix with missing planned assets: $error', async ({ missing, error }) => {
    mocks.exists.mockImplementation((path: string) => !missing.some((name) => path.endsWith(name)));

    expect(await mixSceneSfx('/source.mp4', cues, options)).toEqual({
      ok: false,
      error: `Missing scene SFX assets: ${error}`,
    });
    expect(mocks.mixBed).not.toHaveBeenCalled();
    expect(mocks.ffmpeg).not.toHaveBeenCalled();
  });

  it('preserves the legacy no-assets fallback', async () => {
    mocks.exists.mockReturnValue(false);

    expect(await mixSceneSfx('/source.mp4', cues, { ...options, bounded: false })).toEqual({
      ok: true,
      outputPath: '/source.mp4',
      placed: 0,
    });
    expect(mocks.mixBed).not.toHaveBeenCalled();
    expect(mocks.ffmpeg).not.toHaveBeenCalled();
  });

  it('does not require assets when no cues survive the existing guardrails', async () => {
    mocks.exists.mockReturnValue(false);

    expect(await mixSceneSfx('/source.mp4', [{ kind: 'tick', at: -1 }], options)).toEqual({
      ok: true,
      outputPath: '/source.mp4',
      placed: 0,
    });
    expect(mocks.mixBed).not.toHaveBeenCalled();
    expect(mocks.ffmpeg).not.toHaveBeenCalled();
  });

  it('does not require unused assets', async () => {
    mocks.exists.mockImplementation((path: string) => !path.endsWith('thump-1.mp3'));

    expect(await mixSceneSfx('/source.mp4', cues, options)).toEqual({
      ok: true,
      outputPath: options.outputPath,
      placed: 2,
    });
    expect(mocks.mixBed).toHaveBeenCalledOnce();
  });
});
