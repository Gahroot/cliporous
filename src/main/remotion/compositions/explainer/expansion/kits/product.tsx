import type { ReactElement } from 'react';
import { ClayBlock } from '../../explanation-kit';
import { Clay } from '../../hero-kit';
import type { ExpansionKitState } from '../scene-types';
import { EXPANSION_LIMITS } from '../value-types';
import {
  boundedKitItems,
  type ComputingRelation,
  ComputingRelationSvg,
  type KitAssetProps,
  type KitBudget,
  type KitPoint,
  KitText,
  kitColor,
  kitOpacity,
  kitPoint,
  kitScale,
  kitTransform,
} from './computing';

/** Original paper/tray grammar, not a reproduction of an app, browser or live control. */
export type ProductSurfaceKind = 'form' | 'table' | 'result' | 'invoice' | 'task';
export interface ProductSurface {
  readonly id: string;
  readonly label: string;
  readonly kind: ProductSurfaceKind;
  readonly qualifier?: string;
  readonly state: ExpansionKitState;
  readonly position: KitPoint;
}
export interface ProductRecord {
  readonly id: string;
  readonly label: string;
  readonly surfaceId: string;
  /** Source-retained display text, never parsed, rounded or promoted into geometry. */
  readonly exact?: string;
  readonly attemptId?: string;
  readonly effectId?: string;
  readonly qualifier?: string;
  readonly state: ExpansionKitState;
  readonly position: KitPoint;
}
export interface ProductSurfaceProps extends KitAssetProps {
  readonly surface: ProductSurface;
}
export interface ProductRecordProps extends KitAssetProps {
  readonly record: ProductRecord;
}
export interface ProductKitProps extends KitAssetProps {
  readonly surfaces: readonly ProductSurface[];
  readonly records: readonly ProductRecord[];
  readonly relations: readonly ComputingRelation[];
}

const PRODUCT_PLANAR_PARTS = {
  form: ['M8 8H184V156H8Z', 'M24 46H160', 'M24 68H148M24 94H148', 'M24 120H100'],
  table: ['M8 8H184V156H8Z', 'M8 46H184', 'M66 46V156M126 46V156', 'M8 82H184M8 118H184'],
  result: [
    'M8 22H184V156H8Z',
    'M24 44H168V134H24Z',
    'M24 134L8 156M168 134L184 156',
    'M58 70H134M58 94H116',
  ],
  invoice: ['M8 8H154L184 38V156H8Z', 'M154 8V38H184', 'M24 64H154M24 90H154', 'M24 124H154'],
  task: [
    'M8 8H184V156H8Z',
    'M70 4H122V20H70Z',
    'M24 54H40V70H24ZM24 86H40V102H24Z',
    'M54 62H158M54 94H158M24 126H130',
  ],
} as const;

export function ProductSurfaceSvg(props: ProductSurfaceProps): ReactElement {
  const { surface, colors } = props;
  return (
    <g
      transform={kitTransform(props)}
      opacity={kitOpacity(props)}
      data-surface-id={surface.id}
      data-kind={surface.kind}
      data-state={props.state}
    >
      {PRODUCT_PLANAR_PARTS[surface.kind].map((d, index) => (
        <path
          key={d}
          d={d}
          fill={index === 0 ? colors.surface : 'none'}
          stroke={index === 1 ? kitColor(props) : colors.text}
          strokeWidth={index === 1 ? 3 : 2}
        />
      ))}
      <KitText text={surface.label} colors={colors} x={24} y={36} />
      <KitText text={surface.kind} colors={colors} x={8} y={176} />
      <KitText text={surface.qualifier ?? 'Source-backed record'} colors={colors} x={8} y={194} />
      <KitText text={props.state} colors={colors} x={8} y={212} />
    </g>
  );
}

