import type React from 'react';
import { ClayBlock } from '../explanation-kit';
import { Clay } from '../hero-kit';
import { shade, useStage } from '../stage';

/** All dimensions are authored and remain constant during animation. */
export function WorkDesk({
  width = 1.6,
  depth = 1.15,
}: {
  width?: number;
  depth?: number;
}): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ClayBlock size={[width, 0.16, depth]} position={[0, -0.52, 0]} color={S.cardRaised} />
      {[-1, 1].flatMap((x) =>
        [-1, 1].map((z) => (
          <ClayBlock
            key={`${x}:${z}`}
            size={[0.14, 0.8, 0.14]}
            position={[x * (width / 2 - 0.14), -1, z * (depth / 2 - 0.14)]}
            color={shade(S.text, -0.5)}
          />
        )),
      )}
      <ClayBlock
        size={[width - 0.3, 0.1, 0.12]}
        position={[0, -1.1, -depth / 2 + 0.14]}
        color={shade(S.text, -0.5)}
      />
      <ClayBlock
        size={[width * 0.48, 0.27, 0.19]}
        position={[0, -0.75, depth / 2 - 0.1]}
        color={S.card}
      />
      <ClayBlock
        size={[0.25, 0.045, 0.05]}
        position={[0, -0.73, depth / 2 + 0.015]}
        color={S.text}
      />
    </group>
  );
}

/** A dog-eared sheet with a persistent identity stripe; never an anonymous token. */
export function FoldedDocument({
  color,
  mark = 'lines',
  ink = 1,
}: {
  color: string;
  mark?: 'lines' | 'plan' | 'edit' | 'left' | 'right';
  ink?: number;
}): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ClayBlock
        size={[0.98, 0.96, 0.055]}
        position={[0, -0.15, 0]}
        color={S.cardRaised}
        radius={0.025}
      />
      <ClayBlock
        size={[0.73, 0.3, 0.055]}
        position={[-0.125, 0.47, 0]}
        color={S.cardRaised}
        radius={0.022}
      />
      <mesh position={[0.27, 0.47, 0.02]} rotation={[Math.PI / 2, 0, Math.PI / 6]}>
        <cylinderGeometry args={[0.21, 0.21, 0.045, 3]} />
        <Clay color={shade(S.text, -0.5)} />
      </mesh>
      <ClayBlock
        size={[0.055, 0.85, 0.025]}
        position={[-0.39, -0.03, 0.04]}
        color={color}
        radius={0.01}
      />
      {mark === 'plan' ? (
        <group position={[0.025, -0.05, 0.042]}>
          {[-0.25, 0.25].map((y) => (
            <ClayBlock
              key={y}
              size={[0.52, 0.027, 0.02]}
              position={[0, y, 0]}
              color={color}
              radius={0.005}
            />
          ))}
          {[-0.25, 0, 0.25].map((x) => (
            <ClayBlock
              key={x}
              size={[0.027, 0.5, 0.02]}
              position={[x, 0, 0]}
              color={color}
              radius={0.005}
            />
          ))}
        </group>
      ) : (
        <group scale={[ink, 1, 1]}>
          {[0.23, 0.04, -0.15].map((y, index) => (
            <ClayBlock
              key={y}
              size={[index === 2 ? 0.32 : 0.53, 0.035, 0.025]}
              position={[0.015, y, 0.045]}
              color={S.text}
              radius={0.009}
            />
          ))}
        </group>
      )}
      {mark === 'edit' && (
        <ClayBlock
          size={[0.58, 0.047, 0.035]}
          position={[0.015, 0.04, 0.072]}
          rotation={[0, 0, -0.22]}
          color={color}
          radius={0.01}
        />
      )}
      {(mark === 'left' || mark === 'right') && (
        <group position={[0, -0.4, 0.055]} rotation={[0, 0, mark === 'left' ? Math.PI : 0]}>
          <ClayBlock size={[0.43, 0.065, 0.025]} color={color} radius={0.01} />
          <ClayBlock
            size={[0.2, 0.065, 0.025]}
            position={[0.16, 0.055, 0]}
            rotation={[0, 0, -0.65]}
            color={color}
            radius={0.01}
          />
          <ClayBlock
            size={[0.2, 0.065, 0.025]}
            position={[0.16, -0.055, 0]}
            rotation={[0, 0, 0.65]}
            color={color}
            radius={0.01}
          />
        </group>
      )}
    </group>
  );
}

