import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOARD_FONT_QUERIES, loadBoardFonts, waitForBoardFonts } from './font-readiness';

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
afterEach(() => vi.useRealTimers());

describe('font render gate', () => {
  it('checks every bundled face and releases once on success, including later disposal', async () => {
    vi.useFakeTimers();
    const release = vi.fn();
    const fail = vi.fn();
    const load = vi.fn(async (_query: string) => [{ status: 'loaded' } as FontFace]);
    const dispose = waitForBoardFonts(() => loadBoardFonts({ load }), release, fail);
    await flush();
    expect(load.mock.calls.map(([query]) => query)).toEqual(BOARD_FONT_QUERIES);
    expect(release).toHaveBeenCalledTimes(1);
    expect(fail).not.toHaveBeenCalled();
    dispose();
    await vi.runAllTimersAsync();
    expect(release).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('reports rejected loads rather than swallowing them, releases the gate and clears its timer', async () => {
    vi.useFakeTimers();
    const release = vi.fn();
    const fail = vi.fn();
    waitForBoardFonts(() => Promise.reject(new Error('missing font')), release, fail);
    await flush();
    expect(fail).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        message: 'Storyboard bundled fonts failed to load',
        cause: expect.objectContaining({ message: 'missing font' }),
      }),
    );
    expect(release).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('fails closed for absent CSS faces and synchronous exceptions', async () => {
    await expect(loadBoardFonts({ load: async () => [] })).rejects.toThrow(/Missing bundled font/);
    await expect(
      loadBoardFonts({ load: async () => [{ status: 'error' } as FontFace] }),
    ).rejects.toThrow(/Missing bundled font/);
    const release = vi.fn();
    const fail = vi.fn();
    waitForBoardFonts(
      () => {
        throw new Error('no font API');
      },
      release,
      fail,
    );
    await flush();
    expect(release).toHaveBeenCalledTimes(1);
    expect(fail).toHaveBeenCalledTimes(1);
  });
  it('releases on disposal even if loading never resolves, and ignores late rejection after disposal', async () => {
    vi.useFakeTimers();
    let rejectLoad: (error: Error) => void = () => undefined;
    const pending = new Promise<void>((_resolve, reject) => {
      rejectLoad = reject;
    });
    const release = vi.fn();
    const fail = vi.fn();
    const dispose = waitForBoardFonts(() => pending, release, fail);
    await flush();
    dispose();
    dispose();
    rejectLoad(new Error('after unmount'));
    await flush();
    expect(release).toHaveBeenCalledTimes(1);
    expect(fail).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('times out deterministically and releases a hung loader', async () => {
    vi.useFakeTimers();
    const release = vi.fn();
    const fail = vi.fn();
    waitForBoardFonts(() => new Promise(() => undefined), release, fail, 100);
    await vi.advanceTimersByTimeAsync(100);
    expect(release).toHaveBeenCalledTimes(1);
    expect(fail).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
