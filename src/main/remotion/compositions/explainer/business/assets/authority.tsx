import type React from 'react';
import { FoldedDocument, PaperTray } from '../../cognition/models';
import { ProvenanceLink } from '../../concepts/information/models';
import { ClayBlock } from '../../explanation-kit';
import { Clay } from '../../hero-kit';
import { Occupant } from '../../spatial/parts';
import { useStage } from '../../stage';
import type {
  ApprovalRailProps,
  ExceptionTrolleyProps,
  PermissionCardProps,
  PlaybookBinderProps,
} from './authority-poses';

// Scene-scoped models only: no stage, canvas, clock or source-authored geometry.
// ClayBlock tears down its owned rounded geometry; native geometry/material nodes
// below (and in reused primitives) are owned and cleaned up by R3F. No shared allocations.
function progress(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

/** A-05: laminated permission card. Focus never changes its check, cross or unknown mark. */
export function PermissionCard({ state, focus }: PermissionCardProps): React.ReactElement {
  const S = useStage();
  const f = progress(focus);
  const ink = state === 'allowed' ? S.positive : state === 'denied' ? S.negative : S.muted;
  return (
    <group>
      <ClayBlock size={[1.42, 1.76, 0.1]} color={S.cardRaised} radius={0.09} />
      <ClayBlock
        size={[0.42, 0.08, 0.02]}
        position={[0, 0.68, 0.06]}
        color={S.text}
        radius={0.025}
      />
      <ClayBlock
        size={[0.07, 1.31, 0.02]}
        position={[-0.58, -0.02, 0.065]}
        color={S.accent}
        radius={0.01}
      />
      <ClayBlock
        size={[0.64, 0.57, 0.025]}
        position={[0.1, 0.18, 0.065]}
        color={S.card}
        radius={0.04}
      />
      <group position={[0.1, 0.18, 0.091]}>
        {state === 'allowed' ? (
          <>
            <ClayBlock
              size={[0.18, 0.055, 0.025]}
              position={[-0.105, -0.03, 0]}
              rotation={[0, 0, -0.72]}
              color={ink}
              radius={0.01}
            />
            <ClayBlock
              size={[0.36, 0.055, 0.025]}
              position={[0.065, 0.035, 0]}
              rotation={[0, 0, 0.74]}
              color={ink}
              radius={0.01}
            />
          </>
        ) : state === 'denied' ? (
          [-1, 1].map((side) => (
            <ClayBlock
              key={side}
              size={[0.43, 0.06, 0.025]}
              rotation={[0, 0, (side * Math.PI) / 4]}
              color={ink}
              radius={0.01}
            />
          ))
        ) : (
          <>
            <mesh>
              <torusGeometry args={[0.18, 0.023, 6, 16]} />
              <Clay color={ink} />
            </mesh>
            <ClayBlock size={[0.2, 0.045, 0.025]} color={ink} radius={0.01} />
          </>
        )}
      </group>
      {[0, 1].map((line) => (
        <ClayBlock
          key={line}
          size={[line === 0 ? 0.68 : 0.45, 0.035, 0.025]}
          position={[0.02, -0.3 - line * 0.18, 0.065]}
          color={S.text}
          radius={0.008}
        />
      ))}
      {[-1, 1].map((side) => (
        <group key={side}>
          <ClayBlock
            size={[0.035, 1.8, 0.025]}
            position={[side * (0.75 + 0.06 * (1 - f)), 0, 0.04]}
            color={S.accent}
            radius={0.01}
          />
          <ClayBlock
            size={[1.54, 0.035, 0.025]}
            position={[0, side * (0.93 + 0.06 * (1 - f)), 0.04]}
            color={S.accent}
            radius={0.01}
          />
        </group>
      ))}
    </group>
  );
}

/** A-06: a document carrier on two rails, a lifting gate and a separate approver occupant.
 * Pending/denied gates receive accepted=0 from the validated pack's sampler.
 */
export function ApprovalRail({ accepted }: ApprovalRailProps): React.ReactElement {
  const S = useStage();
  const a = progress(accepted);
  return (
    <group>
      <ClayBlock size={[2.48, 0.13, 0.88]} position={[0, -0.54, 0]} color={S.card} />
      {[-1, 1].map((side) => (
        <group key={side}>
          <ClayBlock
            size={[2.2, 0.06, 0.075]}
            position={[0, -0.435, side * 0.3]}
            color={S.text}
            radius={0.015}
          />
          <ClayBlock
            size={[0.13, 1.25, 0.13]}
            position={[0.28, 0.145, side * 0.3]}
            color={S.clay[2]}
            radius={0.03}
          />
        </group>
      ))}
      <ClayBlock
        size={[0.105, 0.13, 0.7]}
        position={[0.28, -0.15 + 0.8 * a, 0]}
        color={S.accent}
        radius={0.025}
      />
      <ClayBlock
        size={[0.2, 0.18, 0.31]}
        position={[0.28, 0.1, -0.4]}
        color={S.cardRaised}
        radius={0.03}
      />
      <group position={[-0.64 + 1.45 * a, -0.35, 0]}>
        <ClayBlock size={[0.52, 0.09, 0.52]} color={S.clay[1]} radius={0.025} />
        <group position={[0, 0.3, 0]} scale={0.42}>
          <FoldedDocument color={S.accent} />
        </group>
      </group>
      <group position={[1.2, -0.6, -0.55]} scale={1.1}>
        <Occupant />
      </group>
      <ProvenanceLink from={[0.28, 0.1, -0.55]} to={[1.2, 0.1, -0.55]} color={S.muted} />
    </group>
  );
}

/** A-07: ring binder with two source-selected guidance slots. The older sheet persists;
 * a visible later revision is not model retraining, an inferred approval or an automatic update.
 */
export function PlaybookBinder({ open, revision = 0 }: PlaybookBinderProps): React.ReactElement {
  const S = useStage();
  const o = progress(open);
  return (
    <group>
      <ClayBlock
        size={[1.3, 1.78, 0.075]}
        position={[0.06, 0, -0.15]}
        color={S.clay[2]}
        radius={0.045}
      />
      <ClayBlock size={[0.15, 1.78, 0.31]} position={[-0.59, 0, 0]} color={S.clay[1]} />
      {[-0.48, 0.48].map((y) => (
        <mesh key={y} position={[-0.43, y, -0.005]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.11, 0.024, 8, 16]} />
          <Clay color={S.text} />
        </mesh>
      ))}
      <group position={[-0.59, 0, 0.155]} rotation={[0, -Math.PI * 0.74 * o, 0]}>
        <ClayBlock
          size={[1.3, 1.78, 0.075]}
          position={[0.65, 0, 0]}
          color={S.clay[2]}
          radius={0.045}
        />
        <group position={[0.65, 0, -0.064]} rotation={[0, Math.PI, 0]} scale={0.88}>
          <FoldedDocument color={S.clay[1]} />
          <ClayBlock
            size={[0.26, 0.1, 0.055]}
            position={[0.36, 0.62, 0.06]}
            color={S.clay[1]}
            radius={0.015}
          />
        </group>
      </group>
      <group position={[0.08, 0, -0.06]} scale={0.88} visible={revision === 1}>
        <FoldedDocument color={S.accent} />
        <ClayBlock
          size={[0.26, 0.16, 0.055]}
          position={[0.36, 0.62, 0.06]}
          color={S.accent}
          radius={0.015}
        />
      </group>
    </group>
  );
}

