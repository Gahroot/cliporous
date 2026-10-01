/** Run from the repository root. Fixtures are synthetic, never performance measurements. */
import { readFileSync, writeFileSync } from 'node:fs';
import { conceptFixtureWords } from '../fixture-words.ts';

const path = 'scripts/explainer-stills/fixtures/concept-business-operations.json';
const existing = JSON.parse(readFileSync(path, 'utf8'));
const light = existing[0].palette;
const dark = {
  bgOuter: '#0b0d10', bgInner: '#242629', card: '#1f2125', cardRaised: '#2d2f33',
  cardBorder: 'rgba(244, 246, 248, 0.09)', text: '#f6f8f9', muted: '#8d8f92',
  accent: '#4d9dff', accent2: '#9b8cf7', accentSoft: 'rgba(77, 157, 255, 0.18)',
  positive: '#6fbf8a', negative: '#e0735f', paper: '#fbfbfc', paperText: '#0b0c0f',
  clay: ['#9dc4f5', '#d9ccee', '#698ebc'],
};
const fixtures = [];

function add(input, segments, storyboards, data, durationSec = 10) {
  const sourceText = segments.join(' ');
  const words = conceptFixtureWords(sourceText, durationSec);
  const count = words.length;
  const fields = ['setup', 'action', 'response', 'check', 'resolve'];
  let word = 0;
  const plannerInput = { ...input, startWord: 0, endWord: count - 1, layout: 'stack' };
  const scene = {
    kind: input.kind, preset: input.preset, label: input.label,
    subject: input.subject, outcome: input.outcome, ...data,
  };
  const sourceBeats = segments.map((text, i) => {
    plannerInput[`${fields[i]}Word`] = word;
    const at = Math.max(0.3, words[word].start);
    scene[`${fields[i]}At`] = at;
    word += text.split(/\s+/).length;
    return { at, text, storyboard: storyboards[i] };
  });
  const times = [
    (scene.setupAt + scene.actionAt) / 2, (scene.actionAt + scene.responseAt) / 2,
    scene.responseAt + 0.1, scene.checkAt + 0.1,
    scene.resolveAt + (durationSec - scene.resolveAt) / 2,
  ];
  fixtures.push({
    name: `${input.kind}-${input.preset}`,
    covers: [{ category: 'kind', id: input.kind }, { category: 'explanation', id: `${input.kind}/${input.preset}` }],
    description: 'Synthetic authored example, not measured business performance. Static shared camera; bounded 12-ticket, two-actor, three-invoice geometry without particles. All amounts and actors are source-stated; no net-profit or guaranteed return claim.',
    sourceText, sourceBeats, plannerInput, durationSec,
    cases: [
      { name: 'vertical-stack-light', layout: 'stack', aspect: '9:16' },
      { name: 'vertical-stack-flipped-dark', layout: 'stack-flipped', aspect: '9:16', palette: dark },
      { name: 'vertical-takeover-light', layout: 'takeover', aspect: '9:16' },
      { name: 'landscape-over-dark', layout: 'over', aspect: '16:9', palette: dark },
      { name: 'landscape-takeover-light', layout: 'takeover', aspect: '16:9' },
    ],
    palette: light, scene,
    samples: ['setup', 'first-movement', 'relationship-reveal', 'comparison', 'final-hold'].map((name, i) => ({ name, frame: Math.round(times[i] * 30) })),
  });
}

const actors = { seller: { id: 'seller', label: 'Maker' }, buyer: { id: 'buyer', label: 'Buyer' }, product: 'parcel' };
const market = { kind: 'market-exchange', subject: 'parcel', seller: 'Maker', buyer: 'Buyer', product: 'parcel' };
const marketBoards = [
  'Orient seller counter, buyer shopping bag and persistent taped parcel.',
  'Parcel and source-stated payment travel in opposed lanes; labels say in transit, not account balances.',
  'Buyer ownership is revealed at the actual parcel handoff, not before arrival.',
  'Compare source-stated ownership and payment received; a fee is deducted, never added.',
  'Static hold of the supported final owner and payment received, never entire net worth.',
];
add({ ...market, preset: 'direct-sale', label: 'Direct sale', outcome: 'Buyer keeps parcel', amount: 12, unit: 'dollars' }, [
  'Direct sale. Maker owns parcel.',
  'Buyer pays 12 dollars to Maker for parcel.',
  'Maker transfers parcel to Buyer.',
  'Buyer owns parcel. Maker receives 12 dollars.',
  'Buyer keeps parcel.',
], marketBoards, { ...actors, payment: { amount: 12, unit: 'dollars' } }, 8, 100);

add({ ...market, preset: 'platform-fee', label: 'Platform exchange', outcome: 'Buyer keeps parcel', amount: 12, unit: 'dollars', platform: 'Market', fee: 2 }, [
  'Platform exchange. Maker owns parcel. Buyer approaches the marketplace.',
  'Buyer pays 12 dollars to Market for parcel.',
  'Maker transfers parcel to Buyer. The parcel changes ownership.',
  'Buyer owns parcel. Market keeps 2 dollars as fee. Market pays 10 dollars to Maker.',
  'Buyer keeps parcel. The stated fee is part of the original payment.',
], marketBoards, { ...actors, payment: { amount: 12, unit: 'dollars' }, platform: { id: 'platform', label: 'Market', fee: 2 } }, 10, 110);

