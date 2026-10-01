import type React from 'react';
import { ClayBlock, ExplanationStage } from '../../explanation-kit';
import { useSceneTime, useStage } from '../../stage';
import { Conveyor, Correspondence, Customer, CustomerMarket, CustomerSegment } from './assemblies';
import { DataCenter, Rack, ServerTray, TrackedChip } from './models';
import { futuresPose, mix, scalePose, twinPose } from './poses';
import type {
  DigitalTwinScene,
  PerspectiveScene,
  PossibleFuturesScene,
  ScaleHierarchyScene,
} from './types';

function Note({
  children,
  top = 214,
}: {
  children: React.ReactNode;
  top?: number;
}): React.ReactElement {
  const S = useStage();
  return (
    <div
      style={{
        position: 'absolute',
        left: 100,
        top,
        width: 880,
        color: S.muted,
        fontFamily: S.font,
        fontSize: 26,
        lineHeight: 1.15,
        textAlign: 'center',
        overflowWrap: 'anywhere',
      }}
    >
      {children}
    </div>
  );
}

function ScaleView({ scene }: { scene: ScaleHierarchyScene }): React.ReactElement {
  const { t } = useSceneTime();
  const p = scalePose(scene, t);
  const chip = scene.preset === 'chip-to-center';
  const labels = [scene.subject, ...scene.levels.slice(0, p.level + 1).map((level) => level.label)];
  return (
    <>
      <ExplanationStage scene={scene} camera={p.camera} labels={labels} labelRows={4}>
        <group name={p.trackedId} position={p.trackedPosition}>
          {chip ? <TrackedChip /> : <Customer tracked />}
        </group>
        {chip ? (
          <>
            {p.server > 0 && (
              <group scale={p.server}>
                <ServerTray />
              </group>
            )}
            {p.rack > 0 && (
              <group scale={p.rack}>
                <Rack openBay />
              </group>
            )}
            {p.center > 0 && (
              <group scale={p.center}>
                <DataCenter />
              </group>
            )}
          </>
        ) : (
          <>
            {p.segment > 0 && (
              <group scale={p.segment}>
                <CustomerSegment />
              </group>
            )}
            {p.market > 0 && (
              <group scale={p.market}>
                <CustomerMarket />
              </group>
            )}
          </>
        )}
      </ExplanationStage>
      <Note>Illustrative scale · the ring tracks the original</Note>
    </>
  );
}

