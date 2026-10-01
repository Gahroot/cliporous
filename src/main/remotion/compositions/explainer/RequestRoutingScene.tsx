import type React from 'react';
import { Clay } from './hero-kit';
import { SignalWire } from './mechanisms/composed-rigs';
import { MechanismStage } from './mechanisms/MechanismStage';
import { mixHex } from './palette';
import { useSceneTime, useStage } from './stage';
import { CheckSeal, ClayPart, StopSeal } from './technology/clay';
import { revealAt, type TechnologyPoint } from './technology/motion';
import { Outcome, TechText } from './technology/primitives';
import {
  type RequestRoutingPose,
  ROUTING_POINTS,
  requestRoutingPose,
} from './technology/request-routing';
import {
  ROUTING_LABEL_ANCHORS,
  requestRoutingCamera,
  routingPointToWorld,
  routingRequestLabelPosition,
} from './technology/routing-camera';
import type { RequestRoutingScene as Scene } from './technology/types';
import { type CameraSpec, projectToStage } from './three-helpers';

type Point = [number, number, number];

/** A low mechanical selector behind the junction, never in the travelling paper's way. */
function Switchboard({ turn }: { turn: number }): React.ReactElement {
  const S = useStage();
  return (
    <group position={[-0.05, 0, -1.55]}>
      <ClayPart size={[1.15, 0.25, 0.7]} position={[0, -0.71, 0]} color={S.clay[2]} />
      <ClayPart
        size={[0.92, 0.52, 0.48]}
        position={[0, -0.35, -0.03]}
        color={mixHex(S.clay[0], S.bgOuter, 0.22)}
        radius={0.12}
      />
      <mesh position={[0, -0.04, 0.03]}>
        <cylinderGeometry args={[0.29, 0.29, 0.1, 32]} />
        <Clay color={S.clay[1]} />
      </mesh>
      <group position={[0, 0.05, 0.03]} rotation={[0, -0.65 + turn * 1.3, 0]}>
        <ClayPart size={[0.49, 0.12, 0.13]} color={S.accent} radius={0.055} />
        <mesh position={[0.19, 0.11, 0]}>
          <sphereGeometry args={[0.12, 20, 14]} />
          <Clay color={S.clay[0]} />
        </mesh>
      </group>
      {[-0.34, 0.34].map((x) => (
        <mesh key={x} position={[x, -0.4, 0.24]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.065, 0.025, 10, 20]} />
          <Clay color={S.clay[1]} />
        </mesh>
      ))}
    </group>
  );
}

/** An open two-tier shelf: the retained response is separate from the one travelling request. */
function CacheShelf({
  pose,
  conditional,
}: {
  pose: RequestRoutingPose;
  conditional: boolean;
}): React.ReactElement {
  const S = useStage();
  const [x, , z] = routingPointToWorld(ROUTING_POINTS.cache);
  return (
    <group position={[x, pose.cacheOffset / 125, z]}>
      <ClayPart size={[1.92, 0.18, 1.38]} position={[0, -0.77, -0.1]} color={S.clay[2]} />
      <ClayPart
        size={[1.78, 0.78, 0.18]}
        position={[0, -0.18, -0.65]}
        color={mixHex(S.clay[2], S.bgOuter, 0.18)}
      />
      {[-0.8, 0.8].map((side) => (
        <ClayPart
          key={side}
          size={[0.16, 0.98, 0.36]}
          position={[side, -0.21, -0.54]}
          color={S.clay[0]}
        />
      ))}
      <ClayPart size={[1.9, 0.14, 0.86]} position={[0, 0.1, -0.28]} color={S.clay[0]} />
      <ClayPart
        size={[1.4, 0.065, 0.075]}
        position={[0, 0.2, 0.11]}
        color={S.accent}
        radius={0.025}
      />
      <group position={[0, 0.23, -0.32]} scale={pose.cacheContent}>
        <ClayPart size={[1.06, 0.1, 0.52]} color={S.clay[1]} radius={0.045} />
        <ClayPart
          size={[0.12, 0.028, 0.4]}
          position={[-0.35, 0.068, 0]}
          color={S.accent}
          radius={0.014}
        />
        <ClayPart
          size={[0.48, 0.025, 0.045]}
          position={[0.11, 0.068, -0.06]}
          color={S.clay[2]}
          radius={0.014}
        />
      </group>
      {!conditional &&
        (pose.cacheState === 'Match' ||
          (pose.cacheState === 'Stored' && pose.cacheContent === 1)) && (
          <CheckSeal position={[0.74, 0.4, -0.09]} scale={0.72} />
        )}
    </group>
  );
}

