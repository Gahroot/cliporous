/** Small, frame-driven accents. These decorate scene labels, never burned-in captions. */
import type React from 'react';
import { useId } from 'react';
import { followThrough, motionProgress, staggerDelay } from './motion-tokens';
import { ramp, useExplainerContext, useSceneTime, useStage } from './stage';

/** Word masks preserve natural wrapping; the hidden text still reserves its final layout. */
export const MaskRise: React.FC<{ text: string; at: number }> = ({ text, at }) => {
  const { frame, fps } = useSceneTime();
  const words = Array.from(text.matchAll(/\S+/g));
  return (
    <>
      {words.map((match, index) => {
        const word = match[0];
        const p = motionProgress(frame, fps, at + staggerDelay(index, words.length), 'snappy');
        return (
          <span
            key={`${match.index}-${word}`}
            style={{
              display: 'inline-block',
              overflow: 'hidden',
              verticalAlign: 'bottom',
              padding: '0.12em 0',
              margin: '-0.12em 0',
              marginRight: index < words.length - 1 ? '0.22em' : 0,
            }}
          >
            <span
              style={{
                display: 'inline-block',
                transform: `translateY(${(1 - p) * 115}%)`,
                opacity: Math.min(1, p * 2),
              }}
            >
              {word}
            </span>
          </span>
        );
      })}
    </>
  );
};

/** Animate a mask, not the non-scaling stroke: Chromium otherwise breaks dash lengths under nonuniform scaling. */
const DrawnPath: React.FC<{ d: string; progress: number; color: string }> = ({
  d,
  progress,
  color,
}) => {
  const id = useId();
  return (
    <g>
      <defs>
        <mask id={id} maskUnits="userSpaceOnUse" x={-30} y={-50} width={180} height={200}>
          <path
            d={d}
            fill="none"
            stroke="white"
            strokeWidth={16}
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - progress}
          />
        </mask>
      </defs>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={4}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
        mask={`url(#${id})`}
      />
    </g>
  );
};

/** One annotation, anchored to the actual label bounds (no AI-provided coordinates). */
export const AnnotatedLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { extras } = useExplainerContext();
  const S = useStage();
  const { t } = useSceneTime();
  const annotation = extras.annotation;
  const p = annotation ? ramp(t, annotation.at, 0.48) : 0;
  const kind = annotation?.kind;
  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-block',
        maxWidth: '100%',
        // Leave room for italic overhangs without changing the surrounding word layout.
        paddingInline: '0.06em',
        marginInline: '-0.06em',
        isolation: 'isolate',
      }}
    >
      {kind === 'marker' && p > 0 && (
        <span
          style={{
            position: 'absolute',
            left: '-2%',
            right: '-2%',
            bottom: '0.06em',
            height: '0.36em',
            background: S.accent,
            opacity: 0.38,
            transform: `rotate(-1deg) scaleX(${p})`,
            transformOrigin: 'left',
            zIndex: -1,
            borderRadius: '0.06em',
          }}
        />
      )}
      {children}
      {kind && kind !== 'marker' && p > 0 && (
        <svg
          aria-hidden="true"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{
            position: 'absolute',
            left: '-5%',
            top: '-12%',
            width: '110%',
            height: '124%',
            overflow: 'visible',
            pointerEvents: 'none',
          }}
        >
          <DrawnPath
            d={
              kind === 'circle'
                ? 'M 91 21 C 66 -2 6 5 3 48 C -1 92 72 103 94 76 C 111 53 99 21 78 13'
                : kind === 'box'
                  ? 'M 6 3 H 91 Q 98 3 98 12 V 88 Q 98 97 91 97 H 9 Q 2 97 2 88 V 12 Q 2 3 9 3'
                  : kind === 'arrow'
                    ? 'M 10 -30 Q -10 -26 0 6'
                    : 'M 4 91 Q 46 85 96 94'
            }
            color={S.accent}
            progress={p}
          />
          {kind === 'arrow' && (
            <DrawnPath
              d="M -4 -4 L 0 8 L 5 -3"
              color={S.accent}
              progress={Math.max(0, (p - 0.7) / 0.3)}
            />
          )}
        </svg>
      )}
    </span>
  );
};

/** Restrained impact ring, with a trailing ring sampled from the same timeline. */
export const ImpactRing: React.FC<{ at: number; x: number; y: number; radius?: number }> = ({
  at,
  x,
  y,
  radius = 190,
}) => {
  const { frame, fps, t } = useSceneTime();
  const S = useStage();
  const sample = (f: number): number => Math.min(1, motionProgress(f, fps, at, 'gentle'));
  const p = sample(frame);
  const trail = followThrough(sample, frame, fps);
  const opacity = Math.max(0, 1 - (t - at) / 0.48);
  if (t <= at || opacity <= 0) return null;
  return (
    <svg
      aria-hidden="true"
      width={radius * 2 + 12}
      height={radius * 2 + 12}
      style={{
        position: 'absolute',
        left: x - radius - 6,
        top: y - radius - 6,
        pointerEvents: 'none',
        opacity,
      }}
    >
      <circle
        cx={radius + 6}
        cy={radius + 6}
        r={radius * p}
        stroke={S.accent}
        fill="none"
        strokeWidth={3}
      />
      <circle
        cx={radius + 6}
        cy={radius + 6}
        r={radius * trail * 0.88}
        stroke={S.accent2}
        fill="none"
        strokeWidth={2}
        opacity={0.45}
      />
    </svg>
  );
};
