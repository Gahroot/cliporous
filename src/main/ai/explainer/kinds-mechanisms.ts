import { LEAK_SEAL_SECONDS } from '../../remotion/compositions/explainer/types';
import type { AnyKindSpec, KindSpec } from './kind-spec';
import { mechanismIssue, sourceLabel, strictMechanismBeats } from './mechanism-contract';

export const bottleneckSpec: KindSpec<'bottleneck'> = {
  kind: 'bottleneck',
  describe:
    'incoming work feeds into a queue behind a gate, then removing the bottleneck releases it and clears the queue. Use a source-supported constraint → backlog → release, not generic busyness. feedWord starts input; queueWord establishes the blocked queue; the gate rises from openAt-0.3s to openAt, release begins openAt+0.05s, and clearing completes at clearAt.',
  schema:
    '{"kind":"bottleneck","label":"source phrase","tokenCount":6,"feedWord":N,"queueWord":N,"openWord":N,"clearWord":N}',
  limits:
    'label ≤ 26 chars, quote this scene window (ignore case/sentence punctuation, preserve signed numbers and units); no invented numbers or outcomes. tokenCount optional, default 6, only 4/6/8 (illustrative tokens, not a claimed quantity). Required feedWord < queueWord < openWord < clearWord; beat gaps ≥ 0.45/0.5/0.8s respectively, then ≥ 0.5s final hold. Scene 3–8s.',
  layouts: ['stack', 'stack-flipped', 'over'],
  durationSec: [3, 8],
  family: 'object',
  triggers: [
    /\bbottlenecks?\b/,
    /\b(?:work|orders?|requests?|tasks?|traffic|input|items?|jobs?)\b.{0,60}\b(?:pile[sd]? up|back(?:s|ed)? up|queue[sd]? (?:up|behind)|blocked by|waiting (?:on|for))\b/,
    /\b(?:clear(?:s|ed|ing)?|remov(?:e[sd]?|ing)|unblock(?:s|ed|ing)?|open(?:s|ed|ing)?)\b.{0,45}\b(?:backlog|blocked queue|gate|constraint)\b.{0,65}\b(?:flow|releas\w*|mov\w*|through|clear\w*)\b/,
  ],
  avoid:
    'isolated "busy" or "pressure", a generic process list, or a repeating feedback cycle (loop); require a queue caused by a constraint and a source-supported release, not an invented outcome',
  parse: (raw, ctx) => {
    const label = sourceLabel(raw.label, ctx, 26);
    if (!label) return null;
    const tokenCount = raw.tokenCount === undefined ? 6 : raw.tokenCount;
    if (tokenCount !== 4 && tokenCount !== 6 && tokenCount !== 8) {
      return mechanismIssue(ctx, 'tokenCount must be 4, 6 or 8 (omit for 6)');
    }
    const beats = strictMechanismBeats(
      raw,
      ctx,
      ['feedWord', 'queueWord', 'openWord', 'clearWord'],
      [0.45, 0.5, 0.8],
      0.5,
    );
    if (!beats) return null;
    const duration = ctx.win.endTime - ctx.win.startTime;
    if (duration < 3 || duration > 8) {
      return mechanismIssue(ctx, 'bottleneck scene must last 3..8s');
    }
    const [feedAt, queueAt, openAt, clearAt] = beats;
    return { kind: 'bottleneck', label, tokenCount, feedAt, queueAt, openAt, clearAt };
  },
  cues: (scene) => [
    { kind: 'slide', at: scene.feedAt, gain: 0.4 },
    { kind: 'tick', at: scene.openAt, gain: 0.6 },
    { kind: 'pop', at: scene.clearAt, gain: 0.6 },
  ],
};

