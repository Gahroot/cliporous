import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  TECHNOLOGY_KINDS,
  TECHNOLOGY_PRESETS,
} from '../../remotion/compositions/explainer/technology/types';
import type { PlannerWord } from './kind-spec';
import { ALL_KIND_SPECS } from './kinds';
import type { PlanningIdea } from './planning-outline';
import {
  buildIdeaShortlist,
  buildShortlist,
  SHORTLIST_LIMITS,
  scoreKind,
  shortlistText,
} from './shortlist';

function toWords(text: string): PlannerWord[] {
  return text.split(/\s+/).map((w, i) => ({ text: w, start: i * 0.4, end: i * 0.4 + 0.35 }));
}

describe('organization/economics/markets source-specific selection', () => {
  it.each([
    ['organization-map', 'Federated pods retain local decisions and shared responsibilities.'],
    ['system-reconciliation', 'Merger reconciliation leaves two source identities unresolved.'],
    ['operating-cost', 'Compare quoted offers: Luma quotes Seatplan price at 20 USD per seat.'],
    ['scale-economics', 'Fixed and variable costs use two stated output samples.'],
    ['value-capture', 'Value capture allocation retains an explicit remainder.'],
    ['market-dependency', "Iris's Design does not complement Theo's Build."],
    ['procurement-commitment', 'Pike quoted Estimate with amount 12 USD. Mira paid Pike.'],
  ])('offers %s from ordinary bounded source wording', (kind, text) => {
    const menu = buildShortlist(toWords(text));
    expect(menu.kinds.map((spec) => spec.kind)).toContain(kind);
    expect(menu.scores[kind]).toBeGreaterThan(0);
    expect(menu.kinds.length).toBeLessThanOrEqual(16);
    expect(menu.heroProps.length).toBeLessThanOrEqual(10);
  });
  it.each([
    ['organization-map', 'We organized photos into folders.'],
    ['system-reconciliation', 'Git merged the branch and resolved a source-code conflict.'],
    ['operating-cost', 'The algorithm has a computational cost and a training loss.'],
    ['scale-economics', 'The fixed width changes when the CSS variable changes.'],
    ['value-capture', 'This screen captures a frame and displays the color value.'],
    ['market-dependency', 'The television channel aired a stock market forecast.'],
    ['procurement-commitment', 'She quoted a sentence and accepted an invitation.'],
  ])('does not score unrelated %s words or generic AI/business promises', (kind, text) => {
    expect(buildShortlist(toWords(text)).scores[kind] ?? 0).toBe(0);
    expect(buildShortlist(toWords('AI may change every business someday.')).scores[kind] ?? 0).toBe(
      0,
    );
  });
});

describe('Detroit and hybrid targeted selection', () => {
  it.each([
    ['detroit-place', 'The Renaissance Center defines this Detroit skyline.'],
    ['fund-flow', 'The fund deploys contributed capital to two businesses.'],
    ['ownership-change', 'New shares dilute the existing percentage ownership.'],
    ['portfolio-exposure', 'Two funds have shared holdings and overlapping exposure.'],
    ['cash-timing', 'Profit versus cash differs because payment arrives next month.'],
    ['token-attention', 'Word attention illustrates how It refers to shop.'],
    ['inference-tradeoff', 'Model cost and latency differ on this benchmark task.'],
  ])('offers %s without expanding selection budgets', (kind, text) => {
    const menu = buildShortlist(toWords(text));
    expect(menu.kinds.map((spec) => spec.kind)).toContain(kind);
    expect(menu.scores[kind]).toBeGreaterThan(0);
    expect(menu.kinds.length).toBeLessThanOrEqual(16);
    expect(menu.heroProps.length).toBeLessThanOrEqual(10);
  });
  it.each([
    [
      'detroit-place',
      'A fox ran by the train station near central park during the Renaissance lecture.',
    ],
    ['fund-flow', 'We allocate two hours to testing.'],
    ['portfolio-exposure', 'Different names look interesting.'],
    ['token-attention', 'Choose the next token probability from the distribution.'],
    ['inference-tradeoff', 'An agent selects a tool to retrieve context.'],
  ])('does not score the unrelated %s story', (kind, text) => {
    expect(buildShortlist(toWords(text)).scores[kind] ?? 0).toBe(0);
  });
});

