import { describe, expect, it } from 'vitest';
import { COMPOSED_KIND_SPECS } from './kinds-composed';
import { buildShortlist, SHORTLIST_LIMITS } from './shortlist';

const positive = [
  [
    'synchronization',
    'The belts are out of sync, the metronome sets a common beat, they align and the envelope passes across.',
  ],
  ['relay', 'The key enters and turns, the lock releases, then the door opens.'],
  ['relay', 'The watering can tilts and water reaches the soil, then the sprout grows.'],
  ['relay', 'The magnet pulls the workpiece onto the conveyor, then the parcel closes.'],
  ['relay', 'The battery supplies the chip, the chip activates, then the bulb lights.'],
  ['relay', 'The puzzle piece seats, the connection becomes active, and the gears turn.'],
  ['relay', 'The idea enters the gears, the gears process it, and the conveyor delivers a parcel.'],
  [
    'exploded-view',
    'The mechanism assembly separates into parts, we explain the gear detail, then reassemble it.',
  ],
  [
    'exploded-view',
    'The parcel assembly separates into parts, we explain the lid detail, then reassemble it.',
  ],
  [
    'exploded-view',
    'The computing assembly separates into parts, we explain the chip detail, then reassemble it.',
  ],
] as const;
const negative = [
  'We should synchronize the team and keep a shared rhythm.',
  'I practice piano with a metronome every day.',
  'Here is a key and a door, two unrelated things.',
  'A battery is inside the computer and a bulb is on the desk.',
  'An idea is not automatically a working process or a completed result.',
  'Watering a plant is a metaphor for leadership.',
  'The magnet is on the parcel that the conveyor carries.',
  'A computing assembly has a board, a chip and a heatsink.',
  'The mechanism assembly separates into parts; we explain the gear but leave it apart.',
  'The team assembly separates into groups, we explain details, and return to the meeting.',
];
const words = (text: string) =>
  text.split(/\s+/).map((text, i) => ({ text, start: i * 0.3, end: i * 0.3 + 0.2 }));
describe('narrow composed shortlist relations', () => {
  it.each(positive)('offers %s for its complete supported relation', (kind, text) => {
    const result = buildShortlist(words(text));
    expect(result.kinds.map((spec) => spec.kind)).toContain(kind);
    expect(result.scores[kind]).toBeGreaterThan(0);
    expect(result.kinds.length).toBeLessThanOrEqual(SHORTLIST_LIMITS.maxKinds);
  });
  it.each(negative)('does not trigger a composed kind for "%s"', (text) => {
    const result = buildShortlist(words(text), COMPOSED_KIND_SPECS);
    expect(result.scores).toEqual({});
    expect(result.kinds).toEqual([]);
  });
});
