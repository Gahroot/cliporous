import type { ReactElement } from 'react';
import { ClayBlock } from '../../explanation-kit';
import { Clay } from '../../hero-kit';
import type { ExpansionKitState } from '../scene-types';
import { EXPANSION_LIMITS } from '../value-types';
import {
  boundedKitItems,
  type KitAssetProps,
  type KitBudget,
  type KitPoint,
  KitText,
  kitColor,
  kitOpacity,
  kitPoint,
  kitScale,
  kitTransform,
  kitUnit,
} from './computing';

export interface InfrastructureProvenance {
  readonly kind: 'source' | 'illustrative';
  readonly qualifier: string;
}
/** Retained exact text, not a magnitude to turn into stock, flow or a business balance. */
export type InfrastructureContent =
  | { readonly kind: 'known'; readonly exact: string }
  | { readonly kind: 'unknown' | 'missing'; readonly qualifier: string };
export type InfrastructureStageKind = 'supply-module' | 'inventory-tray' | 'reservoir' | 'filter';
export interface InfrastructureStage {
  readonly id: string;
  readonly label: string;
  readonly kind: InfrastructureStageKind;
  readonly position: KitPoint;
  readonly state: ExpansionKitState;
  readonly content: InfrastructureContent;
  readonly provenance: InfrastructureProvenance;
}
export interface InfrastructureCarrier {
  readonly id: string;
  readonly label: string;
  readonly kind: 'supply-parcel' | 'energy-carrier';
  readonly position: KitPoint;
  readonly state: ExpansionKitState;
  readonly content: InfrastructureContent;
  readonly provenance: InfrastructureProvenance;
}
export interface InfrastructureRelation {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  readonly from: KitPoint;
  readonly to: KitPoint;
  readonly state: ExpansionKitState;
  readonly transfer: InfrastructureContent;
  /** Omission means loss not stated, never loss zero or a calculated residual. */
  readonly loss?: InfrastructureContent;
  readonly provenance: InfrastructureProvenance;
}
export interface InfrastructureStageProps extends KitAssetProps {
  readonly stage: InfrastructureStage;
}
export interface InfrastructureCarrierProps extends KitAssetProps {
  readonly carrier: InfrastructureCarrier;
}
export interface InfrastructureRelationProps extends KitAssetProps {
  readonly relation: InfrastructureRelation;
}
export interface InfrastructureKitProps extends KitAssetProps {
  readonly stages: readonly InfrastructureStage[];
  readonly carriers: readonly InfrastructureCarrier[];
  readonly relations: readonly InfrastructureRelation[];
}

function text(value: string, cap: number): void {
  if (!value.trim() || value.length > cap)
    throw new Error('Infrastructure text must be nonempty and bounded');
}
function provenance(value: InfrastructureProvenance): void {
  if (value.kind !== 'source' && value.kind !== 'illustrative')
    throw new Error('Infrastructure provenance is required');
  text(value.qualifier, 96);
}
export function infrastructureContentText(content: InfrastructureContent): string {
  if (content.kind === 'known') {
    text(content.exact, 64);
    return content.exact;
  }
  if (content.kind !== 'unknown' && content.kind !== 'missing')
    throw new Error('Invalid infrastructure content');
  text(content.qualifier, 64);
  return `${content.kind === 'missing' ? 'Not stated' : 'Unknown'}: ${content.qualifier}`;
}
function validateAsset(asset: InfrastructureStage | InfrastructureCarrier): void {
  boundedKitItems([asset], 1);
  text(asset.label, 28);
  kitPoint(asset.position);
  provenance(asset.provenance);
  infrastructureContentText(asset.content);
}
const STAGE_PATHS = {
  'supply-module': [
    'M8 12H180V124H8Z',
    'M20 44H168M20 82H168',
    'M24 22H42V32H24ZM144 100H164V114H144Z',
  ],
  'inventory-tray': [
    'M8 30H180V124H8Z',
    'M24 44H164V106H24Z',
    'M68 44V106M120 44V106M8 124L24 106M180 124L164 106',
  ],
  reservoir: [
    'M16 30Q16 10 94 10Q172 10 172 30V108Q172 128 94 128Q16 128 16 108Z',
    'M16 30Q94 50 172 30M16 108Q94 128 172 108',
    'M30 58H42M30 78H42M30 98H42M156 112H180V126',
  ],
  filter: [
    'M16 14H172V122H16Z',
    'M40 14V122M64 14V122M88 14V122M112 14V122M136 14V122M160 14V122',
    'M16 36H172M16 60H172M16 84H172M16 108H172M0 68H16M172 68H188',
  ],
} as const;

