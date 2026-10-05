import type React from 'react';
import { Clay } from '../../hero-kit';
import { ClayPart as Part } from '../../technology/clay';
import type {
  ExpansionKitColors,
  ExpansionKitPlacement,
  ExpansionKitPose,
  ExpansionKitState,
} from '../scene-types';
import { EXPANSION_LIMITS } from '../value-types';

export type AuthoredPoint = readonly [number, number, number];
export type GeometryTemplate = 'box' | 'cylinder' | 'gadget';
export interface KitAssetProps extends ExpansionKitPlacement {
  readonly pose: ExpansionKitPose;
  readonly state: ExpansionKitState;
  readonly colors: ExpansionKitColors;
  readonly label: string;
  readonly qualifier: { readonly kind: 'source' | 'schematic'; readonly text: string };
}
export interface GeometryAssetProps extends KitAssetProps {
  readonly template: GeometryTemplate;
}
export interface GeometryInteriorPart {
  readonly id: string;
  readonly label: string;
  readonly position: AuthoredPoint;
  readonly size: AuthoredPoint;
}
export interface KitAppearance {
  readonly pose: ExpansionKitPose;
  readonly scale: number;
  readonly color: string;
  readonly position: [number, number, number];
  readonly opacity: number;
  readonly dash: string | undefined;
  readonly transform: string;
}
export interface AuthoredGeometryCamera {
  readonly position: AuthoredPoint;
  readonly target: AuthoredPoint;
}
export interface AnalyticSection {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly radius: number;
  readonly retainedHeight: number;
  readonly cutY: number;
  readonly centerY: number;
  readonly area: number;
  readonly volume: number;
}
export interface AnalyticClearance {
  readonly object: AuthoredPoint;
  readonly opening: AuthoredPoint;
  readonly gap: number;
}

// Local schematic units, NOT metres or a second copy of HouseModel. No house route.
const DIMENSIONS = {
  box: [2, 1.5, 1.2],
  cylinder: [1.5, 1.5, 1.5],
  gadget: [2.4, 1.5, 1.2],
} as const;
const INTERIORS = {
  box: [
    { id: 'box-core', label: 'core', position: [0, -0.25, 0], size: [0.9, 0.35, 0.65] },
    { id: 'box-insert', label: 'insert', position: [0, 0.18, 0], size: [0.6, 0.22, 0.5] },
  ],
  cylinder: [
    { id: 'cylinder-shaft', label: 'shaft', position: [0, -0.1, 0], size: [0.2, 1, 0.2] },
    { id: 'cylinder-core', label: 'core', position: [0, -0.34, 0], size: [0.7, 0.2, 0.7] },
  ],
  gadget: [
    { id: 'gadget-board', label: 'board', position: [0, -0.5, 0], size: [1.7, 0.12, 0.8] },
    { id: 'gadget-cell', label: 'cell', position: [-0.6, -0.22, 0], size: [0.45, 0.35, 0.55] },
    { id: 'gadget-drive', label: 'drive', position: [0.2, -0.22, 0], size: [0.65, 0.35, 0.6] },
    { id: 'gadget-port', label: 'port', position: [0.87, -0.22, 0], size: [0.18, 0.22, 0.4] },
  ],
} as const;

