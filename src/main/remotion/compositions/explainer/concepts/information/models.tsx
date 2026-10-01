import type React from 'react';
import { FoldedDocument } from '../../cognition/models';
import { ClayBlock } from '../../explanation-kit';
import { Clay } from '../../hero-kit';
import { shade, useStage } from '../../stage';
import type { InformationPoint } from './poses';
import type { InformationMedium, LayerRole } from './types';

/** A source identity is both a colored binding AND one to six physical notch marks. */
export function Identity({ index, color }: { index: number; color: string }): React.ReactElement {
  return (
    <group>
      {[0, 1, 2, 3, 4, 5].slice(0, index + 1).map((mark) => (
        <mesh key={mark} position={[-0.22 + mark * 0.085, -0.43, 0.085]}>
          <sphereGeometry args={[0.028, 10, 8]} />
          <Clay color={color} />
        </mesh>
      ))}
    </group>
  );
}

export function SourceDocument({
  index,
  color,
}: {
  index: number;
  color: string;
}): React.ReactElement {
  return (
    <group>
      <FoldedDocument color={color} />
      <Identity index={index} color={color} />
    </group>
  );
}

/** Open-front file cradle, tab and visible sheet guides: a group is not a success badge. */
export function TopicCradle({
  index,
  color,
  reveal,
}: {
  index: number;
  color: string;
  reveal: number;
}): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ClayBlock size={[1.8, 0.14, 1.25]} position={[0, -0.5, 0]} color={S.card} />
      <ClayBlock
        size={[1.8, 0.55, 0.09]}
        position={[0, -0.16, -0.57]}
        color={shade(S.text, -0.62)}
      />
      <ClayBlock size={[0.52, 0.23, 0.12]} position={[-0.51, 0.15, -0.57]} color={color} />
      {[-1, 1].map((side) => (
        <ClayBlock
          key={side}
          size={[0.09, 0.26, 1.25]}
          position={[side * 0.855, -0.32, 0]}
          color={shade(S.text, -0.55)}
        />
      ))}
      <group position={[0, -0.18, 0.64]} scale={[0.65, 0.65, 0.65]}>
        <Identity index={index} color={color} />
      </group>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.93, -0.5, 0]} scale={[1, 0.25 + reveal * 0.75, 1]}>
          <ClayBlock
            size={[0.055, 0.45, 0.08]}
            position={[0, 0.22, 0.55]}
            color={color}
            radius={0.02}
          />
        </group>
      ))}
    </group>
  );
}

/** A real slotted document stand; the unselected candidates never dissolve. */
export function CandidateStand({
  index,
  color,
  selected,
}: {
  index: number;
  color: string;
  selected: number;
}): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ClayBlock size={[1.65, 0.16, 1.05]} position={[0, -0.5, 0]} color={S.card} />
      <group position={[0, 0.1, -0.08]} scale={0.88}>
        <SourceDocument index={index} color={color} />
      </group>
      <ClayBlock size={[1.3, 0.17, 0.2]} position={[0, -0.37, 0.22]} color={S.text} />
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.75, -0.4, 0]} scale={[1, 0.15 + selected * 0.85, 1]}>
          <ClayBlock
            size={[0.055, 1.25, 0.065]}
            position={[0, 0.625, 0]}
            color={color}
            radius={0.02}
          />
          <ClayBlock
            size={[0.19, 0.055, 0.065]}
            position={[-side * 0.065, 1.23, 0]}
            color={color}
            radius={0.02}
          />
        </group>
      ))}
    </group>
  );
}

/** Capability badge, swivel chair and waiting desk; not an agent executing a task. */
export function SkillStation({
  index,
  color,
  paired,
}: {
  index: number;
  color: string;
  paired: number;
}): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ClayBlock size={[1.55, 0.14, 1.05]} position={[0, -0.35, 0]} color={S.cardRaised} />
      {[-0.58, 0.58].map((x) => (
        <ClayBlock key={x} size={[0.1, 0.34, 0.78]} position={[x, -0.59, 0]} color={S.text} />
      ))}
      <ClayBlock size={[0.52, 0.42, 0.12]} position={[0.46, 0.03, -0.43]} color={color} />
      <group position={[0.46, 0.25, -0.35]} scale={0.6}>
        <Identity index={index} color={S.text} />
      </group>
      <ClayBlock size={[0.68, 0.12, 0.57]} position={[0, -0.29, -0.93]} color={S.card} />
      <ClayBlock size={[0.68, 0.65, 0.12]} position={[0, 0.08, -1.15]} color={S.card} />
      <mesh position={[0, -0.53, -0.93]}>
        <cylinderGeometry args={[0.07, 0.07, 0.4, 12]} />
        <Clay color={S.text} />
      </mesh>
      <group position={[0, -0.26, 0.28]} scale={[0.15 + 0.85 * paired, 1, 1]}>
        <ClayBlock size={[1.2, 0.035, 0.075]} color={color} radius={0.01} />
      </group>
    </group>
  );
}