describe('technology domain selection without broader menus', () => {
  const fixtures = TECHNOLOGY_KINDS.flatMap(
    (kind) =>
      JSON.parse(
        readFileSync(
          new URL(
            `../../../../scripts/explainer-stills/fixtures/technology-${kind}.json`,
            import.meta.url,
          ),
          'utf8',
        ),
      ) as { sourceText: string; scene: { kind: string; preset: string } }[],
  );

  it('has one source example for every approved preset and exactly one registry entry per kind', () => {
    expect(
      fixtures.map((fixture) => `${fixture.scene.kind}/${fixture.scene.preset}`).sort(),
    ).toEqual(
      TECHNOLOGY_KINDS.flatMap((kind) =>
        TECHNOLOGY_PRESETS[kind].map((preset) => `${kind}/${preset}`),
      ).sort(),
    );
    for (const kind of TECHNOLOGY_KINDS)
      expect(ALL_KIND_SPECS.filter((spec) => spec.kind === kind)).toHaveLength(1);
    expect(SHORTLIST_LIMITS).toEqual({
      maxKinds: 16,
      minKinds: 10,
      maxProps: 10,
      minProps: 5,
      maxHitsPerTrigger: 3,
    });
  });

  it.each(fixtures)('offers $scene.kind/$scene.preset from ordinary source wording', (fixture) => {
    const menu = buildShortlist(toWords(fixture.sourceText));
    expect(menu.kinds.map((spec) => spec.kind)).toContain(fixture.scene.kind);
    expect(menu.scores[fixture.scene.kind]).toBeGreaterThan(0);
    expect(menu.kinds.length).toBeLessThanOrEqual(16);
    expect(menu.heroProps.length).toBeLessThanOrEqual(10);
  });

  it.each([
    ['agent-workflow', 'Our travel agent likes human stories.'],
    ['retrieval-grounding', 'I found retrieval difficult at the library.'],
    ['context-window', 'I remember our shared childhood memories.'],
    ['software-release', 'We released a new song after rehearsals.'],
    ['request-routing', 'The customer requested a new bus route.'],
  ])('does not score the misleading %s example', (kind, text) => {
    expect(buildShortlist(toWords(text)).scores[kind] ?? 0).toBe(0);
  });
});

describe('concept domain selection without broader menus', () => {
  const packs = [
    'information',
    'inference',
    'business-operations',
    'business-populations',
    'perspective',
    'adaptive',
  ];
  const rows = packs.flatMap(
    (pack) =>
      JSON.parse(
        readFileSync(
          new URL(
            `../../../../scripts/explainer-stills/fixtures/concept-${pack}.json`,
            import.meta.url,
          ),
          'utf8',
        ),
      ) as { sourceText: string; scene: { kind: string } }[],
  );
  const examples = rows.filter(
    (row, index) => rows.findIndex((other) => other.scene.kind === row.scene.kind) === index,
  );

  it('adds an offline evaluation example for each of the 18 concept kinds', () => {
    expect(examples).toHaveLength(18);
  });

  it.each(
    examples,
  )('offers $scene.kind from its source words within the existing caps', (example) => {
    const menu = buildShortlist(toWords(example.sourceText));
    expect(menu.kinds.map((spec) => spec.kind)).toContain(example.scene.kind);
    expect(menu.scores[example.scene.kind]).toBeGreaterThan(0);
    expect(menu.kinds.length).toBeLessThanOrEqual(SHORTLIST_LIMITS.maxKinds);
    expect(menu.heroProps.length).toBeLessThanOrEqual(SHORTLIST_LIMITS.maxProps);
  });
});

/**
 * Offline eval set: realistic podcast lines → a kind (and optionally a prop)
 * that MUST be on the menu the planner sees. This is how we notice when a new
 * kind's triggers crowd out an old one, or a line stops reaching its kind.
 */
