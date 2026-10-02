/** Release the render gate exactly once, including failure, timeout and unmount. */
export function waitForBoardFonts(
  load: () => Promise<unknown>,
  release: () => void,
  fail: (error: Error) => void,
  timeoutMs = 10_000,
): () => void {
  let finished = false;
  let timer: ReturnType<typeof setTimeout>;
  const finish = (error?: unknown): void => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    try {
      if (error !== undefined)
        fail(new Error('Storyboard bundled fonts failed to load', { cause: error }));
    } finally {
      release();
    }
  };
  timer = setTimeout(() => finish(new Error('Font readiness timeout')), timeoutMs);
  Promise.resolve()
    .then(load)
    .then(
      () => finish(),
      (error: unknown) => finish(error),
    );
  return () => finish();
}

export const BOARD_FONT_QUERIES = [
  "600 40px 'Caveat'",
  "700 40px 'Caveat'",
  "650 40px 'Inter'",
  "700 40px 'Inter'",
  "400 40px 'Instrument Serif'",
  "italic 400 40px 'Instrument Serif'",
  "600 40px 'JetBrains Mono'",
] as const;

export async function loadBoardFonts(fonts: Pick<FontFaceSet, 'load'>): Promise<void> {
  await Promise.all(
    BOARD_FONT_QUERIES.map(async (query) => {
      const faces = await fonts.load(query);
      if (faces.length === 0 || faces.some((face) => face.status !== 'loaded')) {
        throw new Error(`Missing bundled font: ${query}`);
      }
    }),
  );
}