/** A-08: wheeled review inbox. Pending sheets and pause marks stay pending indefinitely;
 * an explicitly nonpending inbox is empty, never decorated with an invented success mark.
 */
export function ExceptionTrolley({ pending }: ExceptionTrolleyProps): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <group position={[0, 0.87, 0]}>
        <PaperTray />
      </group>
      {[-1, 1].map((side) => (
        <group key={side}>
          <ClayBlock
            size={[0.075, 0.86, 0.075]}
            position={[side * 0.62, -0.37, -0.48]}
            color={S.text}
            radius={0.025}
          />
          <ClayBlock
            size={[1.2, 0.06, 0.06]}
            position={[0, -0.77, side * 0.38]}
            color={S.text}
            radius={0.015}
          />
          {[-1, 1].map((end) => (
            <mesh
              key={end}
              position={[side * 0.54, -0.77, end * 0.38]}
              rotation={[0, 0, Math.PI / 2]}
            >
              <cylinderGeometry args={[0.14, 0.14, 0.1, 12]} />
              <Clay color={S.clay[2]} />
            </mesh>
          ))}
        </group>
      ))}
      <ClayBlock
        size={[1.36, 0.095, 0.1]}
        position={[0, 0.1, -0.48]}
        color={S.clay[1]}
        radius={0.025}
      />
      <group position={[0, 0.1, 0]} scale={0.52} visible={pending}>
        <FoldedDocument color={S.accent} />
      </group>
      <group position={[0, -0.26, 0.565]}>
        <ClayBlock size={[0.46, 0.22, 0.04]} color={S.cardRaised} radius={0.025} />
        <group visible={pending}>
          {[-1, 1].map((side) => (
            <ClayBlock
              key={side}
              size={[0.055, 0.13, 0.025]}
              position={[side * 0.075, 0, 0.035]}
              color={S.muted}
              radius={0.01}
            />
          ))}
        </group>
      </group>
    </group>
  );
}