const CASES: { text: string; kind: string; prop?: string }[] = [
  {
    text: 'Lift the roof off this house and look inside: the cutaway reveals the kitchen and bedroom, with plumbing behind the walls.',
    kind: 'house-cutaway',
  },
  {
    text: 'Start with a blueprint for the house, lay the foundation, build the walls and roof, then compare the finished home with the plan.',
    kind: 'house-build',
  },
  {
    text: 'Repainting this house is a cosmetic renovation; replacing a load-bearing beam is a structural renovation underneath the surface.',
    kind: 'house-renovation',
  },
  {
    text: 'This house key has scoped access: it opens the living room, not the private bedroom. Revoke the key and that access stops.',
    kind: 'property-access',
  },
  {
    text: 'Repeat the same house template across a neighborhood. Each home has the same structure, but the surroundings and context differ.',
    kind: 'neighborhood',
  },
  {
    text: 'The sofa and table need to fit the floor plan. Rearrange the furniture inside the fixed room without moving its walls.',
    kind: 'floorplan-fit',
  },
  {
    text: 'Compare two renovation options for the same house: a side extension or a new upper room. Each alternative has a tradeoff.',
    kind: 'house-options',
  },
  {
    text: 'The rental property is vacant, then a tenant moves in. Occupancy brings rental income, while maintenance remains a separate expense.',
    kind: 'property-lifecycle',
  },
  {
    text: 'The coordinator delegates tasks to specialist agents. Research and writing happen in parallel, then their results come back together.',
    kind: 'agent-team',
  },
  {
    text: 'The agent makes a plan, encounters an obstacle, and replans. A fixed automation follows its original route instead of adapting.',
    kind: 'agent-plan',
  },
  {
    text: 'Each tool call consumes the agent budget. When the allowance runs out the agent stops and requests more, rather than spending without limits.',
    kind: 'agent-budget',
  },
  {
    text: 'Training examples change the model during training. Later, inference uses that trained model on a new input without retraining it.',
    kind: 'model-training',
  },
  {
    text: 'Evaluate both models on the same tests. Compare their accuracy and speed as tradeoffs, not a universal winner.',
    kind: 'model-evaluation',
  },
  {
    text: 'Two sources disagree. These conflicting claims remain unresolved, so we refer the evidence to a human reviewer instead of inventing agreement.',
    kind: 'evidence-conflict',
  },
  { text: 'The formula is simple: consistency times time equals results.', kind: 'equation' },
  {
    text: 'Plot every task on effort versus impact and do the high impact low effort ones first.',
    kind: 'quadrant',
  },
  {
    text: 'Your business lives in the sweet spot where what you love meets what people pay for.',
    kind: 'venn',
  },
  {
    text: 'ROI basically means how much you get back for every dollar you put in.',
    kind: 'definition',
  },
  {
    text: 'A Harvard study found that people who write goals down are twice as likely to hit them.',
    kind: 'study',
  },
  { text: 'One in four founders quit in the first year.', kind: 'pictogram' },
  {
    text: 'My top three channels, ranked: number one is referrals, then SEO, then email.',
    kind: 'ranking',
  },
  {
    text: 'Rent costs 2,000 a month, ads another 500, tools 200. Add it up, that is 2,700 a month.',
    kind: 'receipt',
  },
  {
    text: 'I posted every day for thirty days straight and the streak changed everything.',
    kind: 'streak',
  },
  {
    text: "It's a spectrum. Most people sit somewhere between lazy and burnt out.",
    kind: 'spectrum',
  },
  { text: 'As Naval says, play long-term games with long-term people.', kind: 'quote' },
  { text: 'It was all over the news, every headline said the startup was dead.', kind: 'headline' },
  {
    text: 'I was broke, hit rock bottom, then had my breakthrough and a real comeback.',
    kind: 'journey',
  },
  { text: 'Just google it. People search how to start a podcast every day.', kind: 'search' },
  {
    text: 'I wrote one line of code, ran the command in the terminal, and the bug was gone.',
    kind: 'code',
  },
  {
    text: 'People only see the surface, the launch, not what is underneath: years of hidden work.',
    kind: 'iceberg',
  },
  {
    text: 'You have to weigh it: the risk versus reward here is massively in your favour.',
    kind: 'balance',
  },
  {
    text: 'Third place went to email, second place SEO, and the winner, the gold medal, referrals.',
    kind: 'podium',
  },
  {
    text: 'If you invest 500 a month, compound interest turns it into a million over time.',
    kind: 'compound',
  },
  {
    text: 'Better sleep leads to more energy, which leads to focus. One domino knocks over the next, a chain reaction.',
    kind: 'dominoes',
  },
  {
    text: 'Step by step: learn, then build, then scale. Take it one step at a time and climb.',
    kind: 'stairs',
  },
  {
    text: 'Approvals are the bottleneck: requests queue behind the gate until we open it and clear the backlog.',
    kind: 'bottleneck',
  },
  {
    text: 'Orders pile up waiting for approval; remove the constraint and let them flow through.',
    kind: 'bottleneck',
  },
  {
    text: 'A first push gets it moving, repeated pushes build momentum, then the wheel drives the output before coasting to a stop.',
    kind: 'momentum',
  },
  {
    text: 'Each small push helps; keep pushing and the flywheel starts driving the output, then it coasts to a stop.',
    kind: 'momentum',
  },
  {
    text: 'At first we push hard; shifting the fulcrum changes the leverage, then the same effort lifts the load and holds it.',
    kind: 'leverage',
  },
  {
    text: 'It takes real effort to move this weight. Move the pivot closer and the load rises with the same push, then stays up.',
    kind: 'leverage',
  },
  {
    text: 'Water flows in, but leaks drain the tank. Seal those leaks and the retained level rises until we stop the inflow.',
    kind: 'resource-leak',
  },
  {
    text: 'Revenue comes in, hidden fees leak money away; close those leaks and we retain more of what comes in.',
    kind: 'resource-leak',
  },
  {
    text: 'We keep filling the bucket but it leaks; plug the holes and the water level rises instead of draining away.',
    kind: 'resource-leak',
  },
  {
    text: 'Pressure rises above target, a sensor detects the error, the valve reduces flow, and the gauge settles exactly at target.',
    kind: 'feedback-control',
  },
  {
    text: 'The gauge goes above its setpoint, a sensor responds, then a valve corrects the flow and it settles at the setpoint.',
    kind: 'feedback-control',
  },
  {
    text: 'Temperature overshoots the target; the sensor signals the valve to cut the hot water flow until it returns to target.',
    kind: 'feedback-control',
  },
  {
    text: 'Temporary supports hold the blocks while the keystone locks the arch; then we withdraw the supports and it stands on its own.',
    kind: 'keystone',
  },
  {
    text: 'We build the stones on scaffolding, seat the center stone, then remove the scaffolding and the arch stays up.',
    kind: 'keystone',
  },
  {
    text: 'Falsework carries the wedges until the keystone seats firmly. Lower the supports and the locked arch holds without them.',
    kind: 'keystone',
  },
  {
    text: 'Tokens approach the junction. The tongue seats toward the right track, then they pass the junction and arrive on the chosen branch.',
    kind: 'switchyard',
  },
  {
    text: 'Parcels approach the fork; seat the switch toward Express rather than Review, then commit the parcels to that branch and they arrive at Express.',
    kind: 'switchyard',
  },
  {
    text: 'Inbound requests approach the fork. The rail switch selects Review over Archive; once locked, we send them down that route until they reach Review.',
    kind: 'switchyard',
  },
  // Older kinds must stay reachable.
  { text: 'First, write the outline. Second, record it. Third, edit it down.', kind: 'checklist' },
  {
    text: 'Most people think you need more ads. That is a myth, the truth is you need a better offer.',
    kind: 'myth-fact',
  },
  {
    text: 'Out of a thousand leads only fifty convert, the funnel narrows at every step.',
    kind: 'funnel',
  },
  {
    text: 'It is a flywheel: content brings leads, leads bring revenue, revenue funds content, over and over.',
    kind: 'loop',
  },
  { text: 'Before, I edited every video by hand. Now the old way is gone.', kind: 'before-after' },
  // Every new icon must be reachable from a realistic transcript, within existing menu caps.
  { text: 'Protect customer privacy with better security.', kind: 'hero', prop: 'shield' },
  { text: 'Upload your backup to cloud storage.', kind: 'hero', prop: 'cloud' },
  { text: 'Your account is verified and approved.', kind: 'hero', prop: 'checkmark' },
  { text: 'This is a serious warning about risk.', kind: 'hero', prop: 'warning' },
  { text: 'Lightning speed gives you instant results.', kind: 'hero', prop: 'lightning' },
  { text: 'The conversation changed after customer feedback.', kind: 'hero', prop: 'chat' },
  { text: 'Leadership means earning that crown.', kind: 'hero', prop: 'crown' },
  { text: 'A rare diamond represents quality.', kind: 'hero', prop: 'diamond' },
  { text: 'Bookmark this reference to remember it.', kind: 'hero', prop: 'bookmark' },
  { text: 'A compass gives you direction and purpose.', kind: 'hero', prop: 'compass' },
  { text: 'Connect the integration to your partners.', kind: 'hero', prop: 'link' },
  { text: 'Graduation from university earns your degree.', kind: 'hero', prop: 'graduation-cap' },
  // Authored mechanisms remain reachable without displacing the existing loop case.
  {
    text: 'Each small push keeps the flywheel turning with momentum.',
    kind: 'hero',
    prop: 'flywheel',
  },
  { text: 'Move the fulcrum on the lever to lift the load.', kind: 'hero', prop: 'lever' },
  { text: 'Pull the taut cable over the pulley to raise the load.', kind: 'hero', prop: 'pulley' },
  { text: 'Compress the spring, store tension, then release it.', kind: 'hero', prop: 'spring' },
  {
    text: 'The ratchet advances one notch and never slips backwards.',
    kind: 'hero',
    prop: 'ratchet',
  },
  {
    text: 'The conveyor belt moves every parcel along the production line.',
    kind: 'hero',
    prop: 'conveyor',
  },
  { text: 'Open the valve to control the flow through the pipe.', kind: 'hero', prop: 'valve' },
  {
    text: 'Watch the pressure gauge respond when the input rises.',
    kind: 'hero',
    prop: 'pressure-gauge',
  },
  {
    text: 'The rail switch selects the right track before the token arrives.',
    kind: 'hero',
    prop: 'rail-switch',
  },
  { text: 'Release the vault bolts before opening the heavy door.', kind: 'hero', prop: 'vault' },
  { text: 'Keep your cards in the wallet for everyday spending.', kind: 'hero', prop: 'wallet' },
  {
    text: 'Tap your card on the contactless reader and wait for confirmation.',
    kind: 'hero',
    prop: 'card-reader',
  },
  {
    text: 'Use a calculator to calculate the cost before deciding.',
    kind: 'hero',
    prop: 'calculator',
  },
  { text: 'Fold the parcel panels and close the shipping box.', kind: 'hero', prop: 'parcel' },
  {
    text: 'File the documents in the filing cabinet to organize your records.',
    kind: 'hero',
    prop: 'filing-cabinet',
  },
  { text: 'Fill the reservoir to build a resource reserve.', kind: 'hero', prop: 'reservoir' },
  { text: 'A prism splits one beam of light into separate paths.', kind: 'hero', prop: 'prism' },
  {
    text: 'Close the aperture so the iris blades let less light in.',
    kind: 'hero',
    prop: 'aperture',
  },
  {
    text: 'Use a magnifying glass to inspect the fine print and see that detail.',
    kind: 'hero',
    prop: 'magnifying-glass',
  },
  {
    text: 'Extend the telescope, then aim toward the distant horizon.',
    kind: 'hero',
    prop: 'telescope',
  },
  {
    text: 'Lower the bridge leaves to bridge the gap until their tips meet.',
    kind: 'hero',
    prop: 'bridge',
  },
  {
    text: 'Connect both sides of the gap so people can cross safely.',
    kind: 'hero',
    prop: 'bridge',
  },
  {
    text: 'Seat the paired blocks in the archway before the keystone completes the arch.',
    kind: 'hero',
    prop: 'arch',
  },
  {
    text: 'The center stone seats last and locks both sides in place.',
    kind: 'hero',
    prop: 'arch',
  },
  // Hero props follow the transcript.
  {
    text: 'Save a little every month, that savings account is your safety net.',
    kind: 'hero',
    prop: 'piggybank',
  },
  { text: 'Burnout is real. My energy was completely drained.', kind: 'hero', prop: 'battery' },
  { text: 'AI changed everything. ChatGPT writes my first drafts.', kind: 'hero', prop: 'chip' },
  { text: 'Set one clear goal and aim everything at that target.', kind: 'hero', prop: 'target' },
  {
    text: 'Patience. It takes years, and time is running out for people who wait.',
    kind: 'hero',
    prop: 'hourglass',
  },
];

