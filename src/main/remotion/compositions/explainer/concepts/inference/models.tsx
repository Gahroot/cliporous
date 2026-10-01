import type React from 'react';
import { FoldedDocument } from '../../cognition/models';
import { ClayBlock } from '../../explanation-kit';
import { Clay } from '../../hero-kit';
import { shade, useStage } from '../../stage';
import type { ExpertRole } from './types';

/** Authored semantic solids. Fixed dimensions let ClayBlock memoize and dispose its geometry. */
export function Lens(): React.ReactElement {
  const S = useStage();
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <mesh>
        <cylinderGeometry args={[0.29, 0.32, 0.2, 24]} />
        <Clay color={S.text} />
      </mesh>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.19, 0.19, 0.04, 24]} />
        <Clay color={S.accent} />
      </mesh>
    </group>
  );
}

export function Device({
  kind,
  press = 0,
}: {
  kind: 'phone' | 'camera';
  press?: number;
}): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ClayBlock
        size={kind === 'phone' ? [1.45, 2.25, 0.3] : [1.85, 1.5, 0.55]}
        color={shade(S.text, -0.35)}
        radius={0.15}
      />
      {kind === 'phone' ? (
        <>
          <ClayBlock size={[1.22, 1.82, 0.07]} position={[0, 0, 0.18]} color={S.cardRaised} />
          <ClayBlock size={[0.4, 0.055, 0.04]} position={[0, 0.99, 0.19]} color={S.cardRaised} />
        </>
      ) : (
        <>
          <ClayBlock size={[0.65, 0.22, 0.45]} position={[-0.4, 0.85, 0]} color={S.cardRaised} />
          <group position={[-0.48, 0.2, 0.37]}>
            <Lens />
          </group>
          <ClayBlock size={[0.6, 0.9, 0.04]} position={[0.46, -0.1, 0.3]} color={S.cardRaised} />
        </>
      )}
      <group position={[kind === 'camera' ? 0.44 : 0, -0.1 - press, 0.4]} scale={0.55}>
        <ClayBlock size={[0.67, 0.67, 0.1]} color={S.accent} />
        {[-1, 1].flatMap((side) =>
          [-0.2, 0, 0.2].map((offset) => (
            <group key={`${side}:${offset}`}>
              <ClayBlock
                size={[0.16, 0.055, 0.04]}
                position={[side * 0.4, offset, 0]}
                color={S.text}
                radius={0.01}
              />
              <ClayBlock
                size={[0.055, 0.16, 0.04]}
                position={[offset, side * 0.4, 0]}
                color={S.text}
                radius={0.01}
              />
            </group>
          )),
        )}
      </group>
      <ClayBlock size={[1.7, 0.14, 0.95]} position={[0, -1.18, 0.15]} color={S.card} />
    </group>
  );
}

export function CloudService(): React.ReactElement {
  const S = useStage();
  return (
    <group>
      {([-0.5, 0, 0.5] as const).map((x) => (
        <mesh key={x} position={[x, x === 0 ? 0.45 : 0.2, 0]} scale={[0.62, 0.52, 0.42]}>
          <sphereGeometry args={[1, 24, 16]} />
          <Clay color={S.cardRaised} />
        </mesh>
      ))}
      <ClayBlock size={[1.65, 0.32, 0.64]} position={[0, 0.02, 0]} color={S.cardRaised} />
      <ClayBlock size={[1.3, 0.55, 0.7]} position={[0, -0.58, 0]} color={shade(S.text, -0.4)} />
      {[-0.72, -0.47].map((y) => (
        <ClayBlock
          key={y}
          size={[0.91, 0.05, 0.035]}
          position={[0, y, 0.37]}
          color={S.cardRaised}
        />
      ))}
    </group>
  );
}

export function ExpertTool({ role }: { role: ExpertRole }): React.ReactElement {
  const S = useStage();
  switch (role) {
    case 'math':
      return (
        <group>
          <ClayBlock size={[0.92, 1.24, 0.18]} color={S.accent} />
          <ClayBlock size={[0.67, 0.28, 0.04]} position={[0, 0.36, 0.12]} color={S.cardRaised} />
          {[-0.22, 0, 0.22].flatMap((x) =>
            [-0.12, -0.36].map((y) => (
              <ClayBlock
                key={`${x}:${y}`}
                size={[0.13, 0.13, 0.05]}
                position={[x, y, 0.13]}
                color={S.cardRaised}
                radius={0.025}
              />
            )),
          )}
        </group>
      );
    case 'language':
      return (
        <group>
          <ClayBlock size={[1.4, 0.94, 0.1]} color={S.accent} />
          {[-1, 1].map((side) => (
            <group key={side} position={[side * 0.34, 0.04, 0.12]} rotation={[0, side * -0.16, 0]}>
              <ClayBlock size={[0.64, 0.83, 0.1]} color={S.cardRaised} />
              {[-0.18, 0.04, 0.26].map((y) => (
                <ClayBlock
                  key={y}
                  size={[0.4, 0.025, 0.02]}
                  position={[0, y, 0.06]}
                  color={S.text}
                  radius={0.005}
                />
              ))}
            </group>
          ))}
        </group>
      );
    case 'vision':
      return (
        <group>
          <ClayBlock size={[1.3, 0.85, 0.45]} color={S.accent} />
          <ClayBlock size={[0.44, 0.18, 0.32]} position={[-0.3, 0.5, 0]} color={S.text} />
          <group position={[0.12, 0, 0.33]}>
            <Lens />
          </group>
        </group>
      );
    case 'code':
      return (
        <group>
          <ClayBlock size={[1.24, 0.83, 0.12]} color={S.accent} />
          <ClayBlock size={[1.02, 0.61, 0.035]} position={[0, 0, 0.08]} color={S.cardRaised} />
          <ClayBlock size={[1.37, 0.09, 0.64]} position={[0, -0.49, 0.23]} color={S.text} />
          {[-1, 1].flatMap((side) =>
            [-1, 1].map((vertical) => (
              <ClayBlock
                key={`${side}:${vertical}`}
                size={[0.24, 0.045, 0.03]}
                position={[side * 0.25, vertical * 0.065, 0.11]}
                rotation={[0, 0, side * vertical * -0.65]}
                color={S.text}
                radius={0.01}
              />
            )),
          )}
        </group>
      );
  }
}

export function TaskFolder(): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ClayBlock size={[1.65, 0.8, 0.13]} color={S.accent} />
      <ClayBlock size={[0.6, 0.2, 0.13]} position={[-0.43, 0.47, 0]} color={S.accent} />
      <ClayBlock
        size={[1.65, 0.48, 0.12]}
        position={[0, -0.18, 0.31]}
        rotation={[-0.24, 0, 0]}
        color={S.card}
      />
    </group>
  );
}

export function DataPaper({
  color,
  scale = 0.45,
}: {
  color: string;
  scale?: number;
}): React.ReactElement {
  return (
    <group scale={scale}>
      <FoldedDocument color={color} />
    </group>
  );
}
