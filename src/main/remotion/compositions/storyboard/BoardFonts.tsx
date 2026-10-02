import type React from 'react';
import { useEffect, useState } from 'react';
import { continueRender, delayRender, staticFile } from 'remotion';
import { loadBoardFonts, waitForBoardFonts } from './font-readiness';

const FONT_FACES = [
  ['Caveat', 'Caveat.ttf', 'normal', '400 700'],
  ['Inter', 'Inter.ttf', 'normal', '100 900'],
  ['Instrument Serif', 'InstrumentSerif-Regular.ttf', 'normal', '400'],
  ['Instrument Serif', 'InstrumentSerif-Italic.ttf', 'italic', '400'],
  ['JetBrains Mono', 'JetBrainsMono.ttf', 'normal', '100 800'],
] as const;

/** Fail closed rather than let host fonts silently change line breaks in an export. */
export const BoardFonts: React.FC = () => {
  const [handle] = useState(() => delayRender('Loading storyboard bundled fonts'));
  const [error, setError] = useState<Error | null>(null);
  useEffect(
    () =>
      waitForBoardFonts(
        () => loadBoardFonts(document.fonts),
        () => continueRender(handle),
        setError,
      ),
    [handle],
  );
  if (error) throw error;
  return (
    <style>
      {FONT_FACES.map(
        ([family, file, style, weight]) =>
          `@font-face{font-family:'${family}';src:url('${staticFile(`fonts/${file}`)}') format('truetype');font-weight:${weight};font-style:${style};font-display:block;}`,
      ).join('\n')}
    </style>
  );
};
