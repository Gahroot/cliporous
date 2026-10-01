import { CHIP_RAW, CHIP_SCENE, CHIP_SOURCE, sourceFixture } from './fixtures';
import type { PerspectiveScene } from './types';

export interface PerspectiveFixture {
  sentences: string[];
  raw: Record<string, unknown>;
  scene: PerspectiveScene;
  storyboard: string[];
}

function common(sentences: string[], label: string, subject: string, outcome: string) {
  const source = sourceFixture(sentences);
  return {
    source,
    raw: {
      label,
      subject,
      outcome,
      ...source.beats,
      startWord: 0,
      endWord: source.words.length - 1,
      layout: 'stack',
    },
    story: {
      label,
      subject,
      outcome,
      setupAt: 0.3,
      actionAt: source.times.actionAt ?? 0,
      responseAt: source.times.responseAt ?? 0,
      checkAt: source.times.checkAt ?? 0,
      resolveAt: source.times.resolveAt ?? 0,
    },
  };
}

const customerText = [
  'Customer within a market: the original customer stays identifiable.',
  'The original customer belongs to the local segment.',
  'The local segment sits within the wider market.',
  'Illustrative shoppers reveal context, not a population count.',
  'The original customer remains inside the wider market.',
];
const customer = common(
  customerText,
  'Customer within a market',
  'original customer',
  'remains inside the wider market',
);

const branchText = [
  'Possible futures for the packing line share this present.',
  'The packing line could have lower capacity.',
  'The packing line might retain steady capacity.',
  'The packing line may reach higher capacity.',
  'For the packing line, no outcome is certain.',
];
const branch = common(branchText, 'Possible futures', 'packing line', 'no outcome is certain');
const branchAlternatives = [
  { label: 'lower capacity', change: 'reduced', qualifier: 'could have lower capacity' },
  { label: 'steady capacity', change: 'steady', qualifier: 'might retain steady capacity' },
  { label: 'higher capacity', change: 'expanded', qualifier: 'may reach higher capacity' },
] as const;

const rangeText = [
  'A qualitative forecast range concerns the packing line.',
  'The packing line could have lower capacity.',
  'The packing line could have higher capacity.',
  'The range spans lower capacity to higher capacity.',
  'For the packing line, no single forecast is certain.',
];
const range = common(
  rangeText,
  'A qualitative forecast range',
  'packing line',
  'no single forecast is certain',
);
const rangeAlternatives = [
  { label: 'lower capacity', change: 'reduced', qualifier: 'could have lower capacity' },
  { label: 'higher capacity', change: 'expanded', qualifier: 'could have higher capacity' },
] as const;

const mirrorText = [
  'Gate state correspondence: the actual conveyor stays closed.',
  'The actual conveyor has a closed safety gate.',
  "The digital model mirrors the actual conveyor's safety gate.",
  'This illustrative model is not live telemetry.',
  'The actual conveyor and digital model remain closed.',
];
const mirror = common(mirrorText, 'Gate state correspondence', 'actual conveyor', 'remain closed');

const simulatedText = [
  'Model-only intervention: the actual conveyor stays closed.',
  'The actual conveyor has a closed safety gate.',
  "The digital model mirrors the actual conveyor's safety gate.",
  'The digital model simulates opening the safety gate, simulation only.',
  'The actual conveyor remains closed and the digital model remains simulated.',
];
const simulated = common(
  simulatedText,
  'Model-only intervention',
  'actual conveyor',
  'digital model remains simulated',
);

