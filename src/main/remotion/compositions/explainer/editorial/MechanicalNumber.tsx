import type React from 'react';
import { useSceneTime, useStage } from '../stage';
import { ease } from './motion';
import { digitTravel, type NumberValue, sampleMechanicalNumber } from './number-logic';
import type { NumberPresentation } from './types';

const ROLL_GLYPHS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'rollover'] as const;

function MechanicalDigit({
  position,
  presentation,
}: {
  position: number;
  presentation: NumberPresentation;
}): React.ReactElement {
  const S = useStage();
  const digit = Math.floor(position) % 10;
  const fraction = position - Math.floor(position);
  const glyph: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    lineHeight: '1.2em',
    textAlign: 'center',
  };
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'relative',
        display: 'inline-block',
        overflow: 'hidden',
        width: '0.67em',
        height: '1.2em',
        borderRadius: '0.065em',
        background: S.card,
        border: `1px solid ${S.cardBorder}`,
        boxShadow: `inset 0 0.04em 0.06em ${S.bgOuter}`,
      }}
    >
      {presentation === 'odometer' ? (
        <span
          style={{
            display: 'flex',
            flexDirection: 'column',
            transform: `translateY(${-position * 1.2}em)`,
          }}
        >
          {ROLL_GLYPHS.map((glyph) => (
            <span
              key={glyph}
              style={{ height: '1.2em', lineHeight: '1.2em', textAlign: 'center', flexShrink: 0 }}
            >
              {glyph === 'rollover' ? '0' : glyph}
            </span>
          ))}
        </span>
      ) : (
        <>
          <span style={glyph}>{fraction > 0 ? (digit + 1) % 10 : digit}</span>
          {fraction > 0 && (
            <>
              <span style={{ ...glyph, clipPath: 'inset(50% 0 0 0)' }}>{digit}</span>
              <span
                style={{
                  ...glyph,
                  transformOrigin: 'center 50%',
                  transform: `perspective(600px) rotateX(${-180 * fraction}deg)`,
                  backfaceVisibility: 'hidden',
                  clipPath: 'inset(0 0 50% 0)',
                  background: S.cardRaised,
                }}
              >
                {digit}
              </span>
              {fraction > 0.5 && (
                <span style={{ ...glyph, clipPath: 'inset(50% 0 0 0)' }}>{(digit + 1) % 10}</span>
              )}
            </>
          )}
          <span
            style={{
              position: 'absolute',
              top: '50%',
              left: 0,
              right: 0,
              height: 2,
              background: S.bgOuter,
            }}
          />
          <span
            style={{
              position: 'absolute',
              top: '47%',
              left: 0,
              width: '0.035em',
              height: '0.08em',
              background: S.accent2,
            }}
          />
          <span
            style={{
              position: 'absolute',
              top: '47%',
              right: 0,
              width: '0.035em',
              height: '0.08em',
              background: S.accent2,
            }}
          />
        </>
      )}
    </span>
  );
}

/** Fixed slots including sign, decimal, grouping and units. No growing/vanishing places. */
export function MechanicalNumber({
  scene,
}: {
  scene: NumberValue & { label: string; presentation: NumberPresentation };
}): React.ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const sample = sampleMechanicalNumber(scene, t);
  const affixLength =
    (scene.prefix?.length ?? 0) + (scene.suffix?.length ?? 0) + sample.sign.length;
  const em =
    sample.places * 0.74 + (sample.chars.length - sample.places) * 0.25 + affixLength * 0.35 + 0.5;
  const fontSize = Math.min(210, 910 / Math.max(1, em));
  const affixStyle: React.CSSProperties = {
    fontSize: '0.45em',
    color: S.accent,
    whiteSpace: 'pre',
    alignSelf: 'center',
  };
  return (
    <div
      data-editorial={`mechanical-${scene.presentation}`}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 46,
        opacity: ease((t - scene.countAt + 0.15) / 0.25),
        color: S.text,
        fontFamily: S.font,
      }}
    >
      <div
        role="img"
        aria-label={sample.text}
        style={{
          display: 'flex',
          gap: '0.025em',
          padding: '0.12em',
          borderRadius: '0.12em',
          background: S.cardRaised,
          border: `2px solid ${S.cardBorder}`,
          fontSize,
          fontWeight: 750,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {scene.prefix && <span style={affixStyle}>{scene.prefix}</span>}
        {sample.sign && <span style={affixStyle}>{sample.sign}</span>}
        {sample.chars.map((cell) =>
          cell.place === undefined ? (
            <span
              key={cell.id}
              style={{ lineHeight: '1.2em', width: '0.22em', textAlign: 'center' }}
            >
              {cell.char}
            </span>
          ) : (
            <MechanicalDigit
              key={cell.id}
              position={digitTravel(
                sample.target * sample.progress,
                sample.target,
                cell.place,
                sample.progress,
              )}
              presentation={scene.presentation}
            />
          ),
        )}
        {scene.suffix && <span style={affixStyle}>{scene.suffix}</span>}
      </div>
      <div
        style={{
          maxWidth: 910,
          fontSize: 52,
          fontWeight: 650,
          lineHeight: 1.2,
          textAlign: 'center',
          color: S.text,
        }}
      >
        {scene.label}
      </div>
    </div>
  );
}
