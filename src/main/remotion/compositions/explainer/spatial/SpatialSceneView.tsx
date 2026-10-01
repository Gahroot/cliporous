import type React from 'react';
import { ClayBlock, type ClayPoint, ExplanationStage } from '../explanation-kit';
import { Clay } from '../hero-kit';
import { shade, useSceneTime, useStage } from '../stage';
import { HouseDoor, HouseModel } from './HouseModel';
import {
  Blueprint,
  CoinModel,
  FurnitureModel,
  furnitureForLabel,
  KeyModel,
  Occupant,
  Padlock,
  PaintRoller,
  ParkBench,
  SolidRoute,
  StreetLamp,
  TreeModel,
  WrenchModel,
} from './parts';
import { spatialPose } from './poses';
import type { SpatialScene } from './types';

const UTILITY_ROUTES: readonly (readonly ClayPoint[])[] = [
  [
    [-1.22, -0.92, -0.88],
    [-1.22, -0.92, 0.78],
    [0.88, -0.92, 0.78],
    [0.88, -0.26, 0.78],
  ],
  [
    [-1.12, 0.02, -0.91],
    [-1.12, 0.12, -0.91],
    [1.28, 0.12, -0.91],
    [1.28, -0.65, 0.61],
  ],
  [
    [0.8, -0.99, -0.82],
    [0.8, -0.99, 0.43],
    [-0.65, -0.99, 0.43],
    [-0.65, -0.28, 0.43],
  ],
];
const INCOME_ROUTE: readonly ClayPoint[] = [
  [-3.05, -1.16, 1.65],
  [-1.4, -1.16, 1.65],
];
const EXPENSE_ROUTE: readonly ClayPoint[] = [
  [1.4, -1.16, 1.65],
  [3.05, -1.16, 1.65],
];

function sourceLabels(scene: SpatialScene): readonly string[] {
  switch (scene.kind) {
    case 'house-cutaway':
      return scene.parts;
    case 'house-build':
      return [scene.planLabel, scene.subject];
    case 'house-renovation':
      return [scene.subject, scene.partLabel];
    case 'property-access':
      return [scene.allowedLabel, scene.restrictedLabel];
    case 'neighborhood':
      return scene.contextLabels;
    case 'floorplan-fit':
      return scene.items;
    case 'house-options':
      return scene.options;
    case 'property-lifecycle':
      return scene.stageLabels;
  }
}

/** Utility endpoints are physical fixtures: tank, switchboard and radiator. */
function Utilities({ reveal, count }: { reveal: number; count: number }): React.ReactElement {
  const S = useStage();
  return (
    <group>
      {UTILITY_ROUTES.slice(0, count).map((points, i) => (
        <SolidRoute
          key={points[0].join(':')}
          points={points}
          progress={reveal}
          color={i === 1 ? S.text : shade(S.accent, i === 2 ? -0.25 : 0.12)}
          radius={i === 1 ? 0.024 : 0.045}
        />
      ))}
      <group position={[-1.2, -0.79, -0.8]}>
        <mesh>
          <cylinderGeometry args={[0.19, 0.19, 0.58, 20]} />
          <Clay color={S.text} />
        </mesh>
        <mesh position={[0, 0.1, 0.19]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.065, 0.065, 0.035, 16]} />
          <Clay color={S.accent} />
        </mesh>
        <ClayBlock size={[0.28, 0.07, 0.29]} position={[0, -0.31, 0]} color={shade(S.card, 0.2)} />
      </group>
      <group position={[-0.95, -0.17, -1.02]}>
        <ClayBlock size={[0.48, 0.55, 0.13]} color={shade(S.text, -0.13)} />
        {[-0.12, 0.03, 0.18].map((x) => (
          <ClayBlock
            key={x}
            size={[0.065, 0.2, 0.065]}
            position={[x, 0, 0.09]}
            color={S.accent}
            radius={0.02}
          />
        ))}
      </group>
      {count > 2 && (
        <group position={[-0.65, -0.53, 0.43]}>
          {[-0.18, -0.06, 0.06, 0.18].map((x) => (
            <ClayBlock
              key={x}
              size={[0.085, 0.48, 0.13]}
              position={[x, 0, 0]}
              color={S.text}
              radius={0.04}
            />
          ))}
          <ClayBlock
            size={[0.48, 0.055, 0.075]}
            position={[0, -0.16, 0]}
            color={S.text}
            radius={0.02}
          />
        </group>
      )}
    </group>
  );
}

