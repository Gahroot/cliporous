import { describe, expect, it } from 'vitest';
import { COMMERCE_TIMING, HERO_CATALOG, heroImpactSec } from '../hero-catalog';
import {
  CALCULATOR_INPUT,
  CALCULATOR_KEY_CONTACTS,
  CALCULATOR_KEY_RELEASE_SEC,
  CALCULATOR_KEY_STROKE,
  READER_CARD,
  READER_CARD_CONTACT_Z,
  sampleCalculatorPose,
  sampleCardReaderPose,
  sampleVaultPose,
  sampleWalletPose,
  VAULT_DOOR,
  WALLET_CARD,
  WALLET_CARD_SEAT_Y,
} from './commerce-poses';

const EPSILON = 1e-6;
const SAMPLERS = {
  vault: sampleVaultPose,
  wallet: sampleWalletPose,
  'card-reader': sampleCardReaderPose,
  calculator: sampleCalculatorPose,
} as const;
const BOUNDARIES = [
  0,
  0.15,
  0.2,
  0.23,
  0.25,
  0.35,
  0.45,
  0.53,
  0.6,
  0.65,
  0.7,
  0.75,
  0.83,
  0.85,
  0.9,
  0.95,
  1.05,
  1.06,
  1.15,
  1.2,
  1.5,
  ...CALCULATOR_KEY_CONTACTS.flatMap((at) => [at - 0.1, at, at + CALCULATOR_KEY_RELEASE_SEC]),
];
const SAMPLE_TIMES = [
  -10,
  ...BOUNDARIES.flatMap((time) => [time - EPSILON, time, time + EPSILON]),
  ...Array.from({ length: 121 }, (_, frame) => frame / 60),
  5,
  1e6,
];

function numbers(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(numbers);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(numbers);
  throw new Error('Commerce poses must contain only numeric transforms and completion signals');
}

function within(value: number, min: number, max: number): void {
  expect(Number.isFinite(value)).toBe(true);
  expect(value).toBeGreaterThanOrEqual(min);
  expect(value).toBeLessThanOrEqual(max);
}

function boltTip(extension: number): number {
  // Both horizontal sides have this tip distance from the door centre.
  return VAULT_DOOR.boltCenterX + extension + VAULT_DOOR.boltLength / 2;
}

describe('commerce timing contracts', () => {
  it('pins the four approved impact times exactly', () => {
    expect(COMMERCE_TIMING).toEqual({
      vault: 0.65,
      wallet: 0.95,
      'card-reader': 0.85,
      calculator: 1.2,
    });
  });

  it.each(
    Object.keys(SAMPLERS) as (keyof typeof SAMPLERS)[],
  )('%s advertises the same signature for every tone, with no reversed action', (id) => {
    expect(HERO_CATALOG[id].impactSec).toBe(COMMERCE_TIMING[id]);
    expect(HERO_CATALOG[id].downImpactSec).toBeUndefined();
    expect(HERO_CATALOG[id].downHint).toBeUndefined();
    for (const tone of [undefined, 'up', 'down'] as const) {
      expect(heroImpactSec(id, tone)).toBe(COMMERCE_TIMING[id]);
    }
  });
});

