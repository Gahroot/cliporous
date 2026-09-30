import type React from 'react';
import { useSceneTime, useStage } from '../stage';
import { ease, semanticLetterPose } from './motion';
import type { SemanticTextTreatment } from './types';

/** Word-level meaning only; the original text and final metrics are never rewritten. */
export function SemanticText({
  text,
  treatment,
}: {
  text: string;
  treatment: SemanticTextTreatment;
}): React.ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const occurrences = new Map<string, number>();
  const letters = Array.from(text, (letter) => {
    const occurrence = occurrences.get(letter) ?? 0;
    occurrences.set(letter, occurrence + 1);
    return { letter, id: `${letter}:${occurrence}` };
  });
  const guide = ease((t - treatment.at) / 0.15) * (1 - ease((t - treatment.at - 0.8) / 0.3));
  return (
    <span
      data-editorial={`semantic-${treatment.kind}`}
      role="img"
      aria-label={text}
      style={{ position: 'relative', display: 'inline-block', whiteSpace: 'pre' }}
    >
      {letters.map(({ letter, id }, i) => {
        const p = semanticLetterPose(t, treatment, i, letters.length);
        return (
          <span
            key={id}
            aria-hidden="true"
            style={{
              display: 'inline-block',
              transform: `translate(${p.x}em, ${p.y}em) scaleX(${p.scaleX})`,
            }}
          >
            {letter}
          </span>
        );
      })}
      {treatment.kind === 'align' && guide > 0 && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: '-0.06em',
            height: '0.013em',
            background: S.accent,
            opacity: guide * 0.65,
          }}
        />
      )}
    </span>
  );
}