export function DeskTool({
  variant,
  color,
}: {
  variant: 'draft' | 'hammer' | 'roller';
  color: string;
}): React.ReactElement {
  const S = useStage();
  if (variant === 'draft') {
    return (
      <group>
        <ClayBlock
          size={[0.72, 0.045, 0.15]}
          position={[0, 0.03, 0.02]}
          rotation={[0, 0.25, 0]}
          color={shade(S.text, -0.5)}
          radius={0.012}
        />
        <group position={[0.1, 0.28, -0.09]} rotation={[0, 0, -0.7]}>
          <mesh>
            <cylinderGeometry args={[0.045, 0.045, 0.68, 8]} />
            <Clay color={color} />
          </mesh>
          <mesh position={[0, -0.4, 0]} rotation={[0, 0, Math.PI]}>
            <coneGeometry args={[0.047, 0.13, 8]} />
            <Clay color={S.text} />
          </mesh>
        </group>
      </group>
    );
  }
  return (
    <group>
      <ClayBlock
        size={[0.11, 0.63, 0.11]}
        position={[0, 0.24, 0]}
        rotation={[0, 0, -0.22]}
        color={color}
        radius={0.04}
      />
      {variant === 'hammer' ? (
        <>
          <ClayBlock size={[0.52, 0.2, 0.22]} position={[0.06, 0.55, 0]} color={S.text} />
          <ClayBlock
            size={[0.14, 0.27, 0.23]}
            position={[-0.18, 0.51, 0]}
            rotation={[0, 0, -0.25]}
            color={shade(S.text, -0.5)}
          />
        </>
      ) : (
        <group position={[0.1, 0.61, 0]}>
          <ClayBlock
            size={[0.38, 0.055, 0.055]}
            position={[0.12, -0.04, 0]}
            color={S.text}
            radius={0.015}
          />
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.14, 0.14, 0.47, 16]} />
            <Clay color={color} />
          </mesh>
        </group>
      )}
    </group>
  );
}

export function PaperTray({
  width = 1.45,
  depth = 1.1,
}: {
  width?: number;
  depth?: number;
}): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ClayBlock size={[width, 0.13, depth]} position={[0, -1.18, 0]} color={S.card} />
      {[-1, 1].map((side) => (
        <ClayBlock
          key={side}
          size={[0.09, 0.25, depth]}
          position={[side * (width / 2 - 0.04), -1.08, 0]}
          color={shade(S.text, -0.5)}
          radius={0.035}
        />
      ))}
      <ClayBlock
        size={[width, 0.25, 0.09]}
        position={[0, -1.08, -depth / 2 + 0.04]}
        color={shade(S.text, -0.5)}
        radius={0.035}
      />
      <ClayBlock
        size={[width - 0.25, 0.16, depth - 0.18]}
        position={[0, -1.32, 0]}
        color={shade(S.text, -0.5)}
      />
    </group>
  );
}

/** Paper, clip and rolled edge make the path a physical work plan, not a dashboard. */
export function PlanSheet(): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ClayBlock
        size={[2.55, 0.07, 3.12]}
        position={[0, -0.395, 0]}
        color={S.cardRaised}
        radius={0.025}
      />
      <ClayBlock
        size={[0.52, 0.08, 0.2]}
        position={[0, -0.34, -1.46]}
        color={shade(S.text, -0.5)}
        radius={0.035}
      />
      <mesh position={[-1.19, -0.33, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 2.96, 16]} />
        <Clay color={S.cardRaised} />
      </mesh>
      {[-1, 1].map((side) => (
        <ClayBlock
          key={side}
          size={[0.025, 0.012, 2.7]}
          position={[side * 1.05, -0.35, 0]}
          color={shade(S.text, -0.5)}
          radius={0.004}
        />
      ))}
      <group position={[-0.92, -0.28, 0.75]} rotation={[0, 0.15, Math.PI / 2]} scale={0.6}>
        <DeskTool variant="draft" color={S.accent} />
      </group>
    </group>
  );
}