describe('buildShortlist eval set', () => {
  it.each([
    'We are busy today.',
    'Under pressure, take a break.',
    'Work is busy and the pressure is high.',
    'I queued up my favourite song.',
    'It is a flywheel: content brings leads, leads bring revenue, revenue funds content, over and over.',
  ])('does not offer a bottleneck for ambiguous text: %s', (text) => {
    const s = buildShortlist(toWords(text));
    expect(s.kinds.map((kind) => kind.kind)).not.toContain('bottleneck');
    expect(s.scores.bottleneck).toBeUndefined();
  });
  it.each([
    { text: 'We need more momentum this quarter.', simpler: 'statement' },
    { text: 'Consistency matters. Show up every day.', simpler: 'statement' },
    { text: 'Each small push keeps the flywheel turning with momentum.', simpler: 'hero' },
    {
      text: 'It is a flywheel: content brings leads, leads bring revenue, revenue funds content, over and over.',
      simpler: 'loop',
    },
    { text: 'We used financial leverage to fund the deal.', simpler: 'statement' },
    { text: 'That offer gives us leverage in the negotiation.', simpler: 'statement' },
    { text: 'Work smarter, not harder.', simpler: 'statement' },
    { text: 'Pull the lever to open the door.', simpler: 'hero' },
    {
      text: 'Plot every task on effort versus impact and do the high impact low effort ones first.',
      simpler: 'quadrant',
    },
  ])('keeps $simpler instead of a mechanism for "$text"', ({ text, simpler }) => {
    const s = buildShortlist(toWords(text));
    expect(s.kinds.map((kind) => kind.kind)).toContain(simpler);
    for (const kind of ['momentum', 'leverage']) {
      expect(s.kinds.map((entry) => entry.kind)).not.toContain(kind);
      expect(s.scores[kind]).toBeUndefined();
    }
  });
  it.each([
    { text: 'Pressure.', simpler: 'statement' },
    { text: 'Under pressure, take a break.', simpler: 'statement' },
    { text: 'Watch the pressure gauge respond when the input rises.', simpler: 'hero' },
    { text: 'The gauge is above target but we only record the reading.', simpler: 'hero' },
    {
      text: 'Pressure rises above target, the sensor sends an alert, and we leave the valve alone.',
      simpler: 'hero',
    },
    { text: 'Customer feedback helped us improve the landing page.', simpler: 'statement' },
    { text: 'Money leaks away on subscriptions every month.', simpler: 'statement' },
    { text: 'Revenue comes in but money leaks away on fees.', simpler: 'statement' },
    { text: 'Seal the parcel before it leaks in transit.', simpler: 'hero' },
    { text: 'Fill the reservoir and keep some water in reserve.', simpler: 'hero' },
    {
      text: 'It is a flywheel: content brings leads, leads bring revenue, revenue funds content, over and over.',
      simpler: 'loop',
    },
  ])('keeps $simpler without inventing a corrective system for "$text"', ({ text, simpler }) => {
    const s = buildShortlist(toWords(text));
    expect(s.kinds.map((kind) => kind.kind)).toContain(simpler);
    for (const kind of ['resource-leak', 'feedback-control']) {
      expect(s.kinds.map((entry) => entry.kind)).not.toContain(kind);
      expect(s.scores[kind]).toBeUndefined();
    }
  });
  it.each([
    { text: 'Trust is the keystone of our business.', simpler: 'statement' },
    { text: 'That stone arch has stood for centuries.', simpler: 'hero' },
    {
      text: 'Seat the paired blocks in the archway before the keystone completes the arch.',
      simpler: 'hero',
    },
    { text: 'The center stone seats last and locks both sides in place.', simpler: 'hero' },
    { text: 'Temporary supports hold the blocks while we inspect them.', simpler: 'statement' },
    { text: 'Switch tasks when you feel stuck.', simpler: 'statement' },
    { text: 'Under pressure, switch to a simpler task and take a break.', simpler: 'statement' },
    { text: 'Switch to the new software and route the incoming requests.', simpler: 'statement' },
    { text: 'We can choose Express or Review, but have not decided yet.', simpler: 'statement' },
    {
      text: 'The rail switch selects the right track before the token arrives.',
      simpler: 'hero',
    },
    {
      text: 'Tokens approach the junction, but the switch is broken so nothing moves.',
      simpler: 'statement',
    },
    {
      text: 'It is a flywheel: content brings leads, leads bring revenue, revenue funds content, over and over.',
      simpler: 'loop',
    },
  ])('keeps $simpler without inventing an assembly or routing system for "$text"', ({
    text,
    simpler,
  }) => {
    const s = buildShortlist(toWords(text));
    expect(s.kinds.map((kind) => kind.kind)).toContain(simpler);
    for (const kind of ['keystone', 'switchyard']) {
      expect(s.kinds.map((entry) => entry.kind)).not.toContain(kind);
      expect(s.scores[kind]).toBeUndefined();
    }
  });
  it('does not turn everyday pressure or a software switch into physical controls', () => {
    const s = buildShortlist(toWords('Under pressure, switch to a simpler task and take a break.'));
    expect(s.heroProps).not.toContain('pressure-gauge');
    expect(s.heroProps).not.toContain('rail-switch');
  });
  it('does not invent a checkout or calculator from a generic outcome', () => {
    const s = buildShortlist(toWords('Think about the outcome before deciding.'));
    expect(s.heroProps).not.toContain('card-reader');
    expect(s.heroProps).not.toContain('calculator');
  });
  it.each([
    'Focus on one goal instead of chasing every opportunity.',
    'The future is uncertain, so keep the plan simple.',
    'Split the workload between two people.',
    'Open the document and read it carefully.',
  ])('does not invent optical equipment for ambiguous text: %s', (text) => {
    const s = buildShortlist(toWords(text));
    expect(s.kinds.map((kind) => kind.kind)).toContain('statement');
    for (const prop of ['prism', 'aperture', 'magnifying-glass', 'telescope'])
      expect(s.heroProps).not.toContain(prop);
  });
  it.each([
    'The network connected every service after deployment.',
    'We connect teams through our network.',
    'Review the software architecture before changing the API.',
    'Archive the old documents before the next release.',
  ])('does not invent structures for ambiguous text: %s', (text) => {
    const s = buildShortlist(toWords(text));
    expect(s.heroProps).not.toContain('bridge');
    expect(s.heroProps).not.toContain('arch');
  });
  it('does not turn a digital file format into a filing cabinet', () => {
    expect(buildShortlist(toWords('This file format opens on a laptop.')).heroProps).not.toContain(
      'filing-cabinet',
    );
  });
  it('does not interpret the season as a compression spring', () => {
    const s = buildShortlist(toWords('This spring we will launch the next course.'));
    expect(s.heroProps).not.toContain('spring');
  });
  it.each(CASES)('offers $kind for "$text"', ({ text, kind, prop }) => {
    const s = buildShortlist(toWords(text));
    expect(s.kinds.map((k) => k.kind)).toContain(kind);
    if (prop) expect(s.heroProps).toContain(prop);
  });
});

