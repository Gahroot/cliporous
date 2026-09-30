import type React from 'react';
import { withAlpha } from '../palette';
import { useSceneTime, useStage } from '../stage';
import { sampleLabel } from './motion';
import type { LabelTreatment } from './types';

/** Cover only the original label. There is deliberately no hidden/replacement text prop. */
export function TreatedLabel({
  text,
  treatment,
}: {
  text: string;
  treatment: LabelTreatment;
}): React.ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const p = sampleLabel(t, treatment);
  if (treatment.kind === 'redaction') {
    const occurrences = new Map<string, number>();
    const parts = text.split(/(\s+)/).map((part) => {
      const occurrence = occurrences.get(part) ?? 0;
      occurrences.set(part, occurrence + 1);
      return { part, id: `${part}:${occurrence}` };
    });
    return (
      <span data-editorial="redaction" role="img" aria-label={text}>
        {parts.map(({ part, id }, i) => {
          const q = sampleLabel(t, treatment, Math.floor(i / 2));
          return (
            <span
              key={id}
              style={{ position: 'relative', display: 'inline-block', whiteSpace: 'pre' }}
            >
              {part}
              {part.trim() && q.reveal < 1 && (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: '-0.02em',
                    right: '-0.02em',
                    top: '0.12em',
                    bottom: '0.02em',
                    background: S.accent,
                    borderRadius: '0.035em',
                    transform: `scaleX(${1 - q.reveal})`,
                    transformOrigin: 'right center',
                  }}
                />
              )}
            </span>
          );
        })}
      </span>
    );
  }
  return (
    <span
      data-editorial="peel-back"
      style={{ position: 'relative', display: 'inline-block', whiteSpace: 'pre' }}
    >
      {text}
      {p.reveal < 1 && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: '-0.05em -0.09em',
            background: S.paper,
            border: `1px solid ${S.cardBorder}`,
            borderRadius: '0.08em',
            clipPath: `inset(0 ${p.reveal * 100}% 0 0)`,
            boxShadow: `0 ${p.lift * 0.045}em ${p.lift * 0.09}em ${withAlpha(S.bgOuter, 0.4)}`,
          }}
        >
          <span
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              width: '0.3em',
              height: '0.3em',
              background: `linear-gradient(45deg, ${S.accentSoft}, ${S.paper})`,
              clipPath: 'polygon(0 0, 100% 100%, 0 100%)',
              transformOrigin: 'right top',
              transform: `translate(${-p.lift * 0.025}em, ${p.lift * 0.025}em) rotate(${-p.lift * 20}deg)`,
              opacity: 0.3 + p.lift * 0.7,
              boxShadow: `-2px 2px 2px ${S.cardBorder}`,
            }}
          />
        </span>
      )}
    </span>
  );
}