/** Backend rack and low alternate socket share an open ingress, not a wall the request crosses. */
function ServiceDock({
  point,
  offset,
  state,
  conditional,
  alternate = false,
}: {
  point: TechnologyPoint;
  offset: number;
  state: RequestRoutingPose['primaryState'] | RequestRoutingPose['fallbackState'];
  conditional: boolean;
  alternate?: boolean;
}): React.ReactElement {
  const S = useStage();
  const [x, , z] = routingPointToWorld(point);
  const shell = mixHex(S.clay[0], S.bgOuter, alternate ? 0.28 : 0.16);
  return (
    <group position={[x, offset / 125, z]}>
      <ClayPart size={[1.92, 0.18, 1.38]} position={[0, -0.77, -0.1]} color={S.clay[2]} />
      {alternate ? (
        <>
          {/* Low, open fork leaves the stopped request at the rear primary fully visible. */}
          {[-0.77, 0.77].map((side) => (
            <ClayPart
              key={side}
              size={[0.27, 0.44, 0.85]}
              position={[side, -0.43, -0.16]}
              color={shell}
              radius={0.11}
            />
          ))}
          <ClayPart size={[1.6, 0.2, 0.28]} position={[0, -0.6, -0.65]} color={shell} />
        </>
      ) : (
        <>
          <ClayPart
            size={[1.72, 1.08, 0.3]}
            position={[0, -0.03, -0.65]}
            color={shell}
            radius={0.12}
          />
          {[-0.2, 0.15].map((y) => (
            <group key={y} position={[0, y, -0.37]}>
              <ClayPart size={[1.32, 0.25, 0.31]} color={S.clay[2]} radius={0.065} />
              <ClayPart
                size={[0.92, 0.055, 0.04]}
                position={[0, 0, 0.17]}
                color={mixHex(S.clay[2], S.bgOuter, 0.5)}
                radius={0.02}
              />
            </group>
          ))}
        </>
      )}
      <ClayPart
        size={[1.45, 0.055, 0.075]}
        position={[0, -0.65, 0.45]}
        color={state === 'Receiving' ? S.accent : S.clay[1]}
        radius={0.025}
      />
      {state === 'Timed out' && <StopSeal position={[0.72, 0.56, -0.28]} />}
      {state === 'Responded' && !conditional && (
        <CheckSeal position={[0.78, alternate ? -0.13 : 0.56, -0.22]} scale={0.72} />
      )}
    </group>
  );
}

