import type React from 'react';
import { ClayBlock } from '../../explanation-kit';
import { Clay } from '../../hero-kit';
import type { ExpansionKitState } from '../scene-types';
import {
  EXPANSION_DERIVATIONS,
  EXPANSION_LIMITS,
  type ExpansionDerivation,
  type ExpansionRational,
} from '../value-types';
import { type AuthoredPoint, type KitAssetProps, kitAppearance } from './geometry';

/** Validated facts only: no evaluator, geometry, camera or rendering callbacks. */
export type RepresentationValue =
  | { readonly state: 'known'; readonly value: ExpansionRational }
  | {
      readonly state: 'derived';
      readonly value: ExpansionRational;
      readonly operation: ExpansionDerivation;
    }
  | { readonly state: 'unknown' | 'missing' };
export interface RepresentationItem {
  readonly id: string;
  readonly label: string;
  readonly state: ExpansionKitState;
  readonly value: RepresentationValue;
}
export interface TileRepresentationProps extends KitAssetProps {
  readonly items: readonly RepresentationItem[];
}
export interface MatrixRepresentationProps extends KitAssetProps {
  readonly rows: readonly (readonly RepresentationItem[])[];
  readonly rowLabels: readonly string[];
  readonly columnLabels: readonly string[];
}
export type ReferenceTemplate =
  | 'x'
  | 'negative-x'
  | 'y'
  | 'negative-y'
  | 'diagonal'
  | 'negative-diagonal';
export interface VectorProjectionProps extends KitAssetProps {
  readonly vector: {
    readonly id: string;
    readonly label: string;
    readonly x: RepresentationValue;
    readonly y: RepresentationValue;
  };
  readonly reference: ReferenceTemplate;
  readonly basisLabels: readonly [string, string];
  readonly projectionLabel: string;
}
export interface RepresentationLink {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  readonly label: string;
}
export interface CorrespondenceRepresentationProps extends KitAssetProps {
  readonly from: readonly RepresentationItem[];
  readonly to: readonly RepresentationItem[];
  readonly links: readonly RepresentationLink[];
}
export interface RepresentationPlacement {
  readonly item: RepresentationItem;
  readonly position: AuthoredPoint;
}
export type PlanarPoint = readonly [number, number];
export interface VectorProjectionResult {
  readonly state: 'known' | 'derived' | 'unknown' | 'missing';
  readonly reference: PlanarPoint;
  readonly vector: PlanarPoint | null;
  readonly projection: PlanarPoint | null;
  readonly signedCoefficient: number | null;
  readonly displayScale: number;
}
export interface CorrespondencePlacement {
  readonly link: RepresentationLink;
  readonly from: PlanarPoint;
  readonly to: PlanarPoint;
}