export const momentumSpec: KindSpec<'momentum'> = {
  kind: 'momentum',
  describe:
    'a first small push starts a flywheel, repeated pushes build momentum, then it engages an output before coasting to rest. pushWord starts the first of three short push impulses; repeatWord starts repeated pushes; engageWord engages the output (never earlier); coastWord begins shared deceleration, with wheel and output still engaged, followed by 0.6s coasting then a static hold. Use a source-supported effort → momentum → working output, not a feedback loop.',
  schema:
    '{"kind":"momentum","label":"source phrase","pushWord":N,"repeatWord":N,"engageWord":N,"coastWord":N}',
  limits:
    'label ≤ 26 chars, quote a contiguous phrase from this scene window (ignore case/sentence punctuation, preserve signed numbers and units); no invented outcomes or numeric promises. Required pushWord < repeatWord < engageWord < coastWord; beat gaps ≥ 0.45/0.65/0.9s respectively, then ≥ 1.1s final hold (0.6s coasting + 0.5s static). Scene 3.5–8s.',
  layouts: ['stack', 'stack-flipped', 'over'],
  durationSec: [3.5, 8],
  family: 'object',
  triggers: [
    /\b(?:small|first|initial) push\b.{0,80}\b(?:push(?:es)? again|repeat(?:ed)? (?:the )?pushes|keep pushing)\b.{0,100}\b(?:driv(?:e[sd]?|ing)|power(?:s|ed|ing)?|output|coast(?:s|ed|ing)?)\b/,
    /\b(?:repeated pushes|small pushes|keep pushing|push again)\b.{0,80}\b(?:momentum|flywheel|spin(?:s|ning)? up)\b.{0,90}\b(?:driv(?:e[sd]?|ing)|power(?:s|ed|ing)?|output|coast(?:s|ed|ing)?)\b/,
  ],
  avoid:
    'isolated "momentum" or "flywheel", generic consistency, or content → leads → revenue → content feedback (use loop); require repeated effort that builds motion, drives an output, then coasts, not an invented growth promise',
  parse: (raw, ctx) => {
    const label = sourceLabel(raw.label, ctx, 26);
    if (!label) return null;
    const beats = strictMechanismBeats(
      raw,
      ctx,
      ['pushWord', 'repeatWord', 'engageWord', 'coastWord'],
      [0.45, 0.65, 0.9],
      1.1,
    );
    if (!beats) return null;
    const duration = ctx.win.endTime - ctx.win.startTime;
    if (duration < 3.5 || duration > 8) {
      return mechanismIssue(ctx, 'momentum scene must last 3.5..8s');
    }
    const [pushAt, repeatAt, engageAt, coastAt] = beats;
    return { kind: 'momentum', label, pushAt, repeatAt, engageAt, coastAt };
  },
  cues: (scene) => [
    { kind: 'tick', at: scene.pushAt, gain: 0.4 }, // First push contact, not every push/revolution.
    { kind: 'tick', at: scene.engageAt, gain: 0.55 }, // Output drive engages.
  ],
};

export const leverageSpec: KindSpec<'leverage'> = {
  kind: 'leverage',
  describe:
    'initial effort on a lever barely moves a load; shifting the fulcrum changes the leverage, then the load lifts and holds. effortWord starts effort/contact; pivotWord starts the fulcrum shift; liftWord starts the lift after the pivot change; holdWord settles into the held result. Use a source-supported change in mechanical advantage, not financial leverage or a numerical multiplier.',
  schema:
    '{"kind":"leverage","label":"source phrase","effortWord":N,"pivotWord":N,"liftWord":N,"holdWord":N}',
  limits:
    'label ≤ 26 chars, quote a contiguous phrase from this scene window (ignore case/sentence punctuation, preserve signed numbers and units); no invented outcomes or numeric promises. Required effortWord < pivotWord < liftWord < holdWord; beat gaps ≥ 0.45/0.5/0.65s respectively, then ≥ 0.5s static final hold. Scene 3–8s.',
  layouts: ['stack', 'stack-flipped', 'over'],
  durationSec: [3, 8],
  family: 'object',
  triggers: [
    /\b(?:mov(?:e[sd]?|ing)|shift(?:s|ed|ing)?|adjust(?:s|ed|ing)?|reposition(?:s|ed|ing)?)\b.{0,45}\b(?:fulcrum|pivot)\b.{0,90}\b(?:lift(?:s|ed|ing)?|rais(?:e[sd]?|ing))\b.{0,35}\b(?:load|weight)\b/,
    /\b(?:mov(?:e[sd]?|ing)|shift(?:s|ed|ing)?|adjust(?:s|ed|ing)?)\b.{0,45}\b(?:fulcrum|pivot)\b.{0,60}\b(?:load|weight)\b.{0,45}\b(?:rises?|lifts?|goes up)\b/,
  ],
  avoid:
    'financial leverage, negotiation leverage, generic "work smarter", an effort/impact comparison (use quadrant), or a lever mentioned without a pivot change and lifted result (use hero); do not imply a numeric advantage or guaranteed outcome',
  parse: (raw, ctx) => {
    const label = sourceLabel(raw.label, ctx, 26);
    if (!label) return null;
    const beats = strictMechanismBeats(
      raw,
      ctx,
      ['effortWord', 'pivotWord', 'liftWord', 'holdWord'],
      [0.45, 0.5, 0.65],
      0.5,
    );
    if (!beats) return null;
    const duration = ctx.win.endTime - ctx.win.startTime;
    if (duration < 3 || duration > 8) {
      return mechanismIssue(ctx, 'leverage scene must last 3..8s');
    }
    const [effortAt, pivotAt, liftAt, holdAt] = beats;
    return { kind: 'leverage', label, effortAt, pivotAt, liftAt, holdAt };
  },
  cues: (scene) => [
    { kind: 'thump', at: scene.effortAt, gain: 0.35 }, // Initial lever contact.
    { kind: 'slide', at: scene.pivotAt, gain: 0.4 }, // Fulcrum starts shifting.
    { kind: 'tick', at: scene.holdAt, gain: 0.5 }, // Load settles into the held result.
  ],
};

