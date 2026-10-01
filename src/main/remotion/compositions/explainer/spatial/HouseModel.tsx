import type React from 'react';
import { useEffect, useMemo } from 'react';
import { Color, ExtrudeGeometry, Shape } from 'three';
import { ClayBlock } from '../explanation-kit';
import { Clay } from '../hero-kit';
import { shade, useStage } from '../stage';
import { bounded } from './poses';

/** All controls are optional and bounded. Default: 3.6w × 2.9h × 2.8d,
 * floor -1.16, foundation bottom -1.4. No stage/canvas/lights of its own. */
export interface HouseModelProps {
  build?: number;
  /** Dollhouse front folds outward around its bottom hinge. */
  open?: number;
  /** Roof assembly lifts at most 0.95 units; does not spin. */
  roofLift?: number;
  doorOpen?: number;
  rooms?: boolean;
  beam?: boolean;
  /** Authored alternative partition position, clamped to ±0.65. */
  partitionOffset?: number;
  finish?: number;
  roofColor?: string;
  serviceOpen?: number;
}

function WindowModel({ width = 0.82 }: { width?: number }): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ClayBlock size={[width + 0.12, 0.9, 0.13]} color={shade(S.text, -0.14)} radius={0.045} />
      <ClayBlock
        size={[width, 0.76, 0.06]}
        position={[0, 0, 0.08]}
        color={shade(S.accent, -0.4)}
        radius={0.04}
      />
      <ClayBlock
        size={[0.045, 0.77, 0.055]}
        position={[0, 0, 0.125]}
        color={S.text}
        radius={0.018}
      />
      <ClayBlock
        size={[width, 0.045, 0.055]}
        position={[0, 0, 0.125]}
        color={S.text}
        radius={0.018}
      />
      <ClayBlock
        size={[width + 0.23, 0.1, 0.27]}
        position={[0, -0.46, 0.075]}
        color={S.text}
        radius={0.035}
      />
    </group>
  );
}

/** Hinge-local, floor-origin door. Reused by the scoped-room demonstration. */
export function HouseDoor({
  open = 0,
  width = 0.64,
  height = 1.26,
  barred = false,
}: {
  open?: number;
  width?: number;
  height?: number;
  barred?: boolean;
}): React.ReactElement {
  const S = useStage();
  return (
    <group>
      {[-1, 1].map((side) => (
        <ClayBlock
          key={side}
          size={[0.075, height + 0.08, 0.18]}
          position={[side * (width / 2 + 0.045), height / 2, 0]}
          color={S.text}
          radius={0.025}
        />
      ))}
      <ClayBlock
        size={[width + 0.15, 0.09, 0.18]}
        position={[0, height + 0.025, 0]}
        color={S.text}
        radius={0.025}
      />
      <group position={[-width / 2, 0, 0]} rotation={[0, bounded(open) * 1.4, 0]}>
        <ClayBlock
          size={[width, height, 0.12]}
          position={[width / 2, height / 2, 0]}
          color={shade(S.accent, -0.2)}
          radius={0.035}
        />
        <ClayBlock
          size={[width * 0.7, height * 0.49, 0.04]}
          position={[width / 2, height * 0.62, 0.07]}
          color={shade(S.accent, -0.1)}
          radius={0.035}
        />
        <mesh position={[width - 0.16, 0.6, 0.105]}>
          <sphereGeometry args={[0.052, 12, 10]} />
          <Clay color={S.text} />
        </mesh>
        {barred && (
          <ClayBlock
            size={[width * 0.84, 0.11, 0.1]}
            position={[width / 2, height * 0.57, 0.15]}
            rotation={[0, 0, -0.35]}
            color={S.text}
            radius={0.025}
          />
        )}
      </group>
    </group>
  );
}

