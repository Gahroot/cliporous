/**
 * Stamp scene — a glowing hero icon; on the key word a tilted rubber stamp
 * slams in (with a short stage shake), and optionally the icon gets crossed
 * out.
 */

import type React from 'react';
import { resolveIcon } from '../blocks/icon';
import { ImpactRing } from './graphic-accents';
import { Burst, floatTransform, useBreath, useFloat } from './motion';
import { motionProgress, settleOffset } from './motion-tokens';
import { ramp, usePop, useSceneTime, useStage } from './stage';
import type { StampScene as StampSceneData } from './types';

export const StampScene: React.FC<{ scene: StampSceneData }> = ({ scene }) => {
  const STAGE = useStage();
  const accent = STAGE.accent;
  const { t, frame, fps } = useSceneTime();
  const float = useFloat('stamp-icon', 7);
  const breath = useBreath('stamp');
  const iconIn = usePop(0.05, 150, 16);
  const Icon = resolveIcon(scene.icon);

  const slam = motionProgress(frame, fps, scene.stampAt, 'stamp');
  const stampScale = 2.2 - 1.2 * slam;
  const recoil = settleOffset(t - scene.stampAt - 0.12) * 3;

  const strike = scene.strikeAt === undefined ? 0 : ramp(t, scene.strikeAt, 0.35);
  const lineLength = 300;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 330,
          width: 260,
          height: 260,
          marginLeft: -130,
          marginTop: -130,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `${floatTransform(float)} scale(${iconIn})`,
          filter: `drop-shadow(0 0 ${22 + breath * 16}px rgba(255,255,255,${(0.25 + breath * 0.15) * (1 - strike * 0.6)}))`,
        }}
      >
        <Icon size={220} strokeWidth={1.6} color={STAGE.text} />
        {strike > 0 && (
          <svg
            width={260}
            height={260}
            viewBox="0 0 260 260"
            style={{ position: 'absolute', inset: 0 }}
            aria-hidden="true"
          >
            <line
              x1={20}
              y1={240}
              x2={240}
              y2={20}
              stroke={accent}
              strokeWidth={16}
              strokeLinecap="round"
              strokeDasharray={lineLength}
              strokeDashoffset={lineLength * (1 - strike)}
            />
          </svg>
        )}
      </div>

      {slam > 0 && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: 640,
            transform: `translate(-50%, -50%) rotate(${-7 + recoil}deg) scale(${stampScale})`,
            opacity: Math.min(1, slam),
            border: `9px solid ${accent}`,
            borderRadius: 22,
            padding: '6px 40px 2px',
            fontFamily: STAGE.font,
            fontWeight: 900,
            fontSize: 132,
            letterSpacing: 6,
            color: accent,
            whiteSpace: 'nowrap',
            textTransform: 'uppercase',
            lineHeight: 1.05,
          }}
        >
          {scene.word}
        </div>
      )}
      <ImpactRing at={scene.stampAt + 0.12} x={540} y={640} radius={230} />
      <Burst
        atSec={scene.stampAt + 0.12}
        x={540}
        y={640}
        color={accent}
        seed="stamp"
        radius={260}
      />
    </div>
  );
};