export const resourceLeakSpec: KindSpec<'resource-leak'> = {
  kind: 'resource-leak',
  describe:
    'inflow fills a reservoir, leaks drain it, outlet taps seal the leaks, then the retained level rises. Require source-supported inflow → leakage → correction → retention. inflowAt starts inflow; leakAt opens visible leaks; sealAt starts closing both outlet taps, seating exactly 0.32s later; retained level rises until retainAt, then inflow stops and the final level holds.',
  schema:
    '{"kind":"resource-leak","label":"source phrase","inflowWord":N,"leakWord":N,"sealWord":N,"retainWord":N}',
  limits:
    'label ≤ 26 chars, quote a contiguous phrase from this scene window (ignore case/sentence punctuation, preserve signed numbers and units); no invented outcomes or numeric promises. Required inflowWord < leakWord < sealWord < retainWord; beat gaps ≥ 0.55/0.75/1s respectively, then ≥ 0.5s static final hold. Scene 3.5–8s. No extra mechanism options.',
  layouts: ['stack', 'stack-flipped', 'over'],
  durationSec: [3.5, 8],
  family: 'object',
  triggers: [
    /\b(?:inflow|(?:water|money|revenue|income|resources?|cash|energy) (?:flows?|comes?|pours?) in)\b.{0,90}\bleak(?:s|ed|ing)?\b.{0,70}\b(?:seal(?:s|ed|ing)?|plug(?:s|ged|ging)?|clos(?:e[sd]?|ing))\b.{0,90}\b(?:retain(?:s|ed|ing)?|keeps?|builds? up|rises?|fills?)\b/,
    /\b(?:fill(?:s|ed|ing)?|pour(?:s|ed|ing)?)\b.{0,35}\b(?:tank|reservoir|bucket)\b.{0,70}\bleak(?:s|ed|ing)?\b.{0,70}\b(?:seal(?:s|ed|ing)?|plug(?:s|ged|ging)?|clos(?:e[sd]?|ing))\b.{0,90}\b(?:retain(?:s|ed|ing)?|keeps?|builds? up|rises?|fills?)\b/,
    /\b(?:revenue|income|cash|resources?|money)\b.{0,25}\b(?:arrives?|comes? in|flows? in)\b.{0,90}\b(?:waste|wasting|loss)\b.{0,80}\b(?:we|they|the team) (?:cancel|remove|stop)\b.{0,100}\bmore (?:revenue|money|resources?) (?:stays?|remains?) available\b/,
  ],
  avoid:
    'an isolated leak metaphor without a source-supported correction and retained result (use statement or hero), generic spending, or a reservoir merely filling; never invent a saving or quantity. Ordinary business waste qualifies only with recurring inflow, corrective action and retained resources.',
  parse: (raw, ctx) => {
    const label = sourceLabel(raw.label, ctx, 26);
    if (!label) return null;
    const beats = strictMechanismBeats(
      raw,
      ctx,
      ['inflowWord', 'leakWord', 'sealWord', 'retainWord'],
      [0.55, 0.75, 1],
      0.5,
    );
    if (!beats) return null;
    const duration = ctx.win.endTime - ctx.win.startTime;
    if (duration < 3.5 || duration > 8) {
      return mechanismIssue(ctx, 'resource-leak scene must last 3.5..8s');
    }
    const [inflowAt, leakAt, sealAt, retainAt] = beats;
    return { kind: 'resource-leak', label, inflowAt, leakAt, sealAt, retainAt };
  },
  cues: (scene) => [
    { kind: 'slide', at: scene.inflowAt, gain: 0.35 }, // One inflow cue, not one per particle.
    { kind: 'tick', at: scene.sealAt + LEAK_SEAL_SECONDS, gain: 0.5 }, // Outlet taps seat, not when closing starts.
  ],
};