function Facade({ color, doorOpen }: { color: string; doorOpen: number }): React.ReactElement {
  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={side}>
          <ClayBlock size={[1.16, 0.35, 0.18]} position={[side * 1.01, 0.18, 0]} color={color} />
          <ClayBlock size={[1.16, 0.3, 0.18]} position={[side * 1.01, 1.5, 0]} color={color} />
          <ClayBlock size={[0.16, 1.63, 0.2]} position={[side * 1.53, 0.82, 0]} color={color} />
          <ClayBlock size={[0.19, 1.63, 0.2]} position={[side * 0.45, 0.82, 0]} color={color} />
          <group position={[side * 1.0, 0.85, 0.015]}>
            <WindowModel />
          </group>
        </group>
      ))}
      <ClayBlock size={[0.74, 0.27, 0.18]} position={[0, 1.51, 0]} color={color} />
      <HouseDoor open={doorOpen} />
    </group>
  );
}

function RoofAssembly({ color }: { color: string }): React.ReactElement {
  const S = useStage();
  const gable = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(-1.59, 0.48);
    shape.lineTo(1.59, 0.48);
    shape.lineTo(0, 1.36);
    shape.closePath();
    const geometry = new ExtrudeGeometry(shape, {
      depth: 0.12,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.025,
      bevelThickness: 0.025,
    });
    geometry.translate(0, 0, -0.06);
    return geometry;
  }, []);
  useEffect(() => () => gable.dispose(), [gable]);
  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh geometry={gable} position={[0, 0, side * 1.19]}>
            <Clay color={S.text} />
          </mesh>
          <ClayBlock
            size={[2.02, 0.16, 2.8]}
            position={[side * 0.85, 0.99, 0]}
            rotation={[0, 0, -side * 0.51]}
            color={color}
            radius={0.06}
          />
          {/* Raised standing seams give the miniature a roof, not a triangle icon. */}
          {[-0.92, -0.3, 0.32, 0.94].map((z) => (
            <ClayBlock
              key={z}
              size={[2.01, 0.035, 0.035]}
              position={[side * 0.85, 1.085, z]}
              rotation={[0, 0, -side * 0.51]}
              color={shade(color, 0.12)}
              radius={0.014}
            />
          ))}
          <ClayBlock
            size={[0.13, 0.17, 2.81]}
            position={[side * 1.73, 0.53, 0]}
            color={shade(color, -0.12)}
            radius={0.04}
          />
        </group>
      ))}
      <mesh position={[0, 1.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 2.84, 18]} />
        <Clay color={shade(color, 0.12)} />
      </mesh>
      <ClayBlock
        size={[0.37, 0.62, 0.4]}
        position={[-0.82, 1.17, -0.55]}
        color={shade(S.text, -0.16)}
        radius={0.04}
      />
      <ClayBlock
        size={[0.45, 0.12, 0.48]}
        position={[-0.82, 1.5, -0.55]}
        color={S.text}
        radius={0.035}
      />
    </group>
  );
}

