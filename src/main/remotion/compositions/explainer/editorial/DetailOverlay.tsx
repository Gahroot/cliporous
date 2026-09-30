import { useThree } from '@react-three/fiber';
import type React from 'react';
import { type ReactNode, useLayoutEffect, useMemo, useRef } from 'react';
import { type Group, Plane } from 'three';
import { withAlpha } from '../palette';
import { useLayout, useSceneTime, useStage } from '../stage';
import type { CameraSpec } from '../three-helpers';
import { EXPLAINER_GLASS_RADIUS, EXPLAINER_STAGE_HEIGHT, EXPLAINER_STAGE_WIDTH } from '../types';
import {
  DETAIL_CLIP_SIDES,
  type DetailAnchor,
  installDetailClipping,
  sampleDetailLayout,
} from './detail-logic';
import { ease } from './motion';
import type { DetailTreatment } from './types';

export type { DetailAnchor } from './detail-logic';
export { detailFocusOpacity } from './detail-logic';

export interface DetailProps {
  detail: DetailTreatment;
  camera: CameraSpec;
  anchor: DetailAnchor;
  compact?: boolean;
}

/** DOM/SVG annotations use the SAME sampled camera/anchors as the authored geometry. */
export function DetailOverlay({
  detail,
  camera,
  anchor,
  compact = false,
}: DetailProps): React.ReactElement | null {
  const S = useStage();
  const { t } = useSceneTime();
  const { floating, safe } = useLayout();
  const stageScale = Math.min(
    safe.width / EXPLAINER_STAGE_WIDTH,
    safe.height / EXPLAINER_STAGE_HEIGHT,
  );
  const backdropClip = floating
    ? `inset(0 round ${EXPLAINER_GLASS_RADIUS / stageScale}px)`
    : undefined;
  const p = ease((t - detail.at) / 0.35);
  const layout = sampleDetailLayout(camera, anchor, compact);
  if (!layout || p === 0) return null;
  const { source, sourceRadius, inset, endpoints } = layout;
  if (detail.kind === 'measurement' && !endpoints) return null;
  const width = compact ? 350 : 320;
  const label =
    detail.kind === 'magnified-inset'
      ? { x: inset.x - width / 2, y: inset.y + inset.radius + 22 }
      : layout.label;
  const target =
    detail.kind === 'magnified-inset'
      ? { x: inset.x, y: inset.y + inset.radius }
      : { x: label.x + width / 2, y: label.y };
  const labelBox = (
    <div
      style={{
        position: 'absolute',
        left: label.x,
        top: label.y,
        width,
        minHeight: 76,
        padding: '14px 20px',
        boxSizing: 'border-box',
        borderRadius: 18,
        background: S.cardRaised,
        border: `2px solid ${S.accent}`,
        color: S.text,
        fontFamily: S.font,
        fontWeight: 650,
        fontSize: compact ? 46 : 40,
        lineHeight: 1.15,
        textAlign: 'center',
        overflowWrap: 'break-word',
      }}
    >
      {detail.label}
    </div>
  );
  return (
    <div
      data-editorial={detail.kind}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: p }}
    >
      <svg
        width={1080}
        height={960}
        viewBox="0 0 1080 960"
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0 }}
      >
        {detail.kind === 'focus-isolation' && (
          <>
            <path
              d={`M0 0H1080V960H0Z M${source.x - sourceRadius - 18} ${source.y} a${sourceRadius + 18} ${sourceRadius + 18} 0 1 0 ${2 * (sourceRadius + 18)} 0 a${sourceRadius + 18} ${sourceRadius + 18} 0 1 0 ${-2 * (sourceRadius + 18)} 0`}
              fill={withAlpha(S.bgOuter, 0.45)}
              fillRule="evenodd"
              style={{ clipPath: backdropClip }}
            />
            <circle
              cx={source.x}
              cy={source.y}
              r={sourceRadius + 18}
              fill="none"
              stroke={S.accent}
              strokeWidth={3}
            />
          </>
        )}
        {detail.kind === 'magnified-inset' && (
          <>
            <circle
              cx={source.x}
              cy={source.y}
              r={Math.min(48, sourceRadius)}
              fill="none"
              stroke={S.accent}
              strokeWidth={3}
            />
            <circle
              cx={inset.x}
              cy={inset.y}
              r={inset.radius}
              fill="none"
              stroke={S.accent}
              strokeWidth={5}
            />
            <circle
              cx={inset.x}
              cy={inset.y}
              r={inset.radius + 9}
              fill="none"
              stroke={S.cardBorder}
              strokeWidth={2}
            />
          </>
        )}
        {detail.kind === 'measurement' && endpoints
          ? (() => {
              const [a, b] = endpoints;
              const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
              const dx = -(b.y - a.y) / length;
              const dy = (b.x - a.x) / length;
              const offset = 46;
              const witnesses = [
                { id: 'start', point: a },
                { id: 'end', point: b },
              ];
              return (
                <g stroke={S.accent} strokeWidth={4} fill="none">
                  {witnesses.map(({ point, id }) => (
                    <line
                      key={`witness-${id}`}
                      x1={point.x}
                      y1={point.y}
                      x2={point.x + dx * (offset + 13)}
                      y2={point.y + dy * (offset + 13)}
                    />
                  ))}
                  <line
                    x1={a.x + dx * offset}
                    y1={a.y + dy * offset}
                    x2={a.x + dx * offset + (b.x - a.x) * p}
                    y2={a.y + dy * offset + (b.y - a.y) * p}
                  />
                  {witnesses.map(({ point, id }) => (
                    <circle
                      key={`cap-${id}`}
                      cx={point.x + dx * offset}
                      cy={point.y + dy * offset}
                      r={5}
                      fill={S.accent}
                    />
                  ))}
                </g>
              );
            })()
          : null}
        {detail.kind !== 'measurement' && (
          <>
            <path
              d={`M${source.x} ${source.y} L${target.x} ${source.y + (target.y - source.y) * 0.55} L${target.x} ${target.y}`}
              fill="none"
              stroke={S.accent}
              strokeWidth={3}
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - p}
            />
            {detail.kind === 'tracked-callout' && (
              <circle cx={source.x} cy={source.y} r={7} fill={S.accent} />
            )}
          </>
        )}
      </svg>
      {labelBox}
    </div>
  );
}