export function geometryDimensions(template: GeometryTemplate): AuthoredPoint {
  if (!Object.hasOwn(DIMENSIONS, template)) throw new RangeError('Unknown authored geometry');
  return [...DIMENSIONS[template]];
}
export function geometryInteriorParts(template: GeometryTemplate): readonly GeometryInteriorPart[] {
  geometryDimensions(template);
  return INTERIORS[template].map((part) => ({
    id: part.id,
    label: part.label,
    position: [...part.position] as AuthoredPoint,
    size: [...part.size] as AuthoredPoint,
  }));
}
export function boundedKitPose(pose: ExpansionKitPose): ExpansionKitPose {
  const bound = (value: number) => {
    if (!Number.isFinite(value)) throw new RangeError('Non-finite kit pose');
    return Math.max(0, Math.min(1, value));
  };
  return {
    reveal: bound(pose.reveal),
    action: bound(pose.action),
    response: bound(pose.response),
    check: bound(pose.check),
    resolve: bound(pose.resolve),
  };
}
/** Shared authored placement validation; not a raw-model coordinate ingestion API. */
export function kitAppearance(props: KitAssetProps): KitAppearance {
  const pose = boundedKitPose(props.pose);
  if (
    props.position.length !== 3 ||
    !props.position.every((v) => Number.isFinite(v) && Math.abs(v) <= 16)
  )
    throw new RangeError('Invalid authored kit placement');
  const scale = props.scale ?? 1;
  if (!Number.isFinite(scale) || scale < 0.125 || scale > 4)
    throw new RangeError('Invalid authored scale');
  if (!['retained', 'active', 'excluded', 'unknown', 'disputed'].includes(props.state))
    throw new RangeError('Invalid kit state');
  if (
    !props.label.trim() ||
    props.label.length > EXPANSION_LIMITS.actorLabel ||
    !['source', 'schematic'].includes(props.qualifier.kind) ||
    !props.qualifier.text.trim() ||
    props.qualifier.text.length > EXPANSION_LIMITS.qualifier
  )
    throw new RangeError('Explicit bounded label and source/schematic qualifier required');
  const color =
    props.state === 'active'
      ? props.colors.accent
      : props.state === 'retained'
        ? props.colors.surface
        : props.colors.muted;
  return {
    pose,
    scale,
    color,
    position: [...props.position] as [number, number, number],
    opacity: pose.reveal * (props.state === 'excluded' ? 0.3 : 1),
    dash: props.state === 'unknown' || props.state === 'disputed' ? '5 4' : undefined,
    transform: `translate(${props.position[0] * 100} ${-props.position[1] * 100}) scale(${scale})`,
  };
}

/** Fixed projection and cameras. Packs may select these, not supply cameras/functions. */
export function projectGeometryPoint(point: AuthoredPoint): readonly [number, number] {
  if (point.length !== 3 || !point.every((v) => Number.isFinite(v) && Math.abs(v) <= 16))
    throw new RangeError('Invalid authored projection point');
  const [x, y, z] = point;
  return [(x + z * 0.4) * 100, (-y + z * 0.2) * 100];
}
export function authoredGeometryCamera(template: 'front' | 'isometric'): AuthoredGeometryCamera {
  if (template !== 'front' && template !== 'isometric')
    throw new RangeError('Unknown authored camera');
  return {
    position: (template === 'front' ? [0, 0, 8] : [4, 3, 6]) as AuthoredPoint,
    target: [0, 0, 0] as AuthoredPoint,
  };
}

/** Horizontal analytic cut; retain at least 35% for a readable final hold. */
export function analyticSection(template: GeometryTemplate, action: number): AnalyticSection {
  const [width, height, depth] = geometryDimensions(template);
  const progress = boundedKitPose({ reveal: 1, action, response: 0, check: 0, resolve: 0 }).action;
  const retainedHeight = height * (1 - 0.65 * progress);
  return {
    width,
    height,
    depth,
    radius: width / 2,
    retainedHeight,
    cutY: -height / 2 + retainedHeight,
    centerY: -height / 2 + retainedHeight / 2,
    // Analytic solid section measure in schematic units, never printed as a measurement.
    area: template === 'cylinder' ? Math.PI * (width / 2) ** 2 : width * depth,
    volume: (template === 'cylinder' ? Math.PI * (width / 2) ** 2 : width * depth) * retainedHeight,
  };
}
export function analyticClearance(template: GeometryTemplate): AnalyticClearance {
  const size = geometryDimensions(template);
  return {
    object: size,
    opening: [size[0] + 0.4, size[1] + 0.4, size[2] + 0.4] as AuthoredPoint,
    gap: 0.2,
  };
}