/** An open model housing: feet, frame, service ports, layered cartridges and cooling vents. */
export function ModelHousing({
  change = 0,
  correction = 0,
  trainingClosed = false,
}: {
  change?: number;
  correction?: number;
  trainingClosed?: boolean;
}): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ClayBlock size={[1.72, 2.02, 0.22]} position={[0, -0.17, -0.36]} color={S.card} />
      {[-1, 1].map((side) => (
        <group key={side}>
          <ClayBlock
            size={[0.2, 2.02, 0.86]}
            position={[side * 0.83, -0.17, 0]}
            color={S.cardRaised}
          />
          <ClayBlock
            size={[0.4, 0.17, 0.92]}
            position={[side * 0.66, -1.315, 0]}
            color={shade(S.text, -0.5)}
          />
          <ClayBlock
            size={[0.26, 0.09, 0.55]}
            position={[side * 1.01, -0.49, 0.1]}
            color={S.text}
            radius={0.025}
          />
        </group>
      ))}
      <ClayBlock size={[1.85, 0.21, 0.88]} position={[0, 0.76, 0]} color={S.cardRaised} />
      <ClayBlock size={[1.85, 0.18, 0.9]} position={[0, -1.18, 0]} color={S.cardRaised} />
      {[0, 1, 2, 3].map((index) => (
        <group
          key={index}
          position={[
            (index % 2 === 0 ? -1 : 1) * (0.2 - change * 0.15),
            -0.73 + index * 0.36 + correction * (index - 1.5) * 0.035,
            0.02,
          ]}
        >
          <ClayBlock
            size={[1.19, 0.14, 0.57]}
            color={index % 2 === 0 ? S.accent : shade(S.text, -0.5)}
            radius={0.04}
          />
          <ClayBlock
            size={[0.7, 0.045, 0.03]}
            position={[0, 0, 0.3]}
            color={S.text}
            radius={0.015}
          />
        </group>
      ))}
      {[-0.45, -0.15, 0.15, 0.45].map((x) => (
        <ClayBlock
          key={x}
          size={[0.15, 0.035, 0.025]}
          position={[x, 0.76, 0.455]}
          color={shade(S.text, -0.5)}
          radius={0.01}
        />
      ))}
      <ClayBlock
        size={[0.3, 0.09, 0.57]}
        position={[-1.02, 0.3, 0.1]}
        color={S.text}
        radius={0.025}
      />
      {trainingClosed && (
        <ClayBlock
          size={[0.12, 0.53, 0.6]}
          position={[-0.99, 0.5, 0.1]}
          color={shade(S.text, -0.5)}
          radius={0.03}
        />
      )}
    </group>
  );
}

/** Mechanical magazine with a continuous fill: no ticks, currency or invented call count. */
export function AllowanceMagazine({ remaining }: { remaining: number }): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ClayBlock size={[1, 0.15, 0.76]} position={[0, -0.35, 0]} color={shade(S.text, -0.5)} />
      {[-1, 1].map((side) => (
        <ClayBlock
          key={side}
          size={[0.13, 1.27, 0.65]}
          position={[side * 0.43, 0.29, 0]}
          color={S.cardRaised}
        />
      ))}
      <ClayBlock size={[1, 0.16, 0.75]} position={[0, 0.96, 0]} color={S.cardRaised} />
      <ClayBlock size={[0.66, 1.13, 0.09]} position={[0, 0.3, -0.29]} color={S.card} />
      {remaining > 0 && (
        <group position={[0, -0.26, 0]} scale={[1, remaining, 1]}>
          <ClayBlock
            size={[0.65, 1.12, 0.42]}
            position={[0, 0.56, 0]}
            color={S.accent}
            radius={0.035}
          />
        </group>
      )}
      <ClayBlock size={[0.42, 0.09, 0.1]} position={[0, 1.09, 0]} color={S.text} />
    </group>
  );
}

