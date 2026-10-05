import type { ReactElement } from 'react';
import { ClayBlock } from '../../explanation-kit';
import { Clay } from '../../hero-kit';
import {
  type KitAssetProps,
  type KitBudget,
  KitText,
  kitColor,
  kitOpacity,
  kitPoint,
  kitScale,
  kitTransform,
  kitUnit,
} from './computing';

export const SIGNAL_SAMPLE_LIMIT = 64;
/** Authored analytic parameters only; no function, expression or evaluator input. */
export interface SignalWaveParameters {
  readonly amplitude: number;
  readonly frequency: number;
  /** Radians, a data value rather than an animation beat timestamp. */
  readonly phase: number;
  readonly domain: readonly [number, number];
  readonly samples: number;
}
export interface SignalSample {
  readonly time: number;
  readonly value: number;
}
export interface SignalProvenance {
  readonly kind: 'source' | 'illustrative';
  /** Required visible qualifier; illustrative curves must never masquerade as telemetry. */
  readonly qualifier: string;
}
export interface SignalTraceProps extends KitAssetProps {
  readonly id: string;
  readonly label: string;
  readonly wave: SignalWaveParameters;
  readonly provenance: SignalProvenance;
}
export interface SignalInstrumentProps extends KitAssetProps {
  readonly id: string;
  readonly label: string;
  readonly provenance: SignalProvenance;
  /** Exact source-retained display text; never rounded or encoded as a needle angle. */
  readonly exact?: string;
}

function bounded(value: number, maximum: number, name: string): void {
  if (!Number.isFinite(value) || Math.abs(value) > maximum)
    throw new Error(`Signal ${name} must be finite and bounded`);
}
export function validateSignalWave(wave: SignalWaveParameters): void {
  bounded(wave.amplitude, 1000000, 'amplitude');
  bounded(wave.frequency, 1000, 'frequency');
  bounded(wave.phase, Math.PI * 2, 'phase');
  if (wave.amplitude < 0 || wave.frequency < 0) throw new Error('Negative signal magnitude');
  const [start, end] = wave.domain;
  bounded(start, 10000, 'domain');
  bounded(end, 10000, 'domain');
  if (end <= start || end - start > 10000)
    throw new Error('Signal domain must have bounded positive extent');
  if (!Number.isInteger(wave.samples) || wave.samples < 2 || wave.samples > SIGNAL_SAMPLE_LIMIT)
    throw new Error('Signal sample capacity is 2–64');
}
/** Inclusive finite-domain evaluation. No retained samples or history between calls. */
export function signalWaveValue(wave: SignalWaveParameters, time: number): number {
  validateSignalWave(wave);
  bounded(time, 10000, 'time');
  if (time < wave.domain[0] || time > wave.domain[1]) throw new Error('Signal time outside domain');
  return wave.amplitude * Math.sin(2 * Math.PI * wave.frequency * time + wave.phase);
}
export function sampleSignalWave(wave: SignalWaveParameters): readonly SignalSample[] {
  validateSignalWave(wave);
  const [start, end] = wave.domain;
  return Array.from({ length: wave.samples }, (_, index) => {
    const time =
      index === wave.samples - 1 ? end : start + ((end - start) * index) / (wave.samples - 1);
    return { time, value: signalWaveValue(wave, time) };
  });
}
/** Fixed authored chart bounds, linear scaling only; exact parameters remain visible. */
export function signalPlotPoints(wave: SignalWaveParameters): string {
  const [start, end] = wave.domain;
  return sampleSignalWave(wave)
    .map(({ time, value }) => {
      const x = 20 + 240 * ((time - start) / (end - start));
      const y = 84 - (wave.amplitude === 0 ? 0 : (44 * value) / wave.amplitude);
      return `${x},${y}`;
    })
    .join(' ');
}
function validateIdentity(id: string, label: string, provenance: SignalProvenance): void {
  if (!id || id.length > 96 || !label.trim() || label.length > 28)
    throw new Error('Signal assets require a stable identity and bounded label');
  if (
    (provenance.kind !== 'source' && provenance.kind !== 'illustrative') ||
    !provenance.qualifier.trim() ||
    provenance.qualifier.length > 96
  )
    throw new Error('Signal provenance requires a visible bounded qualifier');
}
function available(props: KitAssetProps): boolean {
  return props.state !== 'unknown' && props.state !== 'disputed';
}

/** Numeric curves exist only in this planar companion, including in hybrid mode. */
export function SignalTraceSvg(props: SignalTraceProps): ReactElement {
  validateIdentity(props.id, props.label, props.provenance);
  const points = signalPlotPoints(props.wave);
  const known = available(props);
  return (
    <g
      transform={kitTransform(props)}
      opacity={kitOpacity(props)}
      data-signal-id={props.id}
      data-state={props.state}
      data-provenance={props.provenance.kind}
      data-samples={props.wave.samples}
    >
      <rect
        width={280}
        height={276}
        rx={10}
        fill={props.colors.surface}
        stroke={props.colors.text}
        strokeWidth={2}
      />
      <path d="M20 34V134H260M20 84H260" fill="none" stroke={props.colors.muted} strokeWidth={2} />
      {known && <polyline points={points} fill="none" stroke={kitColor(props)} strokeWidth={3} />}
      <KitText text={props.label} colors={props.colors} x={20} y={22} />
      <KitText text={props.provenance.kind} colors={props.colors} x={20} y={152} />
      <KitText text={props.provenance.qualifier} colors={props.colors} x={20} y={170} />
      <KitText
        text={known ? `Amplitude: ${props.wave.amplitude}` : `Amplitude: ${props.state}`}
        colors={props.colors}
        x={20}
        y={188}
      />
      <KitText
        text={known ? `Frequency: ${props.wave.frequency}` : `Frequency: ${props.state}`}
        colors={props.colors}
        x={20}
        y={206}
      />
      <KitText
        text={known ? `Phase: ${props.wave.phase}` : `Phase: ${props.state}`}
        colors={props.colors}
        x={20}
        y={224}
      />
      <KitText
        text={
          known
            ? `Domain: ${props.wave.domain[0]} to ${props.wave.domain[1]}`
            : `Domain: ${props.state}`
        }
        colors={props.colors}
        x={20}
        y={242}
      />
      <KitText text={props.state} colors={props.colors} x={20} y={260} />
    </g>
  );
}

