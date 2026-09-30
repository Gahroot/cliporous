import {
  EXPLODED_RETURN_SECONDS,
  EXPLODED_TARGETS,
  EXPLODED_TEMPLATES,
  type ExplodedTemplate,
  RELAY_PRESETS,
  type RelayPreset,
} from '../../remotion/compositions/explainer/mechanisms/composed-types';
import type { AnyKindSpec, KindSpec, ParseContext, Rec } from './kind-spec';
import { mechanismIssue, sourceLabel, strictMechanismBeats } from './mechanism-contract';

const SYNC_RELATION =
  /\b(?:out of sync|out of step|different (?:timing|rhythms?)|timing (?:disagrees|differs))\b.{0,100}\b(?:metronome|shared rhythm|common beat)\b.{0,100}\b(?:align\w*|synchroni[sz]\w*|in sync|together)\b.{0,100}\b(?:transfer\w*|handoff|hand off|passes?|receives?)\b/;
export const RELAY_RELATIONS: Readonly<Record<RelayPreset, RegExp>> = {
  unlock:
    /\bkey\b.{0,45}\b(?:enters?|insert\w*|turn\w*)\b.{0,65}\block\b.{0,30}\b(?:releases?|opens?|unlocks?)\b.{0,50}\bdoor\b.{0,25}\bopens?\b/,
  nurture:
    /\bwatering can\b.{0,50}\b(?:tilts?|pours?)\b.{0,45}\bwater\b.{0,45}\bsoil\b.{0,55}\b(?:sprout|plant)\b.{0,25}\b(?:grows?|growth)\b/,
  'attract-process':
    /\bmagnet\b.{0,35}\b(?:draws?|pulls?|attracts?)\b.{0,70}\b(?:conveyor|belt)\b.{0,60}\b(?:parcel|package)\b.{0,35}\b(?:clos\w*|complet\w*|pack\w*)\b/,
  'power-insight':
    /\bbattery\b.{0,40}\b(?:suppl\w*|powers?|sends?)\b.{0,55}\bchip\b.{0,35}\b(?:activates?|receives?|processes?)\b.{0,50}\b(?:bulb|lightbulb)\b.{0,30}\b(?:lights?|illuminates?|glows?)\b/,
  'complete-system':
    /\b(?:missing )?puzzle piece\b.{0,35}\b(?:seats?|fits?|connects?)\b.{0,45}\bconnection\b.{0,30}\b(?:active|activates?|completes?|engages?)\b.{0,45}\bgears?\b.{0,30}\b(?:runs?|turns?|spins?)\b/,
  'idea-process-result':
    /\b(?:idea|bulb|lightbulb)\b.{0,60}\bgears?\b.{0,35}\b(?:process\w*|turn\w*|drives?)\b.{0,50}\b(?:conveyor|belt)\b.{0,60}\b(?:parcel|package|result)\b/,
};
const EXPLODE_RELATION =
  /\b(?:assembly|assembled|together)\b.{0,90}\b(?:separat\w*|apart|explode\w*)\b.{0,120}\b(?:explain\w*|detail|inspect\w*|show\w*)\b.{0,110}\b(?:reassembl\w*|return\w*|back together)\b/;
const TEMPLATE_EVIDENCE: Readonly<Record<ExplodedTemplate, RegExp>> = {
  mechanism: /\b(?:mechanism|gear assembly)\b/,
  parcel: /\b(?:parcel|package|packaging)\b/,
  computing: /\b(?:computing|computer|circuit)\b/,
};

