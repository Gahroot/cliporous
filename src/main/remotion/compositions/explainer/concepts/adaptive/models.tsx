import type React from 'react';
import { ClayBlock } from '../../explanation-kit';
import { Clay } from '../../hero-kit';
import { Occupant } from '../../spatial/parts';
import { shade, useStage } from '../../stage';
import type { AdaptivePoint } from './poses';
import type { AdaptiveModuleRole, AdaptiveObjectForm } from './types';

/** Thin physical diagram connector; never a particle emitter or generated graph. */
export function LocalLink({
  from,
  to,
  color,
}: {
  from: AdaptivePoint;
  to: AdaptivePoint;
  color: string;
}): React.ReactElement {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dz);
  return (
    <ClayBlock
      size={[Math.max(0.001, length), 0.035, 0.055]}
      position={[(from[0] + to[0]) / 2, from[1], (from[2] + to[2]) / 2]}
      rotation={[0, -Math.atan2(dz, dx), 0]}
      color={color}
      radius={0.015}
    />
  );
}

export function Person({
  variant,
  adopted,
  showFlag,
}: {
  variant: boolean;
  adopted: number;
  showFlag: boolean;
}): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <group scale={1.55}>
        <Occupant variant={variant} />
      </group>
      {showFlag && (
        <group position={[0.32, 0.68, 0.04]} rotation={[0, 0, (-Math.PI / 2) * (1 - adopted)]}>
          <ClayBlock
            size={[0.035, 0.46, 0.035]}
            position={[0, 0.17, 0]}
            color={S.text}
            radius={0.01}
          />
          <ClayBlock
            size={[0.28, 0.2, 0.035]}
            position={[0.14, 0.31, 0]}
            color={S.accent}
            radius={0.035}
          />
        </group>
      )}
    </group>
  );
}

/** Camera eyes, wheeled chassis, neck and bumper make this a robot, not a token. */
export function Robot({
  headYaw = 0,
  wheelTurn = 0,
  color,
}: {
  headYaw?: number;
  wheelTurn?: number;
  color?: string;
}): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ClayBlock
        size={[0.75, 0.32, 0.62]}
        position={[0, 0.3, 0]}
        color={color ?? S.clay[0]}
        radius={0.12}
      />
      <ClayBlock
        size={[0.68, 0.1, 0.16]}
        position={[0, 0.27, 0.33]}
        color={S.cardRaised}
        radius={0.035}
      />
      {[-1, 1].flatMap((side) =>
        [-1, 1].map((axle) => (
          <group
            key={`${side}:${axle}`}
            position={[side * 0.4, 0.18, axle * 0.22]}
            rotation={[wheelTurn, 0, 0]}
          >
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.18, 0.18, 0.11, 20]} />
              <Clay color={shade(S.text, -0.3)} />
            </mesh>
            <ClayBlock size={[0.13, 0.2, 0.045]} color={S.cardRaised} radius={0.02} />
          </group>
        )),
      )}
      <ClayBlock size={[0.13, 0.22, 0.13]} position={[0, 0.56, 0]} color={S.text} />
      <group position={[0, 0.84, 0]} rotation={[0, headYaw, 0]}>
        <ClayBlock size={[0.64, 0.37, 0.32]} color={color ?? S.clay[0]} radius={0.12} />
        <ClayBlock
          size={[0.52, 0.22, 0.045]}
          position={[0, 0, 0.17]}
          color={S.text}
          radius={0.07}
        />
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.15, 0.01, 0.205]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.065, 0.065, 0.045, 20]} />
            <Clay color={S.cardRaised} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export function PerceptionObject({ form }: { form: AdaptiveObjectForm }): React.ReactElement {
  const S = useStage();
  switch (form) {
    case 'parcel':
      return (
        <group>
          <ClayBlock size={[0.65, 0.58, 0.55]} position={[0, 0.29, 0]} color={S.clay[1]} />
          <ClayBlock
            size={[0.12, 0.59, 0.56]}
            position={[0, 0.29, 0]}
            color={S.cardRaised}
            radius={0.01}
          />
          <ClayBlock
            size={[0.23, 0.12, 0.025]}
            position={[0.13, 0.4, 0.286]}
            color={S.paper}
            radius={0.01}
          />
        </group>
      );
    case 'cone':
      return (
        <group>
          <ClayBlock size={[0.63, 0.09, 0.63]} position={[0, 0.045, 0]} color={S.text} />
          <mesh position={[0, 0.41, 0]}>
            <coneGeometry args={[0.25, 0.66, 24]} />
            <Clay color={S.accent2} />
          </mesh>
          <mesh position={[0, 0.4, 0]}>
            <cylinderGeometry args={[0.125, 0.16, 0.1, 24]} />
            <Clay color={S.cardRaised} />
          </mesh>
        </group>
      );
    case 'cylinder':
      return (
        <group>
          <mesh position={[0, 0.34, 0]}>
            <cylinderGeometry args={[0.26, 0.26, 0.68, 24]} />
            <Clay color={S.clay[2]} />
          </mesh>
          {[0.08, 0.59].map((y) => (
            <mesh key={y} position={[0, y, 0]}>
              <cylinderGeometry args={[0.28, 0.28, 0.05, 24]} />
              <Clay color={S.cardRaised} />
            </mesh>
          ))}
        </group>
      );
  }
}