function FuturesView({ scene }: { scene: PossibleFuturesScene }): React.ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const p = futuresPose(scene, t);
  return (
    <>
      <ExplanationStage scene={scene} camera={p.camera} labels={[scene.subject]}>
        <group name={p.present.id} position={p.present.position} scale={p.present.scale}>
          <ClayBlock size={[2.75, 0.1, 1.3]} position={[0, -1.03, 0]} color={S.clay[1]} />
          <Conveyor gate={p.present.gate} />
        </group>
        {p.alternatives.map((a) => (
          <group key={a.id}>
            {a.scale > 0 && (
              <>
                <Correspondence
                  from={[0, -0.7, 0.7]}
                  to={[a.position[0], -0.7, a.position[2]]}
                  radius={a.pathWidth}
                />
                <group name={a.id} position={a.position} scale={a.scale}>
                  <ClayBlock size={[2.75, 0.1, 1.3]} position={[0, -1.03, 0]} color={S.clay[0]} />
                  <Conveyor gate={a.gate} model />
                  {/* Open corner marks distinguish hypothetical models, independent of color. */}
                  {[-1, 1].map((side) => (
                    <ClayBlock
                      key={side}
                      size={[0.22, 0.05, 0.22]}
                      position={[side * 1.25, -0.93, 0.5]}
                      color={S.paper}
                    />
                  ))}
                </group>
              </>
            )}
          </group>
        ))}
        {p.range > 0 && (
          <group>
            <Correspondence
              from={[-1.8 * p.range, -0.82, -1.35]}
              to={[1.8 * p.range, -0.82, -1.35]}
            />
            {[-1, 1].map((side) => (
              <Correspondence
                key={side}
                from={[side * 1.8 * p.range, -0.82, -1.35]}
                to={[side * 1.8 * p.range, -0.82, -1.08]}
              />
            ))}
          </group>
        )}
      </ExplanationStage>
      <Note>{scene.uncertainty} · qualitative illustration</Note>
      <div
        style={{
          position: 'absolute',
          left: 80,
          top: 686,
          width: 920,
          display: 'flex',
          gap: 24,
          color: S.text,
          fontFamily: S.font,
          fontSize: 24,
          lineHeight: 1.15,
          textAlign: 'center',
        }}
      >
        {scene.alternatives.map((a) => (
          <div key={a.id} style={{ flex: 1, overflowWrap: 'anywhere', opacity: p.diverge }}>
            <strong>{a.label}</strong>
            <div style={{ color: S.muted }}>{a.qualifier}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function TwinView({ scene }: { scene: DigitalTwinScene }): React.ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const p = twinPose(scene, t);
  return (
    <>
      <ExplanationStage
        scene={scene}
        camera={p.camera}
        labels={[scene.physical.label, scene.model.label]}
      >
        <group name={p.physical.id} position={p.physical.position}>
          <ClayBlock size={[2.72, 0.12, 1.45]} position={[0, -1.04, 0]} color={S.clay[1]} />
          <Conveyor gate={p.physical.gate} parcelX={p.physical.parcelX} />
        </group>
        {p.copied > 0 && (
          <group name={p.model.id} position={p.model.position} scale={p.copied}>
            {/* A separate chamfered model stand and corner marks; never holographic glass. */}
            <ClayBlock size={[2.72, 0.18, 1.45]} position={[0, -1.04, 0]} color={S.clay[0]} />
            <Conveyor gate={p.model.gate} parcelX={p.model.parcelX} model />
            {[-1, 1].flatMap((x) =>
              [-1, 1].map((z) => (
                <ClayBlock
                  key={`${x}-${z}`}
                  size={[0.22, 0.04, 0.22]}
                  position={[x * 1.19, -0.92, z * 0.55]}
                  color={S.paper}
                />
              )),
            )}
          </group>
        )}
        {p.connector > 0 && (
          <>
            <Correspondence
              from={[-0.45, -0.65, 0]}
              to={[mix(-0.45, 0.45, p.connector), -0.65, 0]}
            />
            {/* Two corresponding physical marks join the same gate, not an effect cloud. */}
            {[-1, 1].map((side) => (
              <ClayBlock
                key={side}
                size={[0.1, 0.1, 0.1]}
                position={[side * 0.37, -0.65, 0]}
                color={S.clay[2]}
              />
            ))}
          </>
        )}
      </ExplanationStage>
      <Note>{scene.qualifier}</Note>
      <div
        style={{
          position: 'absolute',
          top: 712,
          left: 80,
          width: 920,
          display: 'flex',
          gap: 40,
          fontFamily: S.font,
          fontSize: 26,
          color: S.muted,
          textAlign: 'center',
        }}
      >
        <span style={{ flex: 1 }}>Physical · {scene.physicalState}</span>
        <span style={{ flex: 1 }}>
          {scene.preset === 'simulated-change' ? 'Simulation only' : 'Illustrative mirror'} ·{' '}
          {t < scene.resolveAt
            ? scene.physicalState
            : (scene.simulatedState ?? scene.physicalState)}
        </span>
      </div>
    </>
  );
}

export function PerspectiveSceneView({ scene }: { scene: PerspectiveScene }): React.ReactElement {
  switch (scene.kind) {
    case 'scale-hierarchy':
      return <ScaleView scene={scene} />;
    case 'possible-futures':
      return <FuturesView scene={scene} />;
    case 'digital-twin':
      return <TwinView scene={scene} />;
  }
}