export function ProductSurfaceClay(props: ProductSurfaceProps): ReactElement {
  const { surface, colors } = props;
  const opacity = kitOpacity(props);
  return (
    <group
      position={kitPoint(props.position)}
      scale={kitScale(props.scale)}
      userData={{ surfaceId: surface.id, kind: surface.kind, state: props.state }}
    >
      <ClayBlock size={[1.6, 0.1, 1.2]} color={colors.surface} opacity={opacity} />
      {surface.kind === 'result' ? (
        <>
          <ClayBlock
            size={[0.08, 0.25, 1.2]}
            position={[-0.76, 0.17, 0]}
            color={colors.muted}
            opacity={opacity}
          />
          <ClayBlock
            size={[0.08, 0.25, 1.2]}
            position={[0.76, 0.17, 0]}
            color={colors.muted}
            opacity={opacity}
          />
          <ClayBlock
            size={[1.6, 0.25, 0.08]}
            position={[0, 0.17, -0.56]}
            color={colors.muted}
            opacity={opacity}
          />
          <ClayBlock
            size={[1.1, 0.03, 0.8]}
            position={[0, 0.08, 0]}
            color={kitColor(props)}
            opacity={opacity}
          />
        </>
      ) : (
        <>
          <ClayBlock
            size={surface.kind === 'task' ? [0.46, 0.08, 0.16] : [1.25, 0.03, 0.1]}
            position={[0, 0.08, -0.4]}
            color={kitColor(props)}
            opacity={opacity}
          />
          {([-0.18, 0.05, 0.28] as const).map((z) => (
            <ClayBlock
              key={z}
              size={[surface.kind === 'task' ? 0.85 : 1.25, 0.025, 0.025]}
              position={[surface.kind === 'task' ? 0.16 : 0, 0.07, z]}
              color={colors.muted}
              opacity={opacity}
            />
          ))}
          {surface.kind === 'table' &&
            ([-0.27, 0.27] as const).map((x) => (
              <ClayBlock
                key={x}
                size={[0.025, 0.025, 0.83]}
                position={[x, 0.07, 0.04]}
                color={colors.muted}
                opacity={opacity}
              />
            ))}
          {surface.kind === 'task' &&
            ([-0.18, 0.05, 0.28] as const).map((z) => (
              <mesh key={z} position={[-0.5, 0.07, z]} rotation={[-Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.045, 0.012, 6, 12]} />
                <Clay color={colors.muted} opacity={opacity} />
              </mesh>
            ))}
        </>
      )}
    </group>
  );
}

