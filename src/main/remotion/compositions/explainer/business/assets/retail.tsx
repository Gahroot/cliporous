import type React from 'react';
import { FoldedDocument, PaperTray, WorkDesk } from '../../cognition/models';
import { ClayBlock } from '../../explanation-kit';
import { Occupant } from '../../spatial/parts';
import { shade, useStage } from '../../stage';

function boundedOpen(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

/** A-01: fixed shopfront identity; only the roof and right cutaway wall move. */
export function CommercialStorefront({ open }: { open: number }): React.ReactElement {
  const S = useStage();
  const cutaway = boundedOpen(open);
  return (
    <group>
      <ClayBlock size={[3.2, 0.18, 2.4]} position={[0, -1.15, 0]} color={S.card} />
      <ClayBlock size={[3, 1.7, 0.14]} position={[0, -0.21, -1.04]} color={S.cardRaised} />
      <ClayBlock size={[0.14, 1.7, 2.18]} position={[-1.45, -0.21, -0.02]} color={S.cardRaised} />
      <group position={[cutaway * 0.7, 0, 0]}>
        <ClayBlock size={[0.14, 1.7, 2.18]} position={[1.45, -0.21, -0.02]} color={S.cardRaised} />
      </group>
      <group position={[0, cutaway * 0.82, 0]}>
        <ClayBlock size={[3.12, 0.16, 2.22]} position={[0, 0.72, 0]} color={S.card} />
      </group>
      {/* Lintel, canopy, glazing, doorway and threshold stay on the same storefront. */}
      <ClayBlock size={[3, 0.26, 0.18]} position={[0, 0.51, 1.12]} color={S.cardRaised} />
      <ClayBlock size={[3.26, 0.15, 0.62]} position={[0, 0.55, 1.34]} color={S.accent} />
      {[-1.42, 0.55, 1.42].map((x) => (
        <ClayBlock
          key={x}
          size={[0.12, 1.44, 0.18]}
          position={[x, -0.34, 1.12]}
          color={shade(S.text, -0.3)}
          radius={0.035}
        />
      ))}
      <ClayBlock size={[1.85, 0.22, 0.16]} position={[-0.44, -0.95, 1.12]} color={S.cardRaised} />
      <ClayBlock
        size={[1.85, 1.22, 0.065]}
        position={[-0.44, -0.23, 1.16]}
        color={shade(S.accent, -0.3)}
        opacity={0.35}
        radius={0.025}
      />
      <ClayBlock
        size={[0.72, 1.44, 0.085]}
        position={[0.98, -0.34, 1.16]}
        color={S.cardRaised}
        opacity={0.65}
        radius={0.025}
      />
      <ClayBlock
        size={[0.04, 0.18, 0.06]}
        position={[1.17, -0.32, 1.235]}
        color={S.text}
        radius={0.015}
      />
      <ClayBlock size={[3.2, 0.1, 0.38]} position={[0, -1.085, 1.26]} color={S.card} />
      <ClayBlock size={[1.3, 0.55, 0.45]} position={[-0.55, -0.785, 0.75]} color={S.cardRaised} />
      {/* Back-office furniture, not stock masquerading as service capacity. */}
      <group position={[0.2, -0.15, -0.48]} scale={0.65}>
        <WorkDesk width={1.6} depth={1.15} />
      </group>
    </group>
  );
}

/** A-02: a worktable and client chair; occupied is a supplied fact, never a booking outcome. */
export function ServiceStation({ occupied }: { occupied: boolean }): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ClayBlock size={[2.1, 0.16, 2.7]} position={[0, -1.48, 0]} color={S.card} />
      <group position={[0, 0, -0.2]}>
        <WorkDesk width={1.6} depth={1.15} />
      </group>
      <ClayBlock size={[0.72, 0.13, 0.6]} position={[0, -0.85, 0.84]} color={S.accent} />
      <ClayBlock size={[0.72, 0.72, 0.1]} position={[0, -0.53, 1.09]} color={S.accent} />
      <ClayBlock
        size={[0.12, 0.5, 0.12]}
        position={[0, -1.125, 0.84]}
        color={shade(S.text, -0.3)}
        radius={0.035}
      />
      <ClayBlock
        size={[0.66, 0.06, 0.58]}
        position={[0, -1.37, 0.84]}
        color={shade(S.text, -0.3)}
        radius={0.025}
      />
      {/* Keep mounted for a fixed budget; no hidden-to-visible transition inferred from time. */}
      <group position={[0.45, -1.4, -0.97]} scale={1.7} visible={occupied === true}>
        <Occupant />
      </group>
    </group>
  );
}