/** Recognizable envelope on a small rail sled, with a response tab attached only after a reply. */
function RequestSled({ pose }: { pose: RequestRoutingPose }): React.ReactElement {
  const S = useStage();
  return (
    <group position={routingPointToWorld(pose.request)} scale={pose.requestOpacity}>
      <ClayPart size={[1.17, 0.11, 0.74]} position={[0, -0.1, 0]} color={S.clay[2]} />
      <ClayPart
        size={[0.25, 0.085, 0.28]}
        position={[0, -0.19, 0]}
        color={S.clay[1]}
        radius={0.04}
      />
      <ClayPart size={[1.08, 0.07, 0.65]} color={S.paper} radius={0.045} />
      <SignalWire
        points={[
          [-0.48, 0.044, -0.27],
          [0, 0.044, 0.05],
          [0.48, 0.044, -0.27],
        ]}
        color={S.clay[2]}
        radius={0.012}
      />
      <ClayPart
        size={[0.1, 0.025, 0.44]}
        position={[-0.44, 0.051, 0.04]}
        color={S.accent}
        radius={0.015}
      />
      <group position={[0.37, 0.08, 0.24]} scale={pose.response}>
        <ClayPart size={[0.4, 0.06, 0.26]} color={S.clay[0]} radius={0.045} />
        <ClayPart
          size={[0.22, 0.024, 0.045]}
          position={[0, 0.044, 0]}
          color={S.clay[2]}
          radius={0.012}
        />
      </group>
    </group>
  );
}

function RoutingRig({
  scene,
  pose,
}: {
  scene: Scene;
  pose: RequestRoutingPose;
}): React.ReactElement {
  const S = useStage();
  const fallback = scene.preset === 'timeout-fallback';
  const rail = (point: TechnologyPoint): Point => routingPointToWorld(point, -0.71);
  const railColor = mixHex(S.clay[1], S.bgOuter, 0.23);
  return (
    <group>
      <ClayPart
        size={[7.05, 0.24, 3.85]}
        position={[-0.025, -1.03, -0.075]}
        color={mixHex(S.clay[2], S.bgOuter, 0.25)}
        radius={0.12}
      />
      <ClayPart
        size={[6.85, 0.08, 3.65]}
        position={[-0.025, -0.87, -0.075]}
        color={mixHex(S.clay[2], S.bgOuter, 0.14)}
        radius={0.035}
      />
      {/* One continuous, authored rail network; no invented traffic or decorative pulses. */}
      <SignalWire
        points={[
          rail(ROUTING_POINTS.client),
          rail(ROUTING_POINTS.lower),
          rail(ROUTING_POINTS.upper),
        ]}
        color={railColor}
        radius={0.052}
      />
      <SignalWire
        points={[rail(ROUTING_POINTS.upper), rail(ROUTING_POINTS.primary)]}
        color={pose.primaryWire > 0 ? S.accent : railColor}
        radius={0.052}
      />
      {fallback ? (
        <SignalWire
          points={[rail(ROUTING_POINTS.lower), rail(ROUTING_POINTS.alternate)]}
          color={pose.fallbackWire > 0 ? S.accent : railColor}
          radius={0.052}
        />
      ) : (
        <SignalWire
          points={[rail(ROUTING_POINTS.cache), rail(ROUTING_POINTS.upper)]}
          color={pose.lookupWire > 0 ? S.accent : railColor}
          radius={0.052}
        />
      )}
      <ClayPart
        size={[1.5, 0.1, 0.97]}
        position={[-2.55, -0.77, 1.01]}
        color={S.clay[2]}
        radius={0.06}
      />
      <Switchboard turn={pose.switchTurn} />
      {!fallback && <CacheShelf pose={pose} conditional={Boolean(scene.condition)} />}
      <ServiceDock
        point={ROUTING_POINTS.primary}
        offset={pose.primaryOffset}
        state={pose.primaryState}
        conditional={Boolean(scene.condition)}
      />
      {fallback && scene.fallbackLabel && (
        <ServiceDock
          point={ROUTING_POINTS.alternate}
          offset={pose.fallbackOffset}
          state={pose.fallbackState}
          conditional={Boolean(scene.condition)}
          alternate
        />
      )}
      <RequestSled pose={pose} />
    </group>
  );
}

