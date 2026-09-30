import type React from 'react';
import { RailSwitchRig } from './hero-props/transport';
import { sampleRailStop } from './hero-props/transport-poses';
import { MechanismStage, useCompactMechanism } from './mechanisms/MechanismStage';
import { RailCarrier, RailStop } from './mechanisms/rail-hardware';
import {
  SWITCHYARD_LABEL_SIZE,
  switchyardLabel,
  switchyardLabelFontSize,
  switchyardTransform,
} from './mechanisms/switchyard-layout';
import { sampleSwitchyard } from './mechanisms/switchyard-poses';
import { mixHex } from './palette';
import { useSceneTime, useStage } from './stage';
import type { SwitchyardScene as SwitchyardData } from './types';

const BRANCHES = ['left', 'right'] as const;

export const SwitchyardScene: React.FC<{ scene: SwitchyardData }> = ({ scene }) => {
  const S = useStage();
  const compact = useCompactMechanism();
  const transform = switchyardTransform(compact);
  const pose = sampleSwitchyard(useSceneTime().t, scene);
  return (
    <MechanismStage
      title={scene.label}
      overlay={(camera) => (
        <>
          {BRANCHES.map((branch) => {
            const label = switchyardLabel(camera, branch, compact);
            if (!label) return null;
            const active = branch === scene.route ? pose.arrival : 0;
            const text = branch === 'left' ? scene.leftLabel : scene.rightLabel;
            return (
              <div
                key={branch}
                style={{
                  position: 'absolute',
                  left: label.x,
                  top: label.y,
                  ...SWITCHYARD_LABEL_SIZE,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  padding: '8px 12px',
                  boxSizing: 'border-box',
                  borderRadius: 18,
                  color: mixHex(S.text, S.accent2, active),
                  background: S.card,
                  fontFamily: S.font,
                  fontSize: switchyardLabelFontSize(text, compact),
                  fontWeight: 700,
                  lineHeight: 1.12,
                  wordBreak: 'break-all',
                }}
              >
                {text}
              </div>
            );
          })}
        </>
      )}
    >
      <group
        position={[...transform.position]}
        rotation={transform.rotation ? [...transform.rotation] : undefined}
        scale={transform.scale}
      >
        <RailSwitchRig route={scene.route} seat={pose.seat} />
        {pose.tokens.map((token) => (
          <group
            key={token.id}
            name={`rail-car-${token.id}`}
            position={[...token.position]}
            rotation={[0, 0, token.heading]}
          >
            <RailCarrier
              color={token.id === 0 ? S.accent2 : token.id === 1 ? S.accent : S.clay[2]}
              wheelAngles={token.wheelAngles}
            />
          </group>
        ))}
        {BRANCHES.map((branch) => {
          const stop = sampleRailStop(branch);
          const received = branch === scene.route ? pose.arrival : 0;
          return (
            <group key={branch} position={[...stop.position]} rotation={[0, 0, stop.heading]}>
              <RailStop color={mixHex(S.clay[1], S.accent2, received)} />
            </group>
          );
        })}
      </group>
    </MechanismStage>
  );
};