export function ObservationBracket({
  amount,
  selected,
}: {
  amount: number;
  selected: number;
}): React.ReactElement {
  const S = useStage();
  return (
    <group scale={Math.max(0.001, amount)}>
      {[-1, 1].flatMap((x) =>
        [-1, 1].map((z) => (
          <group key={`${x}:${z}`} position={[x * 0.43, 0.025, z * 0.43]}>
            <ClayBlock
              size={[0.23, 0.05, 0.055]}
              position={[-x * 0.085, 0, 0]}
              color={S.accent}
              radius={0.01}
            />
            <ClayBlock
              size={[0.055, 0.05, 0.23]}
              position={[0, 0, -z * 0.085]}
              color={S.accent}
              radius={0.01}
            />
          </group>
        )),
      )}
      {selected > 0 && (
        <mesh position={[0, 0.055, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={selected}>
          <torusGeometry args={[0.46, 0.025, 8, 40]} />
          <Clay color={S.accent} />
        </mesh>
      )}
    </group>
  );
}

/** Shared keyed connector is visibly round; incompatible candidate uses a triangular key. */
export function ToolModule({
  role,
  incompatible = false,
  turn = 0,
  stroke = 0,
  color,
}: {
  role: AdaptiveModuleRole;
  incompatible?: boolean;
  turn?: number;
  stroke?: number;
  color: string;
}): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ClayBlock size={[0.65, 0.27, 0.44]} position={[0, 0.02, 0]} color={color} radius={0.06} />
      <mesh position={[0, 0.26, 0]}>
        <cylinderGeometry
          args={[
            incompatible ? 0.21 : 0.15,
            incompatible ? 0.21 : 0.15,
            0.24,
            incompatible ? 3 : 24,
          ]}
        />
        <Clay color={S.text} />
      </mesh>
      <group position={[0, -stroke * 0.14, 0]}>
        {role === 'roller' && (
          <group>
            {[-1, 1].map((side) => (
              <ClayBlock
                key={side}
                size={[0.1, 0.43, 0.13]}
                position={[side * 0.3, -0.24, 0]}
                color={S.text}
              />
            ))}
            <mesh position={[0, -0.42, 0]} rotation={[turn, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.21, 0.21, 0.57, 24]} />
              <Clay color={color} />
            </mesh>
            <ClayBlock
              size={[0.45, 0.05, 0.03]}
              position={[0, -0.42, 0.22]}
              color={S.cardRaised}
              radius={0.01}
            />
          </group>
        )}
        {role === 'drill' && (
          <group rotation={[0, turn, 0]}>
            <mesh position={[0, -0.23, 0]}>
              <cylinderGeometry args={[0.18, 0.13, 0.22, 24]} />
              <Clay color={S.text} />
            </mesh>
            <mesh position={[0, -0.47, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.11, 0.3, 16]} />
              <Clay color={S.cardRaised} />
            </mesh>
            {[-0.37, -0.43, -0.49].map((y) => (
              <mesh key={y} position={[0, y, 0]} rotation={[0.15, 0, 0]}>
                <torusGeometry args={[0.085, 0.018, 6, 18]} />
                <Clay color={S.clay[2]} />
              </mesh>
            ))}
          </group>
        )}
        {role === 'gripper' && (
          <group>
            <ClayBlock size={[0.15, 0.2, 0.15]} position={[0, -0.17, 0]} color={S.text} />
            {[-1, 1].map((side) => (
              <group
                key={side}
                position={[side * (0.22 - stroke * 0.08), -0.32, 0]}
                rotation={[0, 0, side * 0.2]}
              >
                <ClayBlock size={[0.11, 0.32, 0.16]} color={color} />
                <ClayBlock
                  size={[0.19, 0.09, 0.18]}
                  position={[-side * 0.055, -0.15, 0]}
                  color={S.text}
                  radius={0.025}
                />
              </group>
            ))}
          </group>
        )}
      </group>
    </group>
  );
}

export function MachineRig({ socketOpen }: { socketOpen: number }): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ClayBlock
        size={[1.6, 0.23, 1.05]}
        position={[0, -1.13, 0.05]}
        color={S.clay[2]}
        radius={0.09}
      />
      <ClayBlock size={[1.25, 0.12, 0.76]} position={[0, -0.95, 0.19]} color={S.cardRaised} />
      {[-1, 1].map((x) => (
        <ClayBlock
          key={x}
          size={[0.18, 1.55, 0.21]}
          position={[x * 0.59, -0.26, -0.34]}
          color={S.clay[0]}
        />
      ))}
      <ClayBlock size={[1.36, 0.22, 0.53]} position={[0, 0.59, -0.1]} color={S.clay[0]} />
      <mesh position={[0, 0.43, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.2, 0.065, 10, 32]} />
        <Clay color={S.text} />
      </mesh>
      {[-1, 1].map((side) => (
        <ClayBlock
          key={side}
          size={[0.12, 0.15, 0.13]}
          position={[side * (0.19 + 0.15 * socketOpen), 0.32, 0.2]}
          color={S.cardRaised}
          radius={0.025}
        />
      ))}
      {/* A real control lever, not a decorative log or success light. */}
      <ClayBlock
        size={[0.065, 0.34, 0.065]}
        position={[-0.77, -0.63, 0.27]}
        rotation={[0, 0, -0.25]}
        color={S.text}
      />
      <mesh position={[-0.81, -0.44, 0.27]}>
        <sphereGeometry args={[0.09, 16, 12]} />
        <Clay color={S.accent} />
      </mesh>
      {[-2.1, 2.1].map((x) => (
        <group key={x}>
          <ClayBlock size={[0.9, 0.13, 0.75]} position={[x, -0.9, 0.2]} color={S.cardRaised} />
          <ClayBlock size={[0.23, 0.3, 0.35]} position={[x, -1.1, 0.2]} color={S.clay[2]} />
        </group>
      ))}
    </group>
  );
}