/** Tank graduations are authored marks, not an invented fill level or precise amount. */
export function InfrastructureStageSvg(props: InfrastructureStageProps): ReactElement {
  const { stage, colors } = props;
  validateAsset(stage);
  return (
    <g
      transform={kitTransform(props)}
      opacity={kitOpacity(props)}
      data-stage-id={stage.id}
      data-kind={stage.kind}
      data-state={props.state}
      data-content-state={stage.content.kind}
    >
      {STAGE_PATHS[stage.kind].map((d, i) => (
        <path
          key={d}
          d={d}
          fill={i === 0 ? colors.surface : 'none'}
          stroke={i === 0 ? colors.text : kitColor(props)}
          strokeWidth={2}
        />
      ))}
      <KitText text={stage.label} colors={colors} x={8} y={148} />
      <KitText text={infrastructureContentText(stage.content)} colors={colors} x={8} y={168} />
      <KitText text={stage.provenance.kind} colors={colors} x={8} y={188} />
      <KitText text={stage.provenance.qualifier} colors={colors} x={8} y={208} />
      <KitText text={props.state} colors={colors} x={8} y={228} />
    </g>
  );
}
export function InfrastructureStageClay(props: InfrastructureStageProps): ReactElement {
  const { stage, colors } = props;
  validateAsset(stage);
  const opacity = kitOpacity(props);
  return (
    <group
      position={kitPoint(props.position)}
      scale={kitScale(props.scale)}
      userData={{
        stageId: stage.id,
        kind: stage.kind,
        state: props.state,
        contentState: stage.content.kind,
      }}
    >
      {stage.kind === 'reservoir' ? (
        <>
          <mesh>
            <cylinderGeometry args={[0.55, 0.55, 1.1, 24]} />
            <Clay color={colors.surface} opacity={opacity} />
          </mesh>
          {([-0.5, 0.5] as const).map((y) => (
            <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.55, 0.025, 8, 24]} />
              <Clay color={colors.muted} opacity={opacity} />
            </mesh>
          ))}
          {([-0.25, 0, 0.25] as const).map((y) => (
            <ClayBlock
              key={y}
              size={[0.13, 0.025, 0.03]}
              position={[-0.15, y, 0.55]}
              color={colors.muted}
              opacity={opacity}
            />
          ))}
          <mesh position={[0.56, -0.4, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.07, 0.07, 0.28, 12]} />
            <Clay color={kitColor(props)} opacity={opacity} />
          </mesh>
        </>
      ) : stage.kind === 'filter' ? (
        <>
          {([-0.6, 0.6] as const).map((x) => (
            <ClayBlock
              key={x}
              size={[0.1, 1.1, 0.12]}
              position={[x, 0, 0]}
              color={colors.surface}
              opacity={opacity}
            />
          ))}
          {([-0.5, 0.5] as const).map((y) => (
            <ClayBlock
              key={y}
              size={[1.3, 0.1, 0.12]}
              position={[0, y, 0]}
              color={colors.surface}
              opacity={opacity}
            />
          ))}
          {([-0.4, -0.2, 0, 0.2, 0.4] as const).map((x) => (
            <ClayBlock
              key={x}
              size={[0.025, 0.9, 0.025]}
              position={[x, 0, 0]}
              color={colors.muted}
              opacity={opacity}
            />
          ))}
          {([-0.3, 0, 0.3] as const).map((y) => (
            <ClayBlock
              key={y}
              size={[1.1, 0.025, 0.025]}
              position={[0, y, 0.02]}
              color={colors.muted}
              opacity={opacity}
            />
          ))}
        </>
      ) : stage.kind === 'inventory-tray' ? (
        <>
          <ClayBlock size={[1.4, 0.1, 0.9]} color={colors.surface} opacity={opacity} />
          {([-0.65, 0.65] as const).map((x) => (
            <ClayBlock
              key={x}
              size={[0.1, 0.28, 0.9]}
              position={[x, 0.14, 0]}
              color={colors.muted}
              opacity={opacity}
            />
          ))}
          <ClayBlock
            size={[1.4, 0.28, 0.1]}
            position={[0, 0.14, -0.4]}
            color={colors.muted}
            opacity={opacity}
          />
          {([-0.22, 0.22] as const).map((x) => (
            <ClayBlock
              key={x}
              size={[0.04, 0.22, 0.8]}
              position={[x, 0.14, 0]}
              color={kitColor(props)}
              opacity={opacity}
            />
          ))}
        </>
      ) : (
        <>
          <ClayBlock size={[1.3, 0.95, 0.65]} color={colors.surface} opacity={opacity} />
          {([-0.2, 0.2] as const).map((y) => (
            <ClayBlock
              key={y}
              size={[1.05, 0.05, 0.04]}
              position={[0, y, 0.35]}
              color={colors.muted}
              opacity={opacity}
            />
          ))}
          <mesh position={[0.38, -0.3, 0.36]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.085, 0.085, 0.06, 12]} />
            <Clay color={kitColor(props)} opacity={opacity} />
          </mesh>
        </>
      )}
    </group>
  );
}
export function InfrastructureCarrierSvg(props: InfrastructureCarrierProps): ReactElement {
  const { carrier, colors } = props;
  validateAsset(carrier);
  const energy = carrier.kind === 'energy-carrier';
  return (
    <g
      transform={kitTransform(props)}
      opacity={kitOpacity(props)}
      data-carrier-id={carrier.id}
      data-kind={carrier.kind}
      data-state={props.state}
      data-content-state={carrier.content.kind}
    >
      <path
        d={energy ? 'M20 8H100V108H20ZM46 0H74V8H46Z' : 'M0 22L60 0L120 22V104L60 126L0 104Z'}
        fill={colors.surface}
        stroke={colors.text}
        strokeWidth={2}
      />
      <path
        d={energy ? 'M66 24L42 62H60L50 92L80 50H62Z' : 'M0 22L60 44L120 22M60 44V126M30 11L90 33'}
        fill={energy ? kitColor(props) : 'none'}
        stroke={kitColor(props)}
        strokeWidth={3}
      />
      <KitText text={carrier.label} colors={colors} x={0} y={148} />
      <KitText text={infrastructureContentText(carrier.content)} colors={colors} x={0} y={168} />
      <KitText text={carrier.provenance.kind} colors={colors} x={0} y={188} />
      <KitText text={carrier.provenance.qualifier} colors={colors} x={0} y={208} />
      <KitText text={props.state} colors={colors} x={0} y={228} />
    </g>
  );
}
export function InfrastructureCarrierClay(props: InfrastructureCarrierProps): ReactElement {
  const { carrier, colors } = props;
  validateAsset(carrier);
  const opacity = kitOpacity(props);
  const energy = carrier.kind === 'energy-carrier';
  return (
    <group
      position={kitPoint(props.position)}
      scale={kitScale(props.scale)}
      userData={{
        carrierId: carrier.id,
        kind: carrier.kind,
        state: props.state,
        contentState: carrier.content.kind,
      }}
    >
      <ClayBlock
        size={[0.9, 0.08, 0.65]}
        position={[0, -0.35, 0]}
        color={colors.muted}
        opacity={opacity}
      />
      {([-0.28, 0.28] as const).map((x) => (
        <mesh key={x} position={[x, -0.4, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.085, 0.085, 0.74, 12]} />
          <Clay color={colors.muted} opacity={opacity} />
        </mesh>
      ))}
      {energy ? (
        <>
          <mesh>
            <cylinderGeometry args={[0.22, 0.22, 0.58, 20]} />
            <Clay color={colors.surface} opacity={opacity} />
          </mesh>
          <mesh position={[0, 0.32, 0]}>
            <cylinderGeometry args={[0.1, 0.1, 0.06, 12]} />
            <Clay color={kitColor(props)} opacity={opacity} />
          </mesh>
          <ClayBlock
            size={[0.2, 0.08, 0.03]}
            position={[0, 0, 0.22]}
            color={kitColor(props)}
            opacity={opacity}
          />
        </>
      ) : (
        <>
          <ClayBlock size={[0.65, 0.55, 0.48]} color={colors.surface} opacity={opacity} />
          <ClayBlock
            size={[0.075, 0.025, 0.5]}
            position={[0, 0.29, 0]}
            color={kitColor(props)}
            opacity={opacity}
          />
          <ClayBlock
            size={[0.075, 0.55, 0.025]}
            position={[0, 0, 0.25]}
            color={kitColor(props)}
            opacity={opacity}
          />
        </>
      )}
    </group>
  );
}
export function InfrastructureRelationSvg(props: InfrastructureRelationProps): ReactElement {
  const { relation, colors } = props;
  provenance(relation.provenance);
  const [x1, y1] = kitPoint(relation.from),
    [x2, y2] = kitPoint(relation.to);
  const p = kitUnit(props.pose.action),
    x = (x1 + x2) / 2,
    y = (y1 + y2) / 2;
  const uncertain =
    relation.transfer.kind !== 'known' || props.state === 'unknown' || props.state === 'disputed';
  return (
    <g
      opacity={kitOpacity(props)}
      data-relation-id={relation.id}
      data-state={props.state}
      data-from-id={relation.fromId}
      data-to-id={relation.toId}
    >
      <path
        d={`M${x1} ${y1}L${x2} ${y2}`}
        stroke={colors.muted}
        strokeDasharray={uncertain ? '5 5' : undefined}
        strokeWidth={2}
      />
      <path
        d={`M${x1} ${y1}L${x1 + (x2 - x1) * p} ${y1 + (y2 - y1) * p}`}
        stroke={kitColor(props)}
        strokeWidth={3}
        strokeDasharray={uncertain ? '5 5' : undefined}
      />
      <KitText
        text={`Transfer: ${infrastructureContentText(relation.transfer)}`}
        colors={colors}
        x={x}
        y={y - 36}
      />
      <KitText
        text={
          relation.loss ? `Loss: ${infrastructureContentText(relation.loss)}` : 'Loss: not stated'
        }
        colors={colors}
        x={x}
        y={y - 18}
      />
      <KitText text={relation.provenance.kind} colors={colors} x={x} y={y} />
      <KitText text={relation.provenance.qualifier} colors={colors} x={x} y={y + 18} />
      <KitText text={props.state} colors={colors} x={x} y={y + 36} />
    </g>
  );
}
export function validateInfrastructureKit(props: InfrastructureKitProps): void {
  const stages = boundedKitItems(props.stages, EXPANSION_LIMITS.actors),
    carriers = boundedKitItems(props.carriers, EXPANSION_LIMITS.records);
  boundedKitItems([...stages, ...carriers], EXPANSION_LIMITS.actors + EXPANSION_LIMITS.records);
  boundedKitItems(props.relations, EXPANSION_LIMITS.relations);
  for (const asset of [...stages, ...carriers]) validateAsset(asset);
  const ids = new Set([...stages, ...carriers].map((asset) => asset.id));
  for (const relation of props.relations) {
    if (!ids.has(relation.fromId) || !ids.has(relation.toId))
      throw new Error('Infrastructure endpoints must retain known identities');
    kitPoint(relation.from);
    kitPoint(relation.to);
    provenance(relation.provenance);
    infrastructureContentText(relation.transfer);
    if (relation.loss) infrastructureContentText(relation.loss);
  }
}
export function InfrastructureKitSvg(props: InfrastructureKitProps): ReactElement {
  validateInfrastructureKit(props);
  return (
    <g transform={kitTransform(props)} data-kit="infrastructure">
      {props.relations.map((relation) => (
        <InfrastructureRelationSvg
          key={relation.id}
          {...props}
          relation={relation}
          state={relation.state}
        />
      ))}
      {props.stages.map((stage) => (
        <InfrastructureStageSvg
          key={stage.id}
          {...props}
          position={stage.position}
          scale={1}
          state={stage.state}
          stage={stage}
        />
      ))}
      {props.carriers.map((carrier) => (
        <InfrastructureCarrierSvg
          key={carrier.id}
          {...props}
          position={carrier.position}
          scale={1}
          state={carrier.state}
          carrier={carrier}
        />
      ))}
    </g>
  );
}
/** Hybrid use pairs this assembly with SVG for every exact value and provenance qualifier. */
export function InfrastructureKitClay(props: InfrastructureKitProps): ReactElement {
  validateInfrastructureKit(props);
  return (
    <group
      position={kitPoint(props.position)}
      scale={kitScale(props.scale)}
      userData={{ kit: 'infrastructure' }}
    >
      {props.stages.map((stage) => (
        <InfrastructureStageClay
          key={stage.id}
          {...props}
          position={stage.position}
          scale={1}
          state={stage.state}
          stage={stage}
        />
      ))}
      {props.carriers.map((carrier) => (
        <InfrastructureCarrierClay
          key={carrier.id}
          {...props}
          position={carrier.position}
          scale={1}
          state={carrier.state}
          carrier={carrier}
        />
      ))}
    </group>
  );
}
/** Source counts include hidden meshes and reused ClayBlock hosts; not GPU/RSS measurements. */
export const INFRASTRUCTURE_ASSET_BUDGETS = {
  'supply-module': { meshes: 4, svgElements: 14 },
  'inventory-tray': { meshes: 6, svgElements: 14 },
  reservoir: { meshes: 7, svgElements: 14 },
  filter: { meshes: 12, svgElements: 14 },
  'supply-parcel': { meshes: 6, svgElements: 13 },
  'energy-carrier': { meshes: 6, svgElements: 13 },
  relation: { meshes: 0, svgElements: 13 },
} as const satisfies Record<string, KitBudget>;
export const INFRASTRUCTURE_KIT_CEILING = { meshes: 168, svgElements: 477 } as const;
export function infrastructureKitBudget(props: InfrastructureKitProps): KitBudget {
  validateInfrastructureKit(props);
  return {
    meshes:
      props.stages.reduce((n, s) => n + INFRASTRUCTURE_ASSET_BUDGETS[s.kind].meshes, 0) +
      props.carriers.length * 6,
    svgElements:
      1 + props.stages.length * 14 + props.carriers.length * 13 + props.relations.length * 13,
  };
}