export function WorkPress({ press, gate }: { press: number; gate: number }): React.ReactElement {
  const S = useStage();
  return (
    <group>
      {[-1, 1].map((side) => (
        <ClayBlock
          key={side}
          size={[0.12, 0.88, 0.18]}
          position={[side * 0.53, 0.03, -0.1]}
          color={shade(S.text, -0.5)}
        />
      ))}
      <ClayBlock size={[1.3, 0.14, 0.56]} position={[0, 0.48, -0.1]} color={S.cardRaised} />
      <group position={[0, -0.33 * press, 0]}>
        <ClayBlock size={[0.12, 0.47, 0.12]} position={[0, 0.24, -0.1]} color={S.text} />
        <ClayBlock
          size={[0.79, 0.15, 0.64]}
          position={[0, 0.01, 0.16]}
          color={shade(S.text, -0.5)}
        />
      </group>
      <group position={[0, 0.58 * (1 - gate), 0.56]}>
        <ClayBlock size={[1.22, 0.2, 0.09]} position={[0, -0.17, 0]} color={S.accent} />
        {[-0.34, 0.34].map((x) => (
          <ClayBlock
            key={x}
            size={[0.075, 0.12, 0.025]}
            position={[x, -0.17, 0.057]}
            color={S.text}
            radius={0.01}
          />
        ))}
      </group>
    </group>
  );
}

/** Seated reader, not an approval stamp. The hands never resolve the conflicting documents. */
export function Reviewer(): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ClayBlock
        size={[0.85, 1.2, 0.17]}
        position={[0, -0.1, -0.32]}
        color={shade(S.text, -0.5)}
        radius={0.08}
      />
      <ClayBlock size={[0.88, 0.16, 0.8]} position={[0, -0.8, 0]} color={shade(S.text, -0.5)} />
      {[-1, 1].map((side) => (
        <ClayBlock
          key={side}
          size={[0.12, 0.54, 0.12]}
          position={[side * 0.3, -1.13, -0.15]}
          color={shade(S.text, -0.5)}
        />
      ))}
      <ClayBlock size={[0.69, 0.83, 0.48]} position={[0, -0.18, 0]} color={S.accent} radius={0.2} />
      <mesh position={[0, 0.55, 0.035]} scale={[1, 1.15, 0.94]}>
        <sphereGeometry args={[0.3, 24, 16]} />
        <Clay color={S.cardRaised} />
      </mesh>
      <mesh position={[0, 0.76, -0.025]} scale={[1, 0.55, 1]}>
        <sphereGeometry args={[0.31, 24, 16]} />
        <Clay color={shade(S.text, -0.5)} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <ClayBlock
            size={[0.18, 0.62, 0.22]}
            position={[side * 0.4, -0.22, 0.15]}
            rotation={[-0.65, 0, side * 0.23]}
            color={S.accent}
            radius={0.075}
          />
          <mesh position={[side * 0.43, -0.45, 0.34]}>
            <sphereGeometry args={[0.12, 16, 12]} />
            <Clay color={S.cardRaised} />
          </mesh>
          <mesh position={[side * 0.13, 0.59, 0.313]}>
            <torusGeometry args={[0.105, 0.018, 8, 20]} />
            <Clay color={S.text} />
          </mesh>
        </group>
      ))}
      <ClayBlock
        size={[0.08, 0.025, 0.025]}
        position={[0, 0.59, 0.32]}
        color={S.text}
        radius={0.01}
      />
    </group>
  );
}