describe('buildIdeaShortlist', () => {
  const semanticKinds = ['agent-team', 'house-options', 'customer-cohort'] as const;

  it.each(
    semanticKinds,
  )('exposes selected specialized %s beyond generic AI/business wording', (kind) => {
    const words = toWords('AI is changing business today.');
    expect(buildShortlist(words).kinds.map((spec) => spec.kind)).not.toContain(kind);
    const ideas: PlanningIdea[] = [
      { startWord: 0, endWord: words.length - 1, goal: 'Explain this relationship', kinds: [kind] },
    ];
    const shortlist = buildIdeaShortlist(words, ideas, () => 1000);
    expect(shortlist.kinds).toContain(ALL_KIND_SPECS.find((spec) => spec.kind === kind));
  });

  it('returns an empty menu for an empty outline instead of backfilling novelty', () => {
    expect(buildIdeaShortlist(toWords('AI business house'), [])).toEqual({
      kinds: [],
      heroProps: [],
      scores: {},
    });
  });

  it('supplements only from each idea window, not unrelated transcript or recency rewards', () => {
    const words = toWords('AI changed everything. A house roof blueprint construction.');
    const idea: PlanningIdea = {
      startWord: 0,
      endWord: 2,
      goal: 'Explain AI',
      kinds: ['agent-team'],
    };
    const penalty = vi.fn(({ kind, prop }: { kind: string; prop?: string }) =>
      kind === 'house-build' || prop === 'telescope' ? -1000 : 1000,
    );
    const shortlist = buildIdeaShortlist(words, [idea], penalty);
    const text = shortlistText(words.slice(0, 3));
    expect(shortlist.heroProps).toContain('chip');
    expect(shortlist.heroProps).not.toContain('telescope');
    expect(penalty.mock.calls.some(([choice]) => choice.prop === 'telescope')).toBe(false);
    expect(shortlist.kinds.map((spec) => spec.kind)).not.toContain('house-build');
    for (const spec of shortlist.kinds) {
      if (spec.kind !== 'agent-team') expect(scoreKind(spec, text)).toBeGreaterThan(0);
    }
    expect(penalty.mock.calls.some(([choice]) => choice.kind === 'house-build')).toBe(false);
  });

  it('does not backfill quiet source windows or use goals as keyword evidence', () => {
    const words = toWords('hello there friends everyone');
    const ideas: PlanningIdea[] = [
      { startWord: 0, endWord: 0, goal: 'AI and a house blueprint', kinds: ['statement'] },
      { startWord: 3, endWord: 3, goal: 'Pressure gauge', kinds: ['statement'] },
    ];
    expect(buildIdeaShortlist(words, ideas).kinds.map((spec) => spec.kind)).toEqual(['statement']);
  });

  it('bounds full schema exposure and uses lexical ties while preserving all selected kinds', async () => {
    const words = toWords(CASES.map((entry) => entry.text).join(' '));
    const text = shortlistText(words);
    const selected = ALL_KIND_SPECS.slice(-18).map((spec) => spec.kind);
    const ideas: PlanningIdea[] = Array.from({ length: 6 }, (_, i) => ({
      startWord: Math.floor((i * words.length) / 6),
      endWord: Math.floor(((i + 1) * words.length) / 6) - 1,
      goal: 'Explain this source idea',
      kinds: selected.slice(i * 3, i * 3 + 3),
    }));
    // Equal trigger scores deliberately put the cutoff on lexical order, not registry order.
    const originalTriggers = ALL_KIND_SPECS.map((spec) => spec.triggers);
    for (const spec of ALL_KIND_SPECS) spec.triggers = [/./];
    try {
      const shortlist = buildIdeaShortlist(words, ideas, () => 1000);
      const offered = shortlist.kinds.map((spec) => spec.kind);
      expect(offered).toHaveLength(24);
      expect(shortlist.heroProps.length).toBeLessThanOrEqual(10);
      for (const kind of selected) expect(offered).toContain(kind);
      const supplements = ALL_KIND_SPECS.map((spec) => spec.kind)
        .filter((kind) => !selected.includes(kind))
        .sort()
        .slice(0, 6);
      expect(offered.filter((kind) => !selected.includes(kind)).sort()).toEqual(supplements);
      expect(buildIdeaShortlist(words, ideas, () => 1000)).toEqual(shortlist);
      const recent = buildIdeaShortlist(words, ideas, ({ kind }) =>
        kind === supplements[0] ? 1000 : 0,
      );
      expect(recent.kinds.map((spec) => spec.kind)).not.toContain(supplements[0]);
      for (const kind of selected) expect(recent.kinds.map((spec) => spec.kind)).toContain(kind);
      expect(recent.kinds).toHaveLength(24);
      const { buildExplainerPrompt } = await import('../explainer-scenes');
      const prompt = buildExplainerPrompt(
        words,
        { minStart: 0, maxEnd: words.at(-1)?.end ?? 0 },
        '9:16',
        shortlist,
      );
      expect(prompt.match(/ {4}JSON: /g)).toHaveLength(24);
      for (const spec of shortlist.kinds) expect(scoreKind(spec, text)).toBeGreaterThan(0);
    } finally {
      ALL_KIND_SPECS.forEach((spec, index) => {
        spec.triggers = originalTriggers[index];
      });
    }
  });
});

