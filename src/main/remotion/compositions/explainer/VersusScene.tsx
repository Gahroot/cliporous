/**
 * Versus scene — two panels side by side; each lights up in the accent colour
 * on the word that introduces it.
 */

import type React from 'react';
import { resolveIcon } from '../blocks/icon';
import { ramp, STAGE, usePop, useSceneTime } from './stage';
import type { VersusScene as VersusSceneData, VersusSide } from './types';

const PANEL = 360;

const Panel: React.FC<{ side: VersusSide; accent: string; delay: number }> = ({
  side,
  accent,
  delay,
}) => {
  const { t } = useSceneTime();
  const enter = ramp(t, delay, 0.5);
  const lit = usePop(side.at, 200, 13);
  const Icon = resolveIcon(side.icon);
  const scale = 0.94 + enter * 0.06 + Math.sin(Math.min(lit, 1) * Math.PI) * 0.05;

  return (
    <div
      style={{
        width: PANEL,
        height: PANEL,
        borderRadius: 30,
        background: STAGE.card,
        border: `3px solid ${lit > 0.5 ? accent : 'rgba(255,255,255,0.08)'}`,
        boxShadow:
          lit > 0.5
            ? `0 0 60px ${accent}33, 0 30px 70px rgba(0,0,0,0.45)`
            : '0 30px 70px rgba(0,0,0,0.45)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 36,
        opacity: enter * (0.55 + 0.45 * Math.min(lit, 1)),
        transform: `scale(${scale})`,
      }}
    >
      <Icon size={128} strokeWidth={1.5} color={lit > 0.5 ? accent : STAGE.text} />
      <div
        style={{
          fontFamily: STAGE.font,
          fontWeight: 700,
          fontSize: 38,
          color: STAGE.text,
          textAlign: 'center',
          padding: '0 24px',
          lineHeight: 1.15,
        }}
      >
        {side.label}
      </div>
    </div>
  );
};

export const VersusScene: React.FC<{ scene: VersusSceneData; accent: string }> = ({
  scene,
  accent,
}) => {
  const { t } = useSceneTime();
  const vs = ramp(t, 0.25, 0.4);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 30,
      }}
    >
      <Panel side={scene.left} accent={accent} delay={0} />
      <div
        style={{
          fontFamily: STAGE.font,
          fontWeight: 800,
          fontSize: 34,
          letterSpacing: 2,
          color: STAGE.muted,
          opacity: vs,
        }}
      >
        VS
      </div>
      <Panel side={scene.right} accent={accent} delay={0.12} />
    </div>
  );
};