/** An open-topped real room; furniture never passes through its enclosing walls. */
function FloorRoom(): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ClayBlock
        size={[4.6, 0.23, 4.6]}
        position={[0, -1.285, 0]}
        color={shade(S.card, 0.24)}
        radius={0.09}
      />
      <ClayBlock
        size={[4.38, 0.045, 4.38]}
        position={[0, -1.145, 0]}
        color={shade(S.text, -0.16)}
        radius={0.035}
      />
      <ClayBlock size={[4.5, 1.2, 0.13]} position={[0, -0.55, -2.2]} color={S.text} />
      <ClayBlock size={[0.13, 1.2, 4.37]} position={[-2.2, -0.55, 0]} color={S.text} />
      <ClayBlock size={[0.13, 0.3, 4.37]} position={[2.2, -1, 0]} color={S.text} radius={0.04} />
      <ClayBlock
        size={[4.5, 0.15, 0.13]}
        position={[0, -1.075, 2.2]}
        color={S.text}
        radius={0.035}
      />
      <ClayBlock
        size={[1.25, 0.64, 0.08]}
        position={[-0.75, -0.32, -2.115]}
        color={shade(S.accent, -0.25)}
      />
      <ClayBlock
        size={[0.045, 0.66, 0.055]}
        position={[-0.75, -0.32, -2.065]}
        color={S.text}
        radius={0.015}
      />
      <ClayBlock
        size={[1.27, 0.045, 0.055]}
        position={[-0.75, -0.32, -2.065]}
        color={S.text}
        radius={0.015}
      />
    </group>
  );
}

function Street({ width = 6.4 }: { width?: number }): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ClayBlock
        size={[width, 0.075, 0.75]}
        position={[0, -1.33, 1.53]}
        color={shade(S.card, 0.18)}
        radius={0.035}
      />
      <ClayBlock
        size={[width, 0.12, 0.12]}
        position={[0, -1.29, 1.1]}
        color={shade(S.text, -0.16)}
        radius={0.025}
      />
      {[-2.1, -0.7, 0.7, 2.1].map((x) => (
        <ClayBlock
          key={x}
          size={[0.45, 0.01, 0.035]}
          position={[x, -1.285, 1.54]}
          color={S.text}
          radius={0.005}
        />
      ))}
    </group>
  );
}