describe('commerce causal contacts', () => {
  it('releases every vault bolt by .65, pauses, then swings only during .7–1.5', () => {
    const locked = sampleVaultPose(0.25);
    expect(locked).toEqual({ boltExtension: VAULT_DOOR.boltTravel, doorAngle: 0, handleAngle: 0 });
    expect(boltTip(locked.boltExtension)).toBeGreaterThan(VAULT_DOOR.receiverInnerX);
    expect(sampleVaultPose(COMMERCE_TIMING.vault - EPSILON).boltExtension).toBeGreaterThan(0);
    const released = sampleVaultPose(COMMERCE_TIMING.vault);
    expect(released).toEqual({ boltExtension: 0, doorAngle: 0, handleAngle: -Math.PI / 3 });
    expect(boltTip(released.boltExtension)).toBeLessThan(VAULT_DOOR.receiverInnerX);
    expect(boltTip(released.boltExtension)).toBeLessThan(VAULT_DOOR.width / 2);
    expect(sampleVaultPose(0.7)).toEqual(released);
    expect(sampleVaultPose(0.7 + EPSILON).doorAngle).toBeGreaterThan(0);
    expect(sampleVaultPose(1.5 - EPSILON).doorAngle).toBeLessThan(VAULT_DOOR.openAngle);
    expect(sampleVaultPose(1.5).doorAngle).toBe(VAULT_DOOR.openAngle);

    for (const time of SAMPLE_TIMES) {
      const pose = sampleVaultPose(time);
      if (time <= 0.7) expect(pose.doorAngle).toBe(0);
      if (pose.doorAngle > 0) {
        expect(pose.boltExtension).toBe(0);
        expect(boltTip(pose.boltExtension)).toBeLessThan(VAULT_DOOR.receiverInnerX);
        expect(boltTip(pose.boltExtension)).toBeLessThan(VAULT_DOOR.width / 2);
      }
    }
  });

  it('opens the wallet before dropping the card onto the exact pocket floor at .95', () => {
    const startY = WALLET_CARD_SEAT_Y + WALLET_CARD.travel;
    expect(sampleWalletPose(0.15)).toEqual({ foldAngle: WALLET_CARD.closedFold, cardY: startY });
    expect(sampleWalletPose(0.6)).toEqual({ foldAngle: WALLET_CARD.openFold, cardY: startY });
    expect(sampleWalletPose(0.6 + EPSILON).cardY).toBeLessThan(startY);
    expect(sampleWalletPose(COMMERCE_TIMING.wallet - EPSILON).cardY).toBeGreaterThan(
      WALLET_CARD_SEAT_Y,
    );
    const seated = sampleWalletPose(COMMERCE_TIMING.wallet);
    expect(seated).toEqual({ foldAngle: WALLET_CARD.openFold, cardY: WALLET_CARD_SEAT_Y });
    expect(seated.cardY - WALLET_CARD.height / 2).toBe(WALLET_CARD.floorY);

    for (const time of SAMPLE_TIMES) {
      const pose = sampleWalletPose(time);
      if (pose.foldAngle > WALLET_CARD.openFold) expect(pose.cardY).toBe(startY);
      if (pose.cardY < startY) expect(pose.foldAngle).toBe(WALLET_CARD.openFold);
      expect(pose.cardY - WALLET_CARD.height / 2).toBeGreaterThanOrEqual(WALLET_CARD.floorY);
    }
  });

  it('touches the reader surface at .85 and only then confirms, without penetration', () => {
    expect(sampleCardReaderPose(COMMERCE_TIMING['card-reader'] - EPSILON).cardZ).toBeGreaterThan(
      READER_CARD_CONTACT_Z,
    );
    const contact = sampleCardReaderPose(COMMERCE_TIMING['card-reader']);
    expect(contact).toEqual({
      cardX: READER_CARD.targetX,
      cardY: READER_CARD.targetY,
      cardZ: READER_CARD_CONTACT_Z,
      cardAngle: 0,
      confirmation: 0,
    });
    // The reader-facing (-Z) plane, not merely the card centre, makes contact.
    // Its only rotation is about Z, so every corner shares this surface clearance.
    expect(contact.cardZ - READER_CARD.depth / 2).toBe(READER_CARD.surfaceZ);
    expect(sampleCardReaderPose(0.9)).toEqual(contact);
    expect(sampleCardReaderPose(0.9 + EPSILON).confirmation).toBeGreaterThan(0);
    expect(sampleCardReaderPose(1.15 - EPSILON).confirmation).toBeLessThan(1);
    expect(sampleCardReaderPose(1.15)).toEqual({ ...contact, confirmation: 1 });

    for (const time of SAMPLE_TIMES) {
      const pose = sampleCardReaderPose(time);
      expect(pose.cardZ - READER_CARD.depth / 2).toBeGreaterThanOrEqual(READER_CARD.surfaceZ);
      if (time <= COMMERCE_TIMING['card-reader']) expect(pose.confirmation).toBe(0);
      if (pose.confirmation > 0) {
        expect(pose.cardZ).toBe(READER_CARD_CONTACT_Z);
        expect(pose.cardX).toBe(READER_CARD.targetX);
        expect(pose.cardY).toBe(READER_CARD.targetY);
        expect(pose.cardAngle).toBe(0);
      }
    }
  });

  it('presses 1, +, the SAME 1, then =; releases all inputs before resolving at 1.2', () => {
    expect(CALCULATOR_INPUT.join('')).toBe('1+1=');
    expect(CALCULATOR_KEY_CONTACTS).toEqual([10 / 30, 16 / 30, 22 / 30, 28 / 30]);
    const physicalKeys = [0, 1, 0, 2];
    for (const [index, at] of CALCULATOR_KEY_CONTACTS.entries()) {
      const key = physicalKeys[index];
      const expected = [0, 0, 0];
      expected[key] = CALCULATOR_KEY_STROKE;
      expect(sampleCalculatorPose(at)).toEqual({
        keyDepths: expected,
        inputCount: index,
        display: 0,
      });
      expect(sampleCalculatorPose(at - EPSILON).keyDepths[key]).toBeLessThan(CALCULATOR_KEY_STROKE);
      expect(sampleCalculatorPose(at + EPSILON).keyDepths[key]).toBeLessThan(CALCULATOR_KEY_STROKE);
      expect(sampleCalculatorPose(at - 0.1).keyDepths[key]).toBe(0);
      const releasedAt = at + CALCULATOR_KEY_RELEASE_SEC;
      expect(sampleCalculatorPose(releasedAt - EPSILON).inputCount).toBe(index);
      expect(sampleCalculatorPose(releasedAt)).toEqual({
        keyDepths: [0, 0, 0],
        inputCount: index + 1,
        display: 0,
      });
    }
    expect(sampleCalculatorPose(1.06)).toEqual({ keyDepths: [0, 0, 0], inputCount: 4, display: 0 });
    expect(sampleCalculatorPose(1.06 + EPSILON).display).toBeGreaterThan(0);
    expect(sampleCalculatorPose(COMMERCE_TIMING.calculator - EPSILON).display).toBeLessThan(1);
    expect(sampleCalculatorPose(COMMERCE_TIMING.calculator)).toEqual({
      keyDepths: [0, 0, 0],
      inputCount: 4,
      display: 1,
    });

    for (const time of SAMPLE_TIMES) {
      const pose = sampleCalculatorPose(time);
      expect(pose.keyDepths).toHaveLength(3);
      expect(pose.keyDepths.filter((depth) => depth > 0).length).toBeLessThanOrEqual(1);
      if (pose.display > 0) {
        expect(pose.keyDepths).toEqual([0, 0, 0]);
        expect(pose.inputCount).toBe(4);
      }
      if (time <= 1.06) expect(pose.display).toBe(0);
    }
  });
});