add({ ...market, preset: 'unmatched-market', label: 'Unmatched market', outcome: 'Maker keeps parcel' }, [
  'Unmatched market. Maker owns parcel. Both participants are present.',
  'Buyer finds no match with Maker. The buyer remains waiting.',
  'Maker keeps parcel. Ownership remains unchanged in this market.',
  'Buyer makes no payment to Maker. Nothing has been exchanged.',
  'Maker keeps parcel. Both participants remain separate without an exchange.',
], [
  'Same recognizable seller and buyer orient around the seller-owned parcel.',
  'Buyer stays on their side of the interrupted exchange lane.',
  'Pause posts and unchanged parcel tray expose the missing match.',
  'No payment object or completed ownership transfer appears.',
  'Hold the unmatched buyer and seller-owned parcel without invented success.',
], actors, 10, 100);

const allocation = { kind: 'resource-allocation', subject: 'Capacity', total: 8, unit: 'hours' };
const reallocated = [
  { label: 'Design', before: 4, after: 6, requested: 6 },
  { label: 'Testing', before: 4, after: 2, requested: 2 },
];
add({ ...allocation, preset: 'reallocate', label: 'Reallocate hours', outcome: 'Testing gives up 2 hours', projects: reallocated }, [
  'Reallocate hours. Capacity has 8 hours. Design starts with 4 hours. Testing starts with 4 hours.',
  'Design requests 6 hours. Testing requests 2 hours.',
  'Design receives 2 hours from Testing.',
  'Design has 6 hours. Testing has 2 hours.',
  'Testing gives up 2 hours.',
], [
  'Eight clock tickets occupy two recognizable project workbenches.',
  'Requested sockets appear; the donor retains its identity.',
  'Exactly two existing tickets cross from Testing to Design.',
  'Six and two tickets show conserved capacity and the opportunity cost.',
  'Hold the reduced donor allocation; no extra resources appear.',
], { total: 8, unit: 'hours', projects: reallocated.map((p, i) => ({ id: `project-${i}`, ...p })) }, 10, 150);

const constrained = [
  { label: 'Project implementation', before: 0, after: 4, requested: 6 },
  { label: 'Production preparation', before: 0, after: 4, requested: 6 },
];
add({ ...allocation, preset: 'constrained-projects', label: 'Finite capacity', outcome: 'Requests exceed capacity', projects: constrained }, [
  'Finite capacity. Capacity has 8 hours. Project implementation starts with 0 hours. Production preparation starts with 0 hours.',
  'Project implementation requests 6 hours. Production preparation requests 6 hours.',
  'Capacity assigns 4 hours to Project implementation. Capacity assigns 4 hours to Production preparation.',
  'Project implementation has 4 hours. Production preparation has 4 hours. Project implementation lacks 2 hours. Production preparation lacks 2 hours.',
  'Requests exceed capacity. Both projects retain their stated allocation.',
], [
  'Eight clock tickets wait in the finite central reserve.',
  'Two project workbenches expose six requested slots apiece.',
  'The same eight tickets split four and four; the reserve becomes empty.',
  'Four unfilled sockets remain, two for each named request.',
  'Hold unresolved requests and conserved allocation, not budget exhaustion.',
], { total: 8, unit: 'hours', projects: constrained.map((p, i) => ({ id: `project-${i}`, ...p })) }, 12, 160);

for (const [preset, revenue] of [['positive-margin', 12], ['break-even', 8], ['negative-margin', 6]]) {
  const costs = [{ label: 'Materials', amount: 5 }, { label: 'Delivery', amount: 3 }];
  const remainder = revenue - 8;
  const outcome = remainder < 0 ? `Stated-cost shortfall is ${-remainder} dollars` : `Stated-cost remainder is ${remainder} dollars`;
  add({ kind: 'unit-economics', preset, label: 'Costs per parcel', subject: 'parcel', outcome, saleUnit: 'one parcel', unit: 'dollars', revenue, costs, remainder }, [
    `Costs per parcel. One parcel brings ${revenue} dollars in revenue.`,
    'Materials costs 5 dollars per one parcel. Delivery costs 3 dollars per one parcel.',
    'Stated costs total 8 dollars per one parcel.',
    `Revenue less stated costs leaves ${remainder} dollars per one parcel.`,
    `${outcome}. This calculation includes only the stated costs.`,
  ], [
    'One taped sale parcel, a banknote and an open result envelope establish the explicit denominator.',
    'The banknote separates into source-named invoices, retaining the same sale context.',
    'Invoices and common-scale amount rails reveal the stated cost total.',
    `Subtraction exposes ${remainder > 0 ? 'a bounded remainder' : remainder === 0 ? 'an empty break-even envelope' : 'unfunded costs and a minus-marked envelope'}.`,
    `Hold ${remainder > 0 ? 'the remainder after stated costs only' : remainder === 0 ? 'zero remainder without growth' : 'the explicit shortfall without turning it into profit'}.`,
  ], { saleUnit: 'one parcel', unit: 'dollars', revenue, costs: costs.map((c, i) => ({ id: `cost-${i}`, ...c })), remainder }, 10, 100);
}

writeFileSync(path, `${JSON.stringify(fixtures, null, 2)}\n`);
console.log(`Wrote ${fixtures.length} fixtures, ${fixtures.reduce((sum, f) => sum + f.samples.length, 0)} semantic samples.`);