function sourceText(ctx: ParseContext): string {
  return ctx.words
    .slice(ctx.win.startWord, ctx.win.endWord + 1)
    .map((w) => w.text)
    .join(' ')
    .toLowerCase();
}
function supported(ctx: ParseContext, relation: RegExp): boolean {
  const source = sourceText(ctx);
  // Do not turn negated, hypothetical or unsuccessful actions into visible success.
  if (
    /\b(?:not|never|cannot|can't|won't|would|could|might|if|fails?|failed|doesn't|didn't|without)\b/.test(
      source,
    ) ||
    !relation.test(source)
  ) {
    mechanismIssue(
      ctx,
      'source must explicitly support the ordered causal relation, not a negated or hypothetical result',
    );
    return false;
  }
  return true;
}
function sceneBeats(
  raw: Rec,
  ctx: ParseContext,
  fields: readonly string[],
  gaps: readonly number[],
  hold = 0.55,
): number[] | null {
  const duration = ctx.win.endTime - ctx.win.startTime;
  if (!Number.isFinite(duration) || duration < 3.5 || duration > 8) {
    return mechanismIssue(
      ctx,
      'composed scene requires 3.5..8s; choose a simpler kind for a tight span',
    );
  }
  return strictMechanismBeats(raw, ctx, fields, gaps, hold);
}

export const synchronizationSpec: KindSpec<'synchronization'> = {
  kind: 'synchronization',
  describe:
    'Two mail belts disagree, a metronome establishes a common beat, phases align forward, then the same waiting envelope passes to the receiver. Require the whole spoken timing-to-success relation, not generic teamwork.',
  schema:
    '{"kind":"synchronization","label":"source phrase","disagreeWord":N,"rhythmWord":N,"alignWord":N,"transferWord":N}',
  limits:
    'Required chronological beats ≥0.6/1/0.95s apart, then ≥0.55s static hold. label ≤26 chars, exact source phrase. Fixed one envelope, two belts, no speeds/counts/options. No takeover.',
  layouts: ['stack', 'stack-flipped', 'over'],
  durationSec: [3.5, 8],
  family: 'object',
  triggers: [SYNC_RELATION],
  avoid:
    'a metronome alone, music, generic synchronization, teamwork or an unsuccessful handoff; use hero or statement',
  parse: (raw, ctx) => {
    const label = sourceLabel(raw.label, ctx, 26);
    const beats = sceneBeats(
      raw,
      ctx,
      ['disagreeWord', 'rhythmWord', 'alignWord', 'transferWord'],
      [0.6, 1, 0.95],
    );
    if (!label || !beats || !supported(ctx, SYNC_RELATION)) return null;
    const [disagreeAt, rhythmAt, alignAt, transferAt] = beats;
    return { kind: 'synchronization', label, disagreeAt, rhythmAt, alignAt, transferAt };
  },
  cues: (s) => [
    { kind: 'tick', at: s.rhythmAt, gain: 0.25 },
    { kind: 'slide', at: s.transferAt, gain: 0.3 },
  ],
};

export const relaySpec: KindSpec<'relay'> = {
  kind: 'relay',
  describe:
    'One shared-clock causal relationship, only these authored presets: unlock (key→lock→door), nurture (watering can→soil→sprout), attract-process (magnet→conveyor→parcel), power-insight (battery→chip→bulb), complete-system (puzzle→connection→gears), idea-process-result (bulb→gears→conveyor/parcel). All actors and the successful relation must be spoken, never invent an outcome from an isolated noun.',
  schema:
    '{"kind":"relay","preset":"unlock","label":"source phrase","sourceWord":N,"transferWord":N,"receiveWord":N,"outcomeWord":N}',
  limits:
    'Required preset, chronological beats ≥0.65/0.75/1.2s apart and ≥0.55s final hold. label ≤26 chars quoting source; no arbitrary actors, ports, counts, numbers or coordinates. Fixed bounded transfer objects. No takeover.',
  layouts: ['stack', 'stack-flipped', 'over'],
  durationSec: [3.5, 8],
  family: 'object',
  triggers: Object.values(RELAY_RELATIONS),
  avoid:
    'unrelated nouns, hypothetical outcomes or generic process language without the named causal chain; use flow or a single hero',
  parse: (raw, ctx) => {
    if (
      typeof raw.preset !== 'string' ||
      !(RELAY_PRESETS as readonly string[]).includes(raw.preset)
    ) {
      return mechanismIssue(ctx, 'preset must be one of the six authored relay presets');
    }
    const preset = raw.preset as RelayPreset;
    const label = sourceLabel(raw.label, ctx, 26);
    const beats = sceneBeats(
      raw,
      ctx,
      ['sourceWord', 'transferWord', 'receiveWord', 'outcomeWord'],
      [0.65, 0.75, 1.2],
    );
    if (!label || !beats || !supported(ctx, RELAY_RELATIONS[preset])) return null;
    const [sourceAt, transferAt, receiveAt, outcomeAt] = beats;
    return { kind: 'relay', preset, label, sourceAt, transferAt, receiveAt, outcomeAt };
  },
  cues: (s) => [
    { kind: 'tick', at: s.receiveAt, gain: 0.3 },
    { kind: 'thump', at: s.outcomeAt, gain: 0.25 },
  ],
};

