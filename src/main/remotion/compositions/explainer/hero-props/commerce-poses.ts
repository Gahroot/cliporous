import { COMMERCE_TIMING } from '../hero-catalog';
import { smoothPhase } from '../mechanisms/kinematics';

/** Shared mesh/contact dimensions, in local model units (not financial quantities). */
export const VAULT_DOOR = {
  width: 1.26,
  height: 1.44,
  depth: 0.2,
  centerX: 0.66,
  centerZ: -0.19,
  pivotX: -0.68,
  pivotZ: 0.34,
  boltLength: 0.28,
  boltCenterX: 0.43,
  boltTravel: 0.23,
  receiverInnerX: 0.68,
  openAngle: (Math.PI * 29) / 50,
} as const;

export const WALLET_CARD = {
  width: 0.78,
  height: 0.51,
  depth: 0.028,
  floorY: -0.22,
  travel: 0.34,
  closedFold: 1.03,
  openFold: 0.18,
} as const;
export const WALLET_CARD_SEAT_Y = WALLET_CARD.floorY + WALLET_CARD.height / 2;

export const READER_CARD = {
  width: 0.99,
  height: 0.62,
  depth: 0.035,
  targetX: 0,
  targetY: 0.6,
  surfaceZ: 0.18,
  startX: 0.25,
  startY: 0.93,
  startZ: 0.88,
} as const;
export const READER_CARD_CONTACT_Z = READER_CARD.surfaceZ + READER_CARD.depth / 2;

/** Fixed illustrative arithmetic, not transcript data or a financial quantity. */
export const CALCULATOR_INPUT = ['1', '+', '1', '='] as const;
// Contacts land on whole 30fps frames; the four presses fit the existing action window.
export const CALCULATOR_KEY_CONTACTS = [10 / 30, 16 / 30, 22 / 30, 28 / 30] as const;
export const CALCULATOR_KEY_STROKE = 0.07;
export const CALCULATOR_KEY_RELEASE_SEC = 0.08;

export type VaultPose = Readonly<{
  /** Remaining horizontal protrusion; zero means all four bolts are released. */
  boltExtension: number;
  /** Positive opening amount; the left hinge applies this as negative Y rotation. */
  doorAngle: number;
  handleAngle: number;
}>;
export type WalletPose = Readonly<{ foldAngle: number; cardY: number }>;
export type CardReaderPose = Readonly<{
  cardX: number;
  cardY: number;
  cardZ: number;
  cardAngle: number;
  confirmation: number;
}>;
export type CalculatorPose = Readonly<{
  /** Physical 1, + and = keys; both operand presses move the same 1 key. */
  keyDepths: readonly [number, number, number];
  /** Released inputs visible on the display, bounded to the four authored symbols. */
  inputCount: number;
  /** Reveal of the exact result 2, never a numeric count-up or an amount. */
  display: number;
}>;

/** Exact endpoint interpolation, including non-finite-time rest from smoothPhase. */
function between(from: number, to: number, progress: number): number {
  if (progress <= 0) return from;
  if (progress >= 1) return to;
  return from + (to - from) * progress;
}

/** Every sampler takes LOCAL seconds (scene t - at), never an accumulated delta. */
export function sampleVaultPose(time: number): VaultPose {
  const release = smoothPhase(time, 0.25, COMMERCE_TIMING.vault);
  return {
    boltExtension: between(VAULT_DOOR.boltTravel, 0, release),
    handleAngle: between(0, -Math.PI / 3, release),
    doorAngle: VAULT_DOOR.openAngle * smoothPhase(time, 0.7, 1.5),
  };
}

export function sampleWalletPose(time: number): WalletPose {
  return {
    foldAngle: between(WALLET_CARD.closedFold, WALLET_CARD.openFold, smoothPhase(time, 0.15, 0.6)),
    // The opened compartment accepts the card; its bottom meets the internal shelf.
    cardY: between(
      WALLET_CARD_SEAT_Y + WALLET_CARD.travel,
      WALLET_CARD_SEAT_Y,
      smoothPhase(time, 0.6, COMMERCE_TIMING.wallet),
    ),
  };
}

export function sampleCardReaderPose(time: number): CardReaderPose {
  const approach = smoothPhase(time, 0.2, COMMERCE_TIMING['card-reader']);
  return {
    cardX: between(READER_CARD.startX, READER_CARD.targetX, approach),
    cardY: between(READER_CARD.startY, READER_CARD.targetY, approach),
    cardZ: between(READER_CARD.startZ, READER_CARD_CONTACT_Z, approach),
    cardAngle: between(-0.12, 0, approach),
    // A deliberate dwell after physical contact, not a pre-emptive success badge.
    confirmation: smoothPhase(time, 0.9, 1.15),
  };
}

function keyDepth(time: number, contactAt: number): number {
  const down = smoothPhase(time, contactAt - 0.1, contactAt);
  const up = smoothPhase(time, contactAt, contactAt + CALCULATOR_KEY_RELEASE_SEC);
  return CALCULATOR_KEY_STROKE * down * (1 - up);
}

export function sampleCalculatorPose(time: number): CalculatorPose {
  return {
    keyDepths: [
      Math.max(
        keyDepth(time, CALCULATOR_KEY_CONTACTS[0]),
        keyDepth(time, CALCULATOR_KEY_CONTACTS[2]),
      ),
      keyDepth(time, CALCULATOR_KEY_CONTACTS[1]),
      keyDepth(time, CALCULATOR_KEY_CONTACTS[3]),
    ],
    inputCount: Number.isFinite(time)
      ? CALCULATOR_KEY_CONTACTS.filter((at) => time >= at + CALCULATOR_KEY_RELEASE_SEC).length
      : 0,
    // 1, +, 1, = have all returned before the result resolves; the original impact stays 1.2s.
    display: smoothPhase(time, 1.06, COMMERCE_TIMING.calculator),
  };
}
