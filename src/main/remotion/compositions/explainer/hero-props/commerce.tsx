/** Authored commerce objects; only decorative basic arithmetic, no financial/brand claims. */
import type React from 'react';
import { Clay, type HeroPropDef, type HeroPropProps } from '../hero-kit';
import { RoundedBlock as Block, Shaft, Wheel } from '../mechanisms/primitives';
import { mixHex } from '../palette';
import { useSceneTime, useStage } from '../stage';
import {
  CALCULATOR_INPUT,
  CALCULATOR_KEY_STROKE,
  type CalculatorPose,
  type CardReaderPose,
  READER_CARD,
  sampleCalculatorPose,
  sampleCardReaderPose,
  sampleVaultPose,
  sampleWalletPose,
  VAULT_DOOR,
  type VaultPose,
  WALLET_CARD,
  type WalletPose,
} from './commerce-poses';

type Point = [number, number, number];

/** A neutral operation-complete mark, never evidence of a financial result. */
const CompleteMark: React.FC<{ progress: number }> = ({ progress }) => {
  const S = useStage();
  return (
    <group scale={Math.max(0.001, progress)} visible={progress > 0}>
      <group position={[-0.1, -0.025, 0]} rotation={[0, 0, -0.78]}>
        <Block size={[0.19, 0.048, 0.025]} color={S.accent2} />
      </group>
      <group position={[0.065, 0.055, 0]} rotation={[0, 0, 0.8]}>
        <Block size={[0.33, 0.048, 0.025]} color={S.accent2} />
      </group>
    </group>
  );
};

export const VaultRig: React.FC<VaultPose> = ({ boltExtension, doorAngle, handleAngle }) => {
  const S = useStage();
  return (
    <group>
      <Block size={[1.84, 1.92, 0.16]} at={[0, 0, -0.7]} color={S.clay[2]} />
      {[-0.8, 0.8].map((x) => (
        <Block key={x} size={[0.24, 1.92, 0.94]} at={[x, 0, -0.25]} color={S.clay[0]} />
      ))}
      {[-0.85, 0.85].map((y) => (
        <Block key={y} size={[1.62, 0.22, 0.94]} at={[0, y, -0.25]} color={S.clay[0]} />
      ))}
      {[-0.8, 0.8].flatMap((x) =>
        [-0.4, 0.4].map((y) => (
          <Block key={`${x}:${y}`} size={[0.24, 0.18, 0.24]} at={[x, y, 0.32]} color={S.clay[2]} />
        )),
      )}
      <Block size={[1.34, 0.065, 0.66]} at={[0, -0.25, -0.36]} color={S.clay[1]} />
      <Block size={[0.55, 0.22, 0.33]} at={[0.25, -0.09, -0.42]} color={S.paper} />
      {[-0.57, 0.57].map((y) => (
        <group
          key={y}
          position={[VAULT_DOOR.pivotX, y, VAULT_DOOR.pivotZ]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <Shaft radius={0.085} length={0.23} color={S.clay[2]} />
        </group>
      ))}
      <group position={[VAULT_DOOR.pivotX, 0, VAULT_DOOR.pivotZ]} rotation={[0, -doorAngle, 0]}>
        <group position={[VAULT_DOOR.centerX, 0, VAULT_DOOR.centerZ]}>
          <Block size={[VAULT_DOOR.width, VAULT_DOOR.height, VAULT_DOOR.depth]} color={S.clay[1]} />
          <Block size={[1.05, 1.22, 0.035]} at={[0, 0, 0.115]} color={S.clay[0]} />
          {[-1, 1].flatMap((side) =>
            [-0.4, 0.4].map((y) => (
              <group
                key={`${side}:${y}`}
                position={[side * (VAULT_DOOR.boltCenterX + boltExtension), y, 0.21]}
                rotation={[0, Math.PI / 2, 0]}
              >
                <Shaft radius={0.055} length={VAULT_DOOR.boltLength} color={S.paper} />
              </group>
            )),
          )}
          <group position={[0, 0.08, 0.23]}>
            <Wheel radius={0.24} angle={handleAngle} color={S.paper} spokes={3} />
          </group>
          <Block size={[0.1, 0.16, 0.025]} at={[0, -0.36, 0.151]} color={S.clay[2]} />
        </group>
      </group>
      {[-0.65, 0.65].map((x) => (
        <Block key={x} size={[0.29, 0.14, 0.55]} at={[x, -1.01, -0.3]} color={S.clay[2]} />
      ))}
    </group>
  );
};

export const WalletRig: React.FC<WalletPose> = ({ foldAngle, cardY }) => {
  const S = useStage();
  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={side} rotation={[0, -side * foldAngle, 0]}>
          <Block size={[1.04, 1.36, 0.11]} at={[side * 0.55, 0, -0.07]} color={S.clay[2]} />
          <Block size={[0.94, 1.22, 0.045]} at={[side * 0.55, 0, -0.01]} color={S.clay[0]} />
          {side === -1 && (
            <>
              <Block size={[0.78, 0.38, 0.028]} at={[-0.55, 0.32, 0.037]} color={S.paper} />
              <Block size={[0.93, 0.24, 0.035]} at={[-0.55, 0.2, 0.085]} color={S.clay[1]} />
            </>
          )}
          {[-0.57, 0.57].map((y) => (
            <Block
              key={y}
              size={[0.89, 0.018, 0.012]}
              at={[side * 0.55, y, 0.02]}
              color={S.clay[1]}
            />
          ))}
          {side === 1 ? (
            <group position={[0.55, 0, 0]}>
              <Block
                size={[WALLET_CARD.width, WALLET_CARD.height, WALLET_CARD.depth]}
                at={[0, cardY, 0.044]}
                color={S.paper}
              />
              <Block
                size={[0.2, 0.045, 0.009]}
                at={[-0.18, cardY + 0.17, 0.063]}
                color={S.accent2}
              />
              <Block
                size={[0.9, 0.04, 0.15]}
                at={[0, WALLET_CARD.floorY - 0.02, 0.047]}
                color={S.clay[2]}
              />
              <Block size={[0.92, 0.3, 0.035]} at={[0, -0.07, 0.105]} color={S.clay[1]} />
            </group>
          ) : (
            <Block size={[0.93, 0.33, 0.045]} at={[-0.55, -0.22, 0.075]} color={S.clay[1]} />
          )}
        </group>
      ))}
      <Block size={[0.075, 1.28, 0.11]} color={S.clay[2]} />
    </group>
  );
};