export type CubeFaceId = 'front' | 'right' | 'left' | 'top' | 'bottom' | 'back';
export interface CubeNetFace {
  readonly id: CubeFaceId;
  readonly center: AuthoredPoint;
  readonly rotation: AuthoredPoint;
  readonly normal: AuthoredPoint;
  readonly corners: readonly AuthoredPoint[];
}
/** One unit cube / one cross net, same six identities. Back hinges on right, not on air. */
export function matchedCubeNet(unfold: number): readonly CubeNetFace[] {
  const p = boundedKitPose({ reveal: 1, action: unfold, response: 0, check: 0, resolve: 0 }).action;
  const a = ((1 - p) * Math.PI) / 2;
  const c = Math.cos(a),
    s = Math.sin(a);
  const faces: readonly [CubeFaceId, AuthoredPoint, number, number][] = [
    ['front', [0, 0, 0.5], 0, 0],
    ['right', [0.5 + c / 2, 0, 0.5 - s / 2], 0, a],
    ['left', [-0.5 - c / 2, 0, 0.5 - s / 2], 0, -a],
    ['top', [0, 0.5 + c / 2, 0.5 - s / 2], -a, 0],
    ['bottom', [0, -0.5 - c / 2, 0.5 - s / 2], a, 0],
    ['back', [0.5 + c + Math.cos(2 * a) / 2, 0, 0.5 - s - Math.sin(2 * a) / 2], 0, 2 * a],
  ];
  return faces.map(([id, center, rx, ry]) => {
    const cx = Math.cos(rx),
      sx = Math.sin(rx),
      cy = Math.cos(ry),
      sy = Math.sin(ry);
    const corners = (
      [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5],
      ] as const
    ).map(
      ([x, y]): AuthoredPoint => [
        center[0] + cy * x + sy * sx * y,
        center[1] + cx * y,
        center[2] - sy * x + cy * sx * y,
      ],
    );
    return {
      id,
      center,
      rotation: [rx, ry, 0] as AuthoredPoint,
      normal: [sy * cx, -sx, cy * cx] as AuthoredPoint,
      corners,
    };
  });
}

function Caption({ props, y }: { props: KitAssetProps; y: number }): React.ReactElement {
  return (
    <>
      <text x={0} y={y} fill={props.colors.text} textAnchor="middle" fontSize={14}>
        {props.label} · {props.state}
      </text>
      <text x={0} y={y + 20} fill={props.colors.muted} textAnchor="middle" fontSize={11}>
        {props.qualifier.kind}: {props.qualifier.text}
      </text>
    </>
  );
}