export const feedbackControlSpec: KindSpec<'feedback-control'> = {
  kind: 'feedback-control',
  describe:
    'an over-target gauge triggers a sensor, then a valve corrects flow and the gauge settles. Require source-supported exceedance → sensing → correction → stable target. exceedAt starts the over-target gauge rise before senseAt; senseAt is the sensor response; correctAt starts valve correction; settleAt reaches the exact stable target and holds.',
  schema:
    '{"kind":"feedback-control","label":"source phrase","exceedWord":N,"senseWord":N,"correctWord":N,"settleWord":N}',
  limits:
    'label ≤ 26 chars, quote a contiguous phrase from this scene window (ignore case/sentence punctuation, preserve signed numbers and units); no invented outcomes or numeric promises. Required exceedWord < senseWord < correctWord < settleWord; beat gaps ≥ 0.55/0.55/1s respectively, then ≥ 0.6s static final hold. Scene 3.5–8s. No extra mechanism options.',
  layouts: ['stack', 'stack-flipped', 'over'],
  durationSec: [3.5, 8],
  family: 'object',
  triggers: [
    /\b(?:gauge|pressure|level|temperature)\b.{0,45}\b(?:exceeds?|above|overshoots?)\b.{0,20}\b(?:target|set ?point)\b.{0,60}\bsensor\b.{0,30}\b(?:respond(?:s|ed)?|detect(?:s|ed)?|signals?|notic(?:es|ed))\b.{0,55}\bvalve\b.{0,75}\b(?:settle[sd]?|stabili[sz]e[sd]?|returns? to|back (?:at|to))\b/,
    /\bdemand (?:exceeds?|is above)\b.{0,35}\bcapacity target\b.{0,55}\bmeasure (?:the )?workload\b.{0,75}\b(?:add staff|increase staffing|adjust capacity)\b.{0,55}\bworkload (?:returns? to|settles? at) (?:the )?target\b.{0,30}\b(?:stays?|stable)\b/,
  ],
  avoid:
    'isolated "pressure", generic customer feedback, a reading without measured correction, or a recurring flywheel (use hero, statement or loop); require a spoken stable result, not invented regulation. Business capacity needs excess demand, measurement, staffing correction and a return toward target.',
  parse: (raw, ctx) => {
    const label = sourceLabel(raw.label, ctx, 26);
    if (!label) return null;
    const beats = strictMechanismBeats(
      raw,
      ctx,
      ['exceedWord', 'senseWord', 'correctWord', 'settleWord'],
      [0.55, 0.55, 1],
      0.6,
    );
    if (!beats) return null;
    const duration = ctx.win.endTime - ctx.win.startTime;
    if (duration < 3.5 || duration > 8) {
      return mechanismIssue(ctx, 'feedback-control scene must last 3.5..8s');
    }
    const [exceedAt, senseAt, correctAt, settleAt] = beats;
    return { kind: 'feedback-control', label, exceedAt, senseAt, correctAt, settleAt };
  },
  cues: (scene) => [
    { kind: 'tick', at: scene.senseAt, gain: 0.35 },
    { kind: 'slide', at: scene.correctAt, gain: 0.4 },
  ],
};

export const MECHANISM_KIND_SPECS: readonly AnyKindSpec[] = [
  bottleneckSpec,
  momentumSpec,
  leverageSpec,
  resourceLeakSpec,
  feedbackControlSpec,
];