export const explodedViewSpec: KindSpec<'exploded-view'> = {
  kind: 'exploded-view',
  describe:
    'A clearly stylized assembly separates into three authored parts, explains one source-supported component, then returns. Templates/targets: mechanism housing|shaft|gear; parcel base|contents|lid; computing board|chip|heatsink. Never imply a branded teardown or invent product anatomy.',
  schema:
    '{"kind":"exploded-view","template":"mechanism","target":"gear","label":"source phrase","detailLabel":"gear","assembleWord":N,"separateWord":N,"explainWord":N,"returnWord":N}',
  limits:
    'template and its target required. label ≤26 and detailLabel ≤20 chars, source phrases. detailLabel must name the selected authored component. Require assembled→separated→explained→reassembled source relation. Beats ≥0.5/0.7/0.75s apart, then ≥1.15s (0.65s return + 0.5s still). No quantities/units unless explicitly supplied by source-grounded optional editorial parser. No takeover.',
  layouts: ['stack', 'stack-flipped', 'over'],
  durationSec: [3.5, 8],
  family: 'object',
  triggers: [
    new RegExp(
      String.raw`\b(?:mechanism|gear|parcel|package|computing|computer|circuit)\b.{0,55}${EXPLODE_RELATION.source}`,
    ),
  ],
  avoid:
    'a generic list of parts, a real branded device teardown, or no spoken return to assembly; use stack or a hero',
  parse: (raw, ctx) => {
    if (
      typeof raw.template !== 'string' ||
      !(EXPLODED_TEMPLATES as readonly string[]).includes(raw.template)
    )
      return mechanismIssue(ctx, 'template must be mechanism, parcel or computing');
    const template = raw.template as ExplodedTemplate;
    if (
      typeof raw.target !== 'string' ||
      !(EXPLODED_TARGETS[template] as readonly string[]).includes(raw.target)
    )
      return mechanismIssue(ctx, 'target must belong to the selected authored template');
    const target = raw.target as (typeof EXPLODED_TARGETS)[ExplodedTemplate][number];
    const label = sourceLabel(raw.label, ctx, 26);
    const detailLabel = sourceLabel(raw.detailLabel, ctx, 20);
    if (!label || !detailLabel) return null;
    if (!new RegExp(`\\b${target}\\b`, 'i').test(detailLabel))
      return mechanismIssue(
        ctx,
        'detailLabel must name the selected component, not an unrelated source phrase',
      );
    if (!TEMPLATE_EVIDENCE[template].test(sourceText(ctx)) || !supported(ctx, EXPLODE_RELATION))
      return mechanismIssue(
        ctx,
        'source must support this assembly template and its separation/return',
      );
    const beats = sceneBeats(
      raw,
      ctx,
      ['assembleWord', 'separateWord', 'explainWord', 'returnWord'],
      [0.5, 0.7, 0.75],
      EXPLODED_RETURN_SECONDS + 0.5,
    );
    if (!beats) return null;
    const [assembleAt, separateAt, explainAt, returnAt] = beats;
    return {
      kind: 'exploded-view',
      template,
      target,
      label,
      detailLabel,
      assembleAt,
      separateAt,
      explainAt,
      returnAt,
    };
  },
  cues: (s) => [
    { kind: 'slide', at: s.separateAt, gain: 0.25 },
    { kind: 'tick', at: s.returnAt + EXPLODED_RETURN_SECONDS, gain: 0.3 },
  ],
};

export const COMPOSED_KIND_SPECS: readonly AnyKindSpec[] = [
  synchronizationSpec,
  relaySpec,
  explodedViewSpec,
];