export function HouseModel({
  build = 1,
  open = 0,
  roofLift = 0,
  doorOpen = 0,
  rooms = true,
  beam = true,
  partitionOffset = 0,
  finish = 0,
  roofColor,
  serviceOpen = 0,
}: HouseModelProps = {}): React.ReactElement {
  const S = useStage();
  const foundation = bounded(build * 3);
  const walls = bounded(build * 3 - 1);
  const roof = bounded(build * 3 - 2);
  const partition = Math.max(
    -0.65,
    Math.min(0.65, Number.isFinite(partitionOffset) ? partitionOffset : 0),
  );
  const wallColor = new Color(shade(S.text, -0.15))
    .lerp(new Color(S.text), bounded(finish))
    .getStyle();
  return (
    <group>
      {foundation > 0 && (
        <group position={[0, -1.4, 0]} scale={[1, foundation, 1]}>
          <ClayBlock
            size={[3.6, 0.23, 2.7]}
            position={[0, 0.115, 0]}
            color={shade(S.card, 0.22)}
            radius={0.09}
          />
          <ClayBlock
            size={[3.28, 0.045, 2.41]}
            position={[0, 0.245, 0]}
            color={shade(S.text, -0.22)}
            radius={0.025}
          />
          {/* Mortar joints in the visible foundation, not numerical scale marks. */}
          {[-1.2, -0.4, 0.4, 1.2].map((x) => (
            <ClayBlock
              key={x}
              size={[0.025, 0.13, 0.013]}
              position={[x, 0.1, 1.353]}
              color={S.card}
              radius={0.005}
            />
          ))}
        </group>
      )}
      {walls > 0 && (
        <group position={[0, -1.16, 0]} scale={[1, walls, 1]}>
          <ClayBlock size={[3.2, 1.64, 0.18]} position={[0, 0.82, -1.16]} color={wallColor} />
          {[-1, 1].map((side) => (
            <group key={side}>
              <ClayBlock
                size={[0.18, 1.64, 2.33]}
                position={[side * 1.53, 0.82, 0]}
                color={wallColor}
              />
              <group position={[side * 1.635, 0.84, -0.42]} rotation={[0, (side * Math.PI) / 2, 0]}>
                <WindowModel width={0.66} />
              </group>
            </group>
          ))}
          <group position={[0, 0, 1.19]} rotation={[(bounded(open) * Math.PI) / 2, 0, 0]}>
            <Facade color={wallColor} doorOpen={doorOpen} />
          </group>
          {rooms && (
            <group>
              <ClayBlock
                size={[1.36, 0.035, 2.07]}
                position={[-0.78, 0.022, 0]}
                color={shade(S.accent, 0.25)}
                radius={0.035}
              />
              <ClayBlock
                size={[1.32, 0.035, 2.07]}
                position={[0.78, 0.023, 0]}
                color={shade(S.text, -0.08)}
                radius={0.035}
              />
              <ClayBlock
                size={[0.1, 1.15, 1.65]}
                position={[0.15 + partition, 0.575, -0.25]}
                color={wallColor}
                radius={0.035}
              />
              <ClayBlock
                size={[1.27, 0.9, 0.1]}
                position={[-0.82, 0.45, -0.3]}
                color={wallColor}
                radius={0.035}
              />
              <ClayBlock
                size={[0.11, 0.11, 1.66]}
                position={[0.15 + partition, 1.155, -0.25]}
                color={S.text}
                radius={0.03}
              />
            </group>
          )}
          {beam && (
            <ClayBlock
              size={[2.85, 0.16, 0.18]}
              position={[0, 1.44, 0]}
              color={shade(S.accent, -0.26)}
              radius={0.03}
            />
          )}
          {/* Hinged service cabinet with an actual valve exposed behind the cover. */}
          <group position={[1.67, 0.76, 0.56]} rotation={[0, Math.PI / 2, 0]}>
            <ClayBlock size={[0.5, 0.66, 0.1]} color={shade(S.card, 0.15)} radius={0.045} />
            <mesh position={[0, 0, 0.08]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.075, 0.075, 0.18, 12]} />
              <Clay color={S.accent} />
            </mesh>
            <mesh position={[0, 0, 0.19]}>
              <torusGeometry args={[0.13, 0.028, 8, 20]} />
              <Clay color={S.text} />
            </mesh>
            <ClayBlock
              size={[0.025, 0.25, 0.025]}
              position={[0, 0, 0.19]}
              color={S.text}
              radius={0.01}
            />
            <group position={[-0.25, 0, 0.08]} rotation={[0, -bounded(serviceOpen) * 1.85, 0]}>
              <ClayBlock
                size={[0.51, 0.67, 0.07]}
                position={[0.25, 0, 0]}
                color={wallColor}
                radius={0.035}
              />
              <ClayBlock
                size={[0.035, 0.13, 0.035]}
                position={[0.43, 0, 0.06]}
                color={S.accent}
                radius={0.014}
              />
            </group>
          </group>
        </group>
      )}
      {roof > 0 && (
        <group
          position={[0, bounded(roofLift) * 0.95 + (1 - roof) * 1.1, 0]}
          scale={[1, Math.max(0.001, roof), 1]}
        >
          <RoofAssembly color={roofColor ?? S.accent} />
        </group>
      )}
    </group>
  );
}