const READER_KEYS = [-0.32, 0, 0.32].flatMap((x) => [-0.43, -0.7].map((y): Point => [x, y, 0.16]));
export const CardReaderRig: React.FC<CardReaderPose> = (pose) => {
  const S = useStage();
  return (
    <group rotation={[-0.12, 0, 0]}>
      <Block size={[1.29, 1.94, 0.24]} at={[0, 0, -0.02]} color={S.clay[0]} />
      <Block size={[1.07, 0.76, 0.06]} at={[0, 0.56, 0.15]} color={S.clay[2]} />
      {[0.11, 0.18, 0.25].map((radius) => (
        <mesh
          key={radius}
          position={[-0.08, 0.58, READER_CARD.surfaceZ + 0.0001]}
          rotation={[0, 0, -1.05]}
        >
          <ringGeometry args={[radius - 0.01, radius + 0.01, 28, 1, 0, 2.1]} />
          <Clay color={S.paper} />
        </mesh>
      ))}
      <Block
        size={[1.06, 0.38, 0.055]}
        at={[0, 0, 0.13]}
        color={mixHex(S.clay[2], S.bgOuter, 0.6)}
      />
      <group position={[0, -0.025, 0.17]} scale={0.75}>
        <CompleteMark progress={pose.confirmation} />
      </group>
      {READER_KEYS.map((at) => (
        <Block key={`${at[0]}:${at[1]}`} size={[0.25, 0.18, 0.08]} at={at} color={S.paper} />
      ))}
      <group position={[pose.cardX, pose.cardY, pose.cardZ]} rotation={[0, 0, pose.cardAngle]}>
        <Block size={[READER_CARD.width, READER_CARD.height, READER_CARD.depth]} color={S.paper} />
        <Block size={[0.16, 0.12, 0.012]} at={[-0.28, 0.065, 0.024]} color={S.clay[1]} />
        <Block size={[0.39, 0.038, 0.009]} at={[0.1, -0.15, 0.024]} color={S.clay[2]} />
      </group>
    </group>
  );
};

// Seven-segment digits and two arithmetic operators, authored from small boxes (no fonts).
const CALCULATOR_SEGMENTS: Record<string, { at: Point; size: Point }> = {
  a: { at: [0, 0.068, 0], size: [0.084, 0.018, 0.01] },
  b: { at: [0.05, 0.034, 0], size: [0.018, 0.05, 0.01] },
  c: { at: [0.05, -0.034, 0], size: [0.018, 0.05, 0.01] },
  d: { at: [0, -0.068, 0], size: [0.084, 0.018, 0.01] },
  e: { at: [-0.05, -0.034, 0], size: [0.018, 0.05, 0.01] },
  f: { at: [-0.05, 0.034, 0], size: [0.018, 0.05, 0.01] },
  g: { at: [0, 0, 0], size: [0.084, 0.018, 0.01] },
  h: { at: [0, 0, 0], size: [0.018, 0.1, 0.01] },
  i: { at: [0, 0.031, 0], size: [0.084, 0.018, 0.01] },
  j: { at: [0, -0.031, 0], size: [0.084, 0.018, 0.01] },
};
const CALCULATOR_GLYPHS = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abdeg',
  '3': 'abcdg',
  '4': 'bcfg',
  '5': 'acdfg',
  '6': 'acdefg',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
  '+': 'gh',
  '=': 'ij',
} as const;
type CalculatorGlyph = keyof typeof CALCULATOR_GLYPHS;