describe('commerce seekability and finite bounds', () => {
  it('bounds all moving parts before, at and after every beat, including subframes', () => {
    for (const time of SAMPLE_TIMES) {
      const vault = sampleVaultPose(time);
      within(vault.boltExtension, 0, VAULT_DOOR.boltTravel);
      within(vault.doorAngle, 0, VAULT_DOOR.openAngle);
      within(vault.handleAngle, -Math.PI / 3, 0);
      const wallet = sampleWalletPose(time);
      within(wallet.foldAngle, WALLET_CARD.openFold, WALLET_CARD.closedFold);
      within(wallet.cardY, WALLET_CARD_SEAT_Y, WALLET_CARD_SEAT_Y + WALLET_CARD.travel);
      const reader = sampleCardReaderPose(time);
      within(reader.cardX, READER_CARD.targetX, READER_CARD.startX);
      within(reader.cardY, READER_CARD.targetY, READER_CARD.startY);
      within(reader.cardZ, READER_CARD_CONTACT_Z, READER_CARD.startZ);
      within(reader.cardAngle, -0.12, 0);
      within(reader.confirmation, 0, 1);
      const calculator = sampleCalculatorPose(time);
      for (const depth of calculator.keyDepths) within(depth, 0, CALCULATOR_KEY_STROKE);
      within(calculator.inputCount, 0, 4);
      expect(Number.isInteger(calculator.inputCount)).toBe(true);
      within(calculator.display, 0, 1);
    }
  });

  it.each(
    Object.entries(SAMPLERS),
  )('%s is deterministic in repeated/reversed/shuffled requests', (_id, sample) => {
    const reference = SAMPLE_TIMES.map((time) => structuredClone(sample(time)));
    const indexes = SAMPLE_TIMES.map((_, index) => index);
    const shuffled = [...indexes].sort(
      (a, b) => ((a * 37) % indexes.length) - ((b * 37) % indexes.length),
    );
    for (const order of [indexes, [...indexes].reverse(), shuffled, shuffled]) {
      for (const index of order) expect(sample(SAMPLE_TIMES[index])).toEqual(reference[index]);
    }
  });

  it.each(Object.entries(SAMPLERS))('%s returns a finite rest for invalid time', (_id, sample) => {
    for (const time of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const pose = sample(time);
      expect(numbers(pose).every(Number.isFinite)).toBe(true);
      expect(pose).toEqual(sample(-1));
    }
  });

  it.each([
    ['vault', sampleVaultPose, 1.5],
    ['wallet', sampleWalletPose, COMMERCE_TIMING.wallet],
    ['card-reader', sampleCardReaderPose, 1.15],
    ['calculator', sampleCalculatorPose, COMMERCE_TIMING.calculator],
  ] as const)('%s holds its exact final pose without idle motion', (_id, sample, settledAt) => {
    const settled = sample(settledAt);
    for (const time of [settledAt + EPSILON, settledAt + 1 / 30, 2, 5, 37, 1e6]) {
      expect(sample(time)).toEqual(settled);
    }
    expect(sample(-1e6)).toEqual(sample(0));
  });
});