function Person({ color }: { color: string }): React.ReactElement {
  return (
    <group>
      <mesh position={[0, 0.3, 0]}>
        <sphereGeometry args={[0.12, 16, 12]} />
        <Clay color={color} />
      </mesh>
      <mesh position={[0, 0.08, 0]}>
        <capsuleGeometry args={[0.105, 0.15, 4, 12]} />
        <Clay color={color} />
      </mesh>
    </group>
  );
}

/** Boards and office floors have different silhouettes and visible functional parts. */
export function FunctionalLayer({
  role,
  device,
  color,
  index,
}: {
  role: LayerRole;
  device: boolean;
  color: string;
  index: number;
}): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ClayBlock
        size={[device ? 2.6 : 3.0, 0.16, device ? 1.65 : 1.95]}
        color={device ? shade(S.text, -0.55) : S.card}
        radius={0.1}
      />
      {device ? (
        <>
          {[-1.12, 1.12].flatMap((x) =>
            [-0.65, 0.65].map((z) => (
              <mesh key={`${x}:${z}`} position={[x, 0.1, z]}>
                <cylinderGeometry args={[0.075, 0.075, 0.06, 12]} />
                <Clay color={S.text} />
              </mesh>
            )),
          )}
          {role === 'interface' ? (
            <>
              <ClayBlock
                size={[1.83, 0.06, 1.16]}
                position={[0, 0.13, 0]}
                color={S.cardRaised}
                radius={0.12}
              />
              <ClayBlock
                size={[0.82, 0.035, 0.05]}
                position={[0, 0.18, 0.4]}
                color={S.text}
                radius={0.015}
              />
              <mesh position={[0.84, 0.18, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.09, 0.025, 8, 20]} />
                <Clay color={color} />
              </mesh>
            </>
          ) : role === 'power' ? (
            [-0.47, 0.47].map((x) => (
              <group key={x} position={[x, 0.14, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <mesh>
                  <cylinderGeometry args={[0.2, 0.2, 1.03, 20]} />
                  <Clay color={color} />
                </mesh>
                <mesh position={[0, 0.55, 0]}>
                  <cylinderGeometry args={[0.095, 0.095, 0.07, 12]} />
                  <Clay color={S.text} />
                </mesh>
              </group>
            ))
          ) : (
            <>
              <ClayBlock size={[0.93, 0.19, 0.88]} position={[0, 0.17, 0]} color={color} />
              {[-1, 1].flatMap((side) =>
                [-0.3, 0, 0.3].map((z) => (
                  <ClayBlock
                    key={`${side}:${z}`}
                    size={[0.28, 0.05, 0.075]}
                    position={[side * 0.57, 0.11, z]}
                    color={S.text}
                    radius={0.01}
                  />
                )),
              )}
              {role === 'records' &&
                [-0.8, 0.8].map((x) => (
                  <ClayBlock
                    key={x}
                    size={[0.3, 0.12, 0.66]}
                    position={[x, 0.14, 0]}
                    color={S.cardRaised}
                  />
                ))}
            </>
          )}
        </>
      ) : (
        <>
          {[-1.3, 1.3].map((x) => (
            <ClayBlock
              key={x}
              size={[0.12, 0.49, 1.8]}
              position={[x, 0.28, 0]}
              color={shade(S.text, -0.6)}
            />
          ))}
          {role === 'people' ? (
            [-0.66, 0, 0.66].map((x) => (
              <group key={x} position={[x, 0.1, 0]}>
                <Person color={color} />
              </group>
            ))
          ) : role === 'records' ? (
            [-0.7, -0.23, 0.23, 0.7].map((x) => (
              <group key={x} position={[x, 0.27, 0]}>
                <ClayBlock size={[0.27, 0.38, 0.7]} color={color} radius={0.025} />
                <ClayBlock
                  size={[0.13, 0.065, 0.035]}
                  position={[0, 0.04, 0.37]}
                  color={S.cardRaised}
                  radius={0.01}
                />
              </group>
            ))
          ) : (
            <>
              <ClayBlock size={[1.95, 0.1, 0.85]} position={[0, 0.2, 0]} color={S.cardRaised} />
              {[-0.66, 0, 0.66].map((x) => (
                <group key={x} position={[x, 0.31, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={0.38}>
                  <FoldedDocument color={color} />
                </group>
              ))}
              <ClayBlock
                size={[1.65, 0.025, 0.045]}
                position={[0, 0.27, 0.32]}
                color={S.text}
                radius={0.01}
              />
            </>
          )}
        </>
      )}
      <group position={[0, 0.19, device ? 0.85 : 1]} scale={0.6}>
        <Identity index={index} color={color} />
      </group>
    </group>
  );
}

/** Physical provenance thread; unit cylinder is scaled, never reconstructed per frame. */
export function ProvenanceLink({
  from,
  to,
  color,
  reveal = 1,
}: {
  from: InformationPoint;
  to: InformationPoint;
  color: string;
  reveal?: number;
}): React.ReactElement {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  return (
    <group position={from} rotation={[0, 0, -Math.atan2(dx, dy)]} scale={[1, reveal, 1]}>
      <mesh position={[0, Math.hypot(dx, dy) / 2, 0]} scale={[1, Math.hypot(dx, dy), 1]}>
        <cylinderGeometry args={[0.022, 0.022, 1, 10]} />
        <Clay color={color} />
      </mesh>
    </group>
  );
}

/** Three unmistakable source carriers: folded text, mounted photograph, audio recorder. */
export function MediaSource({
  medium,
  color,
  index,
}: {
  medium: InformationMedium;
  color: string;
  index: number;
}): React.ReactElement {
  const S = useStage();
  if (medium === 'text') return <SourceDocument index={index} color={color} />;
  return (
    <group>
      <ClayBlock size={[1.05, 1.03, medium === 'audio' ? 0.2 : 0.08]} color={S.cardRaised} />
      {medium === 'image' ? (
        <>
          <ClayBlock
            size={[0.85, 0.69, 0.035]}
            position={[0, 0.05, 0.06]}
            color={shade(color, -0.3)}
            radius={0.035}
          />
          <mesh position={[0.22, 0.23, 0.095]}>
            <sphereGeometry args={[0.09, 16, 12]} />
            <Clay color={S.cardRaised} />
          </mesh>
          {[-0.18, 0.15].map((x) => (
            <mesh key={x} position={[x, -0.07, 0.105]} rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[x < 0 ? 0.25 : 0.18, 0.055, 3]} />
              <Clay color={color} />
            </mesh>
          ))}
        </>
      ) : (
        <>
          {[-0.25, 0.25].map((x) => (
            <mesh key={x} position={[x, 0.22, 0.13]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.16, 0.045, 8, 20]} />
              <Clay color={S.text} />
            </mesh>
          ))}
          {[0.13, 0.3, 0.44, 0.24, 0.1].map((height, i) => (
            <ClayBlock
              key={height}
              size={[0.055, height, 0.035]}
              position={[(i - 2) * 0.14, -0.16, 0.13]}
              color={color}
              radius={0.02}
            />
          ))}
        </>
      )}
      <Identity index={index} color={color} />
    </group>
  );
}