function SpatialBody({ scene, time }: { scene: SpatialScene; time: number }): React.ReactElement {
  const S = useStage();
  switch (scene.kind) {
    case 'house-cutaway': {
      const p = spatialPose(scene, time);
      return (
        <group scale={0.84} position={[0, -0.224, -0.25]}>
          <HouseModel
            open={p.frontOpen}
            roofLift={p.roofLift}
            beam={scene.preset !== 'utilities'}
          />
          {scene.preset === 'utilities' ? (
            <Utilities reveal={p.utilityReveal} count={Math.min(3, scene.parts.length)} />
          ) : (
            <>
              <group position={[-0.8, -1.13, -0.73]} scale={0.49}>
                <FurnitureModel kind="bed" />
              </group>
              <group position={[-0.8, -1.13, 0.56]} scale={0.52}>
                <FurnitureModel kind="sofa" />
              </group>
              <group position={[0.84, -1.13, -0.3]} scale={0.57}>
                <FurnitureModel kind="table" />
              </group>
            </>
          )}
        </group>
      );
    }
    case 'house-build': {
      const p = spatialPose(scene, time);
      return (
        <group>
          <group position={[0.6, -0.336, -0.1]} scale={0.76}>
            <HouseModel
              build={p.build}
              open={p.frontOpen}
              roofLift={p.roofLift}
              partitionOffset={p.partitionOffset}
            />
            {scene.preset === 'plan-mismatch' && (
              <ClayBlock
                size={[0.035, 0.02, 1.66]}
                position={[0.15, -1.105, -0.25]}
                color={S.accent}
                radius={0.009}
              />
            )}
          </group>
          <group
            position={[-2.05, -1.35, 0.3]}
            scale={[1, Math.max(0.001, p.planReveal), 1]}
            rotation={[0, -0.15, 0]}
          >
            <Blueprint />
          </group>
        </group>
      );
    }
    case 'house-renovation': {
      const p = spatialPose(scene, time);
      const structural = scene.preset === 'structural';
      return (
        <group scale={structural ? 0.66 : 0.9} position={[0, structural ? -0.476 : -0.14, -0.1]}>
          <HouseModel
            open={p.frontOpen}
            roofLift={p.roofLift}
            finish={p.finish}
            beam={!structural}
          />
          {structural ? (
            <>
              <ClayBlock
                size={[2.85, 0.16, 0.18]}
                position={p.oldBeam}
                color={shade(S.text, -0.28)}
                radius={0.035}
              />
              {p.replacementVisible && (
                <ClayBlock
                  size={[2.85, 0.16, 0.18]}
                  position={p.newBeam}
                  color={S.accent}
                  radius={0.035}
                />
              )}
              {/* Support stays in place throughout replacement; no unsupported floating roof. */}
              {[-1.31, 1.31].map((x) => (
                <ClayBlock
                  key={x}
                  size={[0.12, 1.45, 0.14]}
                  position={[x, -0.415, 0]}
                  color={shade(S.text, -0.2)}
                  radius={0.025}
                />
              ))}
              {[-4.35, -2.55].map((x) => (
                <ClayBlock
                  key={x}
                  size={[0.16, 0.31, 0.7]}
                  position={[x, -1.23, 0]}
                  color={S.text}
                  radius={0.035}
                />
              ))}
            </>
          ) : (
            <group position={p.roller}>
              <PaintRoller turn={p.rollerTurn} />
            </group>
          )}
        </group>
      );
    }
    case 'property-access': {
      const p = spatialPose(scene, time);
      return (
        <group scale={0.84} position={[0, -0.224, -0.25]}>
          <HouseModel open={1} roofLift={0.95} beam={false} rooms={false} />
          <ClayBlock
            size={[0.12, 1.36, 2.1]}
            position={[0.08, -0.48, -0.07]}
            color={S.text}
            radius={0.035}
          />
          <group position={[-0.79, -1.16, 0.25]}>
            <HouseDoor width={1.12} height={1.3} open={p.allowedOpen} barred={p.revoked > 0.5} />
          </group>
          <group position={[0.83, -1.16, 0.25]}>
            <HouseDoor width={1.08} height={1.3} open={p.restrictedOpen} />
            <group position={[0.32, 0.65, 0.17]}>
              <Padlock />
            </group>
          </group>
          <group position={p.key} rotation={[0, 0, p.keyTurn]}>
            <KeyModel barred={p.revoked} />
          </group>
        </group>
      );
    }
    case 'neighborhood': {
      const p = spatialPose(scene, time);
      const replicate = scene.preset === 'replicate';
      return (
        <group>
          <group scale={p.houseScale} position={[0, -1.4 * (1 - p.houseScale), -0.22]}>
            <HouseModel />
          </group>
          {replicate ? (
            <>
              {p.copies.map(
                (appear, i) =>
                  appear > 0 && (
                    <group
                      key={i === 0 ? 'west' : 'east'}
                      position={[
                        (i === 0 ? -1 : 1) * 2.22,
                        -1.4 * (1 - 0.5 * appear),
                        i === 0 ? -0.58 : 0.2,
                      ]}
                      scale={0.5 * appear}
                    >
                      <HouseModel />
                    </group>
                  ),
              )}
              <Street />
            </>
          ) : (
            <>
              {p.park > 0 && (
                <group position={[-2.05 - 0.7 * (1 - p.park), -1.38, -0.12]} scale={p.park}>
                  <ClayBlock
                    size={[1.7, 0.1, 2.35]}
                    position={[0, 0, 0]}
                    color={shade(S.accent, -0.4)}
                  />
                  <group position={[-0.3, 0.05, -0.55]}>
                    <TreeModel />
                  </group>
                  <group position={[0.15, 0.05, 0.65]} scale={0.75}>
                    <ParkBench />
                  </group>
                </group>
              )}
              {p.street > 0 && (
                <group scale={[1, p.street, 1]} position={[0, -1.4 * (1 - p.street), 0]}>
                  <Street />
                  <group position={[2.12, -1.28, 0.78]}>
                    <StreetLamp />
                  </group>
                  <group position={[-2.12, -1.28, 0.78]}>
                    <StreetLamp />
                  </group>
                </group>
              )}
            </>
          )}
        </group>
      );
    }
    case 'floorplan-fit': {
      const p = spatialPose(scene, time);
      return (
        <group scale={0.86} position={[0, -0.196, 0]}>
          <FloorRoom />
          {p.furniture.map((item, i) => (
            <group
              key={['first', 'second', 'third'][i]}
              position={item.position}
              rotation={[0, item.yaw, 0]}
              scale={0.62}
            >
              <FurnitureModel kind={furnitureForLabel(scene.items[i] ?? '')} />
            </group>
          ))}
        </group>
      );
    }
    case 'house-options': {
      const p = spatialPose(scene, time);
      return (
        <group>
          <group position={[-p.separation, -0.546, 0]} scale={0.61}>
            <HouseModel open={p.leftOpen} roofLift={p.leftRoof} roofColor={shade(S.accent, 0.22)} />
          </group>
          <group position={[p.separation, -0.546, 0]} scale={0.61}>
            <HouseModel
              open={p.rightOpen}
              roofLift={p.rightRoof}
              roofColor={shade(S.accent, -0.22)}
            />
          </group>
        </group>
      );
    }
    case 'property-lifecycle': {
      const p = spatialPose(scene, time);
      const occupancy = scene.preset === 'occupancy';
      const maintenance = scene.preset === 'maintenance';
      return (
        <group scale={0.84} position={[0, -0.224, -0.25]}>
          <HouseModel doorOpen={p.doorOpen} serviceOpen={p.serviceOpen} />
          {occupancy && (
            <>
              <group position={p.outgoing}>
                <Occupant />
              </group>
              <group position={p.incoming} rotation={[0, Math.PI, 0]}>
                <Occupant variant />
              </group>
              <ClayBlock
                size={[0.88, 0.045, 1.11]}
                position={[0, -1.185, 1.81]}
                color={shade(S.text, -0.3)}
                radius={0.035}
              />
            </>
          )}
          {maintenance && (
            <group position={p.wrench} rotation={[0, Math.PI / 2, p.wrenchTurn]}>
              <WrenchModel />
            </group>
          )}
          {scene.preset === 'cash-flow' && (
            <>
              <SolidRoute points={INCOME_ROUTE} color={S.accent} radius={0.025} />
              <SolidRoute points={EXPENSE_ROUTE} color={S.text} radius={0.025} />
              {/* Equal, unnumbered markers on separate routes; no total/net/profit claim. */}
              <group position={p.income}>
                <CoinModel />
              </group>
              <group position={p.expense}>
                <CoinModel />
              </group>
              {[-1.38, 3.07].map((x) => (
                <mesh key={x} position={[x, -1.16, 1.65]} rotation={[0, 0, -Math.PI / 2]}>
                  <coneGeometry args={[0.085, 0.2, 16]} />
                  <Clay color={x < 0 ? S.accent : S.text} />
                </mesh>
              ))}
            </>
          )}
        </group>
      );
    }
  }
}

/** One shared WebGL stage. All text is the frozen, source-backed story payload. */
export function SpatialSceneView({ scene }: { scene: SpatialScene }): React.ReactElement {
  const { t } = useSceneTime();
  return (
    <ExplanationStage scene={scene} labels={sourceLabels(scene)}>
      <SpatialBody scene={scene} time={t} />
    </ExplanationStage>
  );
}
