import { describe, expect, it } from 'vitest';
import { HERO_CATALOG } from '../../remotion/compositions/explainer/hero-catalog';
import type { HeroProp } from '../../remotion/compositions/explainer/types';
import type { PlannerWord } from './kind-spec';
import { buildShortlist, SHORTLIST_LIMITS, shortlistText } from './shortlist';

function toWords(text: string): PlannerWord[] {
  return text.split(/\s+/).map((word, i) => ({ text: word, start: i * 0.4, end: i * 0.4 + 0.35 }));
}

const CASES = [
  {
    prop: 'microphone',
    positive: 'Unmute the microphone before recording the podcast so our guest can speak.',
    counterexample: 'Mute the colors and give the brand a distinct voice.',
  },
  {
    prop: 'camera',
    positive: 'Focus the camera lens, then press the shutter to take a photo.',
    counterexample: 'Reduce our exposure to financial risk before entering the market.',
  },
  {
    prop: 'clapperboard',
    positive: 'Close the clapperboard to slate the take before we start filming.',
    counterexample: 'The roadmap is a clean slate; we will take the next step.',
  },
  {
    prop: 'metronome',
    positive: 'Use a metronome to keep the tempo and hold a steady beat during practice.',
    counterexample: 'Finish in time for the deadline before the client arrives.',
  },
  {
    prop: 'watering-can',
    positive: 'Tilt the watering can to water the seedling in the garden.',
    counterexample: 'We need to water down the pitch, not plant another rumor.',
  },
  {
    prop: 'wrench',
    positive:
      'Seat the wrench on the nut before you tighten the bolt; use the spanner to loosen the nut.',
    counterexample: 'Tighten the budget and loosen the schedule before we negotiate.',
  },
] satisfies { prop: HeroProp; positive: string; counterexample: string }[];

describe('remaining media/tools prop reachability', () => {
  it.each(CASES)('$prop reaches the bounded planner menu for a concrete matching scenario', ({
    prop,
    positive,
  }) => {
    const words = toWords(positive);
    const shortlist = buildShortlist(words);
    expect(HERO_CATALOG[prop].triggers.test(shortlistText(words))).toBe(true);
    expect(shortlist.heroProps).toContain(prop);
    expect(shortlist.heroProps.length).toBeLessThanOrEqual(SHORTLIST_LIMITS.maxProps);
    expect(buildShortlist(words).heroProps).toEqual(shortlist.heroProps);
  });

  it.each(CASES)('$prop is not offered for ambiguous words without the object/action', ({
    prop,
    counterexample,
  }) => {
    const words = toWords(counterexample);
    expect(HERO_CATALOG[prop].triggers.test(shortlistText(words))).toBe(false);
    expect(buildShortlist(words).heroProps).not.toContain(prop);
  });
});