export function ResultBinder({
  fusion,
  binding,
}: {
  fusion: boolean;
  binding: number;
}): React.ReactElement {
  const S = useStage();
  return (
    <group position={[1.7, 0.25, 0]}>
      <ClayBlock size={[2.65, 3.18, 0.14]} color={S.card} radius={0.12} />
      <ClayBlock
        size={[2.42, 2.98, 0.07]}
        position={[0.03, 0, 0.1]}
        color={S.cardRaised}
        radius={0.045}
      />
      {[-0.95, 0, 0.95].map((y) => (
        <mesh key={y} position={[-1.23, y, 0.13]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.12, 0.03, 8, 16]} />
          <Clay color={S.text} />
        </mesh>
      ))}
      <group position={[0.02, 1.28, 0.16]} scale={[binding, 1, 1]}>
        <ClayBlock size={[2.06, 0.035, 0.025]} color={S.accent} radius={0.01} />
      </group>
      {fusion && (
        <group position={[0, -1.28, 0.18]}>
          {[-0.36, 0, 0.36].map((x) => (
            <mesh key={x} position={[x, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.25, 0.04, 8, 20]} />
              <Clay color={S.accent} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

export function DetailFragment({
  index,
  color,
  medium,
}: {
  index: number;
  color: string;
  medium: InformationMedium;
}): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ClayBlock size={[2.06, 0.6, 0.065]} color={S.cardRaised} radius={0.06} />
      <ClayBlock
        size={[0.06, 0.51, 0.04]}
        position={[-0.96, 0, 0.05]}
        color={color}
        radius={0.02}
      />
      <group position={[-0.58, 0.36, 0]} scale={0.38}>
        <Identity index={index} color={color} />
      </group>
      {medium === 'image' ? (
        <mesh position={[-0.77, 0.14, 0.07]}>
          <sphereGeometry args={[0.07, 12, 8]} />
          <Clay color={color} />
        </mesh>
      ) : medium === 'audio' ? (
        [-0.83, -0.74].map((x) => (
          <ClayBlock
            key={x}
            size={[0.03, x < -0.8 ? 0.14 : 0.22, 0.025]}
            position={[x, 0.13, 0.07]}
            color={color}
            radius={0.01}
          />
        ))
      ) : (
        <ClayBlock
          size={[0.19, 0.03, 0.025]}
          position={[-0.77, 0.13, 0.07]}
          color={color}
          radius={0.01}
        />
      )}
    </group>
  );
}