/** Keep material clones for the subtree lifetime; only plane coefficients change on frame seeks. */
function ClippedDetail({
  planes,
  children,
}: {
  planes: Plane[];
  children: ReactNode;
}): React.ReactElement {
  const group = useRef<Group>(null);
  const gl = useThree((state) => state.gl);
  const ownedPlanes = useMemo(
    () => Array.from({ length: DETAIL_CLIP_SIDES }, () => new Plane()),
    [],
  );
  useLayoutEffect(() => {
    ownedPlanes.forEach((plane, i) => {
      const sample = planes[i];
      if (sample) plane.copy(sample);
    });
  }, [ownedPlanes, planes]);
  useLayoutEffect(() => {
    if (group.current) return installDetailClipping(group.current, gl, ownedPlanes);
    return undefined;
  }, [gl, ownedPlanes]);
  return <group ref={group}>{children}</group>;
}

/** ONLY the selected origin-centred authored part goes here, inside the host's existing Stage3D. */
export function DetailInset({
  detail,
  camera,
  anchor,
  compact = false,
  children,
}: DetailProps & { children: React.ReactNode }): React.ReactElement | null {
  const S = useStage();
  const { t } = useSceneTime();
  const p = ease((t - detail.at) / 0.35);
  const layout = sampleDetailLayout(camera, anchor, compact);
  if (detail.kind !== 'magnified-inset' || !layout || p === 0) return null;
  const {
    insetWorld,
    cloneScale,
    cloneOffset,
    clippingPlanes,
    backingWorld,
    backingWorldRadius,
    facing,
  } = layout;
  return (
    <group>
      <mesh position={backingWorld} quaternion={facing}>
        <circleGeometry args={[backingWorldRadius, 64]} />
        <meshBasicMaterial color={S.cardRaised} transparent opacity={p} />
      </mesh>
      <ClippedDetail key={detail.target} planes={clippingPlanes}>
        <group position={insetWorld} scale={cloneScale * p}>
          <group position={cloneOffset}>{children}</group>
        </group>
      </ClippedDetail>
    </group>
  );
}