export const PERSPECTIVE_FIXTURES: PerspectiveFixture[] = [
  {
    sentences: CHIP_SOURCE,
    raw: CHIP_RAW,
    scene: CHIP_SCENE,
    storyboard: [
      'Orient on the notched Atlas chip and its physical identity ring.',
      'Reveal the open server tray around the same chip while the camera pulls back.',
      'Reveal rack rails and vented drawers around the tray without replacing the chip.',
      'Reveal a cutaway data center and neighboring cabinets, retaining the visible ring.',
      'Settle the camera and hold the same chip inside the rack and center.',
    ],
  },
  {
    sentences: customerText,
    raw: {
      kind: 'scale-hierarchy',
      preset: 'customer-to-market',
      ...customer.raw,
      levels: [
        { label: 'local segment', ...customer.source.ranges[1] },
        { label: 'wider market', ...customer.source.ranges[2] },
      ],
    },
    scene: {
      kind: 'scale-hierarchy',
      preset: 'customer-to-market',
      ...customer.story,
      trackedId: 'tracked-subject',
      levels: [
        { id: 'level-0', label: 'local segment' },
        { id: 'level-1', label: 'wider market' },
      ],
    },
    storyboard: [
      'Orient on one shopper with a shoulder satchel and notched ring base.',
      'Two illustrative peers and a segment plinth appear around that original shopper.',
      'The camera pulls back to reveal market stalls beyond the segment.',
      'Distinct stalls provide wider market context; people are not quantitative counts.',
      'Hold the original shopper unchanged within both the segment and market.',
    ],
  },
  {
    sentences: branchText,
    raw: {
      kind: 'possible-futures',
      preset: 'branching-scenarios',
      ...branch.raw,
      alternatives: branchAlternatives.map((a, i) => ({ ...a, ...branch.source.ranges[i + 1] })),
      uncertainty: 'no outcome is certain',
    },
    scene: {
      kind: 'possible-futures',
      preset: 'branching-scenarios',
      ...branch.story,
      alternatives: branchAlternatives.map((a, i) => ({ ...a, id: `alternative-${i}` })),
      uncertainty: 'no outcome is certain',
    },
    storyboard: [
      'A packing conveyor on a solid present-state plinth establishes the common origin.',
      'Equal-weight solid paths separate miniature hypothetical lines from the unchanged present.',
      'Their shutters reveal reduced, steady and expanded capacity, without output counts.',
      'All alternatives retain source possibility phrases and identical visual weight.',
      'All three remain possible; no winner, probability or observed change is selected.',
    ],
  },
  {
    sentences: rangeText,
    raw: {
      kind: 'possible-futures',
      preset: 'forecast-range',
      ...range.raw,
      alternatives: rangeAlternatives.map((a, i) => ({ ...a, ...range.source.ranges[i + 1] })),
      uncertainty: 'no single forecast is certain',
    },
    scene: {
      kind: 'possible-futures',
      preset: 'forecast-range',
      ...range.story,
      alternatives: rangeAlternatives.map((a, i) => ({ ...a, id: `alternative-${i}` })),
      uncertainty: 'no single forecast is certain',
    },
    storyboard: [
      'A packing conveyor establishes the common present, not a precise forecast.',
      'Two model plinths diverge along equal-width routes from that same present.',
      'Qualitative lower and higher capacity shutters expose the two supported endpoints.',
      'An ungraduated bracket joins the alternatives; it has no ticks, area band or odds.',
      'Keep both endpoints visible and explicitly uncertain throughout the final hold.',
    ],
  },
  {
    sentences: mirrorText,
    raw: {
      kind: 'digital-twin',
      preset: 'mirror-state',
      ...mirror.raw,
      physical: { label: 'actual conveyor', state: 'closed', ...mirror.source.ranges[1] },
      model: { label: 'digital model', ...mirror.source.ranges[2] },
      partLabel: 'safety gate',
      qualifier: 'not live telemetry',
    },
    scene: {
      kind: 'digital-twin',
      preset: 'mirror-state',
      ...mirror.story,
      physical: { id: 'physical-line', label: 'actual conveyor' },
      model: { id: 'model-line', label: 'digital model' },
      partLabel: 'safety gate',
      physicalState: 'closed',
      qualifier: 'not live telemetry',
    },
    storyboard: [
      'Identify the actual conveyor with its closed safety gate and stationary parcel.',
      'Reveal a separate matching miniature on a corner-marked model stand.',
      'A correspondence link relates the same gate on the physical line and model.',
      'Keep both gates closed with the explicit not-live-telemetry qualification.',
      'Hold a matched illustrative state, never imply sensor updates or an intervention.',
    ],
  },
  {
    sentences: simulatedText,
    raw: {
      kind: 'digital-twin',
      preset: 'simulated-change',
      ...simulated.raw,
      physical: { label: 'actual conveyor', state: 'closed', ...simulated.source.ranges[1] },
      model: { label: 'digital model', ...simulated.source.ranges[2] },
      partLabel: 'safety gate',
      qualifier: 'simulation only',
      intervention: { state: 'open', ...simulated.source.ranges[3] },
    },
    scene: {
      kind: 'digital-twin',
      preset: 'simulated-change',
      ...simulated.story,
      physical: { id: 'physical-line', label: 'actual conveyor' },
      model: { id: 'model-line', label: 'digital model' },
      partLabel: 'safety gate',
      physicalState: 'closed',
      simulatedState: 'open',
      qualifier: 'simulation only',
    },
    storyboard: [
      'Identify the actual conveyor, closed gate and stationary parcel on the physical plinth.',
      'Reveal a matching closed-gate model on a visibly separate marked stand.',
      'Establish correspondence without changing either state or moving real parcels.',
      'Open only the model safety gate under the source simulation-only qualifier.',
      'Hold the simulated gate open while the actual gate and parcel remain unchanged.',
    ],
  },
];
