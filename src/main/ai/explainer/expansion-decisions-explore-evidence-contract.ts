/** Step 11 stories 31–32. Source actions/evidence only: no reward or Bayesian derivations. */
import type {
  ExpansionDecisionStatus,
  ExpansionEvidenceTest,
  ExpansionExploreEvent,
  ExpansionExploreExploitScene,
  ExpansionSequentialEvidenceScene,
} from '../../remotion/compositions/explainer/expansion/decisions/explore-evidence-types';
import type { ExpansionEntity } from '../../remotion/compositions/explainer/expansion/scene-types';
import { EXPANSION_LIMITS } from '../../remotion/compositions/explainer/expansion/value-types';
import { parseExpansionQuantity } from './expansion-quantity-contract';
import {
  type ExpansionSourceEvidence,
  expansionEntities,
  expansionSourceLabel,
  expansionSourceSpan,
  expansionStoryBase,
} from './expansion-source-contract';
import { onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

const BEATS = ['setup', 'action', 'response', 'check', 'resolve'] as const;
function key(text: string): string {
  return text.normalize('NFKC').replace(/’/g, "'").replace(/−/g, '-').replace(/\s+/g, ' ').trim();
}
function literal(text: string): string {
  return key(text)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
}
function same(a: string, b: string): boolean {
  return key(a).toLowerCase() === key(b).toLowerCase();
}
function spanSame(
  a: { fromWord: number; toWord: number },
  b: { fromWord: number; toWord: number },
): boolean {
  return a.fromWord === b.fromWord && a.toWord === b.toWord;
}
function list(values: readonly string[]): string {
  return values.length === 2
    ? `${literal(values[0] ?? '')}\\s+and\\s+${literal(values[1] ?? '')}`
    : `${values.slice(0, -1).map(literal).join(',\\s*')},?\\s+and\\s+${literal(values.at(-1) ?? '')}`;
}
function clause(evidence: ExpansionSourceEvidence, body: string, condition?: string): boolean {
  if (
    /[<>`]|https?:\/\/|www\./i.test(evidence.text) ||
    [...evidence.text].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    return false;
  const text = key(evidence.text)
    .replace(/[.;][”"’')\]]*$/, '')
    .trim();
  const authored = condition
    ? `(?:${literal(condition)},\\s*${body}|${body},?\\s+${literal(condition)})`
    : body;
  return (
    text.split(/\s+/).length <= EXPANSION_LIMITS.evidenceWords &&
    new RegExp(`^(?:${authored})$`, 'iu').test(text)
  );
}
function context(body: string, scope: string, period: string): string {
  const place = `(?:among|for)\\s+${literal(scope)}\\s+(?:during|in|for)\\s+${literal(period)}`;
  const reversed = `(?:during|in|for)\\s+${literal(period)}\\s+(?:among|for)\\s+${literal(scope)}`;
  return `(?:${body}\\s+${place}|${body}\\s+${reversed}|${place},\\s*${body}|${reversed},\\s*${body})`;
}
function ref(
  raw: unknown,
  entities: readonly ExpansionEntity[],
  ctx: ParseContext,
): ExpansionEntity | null {
  const label = ctx.str(raw, EXPANSION_LIMITS.actorLabel);
  return (
    (label ? entities.find((e) => same(e.label, label)) : undefined) ??
    mechanismIssue(
      ctx,
      'option references must be exact declared source labels, never IDs or invented aliases',
    )
  );
}
function atBeat(
  raw: unknown,
  beat: ExpansionSourceEvidence,
  ctx: ParseContext,
): ExpansionSourceEvidence | null {
  const e = expansionSourceSpan(raw, ctx);
  return e && spanSame(e.span, beat.span)
    ? e
    : mechanismIssue(ctx, 'retain the complete local clause for this evidence beat');
}
function status(
  raw: Rec,
  e: ExpansionSourceEvidence,
  ctx: ParseContext,
): ExpansionDecisionStatus | null {
  if (raw.state === 'known' && raw.qualification === undefined && raw.condition === undefined)
    return { state: 'known' };
  if (raw.state === 'conditional' && raw.qualification === undefined) {
    const condition = expansionSourceLabel(raw.condition, e, ctx, EXPANSION_LIMITS.qualifier);
    return condition
      ? { state: 'conditional', condition }
      : mechanismIssue(
          ctx,
          'conditional events/tests must retain their complete locally stated condition',
        );
  }
  if (raw.condition !== undefined)
    return mechanismIssue(ctx, 'only conditional states may carry a condition');
  const qualification = expansionSourceLabel(raw.qualification, e, ctx, EXPANSION_LIMITS.qualifier);
  if (!qualification) return null;
  if (
    (raw.state === 'unknown' || raw.state === 'missing' || raw.state === 'disputed') &&
    same(qualification, raw.state)
  )
    return { state: raw.state, qualification };
  if (raw.state === 'illustrative' && /\b(?:illustrative|teaching example)\b/i.test(qualification))
    return { state: 'illustrative', qualification };
  if (raw.state === 'simulated' && /\b(?:simulated|simulation)\b/i.test(qualification))
    return { state: 'simulated', qualification };
  return mechanismIssue(
    ctx,
    'distinguish observed, absent, disputed, conditional, illustrative and simulated source status',
  );
}
function qualified(body: string, value: ExpansionDecisionStatus): string {
  return value.state === 'illustrative' || value.state === 'simulated'
    ? `(?:in\\s+this|in\\s+the)\\s+${literal(value.qualification)},\\s*${body}`
    : body;
}
function conditionOf(value: ExpansionDecisionStatus): string | undefined {
  return value.state === 'conditional' ? value.condition : undefined;
}
function envelope(raw: Rec, ctx: ParseContext, id: '31' | '32', fields: readonly string[]) {
  const base = expansionStoryBase(raw, ctx, id, [
    'entities',
    'scope',
    'period',
    'route',
    'template',
    ...fields,
  ]);
  if (!base) return null;
  if (
    (raw.route !== undefined && raw.route !== 'source-only') ||
    (raw.template !== undefined &&
      raw.template !== (id === '31' ? 'named-options' : 'ordered-tests'))
  )
    return mechanismIssue(
      ctx,
      'only the authored source-only route and this preset’s fixed template are supported',
    );
  const { treatment, ...story } = base.story;
  if (treatment !== undefined) return mechanismIssue(ctx, 'no treatment is supported');
  const locals: ExpansionSourceEvidence[] = [];
  for (const beat of BEATS) {
    const index = ctx.inWin(raw[`${beat}Word`]);
    if (index === null) return null;
    const e = expansionSourceSpan(
      { fromWord: index, toWord: index + base.spans[beat].split(/\s+/).length - 1 },
      ctx,
    );
    if (!e) return mechanismIssue(ctx, 'five distinct complete clause-start beats are required');
    locals.push(e);
  }
  const [setup, action, response, check, resolve] = locals;
  if (!setup || !action || !response || !check || !resolve) return null;
  const entities = expansionEntities(raw.entities, ctx, id),
    scope = expansionSourceLabel(raw.scope, setup, ctx, EXPANSION_LIMITS.population),
    period = expansionSourceLabel(raw.period, setup, ctx, EXPANSION_LIMITS.period);
  if (
    !entities ||
    entities.length < 2 ||
    entities.length > 4 ||
    !scope ||
    !period ||
    !same(story.subject, scope) ||
    entities.some((e) => !spanSame(e.evidence, setup.span))
  )
    return mechanismIssue(
      ctx,
      'portrait decisions need two to four actual options introduced in their exact source scope and period',
    );
  const names = list(entities.map((e) => e.label));
  if (
    !clause(
      setup,
      context(
        `${literal(story.label)}\\s+(?:considers|compares|reviews|tracks)\\s+${names}`,
        scope,
        period,
      ),
    )
  )
    return mechanismIssue(
      ctx,
      'setup must actually introduce the named options and their decision scope/period',
    );
  return {
    story,
    entities,
    scope,
    period,
    names,
    beats: { setup, action, response, check, resolve },
  };
}
function qualifications(
  raw: Rec,
  values: readonly { state: string; condition?: string }[],
  ctx: ParseContext,
): boolean {
  if (
    values.some((v) => v.state === 'illustrative' || v.state === 'simulated') &&
    raw.evidence !== 'illustrative'
  ) {
    mechanismIssue(ctx, 'teaching/simulation must remain illustrative, not measured behavior');
    return false;
  }
  const conditions = values.filter((v) => v.state === 'conditional');
  if (
    (raw.condition !== undefined && !conditions.length) ||
    conditions.some(
      (v) => typeof raw.condition !== 'string' || !v.condition || !same(v.condition, raw.condition),
    )
  ) {
    mechanismIssue(
      ctx,
      'retain the full condition on its own action/test/decision rather than inventing a blanket condition',
    );
    return false;
  }
  return true;
}

/** Raw31: entities/scope/period, events:{option,behavior,state,qualification?,condition?,evidence}[], rewards:{option,quantity}[], decision:{state,option?,condition?,qualification,evidence}. */
export function parseExpansionExploreExploit(
  raw: Rec,
  ctx: ParseContext,
): ExpansionExploreExploitScene | null {
  const base = envelope(raw, ctx, '31', ['events', 'rewards', 'decision']);
  if (!base) return null;
  const { story, entities, scope, period, names, beats } = base;
  if (
    !Array.isArray(raw.events) ||
    raw.events.length < 2 ||
    !Array.isArray(raw.rewards) ||
    !raw.rewards.length ||
    raw.events.length + raw.rewards.length > EXPANSION_LIMITS.records
  )
    return mechanismIssue(
      ctx,
      'provide finite source events and rewards, at most twelve total records',
    );
  const events: ExpansionExploreEvent[] = [];
  let previous = -1;
  for (const [index, entry] of raw.events.entries()) {
    if (
      !isRec(entry) ||
      !onlyFields(
        entry,
        ['option', 'behavior', 'state', 'qualification', 'condition', 'evidence'],
        ctx,
      )
    )
      return mechanismIssue(ctx, 'events are bounded authored option/status assertions');
    const option = ref(entry.option, entities, ctx),
      e = expansionSourceSpan(entry.evidence, ctx);
    if (!option || !e) return null;
    const s = status(entry, e, ctx);
    if (
      !s ||
      (entry.behavior !== 'explore' && entry.behavior !== 'exploit') ||
      e.span.fromWord <= previous ||
      e.span.fromWord < beats.action.span.fromWord ||
      e.span.toWord >= beats.check.span.fromWord
    )
      return mechanismIssue(
        ctx,
        'events require distinct ordered actor-owned action clauses before reward checking',
      );
    const noun = entry.behavior === 'explore' ? 'exploration' : 'exploitation';
    const body =
      s.state === 'unknown' || s.state === 'missing' || s.state === 'disputed'
        ? `${literal(option.label)}\\s+${noun}\\s+is\\s+${literal(s.qualification)}`
        : `(?:${literal(option.label)}\\s+(?:is|was)\\s+${entry.behavior === 'explore' ? 'explored' : 'exploited'}|(?:the\\s+policy|the\\s+team)\\s+${entry.behavior === 'explore' ? 'explores' : 'exploits'}\\s+${literal(option.label)})`;
    if (!clause(e, qualified(context(body, scope, period), s), conditionOf(s)))
      return mechanismIssue(
        ctx,
        'the source must actually explore/exploit this option in this scope; mention, reward or recommendation is not behavior proof',
      );
    previous = e.span.toWord;
    events.push({
      id: `expansion-31-event-${index}`,
      optionId: option.id,
      behavior: entry.behavior,
      ...s,
      evidence: e.span,
    });
  }
  if (
    !events.some(
      (e) =>
        e.behavior === 'explore' &&
        e.state !== 'unknown' &&
        e.state !== 'missing' &&
        e.state !== 'disputed',
    ) ||
    !events.some(
      (e) =>
        e.behavior === 'exploit' &&
        e.state !== 'unknown' &&
        e.state !== 'missing' &&
        e.state !== 'disputed',
    ) ||
    !events.some((e) => spanSame(e.evidence, beats.action.span)) ||
    !events.some((e) => spanSame(e.evidence, beats.response.span))
  )
    return mechanismIssue(
      ctx,
      'both actual/explicitly qualified exploring and exploiting behavior must anchor the two action beats',
    );
  const rewards: ExpansionExploreExploitScene['rewards'][number][] = [];
  for (const [index, entry] of raw.rewards.entries()) {
    if (!isRec(entry) || !onlyFields(entry, ['option', 'quantity'], ctx))
      return mechanismIssue(
        ctx,
        'reward records accept only an option and its exact source quantity',
      );
    const option = ref(entry.option, entities, ctx),
      q = parseExpansionQuantity(entry.quantity, ctx);
    if (
      !option ||
      !q ||
      !same(q.actor, option.label) ||
      !same(q.claim, 'reward') ||
      !same(q.basis.population, scope) ||
      !same(q.basis.period, period) ||
      q.evidence.fromWord < beats.check.span.fromWord ||
      q.evidence.toWord >= beats.resolve.span.fromWord ||
      rewards.some((r) => r.optionId === option.id)
    )
      return mechanismIssue(
        ctx,
        'each reward must be independently supplied for its own option, scope/period and check phase; no invented reward',
      );
    if (
      ['count', 'percent', 'ratio', 'percentage-point', 'percent-change'].includes(q.basis.unit) &&
      !q.basis.denominator
    )
      return mechanismIssue(
        ctx,
        'reward counts/proportions need their exact positive source denominator',
      );
    rewards.push({ id: `expansion-31-reward-${index}`, optionId: option.id, quantity: q });
  }
  if (!rewards.some((r) => spanSame(r.quantity.evidence, beats.check.span)))
    return mechanismIssue(
      ctx,
      'check beat must supply actual known or explicitly unresolved reward evidence',
    );
  if (
    !isRec(raw.decision) ||
    !onlyFields(raw.decision, ['state', 'option', 'condition', 'qualification', 'evidence'], ctx)
  )
    return mechanismIssue(
      ctx,
      'decision is an authored retained/selected source statement, never an inferred best option',
    );
  const e = atBeat(raw.decision.evidence, beats.resolve, ctx),
    q = e
      ? expansionSourceLabel(raw.decision.qualification, e, ctx, EXPANSION_LIMITS.qualifier)
      : null;
  if (!e || !q || !same(story.outcome, q))
    return mechanismIssue(
      ctx,
      'outcome must retain the exact locally stated decision qualification',
    );
  let decision: ExpansionExploreExploitScene['decision'];
  if (raw.decision.state === 'unresolved') {
    const rewardState = same(q, 'remain available while rewards are unknown')
      ? 'unknown'
      : same(q, 'remain available while rewards are missing')
        ? 'missing'
        : same(q, 'remain available while rewards are disputed')
          ? 'disputed'
          : undefined;
    if (
      raw.decision.option !== undefined ||
      raw.decision.condition !== undefined ||
      (!rewardState && !same(q, 'remain available while evidence is gathered')) ||
      !clause(e, context(`${names}\\s+${literal(q)}`, scope, period)) ||
      (rewardState && !rewards.some((r) => r.quantity.state === rewardState))
    )
      return mechanismIssue(
        ctx,
        'unresolved choice retains actual named options and the exact source reward status, not a fabricated winner or promoted absence',
      );
    decision = {
      state: 'unresolved',
      retainedIds: entities.map((o) => o.id),
      qualification: q,
      evidence: e.span,
    };
  } else {
    const option = ref(raw.decision.option, entities, ctx),
      conditional = raw.decision.state === 'conditional';
    const condition = conditional
      ? expansionSourceLabel(raw.decision.condition, e, ctx, EXPANSION_LIMITS.qualifier)
      : undefined;
    if (
      !option ||
      (!conditional && raw.decision.state !== 'known') ||
      (!conditional && raw.decision.condition !== undefined) ||
      (conditional && !condition) ||
      !same(q, 'is selected') ||
      !clause(
        e,
        context(
          `${literal(option.label)}\\s+is\\s+selected\\s+while\\s+${names}\\s+remain\\s+available`,
          scope,
          period,
        ),
        condition ?? undefined,
      )
    )
      return mechanismIssue(
        ctx,
        'a choice must be expressly selected with its exact condition and retained options; never recommend an inferred best',
      );
    decision = {
      state: conditional ? 'conditional' : 'known',
      selectedId: option.id,
      retainedIds: entities.map((o) => o.id),
      ...(condition ? { condition } : {}),
      qualification: q,
      evidence: e.span,
    };
  }
  if (!qualifications(raw, [...events, ...rewards.map((r) => r.quantity), decision], ctx))
    return null;
  return {
    ...story,
    storyId: '31',
    kind: 'adaptive-choice',
    preset: 'explore-exploit',
    entities,
    scope,
    period,
    events,
    rewards,
    decision,
  };
}

/** Raw32: entities/scope/period, tests:{option,label,state,outcome?,qualification?,condition?,evidence}[], gathering:{evidence}, conclusion:{state:'unresolved',qualification,evidence}. */
export function parseExpansionSequentialEvidence(
  raw: Rec,
  ctx: ParseContext,
): ExpansionSequentialEvidenceScene | null {
  const base = envelope(raw, ctx, '32', ['tests', 'gathering', 'conclusion']);
  if (!base) return null;
  const { story, entities, scope, period, names, beats } = base;
  if (
    !Array.isArray(raw.tests) ||
    raw.tests.length < 2 ||
    raw.tests.length > EXPANSION_LIMITS.records
  )
    return mechanismIssue(
      ctx,
      'include two to twelve finite ordered source tests, not generated evidence',
    );
  const tests: ExpansionEvidenceTest[] = [];
  let previous = -1;
  for (const [index, entry] of raw.tests.entries()) {
    if (
      !isRec(entry) ||
      !onlyFields(
        entry,
        ['option', 'label', 'state', 'outcome', 'qualification', 'condition', 'evidence'],
        ctx,
      )
    )
      return mechanismIssue(
        ctx,
        'test outcomes have bounded authored fields, no numeric evaluator',
      );
    const option = ref(entry.option, entities, ctx),
      e = expansionSourceSpan(entry.evidence, ctx);
    if (!option || !e) return null;
    const label = expansionSourceLabel(entry.label, e, ctx, 26),
      s = status(entry, e, ctx);
    if (
      !label ||
      !s ||
      e.span.fromWord <= previous ||
      e.span.fromWord < beats.action.span.fromWord ||
      e.span.toWord >= beats.check.span.fromWord ||
      tests.some((t) => same(t.label, label))
    )
      return mechanismIssue(
        ctx,
        'tests need distinct source identities and strict local source order',
      );
    let outcome: ExpansionEvidenceTest['outcome'];
    let body: string;
    if (s.state === 'unknown' || s.state === 'missing' || s.state === 'disputed') {
      if (entry.outcome !== undefined)
        return mechanismIssue(
          ctx,
          'unknown/missing/disputed test information has no fabricated false/zero/resolved outcome',
        );
      body = `${literal(option.label)}\\s+${literal(label)}\\s+test\\s+outcome\\s+(?:is|remains)\\s+${literal(s.qualification)}`;
    } else {
      if (
        entry.outcome !== 'passed' &&
        entry.outcome !== 'failed' &&
        entry.outcome !== 'positive' &&
        entry.outcome !== 'negative' &&
        entry.outcome !== 'inconclusive'
      )
        return mechanismIssue(
          ctx,
          'resolved/qualified test outcomes must be supplied passed/failed/positive/negative/inconclusive words, not invented values',
        );
      outcome = entry.outcome;
      body = `${literal(option.label)}\\s+${literal(label)}\\s+test\\s+(?:reports|reported|records|recorded|returns|returned)\\s+${literal(outcome)}`;
    }
    if (!clause(e, qualified(context(body, scope, period), s), conditionOf(s)))
      return mechanismIssue(
        ctx,
        'outcome/status must belong to this exact option and named test, not another actor’s evidence',
      );
    previous = e.span.toWord;
    tests.push({
      id: `expansion-32-test-${index}`,
      optionId: option.id,
      label,
      ...s,
      ...(outcome ? { outcome } : {}),
      evidence: e.span,
    });
  }
  if (
    !tests.some((t) => spanSame(t.evidence, beats.action.span)) ||
    !tests.some((t) => spanSame(t.evidence, beats.response.span)) ||
    !isRec(raw.gathering) ||
    !onlyFields(raw.gathering, ['evidence'], ctx)
  )
    return mechanismIssue(
      ctx,
      'both test beats and an actual evidence gathering relation are required',
    );
  const gathering = atBeat(raw.gathering.evidence, beats.check, ctx);
  if (
    !gathering ||
    !clause(
      gathering,
      context(
        `${list(tests.map((t) => t.label))}\\s+tests\\s+(?:gather|collect)\\s+evidence\\s+for\\s+${names}`,
        scope,
        period,
      ),
    )
  )
    return mechanismIssue(
      ctx,
      'the named tests must actually gather relevant evidence for the retained options in this scope',
    );
  if (
    !isRec(raw.conclusion) ||
    !onlyFields(raw.conclusion, ['state', 'qualification', 'evidence'], ctx)
  )
    return mechanismIssue(
      ctx,
      'conclusion cannot synthesize a resolved branch or infer Bayesian reward',
    );
  const e = atBeat(raw.conclusion.evidence, beats.resolve, ctx),
    q = e
      ? expansionSourceLabel(raw.conclusion.qualification, e, ctx, EXPANSION_LIMITS.qualifier)
      : null;
  if (
    !e ||
    raw.conclusion.state !== 'unresolved' ||
    (q !== 'unknown information is not false' &&
      q !== 'missing information is not false' &&
      q !== 'evidence gathering continues') ||
    !same(story.outcome, q) ||
    !clause(
      e,
      context(
        `${names}\\s+remain\\s+(?:under\\s+review|available)\\s+(?:because|while)\\s+${literal(q)}`,
        scope,
        period,
      ),
    ) ||
    (q === 'unknown information is not false' && !tests.some((t) => t.state === 'unknown')) ||
    (q === 'missing information is not false' && !tests.some((t) => t.state === 'missing'))
  )
    return mechanismIssue(
      ctx,
      'retain the actual options and unresolved/not-false qualification; absent evidence is not failure, zero or a resolved choice',
    );
  if (!qualifications(raw, tests, ctx)) return null;
  return {
    ...story,
    storyId: '32',
    kind: 'conditional-choice',
    preset: 'sequential-evidence',
    entities,
    scope,
    period,
    tests,
    gatheringEvidence: gathering.span,
    conclusion: {
      state: 'unresolved',
      retainedIds: entities.map((o) => o.id),
      qualification: q,
      evidence: e.span,
    },
  };
}