/** Attempts, effects and unknown values are independent lines, never auto-completed. */
export function ProductRecordSvg(props: ProductRecordProps): ReactElement {
  const { record, colors } = props;
  return (
    <g
      transform={kitTransform(props)}
      opacity={kitOpacity(props)}
      data-record-id={record.id}
      data-surface-id={record.surfaceId}
      data-state={props.state}
      data-attempt-id={record.attemptId}
      data-effect-id={record.effectId}
    >
      <path d="M0 0H160V126H0Z" fill={colors.surface} stroke={colors.text} strokeWidth={2} />
      <path d="M10 12V114" stroke={kitColor(props)} strokeWidth={5} />
      <KitText text={record.label} colors={colors} x={22} y={22} />
      <KitText text={record.exact ?? 'Value not stated'} colors={colors} x={22} y={43} />
      <KitText
        text={`Attempt: ${record.attemptId ?? 'not stated'}`}
        colors={colors}
        x={22}
        y={62}
      />
      <KitText text={`Effect: ${record.effectId ?? 'not stated'}`} colors={colors} x={22} y={81} />
      <KitText text={record.qualifier ?? props.state} colors={colors} x={22} y={100} />
      <KitText text={props.state} colors={colors} x={22} y={119} size={10} />
    </g>
  );
}
export function ProductRecordClay(props: ProductRecordProps): ReactElement {
  const opacity = kitOpacity(props);
  return (
    <group
      position={kitPoint(props.position)}
      scale={kitScale(props.scale)}
      userData={{
        recordId: props.record.id,
        surfaceId: props.record.surfaceId,
        state: props.state,
        attemptId: props.record.attemptId,
        effectId: props.record.effectId,
      }}
    >
      <ClayBlock size={[0.7, 0.05, 0.48]} color={props.colors.surface} opacity={opacity} />
      <ClayBlock
        size={[0.035, 0.018, 0.38]}
        position={[-0.27, 0.033, 0]}
        color={kitColor(props)}
        opacity={opacity}
      />
      <ClayBlock
        size={[0.43, 0.018, 0.025]}
        position={[0.02, 0.033, -0.13]}
        color={props.colors.muted}
        opacity={opacity}
      />
    </group>
  );
}
export function validateProductKit(props: ProductKitProps): void {
  const surfaces = boundedKitItems(props.surfaces, EXPANSION_LIMITS.actors);
  const records = boundedKitItems(props.records, EXPANSION_LIMITS.records);
  boundedKitItems([...surfaces, ...records], EXPANSION_LIMITS.actors + EXPANSION_LIMITS.records);
  boundedKitItems(props.relations, EXPANSION_LIMITS.relations);
  const surfaceIds = new Set(surfaces.map((surface) => surface.id));
  const ids = new Set([...surfaces, ...records].map((item) => item.id));
  for (const record of records) {
    if (!surfaceIds.has(record.surfaceId))
      throw new Error('Product records require a retained surface identity');
  }
  for (const relation of props.relations) {
    if (!ids.has(relation.fromId) || !ids.has(relation.toId))
      throw new Error('Product relation endpoint is unknown');
  }
}
export function ProductKitSvg(props: ProductKitProps): ReactElement {
  validateProductKit(props);
  return (
    <g transform={kitTransform(props)} data-kit="product">
      {props.relations.map((relation) => (
        <ComputingRelationSvg
          key={relation.id}
          {...props}
          relation={relation}
          state={relation.state}
        />
      ))}
      {props.surfaces.map((surface) => (
        <ProductSurfaceSvg
          key={surface.id}
          {...props}
          position={surface.position}
          state={surface.state}
          surface={surface}
        />
      ))}
      {props.records.map((record) => (
        <ProductRecordSvg
          key={record.id}
          {...props}
          position={record.position}
          state={record.state}
          record={record}
        />
      ))}
    </g>
  );
}
export function ProductKitClay(props: ProductKitProps): ReactElement {
  validateProductKit(props);
  return (
    <group
      position={kitPoint(props.position)}
      scale={kitScale(props.scale)}
      userData={{ kit: 'product' }}
    >
      {props.surfaces.map((surface) => (
        <ProductSurfaceClay
          key={surface.id}
          {...props}
          position={surface.position}
          state={surface.state}
          surface={surface}
        />
      ))}
      {props.records.map((record) => (
        <ProductRecordClay
          key={record.id}
          {...props}
          position={record.position}
          state={record.state}
          record={record}
        />
      ))}
    </group>
  );
}
export const PRODUCT_ASSET_BUDGETS = {
  form: { meshes: 5, svgElements: 13 },
  table: { meshes: 7, svgElements: 13 },
  result: { meshes: 5, svgElements: 13 },
  invoice: { meshes: 5, svgElements: 13 },
  task: { meshes: 8, svgElements: 13 },
  record: { meshes: 3, svgElements: 15 },
  relation: { meshes: 0, svgElements: 7 },
} as const satisfies Record<string, KitBudget>;
export const PRODUCT_KIT_CEILING = { meshes: 100, svgElements: 397 } as const;
export function productKitBudget(props: ProductKitProps): KitBudget {
  validateProductKit(props);
  return {
    meshes:
      props.surfaces.reduce((n, surface) => n + PRODUCT_ASSET_BUDGETS[surface.kind].meshes, 0) +
      props.records.length * 3,
    svgElements:
      1 + props.surfaces.length * 13 + props.records.length * 15 + props.relations.length * 7,
  };
}