const CalculatorSymbol: React.FC<{ glyph: CalculatorGlyph; color: string; opacity?: number }> = ({
  glyph,
  color,
  opacity,
}) => (
  <group name={`calculator-symbol-${glyph}`}>
    {[...CALCULATOR_GLYPHS[glyph]].map((segment) => {
      const { at, size } = CALCULATOR_SEGMENTS[segment];
      return (
        <mesh key={segment} name={`segment-${segment}`} position={at}>
          <boxGeometry args={size} />
          <Clay color={color} opacity={opacity} />
        </mesh>
      );
    })}
  </group>
);

const CALCULATOR_KEYS = (['7', '8', '9', '4', '5', '6', '1', '2', '3', '+', '0', '='] as const).map(
  (glyph, id) => ({ glyph, x: ((id % 3) - 1) * 0.4, y: 0.23 - Math.floor(id / 3) * 0.31 }),
);
const ACTIVE_KEYS: readonly CalculatorGlyph[] = ['1', '+', '='];
export const CalculatorRig: React.FC<CalculatorPose> = ({ keyDepths, inputCount, display }) => {
  const S = useStage();
  return (
    <group rotation={[-0.18, 0, 0]}>
      <Block size={[1.45, 2.06, 0.27]} color={S.clay[0]} />
      <Block size={[1.19, 0.43, 0.07]} at={[0, 0.68, 0.155]} color={S.clay[2]} />
      <Block
        size={[1.04, 0.29, 0.025]}
        at={[0, 0.68, 0.203]}
        color={mixHex(S.clay[2], S.bgOuter, 0.65)}
      />
      <group name="calculator-display" position={[0, 0.68, 0.232]}>
        {CALCULATOR_INPUT.map((glyph, index) => (
          <group
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed physical display slots, never reordered
            key={`${index}:${glyph}`}
            name={`calculator-input-${index}`}
            position={[(index - 2) * 0.185, 0, 0]}
            scale={1.2}
            visible={inputCount > index}
          >
            <CalculatorSymbol glyph={glyph} color={S.text} />
          </group>
        ))}
        <group name="calculator-result" position={[0.37, 0, 0]} scale={1.2} visible={display > 0}>
          <CalculatorSymbol glyph="2" color={S.accent} opacity={display} />
        </group>
      </group>
      {CALCULATOR_KEYS.map(({ glyph, x, y }) => {
        const active = ACTIVE_KEYS.indexOf(glyph);
        const depth = active < 0 ? 0 : keyDepths[active];
        return (
          <group key={glyph} name={`calculator-key-${glyph}`} position={[x, y, 0.205 - depth]}>
            <Block
              size={[0.31, 0.23, 0.1]}
              color={
                glyph === '=' ? S.accent : mixHex(S.paper, S.accent, depth / CALCULATOR_KEY_STROKE)
              }
            />
            <group position={[0, 0, 0.056]}>
              <CalculatorSymbol glyph={glyph} color={S.paperText} />
            </group>
          </group>
        );
      })}
    </group>
  );
};

const Vault: React.FC<HeroPropProps> = ({ at }) => (
  <VaultRig {...sampleVaultPose(useSceneTime().t - at)} />
);
const Wallet: React.FC<HeroPropProps> = ({ at }) => (
  <WalletRig {...sampleWalletPose(useSceneTime().t - at)} />
);
const CardReader: React.FC<HeroPropProps> = ({ at }) => (
  <CardReaderRig {...sampleCardReaderPose(useSceneTime().t - at)} />
);
const Calculator: React.FC<HeroPropProps> = ({ at }) => (
  <CalculatorRig {...sampleCalculatorPose(useSceneTime().t - at)} />
);

export const COMMERCE_PROPS = {
  vault: { Model: Vault, yaw: -0.3, framing: { scale: 1.04, y: 0.06 } },
  wallet: { Model: Wallet, yaw: -0.16, framing: { scale: 1.25, y: 0.08 } },
  'card-reader': { Model: CardReader, yaw: -0.26, framing: { scale: 1.1, y: 0 } },
  calculator: { Model: Calculator, yaw: -0.22, framing: { scale: 1.14, y: 0.04 } },
} satisfies Record<'vault' | 'wallet' | 'card-reader' | 'calculator', HeroPropDef>;