/** A-03: a local branch shell and workstation; open only lifts its inspection roof. */
export function BranchPod({ open }: { open: number }): React.ReactElement {
  const S = useStage();
  const cutaway = boundedOpen(open);
  return (
    <group>
      <ClayBlock size={[2.1, 0.18, 1.75]} position={[0, -1.15, 0]} color={S.card} />
      <ClayBlock size={[1.9, 1.44, 0.12]} position={[0, -0.34, -0.73]} color={S.cardRaised} />
      {[-1, 1].map((side) => (
        <ClayBlock
          key={side}
          size={[0.13, 1.44, 1.55]}
          position={[side * 0.88, -0.34, 0]}
          color={S.cardRaised}
        />
      ))}
      <group position={[0, cutaway * 0.65, 0]}>
        <ClayBlock size={[2.05, 0.16, 1.72]} position={[0, 0.46, 0]} color={S.card} />
      </group>
      <ClayBlock size={[1.92, 0.2, 0.16]} position={[0, 0.28, 0.78]} color={S.cardRaised} />
      {[0.2, 0.86].map((x) => (
        <ClayBlock
          key={x}
          size={[0.1, 1.34, 0.16]}
          position={[x, -0.39, 0.78]}
          color={shade(S.text, -0.3)}
          radius={0.035}
        />
      ))}
      <ClayBlock
        size={[0.55, 1.28, 0.075]}
        position={[0.53, -0.42, 0.8]}
        color={S.cardRaised}
        opacity={0.65}
        radius={0.025}
      />
      <ClayBlock size={[0.85, 0.11, 0.4]} position={[0.51, 0.32, 0.95]} color={S.accent} />
      <ClayBlock
        size={[0.85, 1.1, 0.06]}
        position={[-0.42, -0.37, 0.8]}
        color={shade(S.accent, -0.3)}
        opacity={0.35}
        radius={0.025}
      />
      <ClayBlock size={[0.91, 0.15, 0.13]} position={[-0.42, -0.985, 0.78]} color={S.cardRaised} />
      {/* Blank architectural plaque: identity labels belong to the source-grounded board. */}
      <ClayBlock
        size={[0.45, 0.13, 0.035]}
        position={[-0.42, 0.28, 0.88]}
        color={S.accent}
        radius={0.015}
      />
      <group position={[-0.1, -0.29, -0.13]} scale={0.55}>
        <WorkDesk width={1.6} depth={1.15} />
      </group>
    </group>
  );
}

/** A-04: desk, monitor and physical inbox. Both states retain the same document, not a success stamp. */
export function OperatingDesk({ pending }: { pending: boolean }): React.ReactElement {
  const S = useStage();
  const unresolved = pending !== false;
  return (
    <group>
      <WorkDesk width={1.6} depth={1.15} />
      <group position={[-0.35, 0.96, 0.05]}>
        <PaperTray width={0.77} depth={0.86} />
      </group>
      {/* Pending paperwork remains propped in the inbox; nonpending means filed, not approved. */}
      <group
        position={[-0.35, unresolved ? 0.01 : -0.14, 0.05]}
        rotation={[unresolved ? -Math.PI / 3 : -Math.PI / 2, 0, 0]}
        scale={0.48}
      >
        <FoldedDocument color={S.accent} />
      </group>
      <ClayBlock
        size={[0.45, 0.06, 0.28]}
        position={[0.39, -0.41, -0.31]}
        color={shade(S.text, -0.3)}
        radius={0.025}
      />
      <ClayBlock
        size={[0.08, 0.25, 0.1]}
        position={[0.39, -0.255, -0.37]}
        color={shade(S.text, -0.3)}
        radius={0.025}
      />
      <ClayBlock
        size={[0.58, 0.4, 0.075]}
        position={[0.39, -0.02, -0.37]}
        color={shade(S.text, -0.3)}
        radius={0.035}
      />
      <ClayBlock
        size={[0.5, 0.32, 0.025]}
        position={[0.39, -0.02, -0.32]}
        color={S.card}
        radius={0.02}
      />
    </group>
  );
}