/** Cable and terminals are semantic signal carriers, not a pseudo-3D numerical plot. */
export function SignalTraceClay(props: SignalTraceProps): ReactElement {
  validateIdentity(props.id, props.label, props.provenance);
  validateSignalWave(props.wave);
  const opacity = kitOpacity(props);
  return (
    <group
      position={kitPoint(props.position)}
      scale={kitScale(props.scale)}
      userData={{ signalId: props.id, state: props.state, provenance: props.provenance.kind }}
    >
      <ClayBlock size={[1.8, 0.08, 0.38]} color={props.colors.surface} opacity={opacity} />
      <mesh rotation={[0, 0, Math.PI / 2]} position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 1.32, 12]} />
        <Clay color={props.colors.muted} opacity={opacity} />
      </mesh>
      {([-0.72, 0.72] as const).map((x) => (
        <group key={x} position={[x, 0.12, 0]}>
          <ClayBlock size={[0.18, 0.16, 0.2]} color={props.colors.surface} opacity={opacity} />
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.045, 0.045, 0.24, 12]} />
            <Clay color={kitColor(props)} opacity={opacity} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function SignalInstrumentSvg(props: SignalInstrumentProps): ReactElement {
  validateIdentity(props.id, props.label, props.provenance);
  const reading = available(props) ? (props.exact ?? 'Not stated') : props.state;
  return (
    <g
      transform={kitTransform(props)}
      opacity={kitOpacity(props)}
      data-instrument-id={props.id}
      data-state={props.state}
      data-provenance={props.provenance.kind}
    >
      <rect
        width={240}
        height={164}
        rx={14}
        fill={props.colors.surface}
        stroke={props.colors.text}
        strokeWidth={3}
      />
      <path d="M14 40H226V90H14Z" fill="none" stroke={props.colors.muted} strokeWidth={2} />
      <circle cx={206} cy={20} r={6} fill={kitColor(props)} />
      <KitText text={props.label} colors={props.colors} x={14} y={24} />
      <KitText text={reading} colors={props.colors} x={24} y={70} size={16} />
      <KitText text={props.provenance.kind} colors={props.colors} x={14} y={108} />
      <KitText text={props.provenance.qualifier} colors={props.colors} x={14} y={128} />
      <KitText text={props.state} colors={props.colors} x={14} y={148} />
    </g>
  );
}
export function SignalInstrumentClay(props: SignalInstrumentProps): ReactElement {
  validateIdentity(props.id, props.label, props.provenance);
  const opacity = kitOpacity(props);
  // This inspection control uses only the shared editorial pose, never a measured value.
  const knobAngle = (kitUnit(props.pose.check) * Math.PI) / 3;
  return (
    <group
      position={kitPoint(props.position)}
      scale={kitScale(props.scale)}
      userData={{ instrumentId: props.id, state: props.state, provenance: props.provenance.kind }}
    >
      <ClayBlock size={[1.35, 0.9, 0.5]} color={props.colors.surface} opacity={opacity} />
      <ClayBlock
        size={[0.98, 0.36, 0.04]}
        position={[0, 0.17, 0.27]}
        color={props.colors.muted}
        opacity={opacity}
      />
      <mesh position={[-0.4, -0.25, 0.28]} rotation={[Math.PI / 2, 0, knobAngle]}>
        <cylinderGeometry args={[0.09, 0.09, 0.07, 16]} />
        <Clay color={kitColor(props)} opacity={opacity} />
      </mesh>
      <ClayBlock
        size={[0.24, 0.05, 0.05]}
        position={[0.32, -0.25, 0.28]}
        color={props.colors.muted}
        opacity={opacity}
      />
      {([-0.45, 0.45] as const).map((x) => (
        <ClayBlock
          key={x}
          size={[0.12, 0.08, 0.35]}
          position={[x, -0.49, 0]}
          color={props.colors.muted}
          opacity={opacity}
        />
      ))}
    </group>
  );
}

/** Source ceilings: all hidden/reused meshes and SVG hosts counted, not GPU/RSS claims.
 * A trace has one polyline with at most 64 points, not 64 meshes or retained history.
 * SVG counts include g/text/tspan, exclude the caller's root, and assume present labels.
 */
export const SIGNAL_ASSET_BUDGETS = {
  trace: { meshes: 6, svgElements: 20, samplePoints: SIGNAL_SAMPLE_LIMIT, polylines: 1 },
  instrument: { meshes: 6, svgElements: 14 },
} as const satisfies Record<
  string,
  KitBudget & { readonly samplePoints?: number; readonly polylines?: number }
>;