function ZoneLabel({
  camera,
  zone,
  label,
  state,
  opacity,
}: {
  camera: CameraSpec;
  zone: keyof typeof ROUTING_LABEL_ANCHORS;
  label: string;
  state?: string;
  opacity: number;
}): React.ReactElement {
  const S = useStage();
  const anchor = ROUTING_LABEL_ANCHORS[zone];
  const point = projectToStage(camera, anchor.point);
  return (
    <div
      style={{
        position: 'absolute',
        left: point.x - anchor.width / 2,
        top: point.y - (zone === 'alternate' ? 0 : 54),
        width: anchor.width,
        boxSizing: 'border-box',
        padding: '8px 10px',
        borderRadius: 12,
        color: S.text,
        background: S.bgOuter,
        fontFamily: S.font,
        textAlign: 'center',
        fontSize: zone === 'switchboard' ? 26 : label.length > 18 ? 24 : 30,
        fontWeight: 700,
        lineHeight: 1.14,
        overflowWrap: 'anywhere',
        opacity,
      }}
    >
      {label}
      {state && <div style={{ marginTop: 6, fontSize: 24, fontWeight: 600 }}>{state}</div>}
    </div>
  );
}

function RoutingLabels({
  scene,
  pose,
  camera,
  time,
}: {
  scene: Scene;
  pose: RequestRoutingPose;
  camera: CameraSpec;
  time: number;
}): React.ReactElement {
  const S = useStage();
  const fallback = scene.preset === 'timeout-fallback';
  const request = routingRequestLabelPosition(camera, pose.request, fallback);
  return (
    <>
      {scene.condition && (
        <TechText x={72} y={151} width={936} size={30} align="center">
          {scene.condition}
        </TechText>
      )}
      <ZoneLabel
        camera={camera}
        zone="switchboard"
        label="Switchboard"
        opacity={revealAt(time, scene.setupAt - 0.25)}
      />
      {!fallback && (
        <ZoneLabel
          camera={camera}
          zone="cache"
          label="Cache"
          state={pose.cacheState}
          opacity={revealAt(time, scene.setupAt)}
        />
      )}
      <ZoneLabel
        camera={camera}
        zone="primary"
        label={scene.serviceLabel}
        state={pose.primaryState}
        opacity={revealAt(
          time,
          fallback ? scene.setupAt : scene.preset === 'cache-hit' ? scene.checkAt : scene.actionAt,
        )}
      />
      {/* The alternate replaces the unused cache, never becoming a fourth main labelled zone. */}
      {fallback && scene.fallbackLabel && (
        <ZoneLabel
          camera={camera}
          zone="alternate"
          label={scene.fallbackLabel}
          state={pose.fallbackState}
          opacity={revealAt(time, scene.responseAt, 0.12)}
        />
      )}
      <div
        style={{
          position: 'absolute',
          left: request.x,
          top: request.y,
          width: 264,
          boxSizing: 'border-box',
          padding: '7px 10px',
          borderRadius: 10,
          background: S.bgOuter,
          color: S.text,
          fontFamily: S.font,
          fontSize: 26,
          fontWeight: 700,
          lineHeight: 1.14,
          overflowWrap: 'anywhere',
          textAlign: 'center',
          opacity: pose.requestOpacity,
        }}
      >
        {scene.subject}
        <div style={{ fontSize: 23, marginTop: 4, opacity: pose.response }}>Response</div>
      </div>
      <Outcome
        text={scene.condition ? `Possible: ${scene.outcome}` : scene.outcome}
        opacity={pose.outcome}
        status={scene.condition ? 'active' : 'passed'}
      />
    </>
  );
}

/** One clay canvas; all source-checked contacts and branches still come from the frozen pose. */
export function RequestRoutingScene({ scene }: { scene: Scene }): React.ReactElement {
  const { t } = useSceneTime();
  const pose = requestRoutingPose(scene, t);
  const camera = requestRoutingCamera(scene, t);
  return (
    <MechanismStage
      title={scene.label}
      camera={camera}
      bobAmount={0}
      overlay={(sampled) => <RoutingLabels scene={scene} pose={pose} camera={sampled} time={t} />}
    >
      <RoutingRig scene={scene} pose={pose} />
    </MechanismStage>
  );
}