export function ScannerPlaneDiagram(props: GeometryAssetProps): React.ReactElement {
  const a = kitAppearance(props),
    s = analyticSection(props.template, a.pose.response);
  return (
    <g transform={a.transform} opacity={a.opacity} data-state={props.state} data-asset="scanner">
      <rect
        x={-s.width * 50}
        y={-s.cutY * 100 - 3}
        width={s.width * 100}
        height={6}
        fill={props.colors.accent}
      />
      <line
        x1={-s.width * 50}
        x2={s.width * 50}
        y1={-s.cutY * 100}
        y2={-s.cutY * 100}
        stroke={props.colors.text}
        strokeDasharray={a.dash}
      />
      <Caption props={props} y={s.height * 50 + 30} />
    </g>
  );
}
export function ScannerPlaneClay(props: GeometryAssetProps): React.ReactElement {
  const a = kitAppearance(props),
    s = analyticSection(props.template, a.pose.response);
  return (
    <group position={a.position} scale={a.scale} visible={a.pose.reveal > 0} name="scanner">
      <mesh position={[0, s.cutY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[s.width, s.depth]} />
        <Clay color={props.colors.accent} opacity={a.opacity * 0.35} />
      </mesh>
    </group>
  );
}

/** SVG labels always remain planar, including when paired with the clay assembly. */
export function SectionableGeometryDiagram(props: GeometryAssetProps): React.ReactElement {
  const a = kitAppearance(props),
    s = analyticSection(props.template, a.pose.action);
  const parts = geometryInteriorParts(props.template);
  return (
    <g
      transform={a.transform}
      opacity={a.opacity}
      data-state={props.state}
      data-asset={props.template}
    >
      <rect
        x={-s.width * 50}
        y={-s.cutY * 100}
        width={s.width * 100}
        height={s.retainedHeight * 100}
        fill={a.color}
        fillOpacity={0.18}
        stroke={props.colors.text}
        strokeDasharray={a.dash}
      />
      {props.template === 'cylinder' && (
        <ellipse
          cx={0}
          cy={-s.cutY * 100}
          rx={s.radius * 100}
          ry={s.depth * 12}
          fill={a.color}
          stroke={props.colors.text}
        />
      )}
      {parts.map((part) => (
        <g key={part.id} data-entity-id={part.id}>
          <rect
            x={(part.position[0] - part.size[0] / 2) * 100}
            y={(-part.position[1] - part.size[1] / 2) * 100}
            width={part.size[0] * 100}
            height={part.size[1] * 100}
            fill={props.colors.accent}
            fillOpacity={0.35 + 0.35 * a.pose.resolve}
          />
          <text
            x={part.position[0] * 100}
            y={-part.position[1] * 100 + 4}
            fontSize={10}
            textAnchor="middle"
            fill={props.colors.text}
          >
            schematic {part.label}
          </text>
        </g>
      ))}
      <line
        x1={-s.width * 50}
        x2={s.width * 50}
        y1={-s.cutY * 100}
        y2={-s.cutY * 100}
        stroke={props.colors.accent}
        strokeWidth={3}
        opacity={a.pose.check}
      />
      <Caption props={props} y={s.height * 50 + 30} />
    </g>
  );
}
export function SectionableGeometryClay(props: GeometryAssetProps): React.ReactElement {
  const a = kitAppearance(props),
    s = analyticSection(props.template, a.pose.action);
  const wall = 0.08;
  const shell = [
    { size: [wall, s.retainedHeight, s.depth], at: [-s.width / 2 + wall / 2, s.centerY, 0] },
    { size: [wall, s.retainedHeight, s.depth], at: [s.width / 2 - wall / 2, s.centerY, 0] },
    { size: [s.width, s.retainedHeight, wall], at: [0, s.centerY, -s.depth / 2 + wall / 2] },
    { size: [s.width, s.retainedHeight, wall], at: [0, s.centerY, s.depth / 2 - wall / 2] },
    { size: [s.width, wall, s.depth], at: [0, -s.height / 2 + wall / 2, 0] },
    { size: [s.width, wall, s.depth], at: [0, s.height / 2 - wall / 2, 0] },
  ];
  return (
    <group
      position={a.position}
      scale={a.scale}
      visible={a.pose.reveal > 0}
      name={`section-${props.template}`}
    >
      {props.template === 'cylinder' ? (
        <>
          <mesh position={[0, s.centerY, 0]}>
            <cylinderGeometry args={[s.radius, s.radius, s.retainedHeight, 32, 1, true]} />
            <Clay color={a.color} opacity={a.opacity * 0.3} />
          </mesh>
          <mesh position={[0, -s.height / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[s.radius, 32]} />
            <Clay color={a.color} opacity={a.opacity * 0.3} />
          </mesh>
          <mesh
            position={[0, s.height / 2, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            visible={a.pose.action === 0}
          >
            <circleGeometry args={[s.radius, 32]} />
            <Clay color={a.color} opacity={a.opacity * 0.3} />
          </mesh>
        </>
      ) : (
        shell.map((part, i) => (
          <mesh
            key={i}
            position={part.at as [number, number, number]}
            visible={i !== 5 || a.pose.action === 0}
          >
            <boxGeometry args={part.size as [number, number, number]} />
            <Clay color={a.color} opacity={a.opacity * 0.3} />
          </mesh>
        ))
      )}
      {geometryInteriorParts(props.template).map((part) => (
        <group key={part.id} name={part.id}>
          <Part
            size={[...part.size]}
            position={[...part.position]}
            color={props.colors.accent}
            radius={0.025}
          />
        </group>
      ))}
      <ScannerPlaneClay {...props} position={[0, 0, 0]} scale={1} />
    </group>
  );
}

export function CubeNetDiagram(props: KitAssetProps): React.ReactElement {
  const a = kitAppearance(props);
  return (
    <g transform={a.transform} opacity={a.opacity} data-state={props.state} data-asset="cube-net">
      {matchedCubeNet(a.pose.action).map((face) => (
        <g key={face.id} data-entity-id={`cube-${face.id}`}>
          <polygon
            points={face.corners.map((p) => projectGeometryPoint(p).join(',')).join(' ')}
            fill={a.color}
            stroke={props.colors.text}
            strokeDasharray={a.dash}
          />
          <text
            x={projectGeometryPoint(face.center)[0]}
            y={projectGeometryPoint(face.center)[1] + 4}
            fontSize={11}
            textAnchor="middle"
            fill={props.colors.text}
          >
            {face.id}
          </text>
        </g>
      ))}
      <Caption props={props} y={145} />
    </g>
  );
}
export function CubeNetClay(props: KitAssetProps): React.ReactElement {
  const a = kitAppearance(props);
  return (
    <group position={a.position} scale={a.scale} visible={a.pose.reveal > 0} name="cube-net">
      {matchedCubeNet(a.pose.action).map((face) => (
        <mesh
          key={face.id}
          name={`cube-${face.id}`}
          position={[...face.center]}
          rotation={[...face.rotation]}
        >
          <planeGeometry args={[1, 1]} />
          <Clay color={a.color} opacity={a.opacity} />
        </mesh>
      ))}
    </group>
  );
}

export interface GeometryGuideProps extends GeometryAssetProps {
  readonly guide: 'dimensions' | 'clearance';
  /** Source lexemes or explicit schematic names; no automatic numeric measurements. */
  readonly labels: readonly [string, string, string];
}
export function GeometryGuideDiagram(props: GeometryGuideProps): React.ReactElement {
  const a = kitAppearance(props),
    [w, h, d] = geometryDimensions(props.template);
  if (
    !['dimensions', 'clearance'].includes(props.guide) ||
    props.labels.length !== 3 ||
    props.labels.some((label) => !label.trim() || label.length > EXPANSION_LIMITS.actorLabel)
  )
    throw new RangeError('Bounded explicit guide labels required');
  const clearance = analyticClearance(props.template);
  const guides =
    props.guide === 'clearance'
      ? ([
          [w * 50, 0, clearance.opening[0] * 50, 0],
          [0, -clearance.opening[1] * 50, 0, -h * 50],
          [
            w * 50 + d * 20,
            -h * 50 + d * 10,
            w * 50 + (d / 2 + clearance.gap) * 40,
            -h * 50 + (d / 2 + clearance.gap) * 20,
          ],
        ] as const)
      : ([
          [-w * 50, h * 50 + 15, w * 50, h * 50 + 15],
          [w * 50 + 15, -h * 50, w * 50 + 15, h * 50],
          [-w * 50, -h * 50 - 15, -w * 50 + d * 40, -h * 50 - 15 + d * 20],
        ] as const);
  return (
    <g
      transform={a.transform}
      opacity={a.opacity * a.pose.check}
      data-state={props.state}
      data-asset={props.guide}
    >
      {props.guide === 'clearance' && (
        <>
          <rect
            x={-clearance.opening[0] * 50}
            y={-clearance.opening[1] * 50}
            width={clearance.opening[0] * 100}
            height={clearance.opening[1] * 100}
            fill="none"
            stroke={props.colors.muted}
          />
          <rect
            x={-w * 50}
            y={-h * 50}
            width={w * 100}
            height={h * 100}
            fill="none"
            stroke={props.colors.accent}
          />
        </>
      )}
      {guides.map(([x1, y1, x2, y2], i) => (
        <g key={i}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={props.colors.text} />
          <line x1={x1 - 3} y1={y1 - 3} x2={x1 + 3} y2={y1 + 3} stroke={props.colors.text} />
          <line x1={x2 - 3} y1={y2 - 3} x2={x2 + 3} y2={y2 + 3} stroke={props.colors.text} />
          <text x={(x1 + x2) / 2 + 8} y={(y1 + y2) / 2 - 6} fontSize={11} fill={props.colors.text}>
            {props.labels[i]}
          </text>
        </g>
      ))}
      <Caption props={props} y={h * 50 + 50} />
    </g>
  );
}

/** Source/JSX ceilings including groups, text, invisible pieces and nested Part meshes.
 * Not GPU/RSS/draw-call measurements. Precision guides/labels have no clay equivalent. */
export const GEOMETRY_ASSET_BUDGETS = {
  sectionBox: { meshes: 9, svgElements: 11 },
  sectionCylinder: { meshes: 6, svgElements: 12 },
  sectionGadget: { meshes: 11, svgElements: 17 },
  scanner: { meshes: 1, svgElements: 5 },
  cubeNet: { meshes: 6, svgElements: 21 },
  dimensions: { meshes: 0, svgElements: 18 },
  clearance: { meshes: 0, svgElements: 20 },
} as const;