describe('buildShortlist limits', () => {
  it('always offers the general kinds', () => {
    const s = buildShortlist(toWords('hello there'));
    for (const k of ALL_KIND_SPECS.filter((x) => x.general)) {
      expect(s.kinds.map((x) => x.kind)).toContain(k.kind);
    }
  });

  it('backfills a quiet transcript to the minimum', () => {
    const s = buildShortlist(toWords('hello there friend'));
    expect(s.kinds.length).toBeGreaterThanOrEqual(SHORTLIST_LIMITS.minKinds);
    expect(s.heroProps.length).toBeGreaterThanOrEqual(SHORTLIST_LIMITS.minProps);
  });

  it('never exceeds the caps, even for a trigger-heavy transcript', () => {
    const everything = CASES.map((c) => c.text).join(' ');
    const s = buildShortlist(toWords(everything));
    expect(SHORTLIST_LIMITS.maxKinds).toBe(16);
    expect(SHORTLIST_LIMITS.maxProps).toBe(10);
    expect(s.kinds.length).toBeLessThanOrEqual(SHORTLIST_LIMITS.maxKinds);
    expect(s.heroProps.length).toBeLessThanOrEqual(SHORTLIST_LIMITS.maxProps);
  });

  it('is deterministic and keeps registry order', () => {
    const w = toWords(CASES.map((c) => c.text).join(' '));
    const a = buildShortlist(w);
    const b = buildShortlist(w);
    expect(a.kinds.map((k) => k.kind)).toEqual(b.kinds.map((k) => k.kind));
    const order = ALL_KIND_SPECS.map((k) => k.kind);
    const idx = a.kinds.map((k) => order.indexOf(k.kind));
    expect(idx).toEqual([...idx].sort((x, y) => x - y));
  });

  it('prompt lists only shortlisted hero props', async () => {
    const { buildExplainerPrompt } = await import('../explainer-scenes');
    const w = toWords('Save money every month in a savings account, it is your budget.');
    const s = buildShortlist(w);
    const prompt = buildExplainerPrompt(w, { minStart: 0, maxEnd: 100 }, '9:16', s);
    expect(prompt).toContain('piggybank (');
    const offered = new Set(s.heroProps);
    for (const p of ['brain', 'dice', 'door'] as const) {
      if (!offered.has(p)) expect(prompt).not.toContain(`${p} (`);
    }
  });
});
