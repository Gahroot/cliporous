import { beforeEach, describe, expect, it, vi } from 'vitest';

const runMock = vi.hoisted(() => vi.fn());
vi.mock('./python', () => ({ runPythonScript: runMock }));

const { detectFaceCrops } = await import('./face-detection');

/** Make the fake sidecar print one `done` line with these crops. */
function sidecarReturns(crops: unknown[]): void {
  runMock.mockImplementation(
    async (_script: string, _args: string[], opts: { onStdout: (line: string) => void }) => {
      opts.onStdout(JSON.stringify({ type: 'done', crops }));
    },
  );
}

const base = { x: 180, y: 0, width: 202, height: 360, face_detected: true, faces_reliable: true };

describe('detectFaceCrops face rows', () => {
  beforeEach(() => {
    runMock.mockReset();
  });

  it('reports the face rows from the sidecar', async () => {
    sidecarReturns([{ ...base, face_top: 57, face_bottom: 162 }]);
    const [result] = await detectFaceCrops('v.mp4', [{ start: 16, end: 22 }], () => undefined);
    expect(result?.faceBand).toEqual({ top: 57, bottom: 162 });
    expect(result?.facesReliable).toBe(true);
  });

  it('marks Haar-only output as unreliable', async () => {
    sidecarReturns([{ ...base, faces_reliable: false }]);
    const [result] = await detectFaceCrops('v.mp4', [{ start: 0, end: 5 }], () => undefined);
    expect(result?.facesReliable).toBe(false);
  });

  it('covers the face in every scene of the window', async () => {
    sidecarReturns([
      {
        ...base,
        face_top: 60,
        face_bottom: 160,
        timeline: [
          { ...base, start_abs: 16, end_abs: 19, face_top: 60, face_bottom: 160 },
          { ...base, start_abs: 19, end_abs: 22, face_top: 120, face_bottom: 240 },
        ],
      },
    ]);
    const [result] = await detectFaceCrops('v.mp4', [{ start: 16, end: 22 }], () => undefined);
    expect(result?.faceBand).toEqual({ top: 60, bottom: 240 });
  });

  it.each([
    ['no face found', { ...base, face_detected: false }],
    ['malformed rows', { ...base, face_top: 'x', face_bottom: 162 }],
    ['inverted rows', { ...base, face_top: 200, face_bottom: 100 }],
  ])('omits the rows for %s', async (_label, crop) => {
    sidecarReturns([crop]);
    const [result] = await detectFaceCrops('v.mp4', [{ start: 0, end: 5 }], () => undefined);
    expect(result).toBeDefined();
    expect(result?.faceBand).toBeUndefined();
  });
});