function label(text: string): void {
  if (!text.trim() || text.length > EXPANSION_LIMITS.actorLabel)
    throw new RangeError('Bounded explicit representation label required');
}
function identity(id: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id))
    throw new RangeError('Invalid stable representation ID');
}
function rational(value: ExpansionRational): number {
  const { numerator: n, denominator: d } = value;
  if (
    !Number.isSafeInteger(n) ||
    !Number.isSafeInteger(d) ||
    d < 1 ||
    Math.abs(n) > EXPANSION_LIMITS.rationalComponent ||
    d > EXPANSION_LIMITS.rationalComponent
  )
    throw new RangeError('Invalid bounded rational');
  let a = Math.abs(n),
    b = d;
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  if (a !== 1) throw new RangeError('Reduced rational required');
  return n / d;
}
/** Exact supplied values, not floating-point labels; absence never becomes zero. */
export function representationValueText(value: RepresentationValue): string {
  if (value.state === 'unknown' || value.state === 'missing') return value.state;
  if (value.state !== 'known' && value.state !== 'derived')
    throw new RangeError('Invalid representation value state');
  rational(value.value);
  if (value.state === 'derived' && !EXPANSION_DERIVATIONS.includes(value.operation))
    throw new RangeError('Invalid supplied derivation');
  const exact =
    value.value.denominator === 1
      ? String(value.value.numerator)
      : `${value.value.numerator}/${value.value.denominator}`;
  return value.state === 'derived' ? `derived: ${exact}` : exact;
}
function checkedItems(items: readonly RepresentationItem[], cap: number): void {
  if (items.length > cap) throw new RangeError('Representation item cap exceeded');
  const ids = new Set<string>();
  for (const item of items) {
    identity(item.id);
    label(item.label);
    representationValueText(item.value);
    if (ids.has(item.id)) throw new RangeError('Duplicate representation ID');
    if (!['retained', 'active', 'excluded', 'unknown', 'disputed'].includes(item.state))
      throw new RangeError('Invalid item state');
    ids.add(item.id);
  }
}
function ordered(items: readonly RepresentationItem[]): readonly RepresentationItem[] {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
export function tileLayout(
  items: readonly RepresentationItem[],
): readonly RepresentationPlacement[] {
  checkedItems(items, EXPANSION_LIMITS.records);
  return ordered(items).map((item, i) => ({
    item,
    position: [((i % 4) - 1.5) * 0.92, (1 - Math.floor(i / 4)) * 0.68, 0] as AuthoredPoint,
  }));
}
export function matrixDimensions(
  rows: MatrixRepresentationProps['rows'],
): readonly [number, number] {
  const columns = rows[0]?.length ?? 0;
  if (
    rows.length < 1 ||
    rows.length > EXPANSION_LIMITS.matrixRows ||
    columns < 1 ||
    columns > EXPANSION_LIMITS.matrixColumns ||
    rows.some((row) => row.length !== columns)
  )
    throw new RangeError('Rectangular 1–4 by 1–4 matrix required');
  checkedItems(rows.flat(), EXPANSION_LIMITS.matrixRows * EXPANSION_LIMITS.matrixColumns);
  return [rows.length, columns];
}
export function matrixLayout(
  rows: MatrixRepresentationProps['rows'],
): readonly RepresentationPlacement[] {
  const [height, width] = matrixDimensions(rows);
  return rows.flatMap((row, r) =>
    row.map((item, c) => ({
      item,
      position: [(c - (width - 1) / 2) * 0.86, ((height - 1) / 2 - r) * 0.62, 0] as AuthoredPoint,
    })),
  );
}
const REFERENCES: Readonly<Record<ReferenceTemplate, PlanarPoint>> = {
  x: [1, 0],
  'negative-x': [-1, 0],
  y: [0, 1],
  'negative-y': [0, -1],
  diagonal: [Math.SQRT1_2, Math.SQRT1_2],
  'negative-diagonal': [-Math.SQRT1_2, -Math.SQRT1_2],
};
/** Analytic schematic projection only. No computed coefficient is printed as source fact. */
export function vectorProjection(
  vector: VectorProjectionProps['vector'],
  reference: ReferenceTemplate,
): VectorProjectionResult {
  identity(vector.id);
  label(vector.label);
  representationValueText(vector.x);
  representationValueText(vector.y);
  if (!Object.hasOwn(REFERENCES, reference))
    throw new RangeError('Unknown authored reference frame');
  const direction: PlanarPoint = [...REFERENCES[reference]];
  if (vector.x.state === 'missing' || vector.y.state === 'missing')
    return {
      state: 'missing',
      reference: direction,
      vector: null,
      projection: null,
      signedCoefficient: null,
      displayScale: 1,
    };
  if (vector.x.state === 'unknown' || vector.y.state === 'unknown')
    return {
      state: 'unknown',
      reference: direction,
      vector: null,
      projection: null,
      signedCoefficient: null,
      displayScale: 1,
    };
  if (
    (vector.x.state !== 'known' && vector.x.state !== 'derived') ||
    (vector.y.state !== 'known' && vector.y.state !== 'derived')
  )
    throw new RangeError('Vector components must retain known, derived or absent states');
  const x = rational(vector.x.value),
    y = rational(vector.y.value);
  const coefficient = x * direction[0] + y * direction[1];
  const displayScale = 1.25 / Math.max(1, Math.abs(x), Math.abs(y));
  return {
    state: vector.x.state === 'derived' || vector.y.state === 'derived' ? 'derived' : 'known',
    reference: direction,
    vector: [x * displayScale, y * displayScale],
    projection: [
      direction[0] * coefficient * displayScale,
      direction[1] * coefficient * displayScale,
    ],
    signedCoefficient: coefficient,
    displayScale,
  };
}
export function correspondenceLayout(
  props: Pick<CorrespondenceRepresentationProps, 'from' | 'to' | 'links'>,
): readonly CorrespondencePlacement[] {
  checkedItems(props.from, EXPANSION_LIMITS.records);
  checkedItems(props.to, EXPANSION_LIMITS.records);
  if (props.links.length > EXPANSION_LIMITS.relations)
    throw new RangeError('Correspondence link cap exceeded');
  const lane = (items: readonly RepresentationItem[], x: number) =>
    new Map(
      correspondenceItems(items, x).map(({ item, position }) => [
        item.id,
        [position[0] + (x < 0 ? 0.38 : -0.38), position[1]] as PlanarPoint,
      ]),
    );
  const from = lane(props.from, -1.4),
    to = lane(props.to, 1.4),
    ids = new Set<string>(),
    pairs = new Set<string>();
  return [...props.links]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((link) => {
      identity(link.id);
      label(link.label);
      const start = from.get(link.fromId),
        end = to.get(link.toId),
        pair = `${link.fromId}:${link.toId}`;
      if (!start || !end || ids.has(link.id) || pairs.has(pair))
        throw new RangeError('Unresolved or duplicate correspondence');
      ids.add(link.id);
      pairs.add(pair);
      return { link, from: start, to: end };
    });
}
function Caption({ props, y }: { props: KitAssetProps; y: number }): React.ReactElement {
  return (
    <>
      <text x={0} y={y} fontSize={14} fill={props.colors.text} textAnchor="middle">
        {props.label} · {props.state}
      </text>
      <text x={0} y={y + 20} fontSize={11} fill={props.colors.muted} textAnchor="middle">
        {props.qualifier.kind}: {props.qualifier.text}
      </text>
    </>
  );
}
function ItemDiagram({
  props,
  item,
  position,
  entityId = item.id,
}: {
  props: KitAssetProps;
  item: RepresentationItem;
  position: AuthoredPoint;
  entityId?: string;
}): React.ReactElement {
  const a = kitAppearance({ ...props, state: item.state, label: item.label });
  return (
    <g
      transform={`translate(${position[0] * 100} ${-position[1] * 100})`}
      data-entity-id={entityId}
      data-state={item.state}
      data-value-state={item.value.state}
    >
      <rect
        x={-38}
        y={-25}
        width={76}
        height={50}
        rx={4}
        fill={a.color}
        stroke={props.colors.text}
        strokeDasharray={a.dash}
      />
      <text
        x={0}
        y={-5}
        fontSize={10}
        textAnchor="middle"
        fill={props.colors.text}
        textLength={68}
        lengthAdjust="spacingAndGlyphs"
      >
        {item.label}
      </text>
      <text
        x={0}
        y={13}
        fontSize={10}
        textAnchor="middle"
        fill={props.colors.text}
        textLength={68}
        lengthAdjust="spacingAndGlyphs"
      >
        {representationValueText(item.value)}
      </text>
    </g>
  );
}
function ItemClay({
  props,
  item,
  position,
  entityId = item.id,
}: {
  props: KitAssetProps;
  item: RepresentationItem;
  position: AuthoredPoint;
  entityId?: string;
}): React.ReactElement {
  const a = kitAppearance({ ...props, state: item.state, label: item.label });
  return (
    <group position={[...position]} name={entityId}>
      <ClayBlock
        size={[0.76, 0.5, 0.08]}
        color={a.color}
        opacity={item.state === 'excluded' ? 0.3 : 1}
        radius={0.025}
      />
    </group>
  );
}
export function ExactTilesDiagram(props: TileRepresentationProps): React.ReactElement {
  const a = kitAppearance(props),
    items = tileLayout(props.items);
  return (
    <g
      transform={a.transform}
      opacity={a.opacity}
      data-state={props.state}
      data-asset="exact-tiles"
    >
      {items.map(({ item, position }) => (
        <ItemDiagram key={item.id} props={props} item={item} position={position} />
      ))}
      <Caption props={props} y={120} />
    </g>
  );
}
export function ExactTilesClay(props: TileRepresentationProps): React.ReactElement {
  const a = kitAppearance(props),
    items = tileLayout(props.items);
  return (
    <group position={a.position} scale={a.scale} visible={a.pose.reveal > 0} name="exact-tiles">
      {items.map(({ item, position }) => (
        <ItemClay key={item.id} props={props} item={item} position={position} />
      ))}
    </group>
  );
}
function matrixLabels(props: MatrixRepresentationProps): readonly [number, number] {
  const dimensions = matrixDimensions(props.rows);
  if (props.rowLabels.length !== dimensions[0] || props.columnLabels.length !== dimensions[1])
    throw new RangeError('Explicit matrix axis labels required');
  props.rowLabels.forEach(label);
  props.columnLabels.forEach(label);
  return dimensions;
}
export function MatrixDiagram(props: MatrixRepresentationProps): React.ReactElement {
  const a = kitAppearance(props),
    [height, width] = matrixLabels(props),
    items = matrixLayout(props.rows);
  return (
    <g transform={a.transform} opacity={a.opacity} data-state={props.state} data-asset="matrix">
      {items.map(({ item, position }) => (
        <ItemDiagram key={item.id} props={props} item={item} position={position} />
      ))}
      {props.rowLabels.map((text, r) => (
        <text
          key={r}
          x={-width * 43 - 12}
          y={(r - (height - 1) / 2) * 62 + 4}
          fontSize={10}
          fill={props.colors.text}
          textAnchor="end"
        >
          {text}
        </text>
      ))}
      {props.columnLabels.map((text, c) => (
        <text
          key={c}
          x={(c - (width - 1) / 2) * 86}
          y={-height * 31 - 14}
          fontSize={10}
          fill={props.colors.text}
          textAnchor="middle"
          textLength={72}
          lengthAdjust="spacingAndGlyphs"
        >
          {text}
        </text>
      ))}
      <Caption props={props} y={height * 31 + 35} />
    </g>
  );
}
export function MatrixClay(props: MatrixRepresentationProps): React.ReactElement {
  const a = kitAppearance(props);
  matrixLabels(props);
  return (
    <group position={a.position} scale={a.scale} visible={a.pose.reveal > 0} name="matrix">
      <ClayBlock
        size={[3.8, 3.2, 0.12]}
        position={[0, 0, -0.12]}
        color={props.colors.surface}
        opacity={a.opacity}
      />
      {matrixLayout(props.rows).map(({ item, position }) => (
        <ItemClay key={item.id} props={props} item={item} position={position} />
      ))}
    </group>
  );
}
function arrow(point: PlanarPoint, progress = 1): string {
  const x = point[0] * 100 * progress,
    y = -point[1] * 100 * progress,
    length = Math.hypot(x, y);
  if (length === 0) return 'M0 0 L0 0';
  const dx = x / length,
    dy = y / length;
  return `M0 0 L${x} ${y} M${x - 8 * dx + 4 * dy} ${y - 8 * dy - 4 * dx} L${x} ${y} L${x - 8 * dx - 4 * dy} ${y - 8 * dy + 4 * dx}`;
}
function checkedVector(props: VectorProjectionProps): VectorProjectionResult {
  if (props.basisLabels.length !== 2) throw new RangeError('Two explicit basis labels required');
  props.basisLabels.forEach(label);
  label(props.projectionLabel);
  return vectorProjection(props.vector, props.reference);
}
export function VectorProjectionDiagram(props: VectorProjectionProps): React.ReactElement {
  const a = kitAppearance(props),
    p = checkedVector(props),
    u = p.reference,
    v: PlanarPoint = [-u[1], u[0]];
  const projection = p.projection ?? [0, 0],
    vector = p.vector ?? [0, 0];
  return (
    <g
      transform={a.transform}
      opacity={a.opacity}
      data-state={props.state}
      data-entity-id={props.vector.id}
      data-value-state={p.state}
    >
      {[u, v].map((basis, i) => (
        <g key={i} data-entity-id={`${props.vector.id}-basis-${i}`}>
          <path
            d={arrow([basis[0] * 1.65, basis[1] * 1.65])}
            stroke={props.colors.muted}
            fill="none"
          />
          <text
            x={basis[0] * 180}
            y={-basis[1] * 180}
            fontSize={11}
            textAnchor="middle"
            fill={props.colors.text}
          >
            {props.basisLabels[i]}
          </text>
        </g>
      ))}
      <g>
        <path
          d={arrow(vector, a.pose.action)}
          stroke={props.colors.accent}
          strokeWidth={3}
          fill="none"
          opacity={p.vector ? 1 : 0}
        />
        <text
          x={0}
          y={190}
          fontSize={11}
          textAnchor="middle"
          fill={props.colors.text}
          textLength={280}
          lengthAdjust="spacingAndGlyphs"
        >
          {props.vector.label}: x={representationValueText(props.vector.x)}, y=
          {representationValueText(props.vector.y)}
        </text>
        <path
          d={arrow(projection, a.pose.response)}
          stroke={props.colors.text}
          fill="none"
          opacity={p.projection ? 1 : 0}
        />
        <line
          x1={projection[0] * 100}
          y1={-projection[1] * 100}
          x2={vector[0] * 100}
          y2={-vector[1] * 100}
          stroke={props.colors.muted}
          strokeDasharray="4 4"
          opacity={p.vector ? a.pose.check : 0}
        />
        <text x={0} y={210} fontSize={10} textAnchor="middle" fill={props.colors.muted}>
          schematic {props.projectionLabel}
          {p.vector ? '' : ` · ${p.state}`}
        </text>
      </g>
      <Caption props={props} y={240} />
    </g>
  );
}
/** Fixed semantic backing only; never turn signed magnitudes into clay height/perspective. */
export function VectorProjectionClay(props: VectorProjectionProps): React.ReactElement {
  const a = kitAppearance(props);
  checkedVector(props);
  return (
    <group position={a.position} scale={a.scale} visible={a.pose.reveal > 0} name={props.vector.id}>
      <ClayBlock
        size={[3.8, 3.8, 0.12]}
        position={[0, 0, -0.12]}
        color={a.color}
        opacity={a.opacity}
      />
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.06, 12]} />
        <Clay color={props.colors.accent} opacity={a.opacity} />
      </mesh>
      <group name={`${props.vector.id}-basis-0`} />
      <group name={`${props.vector.id}-basis-1`} />
    </group>
  );
}
function correspondenceItems(
  items: readonly RepresentationItem[],
  x: number,
): readonly RepresentationPlacement[] {
  // 0.58 pitch leaves an 0.08-unit gap between the fixed 0.5-unit carriers.
  return ordered(items).map((item, i) => ({
    item,
    position: [x, ((items.length - 1) / 2 - i) * 0.58, 0] as AuthoredPoint,
  }));
}
export function CorrespondenceDiagram(
  props: CorrespondenceRepresentationProps,
): React.ReactElement {
  const a = kitAppearance(props),
    links = correspondenceLayout(props);
  return (
    <g
      transform={a.transform}
      opacity={a.opacity}
      data-state={props.state}
      data-asset="correspondence"
    >
      {links.map(({ link, from, to }) => (
        <g key={link.id} data-entity-id={link.id}>
          <line
            x1={from[0] * 100}
            y1={-from[1] * 100}
            x2={to[0] * 100}
            y2={-to[1] * 100}
            stroke={props.colors.accent}
            opacity={0.25 + 0.75 * a.pose.response}
          />
          <text
            x={0}
            y={-(from[1] + to[1]) * 50 - 4}
            fontSize={9}
            textAnchor="middle"
            fill={props.colors.text}
            textLength={100}
            lengthAdjust="spacingAndGlyphs"
          >
            {link.label}
          </text>
        </g>
      ))}
      {(['from', 'to'] as const).flatMap((side) =>
        correspondenceItems(props[side], side === 'from' ? -1.4 : 1.4).map(({ item, position }) => (
          <ItemDiagram
            key={`${side}-${item.id}`}
            props={props}
            item={item}
            position={position}
            entityId={`${side}-${item.id}`}
          />
        )),
      )}
      <Caption props={props} y={380} />
    </g>
  );
}
export function CorrespondenceClay(props: CorrespondenceRepresentationProps): React.ReactElement {
  const a = kitAppearance(props),
    links = correspondenceLayout(props);
  return (
    <group position={a.position} scale={a.scale} visible={a.pose.reveal > 0} name="correspondence">
      {(['from', 'to'] as const).map((side) => (
        <group key={side}>
          <ClayBlock
            size={[1.45, 7.2, 0.12]}
            position={[side === 'from' ? -1.4 : 1.4, 0, -0.12]}
            color={props.colors.surface}
            opacity={a.opacity}
          />
          {correspondenceItems(props[side], side === 'from' ? -1.4 : 1.4).map(
            ({ item, position }) => (
              <ItemClay
                key={item.id}
                props={props}
                item={item}
                position={position}
                entityId={`${side}-${item.id}`}
              />
            ),
          )}
        </group>
      ))}
      {/* Links and precision labels exist ONLY in the SVG overlay; retain IDs here. */}
      {links.map(({ link }) => (
        <group key={link.id} name={link.id} />
      ))}
    </group>
  );
}

/** Actual expanded intrinsic mesh/SVG ceilings at parser caps, including hidden pieces.
 * ClayBlock owns one mesh with attached RoundedBoxGeometry; no instancing/primitive escape.
 * SVG counts include every g/text/path. These are source counts, NOT GPU/RSS measurements. */
export const REPRESENTATION_ASSET_BUDGETS = {
  exactTiles: { meshes: 12, svgElements: 3 + 4 * 12 },
  matrix: { meshes: 1 + 16, svgElements: 3 + 4 * 16 + 4 + 4 },
  vectorProjection: { meshes: 2, svgElements: 15 },
  correspondence: { meshes: 2 + 2 * 12, svgElements: 3 + 4 * 24 + 3 * 16 },
} as const;
