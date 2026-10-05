/** Closed authored geometry identities. Stories 57/58 perform NO domain derivations. */
import { expansionEntry } from '../../remotion/compositions/explainer/expansion/catalog';
import {
  EXPANSION_SECTION_PARTS,
  EXPANSION_UNFOLD_FACES,
  type ExpansionGeometryFact,
  type ExpansionGeometryState,
  type ExpansionInteriorPart,
  type ExpansionSectionPart,
  type ExpansionSectionScanScene,
  type ExpansionSectionTemplate,
  type ExpansionSolidUnfoldScene,
} from '../../remotion/compositions/explainer/expansion/geometry/section-unfold-types';
import type {
  ExpansionEntity,
  ExpansionStoryBase,
} from '../../remotion/compositions/explainer/expansion/scene-types';
import type { ExpansionQuantity } from '../../remotion/compositions/explainer/expansion/value-types';
import { parseExpansionQuantity } from './expansion-quantity-contract';
import {
  type ExpansionSourceEvidence,
  expansionAssertedRelation,
  expansionEntities,
  expansionSourceLabel,
  expansionSourceSpan,
} from './expansion-source-contract';
import { onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue, strictMechanismBeats } from './mechanism-contract';

const BEATS = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'] as const;
const FACT = [
  'actor',
  'identity',
  'claim',
  'scope',
  'period',
  'evidence',
  'state',
  'value',
  'condition',
  'qualifier',
  'alternatives',
] as const;
const LENGTH_UNITS = ['millimetre', 'centimetre', 'metre'] as const;
function literal(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
}
function safe(text: string): boolean {
  return (
    !/[<>`{}[\]\\()]|=>|\b(?:https?|ftp|file|data|javascript):|www\.|\b(?:function|eval)\b|(?:^|\s)(?:\.{0,2}\/|~\/)\S+|\S+\.(?:svg|html|js|tsx|png|mp4)\b/i.test(
      text,
    ) && ![...text].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  );
}
function phrase(
  raw: unknown,
  source: ExpansionSourceEvidence,
  ctx: ParseContext,
  max = 96,
): string | null {
  const label = expansionSourceLabel(raw, source, ctx, max);
  return label && safe(label)
    ? label
    : mechanismIssue(ctx, 'bounded local plain source text required');
}
function list(values: readonly string[]): string {
  if (values.length === 1) return literal(values[0]);
  if (values.length === 2) return values.map(literal).join('\\s+and\\s+');
  return `${values.slice(0, -1).map(literal).join(',\\s*')},?\\s+and\\s+${literal(values[values.length - 1])}`;
}
function scoped(body: string, scope: string, period: string): string {
  const context = `(?:for|within)\\s+${literal(scope)}\\s+(?:during|in)\\s+${literal(period)}`;
  return `(?:${body}\\s+${context}|${context},\\s*${body})`;
}
interface Base {
  story: ExpansionStoryBase;
  actors: ExpansionEntity[];
  identity: string;
  scope: string;
  period: string;
  clauses: ExpansionSourceEvidence[];
}
function envelope(raw: Rec, ctx: ParseContext, id: '57' | '58'): Base | null {
  if (
    !isRec(raw) ||
    !onlyFields(
      raw,
      [
        'kind',
        'preset',
        'visualMode',
        'template',
        'label',
        'subject',
        'outcome',
        'evidence',
        'startWord',
        'endWord',
        'layout',
        'actors',
        'identity',
        'scope',
        'period',
        'measurement',
        'result',
        ...BEATS,
        ...(id === '57' ? ['parts', 'section'] : ['net', 'faces', 'unfolding', 'correspondence']),
      ],
      ctx,
    )
  )
    return mechanismIssue(ctx, 'closed authored geometry proposal required');
  const entry = expansionEntry(raw.kind, raw.preset),
    win = ctx.win,
    duration = win.endTime - win.startTime;
  if (
    !entry ||
    entry.id !== id ||
    (raw.visualMode !== 'diagram' && raw.visualMode !== 'hybrid') ||
    raw.evidence !== 'source-stated' ||
    (raw.startWord !== undefined && raw.startWord !== win.startWord) ||
    (raw.endWord !== undefined && raw.endWord !== win.endWord) ||
    (raw.layout !== undefined && !entry.layouts.some((l) => l === raw.layout))
  )
    return mechanismIssue(ctx, 'exact preset/mode and complete offered envelope required');
  if (
    !Number.isFinite(win.startTime) ||
    !Number.isFinite(win.endTime) ||
    duration < 5 ||
    duration > 12 ||
    !Number.isSafeInteger(win.startWord) ||
    !Number.isSafeInteger(win.endWord) ||
    win.startWord < 0 ||
    win.endWord < win.startWord ||
    win.endWord >= ctx.words.length
  )
    return mechanismIssue(ctx, 'finite complete 5–12s geometry window required');
  const words = ctx.words.slice(win.startWord, win.endWord + 1);
  if (
    words.some(
      (w, i) =>
        !safe(w.text) ||
        !Number.isFinite(w.start) ||
        !Number.isFinite(w.end) ||
        w.end <= w.start ||
        w.start < win.startTime ||
        w.end > win.endTime ||
        (i > 0 && w.start < words[i - 1].end - 1e-7),
    ) ||
    words[0].start < win.startTime + 0.25 - 1e-7 ||
    words[words.length - 1].end > win.endTime - 0.35 + 1e-7
  )
    return mechanismIssue(
      ctx,
      'positive finite nonoverlapping source words and production padding required',
    );
  const clauses: ExpansionSourceEvidence[] = [];
  for (const beat of BEATS) {
    const start = ctx.inWin(raw[beat]);
    if (start === null) return mechanismIssue(ctx, 'five complete source clauses required');
    let end = start;
    while (end < win.endWord && !/[.!?;]$/.test(ctx.words[end].text)) end++;
    if (!/[.!?;]$/.test(ctx.words[end].text))
      return mechanismIssue(ctx, 'incomplete source clause');
    const source = expansionSourceSpan({ fromWord: start, toWord: end }, ctx);
    if (!source) return null;
    clauses.push(source);
  }
  if (
    new Set(clauses.map((c) => c.span.fromWord)).size !== 5 ||
    clauses[0].span.fromWord !== win.startWord ||
    clauses[4].span.toWord !== win.endWord
  )
    return mechanismIssue(ctx, 'five distinct whole clauses must cover setup through resolve');
  const beats = strictMechanismBeats(raw, ctx, BEATS, [1, 1, 1, 1], 0.8),
    actors = expansionEntities(raw.actors, ctx, id);
  const identity = phrase(raw.identity, clauses[0], ctx, 28),
    scope = phrase(raw.scope, clauses[0], ctx, 40),
    period = phrase(raw.period, clauses[0], ctx, 32);
  const label = phrase(raw.label, clauses[0], ctx, 48),
    subject = phrase(raw.subject, clauses[0], ctx, 34),
    outcome = phrase(raw.outcome, clauses[4], ctx, 54);
  if (!beats || !actors || !identity || !scope || !period || !label || !subject || !outcome)
    return null;
  if (
    !actors.some((a) => a.label === subject) ||
    actors.some(
      (a) =>
        !safe(a.label) ||
        a.evidence.fromWord !== clauses[0].span.fromWord ||
        a.evidence.toWord !== clauses[0].span.toWord,
    )
  )
    return mechanismIssue(ctx, 'actors must be introduced by the complete setup');
  if (
    id === '57' &&
    (typeof raw.template !== 'string' || !Object.hasOwn(EXPANSION_SECTION_PARTS, raw.template))
  )
    return mechanismIssue(ctx, 'authored section template required');
  if (id === '58' && (raw.template !== 'cube' || raw.net !== 'cube-cross'))
    return mechanismIssue(ctx, 'only the authored cube/cube-cross pair is allowed');
  const body = `${literal(identity)}\\s+(?:lists|records)\\s+${list(actors.map((a) => a.label))}\\s+as\\s+actors?\\s+with\\s+${literal(String(raw.template))}\\s+template${id === '58' ? `\\s+and\\s+${list(EXPANSION_UNFOLD_FACES)}\\s+faces` : ''}`;
  if (
    !expansionAssertedRelation(
      clauses[0],
      new RegExp(scoped(body, scope, period), 'iu'),
      undefined,
      [identity, scope, period, ...actors.map((a) => a.label)].slice(0, 8),
    )
  )
    return mechanismIssue(
      ctx,
      'template and exact actor/face identities must be supplied in setup',
    );
  return {
    story: {
      storyId: id,
      visualMode: raw.visualMode,
      evidence: 'source-stated',
      label,
      subject,
      outcome,
      setupAt: beats[0],
      actionAt: beats[1],
      responseAt: beats[2],
      checkAt: beats[3],
      resolveAt: beats[4],
    },
    actors,
    identity,
    scope,
    period,
    clauses,
  };
}
function fact<T extends string>(
  raw: unknown,
  base: Base,
  ctx: ParseContext,
  id: string,
  claim: string,
  allowed: readonly T[],
  body: (values: readonly T[], state: string) => string,
  extra: readonly string[] = [],
): ExpansionGeometryFact<T> | null {
  if (!isRec(raw) || !onlyFields(raw, [...FACT, ...extra], ctx))
    return mechanismIssue(ctx, 'complete closed geometry fact required');
  const source = expansionSourceSpan(raw.evidence, ctx);
  if (!source) return null;
  const actor = base.actors.find((a) => a.label === raw.actor);
  if (
    !actor ||
    raw.identity !== base.identity ||
    raw.claim !== claim ||
    raw.scope !== base.scope ||
    raw.period !== base.period
  )
    return mechanismIssue(
      ctx,
      'geometry fact actor/claim/identity/scope/period must be supplied, not inferred',
    );
  for (const [value, max] of [
    [raw.actor, 28],
    [raw.identity, 28],
    [raw.claim, 96],
    [raw.scope, 40],
    [raw.period, 32],
  ] as const)
    if (!phrase(value, source, ctx, max)) return null;
  const state = raw.state;
  if (
    typeof state !== 'string' ||
    ![
      'known',
      'conditional',
      'simulated',
      'illustrative',
      'unknown',
      'missing',
      'disputed',
    ].includes(state)
  )
    return mechanismIssue(ctx, 'distinct supplied geometry status required');
  const condition = state === 'conditional' ? phrase(raw.condition, source, ctx, 96) : undefined;
  const qualifier = ['simulated', 'illustrative', 'unknown', 'missing', 'disputed'].includes(state)
    ? phrase(raw.qualifier, source, ctx, 96)
    : undefined;
  if (
    (state === 'conditional' && (!condition || raw.qualifier !== undefined)) ||
    (state !== 'conditional' && raw.condition !== undefined) ||
    (['known', 'conditional'].includes(state) && raw.qualifier !== undefined) ||
    (['simulated', 'illustrative', 'unknown', 'missing', 'disputed'].includes(state) &&
      !qualifier) ||
    (state === 'simulated' && !/\bsimulat(?:ed|ion)\b/i.test(qualifier ?? '')) ||
    (state === 'illustrative' && !/\billustrative\b/i.test(qualifier ?? '')) ||
    (['unknown', 'missing', 'disputed'].includes(state) && qualifier !== state)
  )
    return mechanismIssue(ctx, 'retain complete conditions and explicit source qualification');
  let values: T[] = [];
  if (state === 'unknown' || state === 'missing') {
    if (raw.value !== undefined || raw.alternatives !== undefined)
      return mechanismIssue(ctx, 'absence of knowledge is not a supplied geometry value');
  } else if (state === 'disputed') {
    if (
      raw.value !== undefined ||
      !Array.isArray(raw.alternatives) ||
      raw.alternatives.length !== 2 ||
      raw.alternatives[0] === raw.alternatives[1] ||
      raw.alternatives.some((v) => !allowed.some((a) => a === v))
    )
      return mechanismIssue(ctx, 'retain two distinct authored disputed alternatives');
    values = raw.alternatives as T[];
  } else {
    if (raw.alternatives !== undefined || !allowed.some((a) => a === raw.value))
      return mechanismIssue(ctx, 'authored source fact value required');
    values = [raw.value as T];
  }
  let trusted = body(values, state);
  if (state === 'simulated' || state === 'illustrative')
    trusted = `(?:in\\s+this|in\\s+the)\\s+${literal(qualifier ?? '')},\\s*${trusted}`;
  if (
    !expansionAssertedRelation(source, new RegExp(trusted, 'iu'), condition ?? undefined, [
      actor.label,
      base.identity,
      claim,
      base.scope,
      base.period,
      ...(qualifier ? [qualifier] : []),
      ...values,
    ])
  )
    return mechanismIssue(ctx, 'exact complete actor-owned geometry relation required');
  const common = {
    id,
    actorId: actor.id,
    identity: base.identity,
    claim,
    scope: base.scope,
    period: base.period,
    evidence: source.span,
  };
  let status: ExpansionGeometryState<T>;
  if (state === 'unknown' || state === 'missing') status = { state, qualifier: qualifier ?? '' };
  else if (state === 'disputed')
    status = { state, qualifier: qualifier ?? '', alternatives: [values[0], values[1]] };
  else if (state === 'conditional')
    status = { state, value: values[0], condition: condition ?? '' };
  else if (state === 'simulated' || state === 'illustrative')
    status = { state, value: values[0], qualifier: qualifier ?? '' };
  else status = { state: 'known', value: values[0] };
  return { ...common, ...status };
}
function simpleBody(
  raw: Rec,
  base: Base,
  noun: string,
  values: readonly string[],
  state: string,
): string {
  const value =
    state === 'unknown' || state === 'missing'
      ? state
      : state === 'disputed'
        ? `disputed\\s+between\\s+${literal(values[0])}\\s+and\\s+${literal(values[1])}`
        : literal(values[0]);
  return scoped(
    `${literal(String(raw.actor))}\\s+(?:states|reports|records)\\s+${literal(base.identity)}\\s+${noun}\\s+is\\s+${value}`,
    base.scope,
    base.period,
  );
}
function measurement(
  raw: unknown,
  base: Base,
  ctx: ParseContext,
  claim: string,
  actorId: string,
): ExpansionQuantity | null {
  const q = parseExpansionQuantity(raw, ctx),
    actor = base.actors.find((a) => a.id === actorId);
  if (
    !q ||
    !actor ||
    q.actor !== actor.label ||
    q.claim !== claim ||
    q.basis.population !== base.scope ||
    q.basis.period !== base.period ||
    !LENGTH_UNITS.some((u) => u === q.basis.unit)
  )
    return mechanismIssue(ctx, 'retain exact supplied actor/claim/unit/period/scope measurement');
  const amounts = 'amount' in q ? [q.amount] : 'alternatives' in q ? q.alternatives : [];
  if (amounts.some((a) => a.kind !== 'rational' || a.value.numerator < 0))
    return mechanismIssue(ctx, 'nonnegative supplied length only; no geometry derivation');
  return q;
}
function result<T extends string>(
  raw: unknown,
  base: Base,
  ctx: ParseContext,
  id: '57' | '58',
  allowed: readonly T[],
): ExpansionGeometryFact<T> | null {
  if (!isRec(raw)) return mechanismIssue(ctx, 'explicit source result required');
  const parsed = fact(raw, base, ctx, `expansion-${id}-result`, 'result', allowed, (v, s) =>
    simpleBody(raw, base, 'result', v, s),
  );
  if (
    !parsed ||
    parsed.evidence.fromWord !== base.clauses[4].span.fromWord ||
    parsed.evidence.toWord !== base.clauses[4].span.toWord ||
    (raw.value !== undefined && base.story.outcome !== raw.value) ||
    (raw.value === undefined && base.story.outcome !== raw.state)
  )
    return mechanismIssue(
      ctx,
      'resolve must retain the supplied result/status, never infer completion',
    );
  return parsed;
}
export function parseExpansionSectionScan(
  raw: Rec,
  ctx: ParseContext,
): ExpansionSectionScanScene | null {
  const base = envelope(raw, ctx, '57');
  if (!base) return null;
  const template = raw.template as ExpansionSectionTemplate,
    allowed: readonly string[] = EXPANSION_SECTION_PARTS[template];
  if (!Array.isArray(raw.parts) || raw.parts.length < 1 || raw.parts.length > allowed.length)
    return mechanismIssue(ctx, 'bounded named interior parts required');
  const parts: ExpansionSectionPart[] = [];
  for (const [i, item] of raw.parts.entries()) {
    if (
      !isRec(item) ||
      typeof item.part !== 'string' ||
      !allowed.includes(item.part) ||
      parts.some((p) => p.part === item.part)
    )
      return mechanismIssue(ctx, 'part must be a distinct authored identity for this template');
    const part = item.part;
    const parsed = fact(
      item,
      base,
      ctx,
      `expansion-57-part-${i}`,
      'visibility',
      ['hidden', 'visible', 'absent'] as const,
      (v, s) => simpleBody(item, base, `${literal(part)}\\s+visibility`, v, s),
      ['part'],
    );
    if (!parsed) return null;
    parts.push({ ...parsed, part: part as ExpansionInteriorPart });
  }
  if (!isRec(raw.section) || typeof raw.section.part !== 'string')
    return mechanismIssue(ctx, 'supplied section relation required');
  const sectionRaw = raw.section;
  const selected = parts.find((p) => p.part === sectionRaw.part);
  if (!selected) return mechanismIssue(ctx, 'section must name an introduced interior part');
  const section = fact(
    sectionRaw,
    base,
    ctx,
    'expansion-57-section',
    'section',
    ['intersects', 'misses'] as const,
    (v, s) =>
      s === 'unknown' || s === 'missing' || s === 'disputed'
        ? simpleBody(sectionRaw, base, `section\\s+for\\s+${literal(selected.part)}`, v, s)
        : scoped(
            `${literal(String(sectionRaw.actor))}\\s+(?:states|reports|records)\\s+${literal(base.identity)}\\s+section\\s+${literal(v[0])}\\s+${literal(selected.part)}`,
            base.scope,
            base.period,
          ),
    ['part'],
  );
  if (!section || section.actorId !== selected.actorId)
    return mechanismIssue(ctx, 'section must retain the same supplied part owner');
  const q = measurement(
      raw.measurement,
      base,
      ctx,
      `${base.identity} ${selected.part} width`,
      selected.actorId,
    ),
    resolved = result(raw.result, base, ctx, '57', [
      'revealed',
      'not-revealed',
      'unresolved',
    ] as const);
  if (!q || !resolved || resolved.actorId !== selected.actorId)
    return mechanismIssue(ctx, 'measurement/result must retain supplied part identity and owner');
  if (
    selected.state === 'known' &&
    selected.value === 'absent' &&
    ((section.state === 'known' && section.value === 'intersects') ||
      (resolved.state === 'known' && resolved.value === 'revealed'))
  )
    return mechanismIssue(
      ctx,
      'an explicitly absent part cannot be represented as intersected/revealed',
    );
  return {
    ...base.story,
    storyId: '57',
    kind: 'section-view',
    preset: 'scan',
    template,
    actors: base.actors,
    identity: base.identity,
    scope: base.scope,
    period: base.period,
    measurement: q,
    parts,
    section: { ...section, partId: selected.id },
    result: { ...resolved, partId: selected.id },
  };
}
export function parseExpansionSolidUnfold(
  raw: Rec,
  ctx: ParseContext,
): ExpansionSolidUnfoldScene | null {
  const base = envelope(raw, ctx, '58');
  if (!base) return null;
  if (
    !Array.isArray(raw.faces) ||
    raw.faces.length !== 6 ||
    new Set(raw.faces).size !== 6 ||
    raw.faces.some((f) => !EXPANSION_UNFOLD_FACES.some((a) => a === f))
  )
    return mechanismIssue(ctx, 'all six exact authored face identities required');
  const faces = EXPANSION_UNFOLD_FACES.map((face, i) => ({
    id: `expansion-58-face-${i}`,
    face,
    evidence: base.clauses[0].span,
  }));
  if (!isRec(raw.unfolding) || !isRec(raw.correspondence))
    return mechanismIssue(ctx, 'supplied unfolding and correspondence facts required');
  const unfoldingRaw = raw.unfolding;
  const unfolding = fact(
    unfoldingRaw,
    base,
    ctx,
    'expansion-58-unfolding',
    'unfolding',
    ['cube-cross'] as const,
    (v, s) => simpleBody(unfoldingRaw, base, 'unfolding', v, s),
  );
  const c = raw.correspondence;
  const links: { from: string; to: string }[] = [];
  const resolved = ['known', 'conditional', 'simulated', 'illustrative'].includes(String(c.state));
  if (resolved) {
    if (!Array.isArray(c.links) || c.links.length !== 6)
      return mechanismIssue(ctx, 'six explicitly supplied face correspondences required');
    for (const item of c.links) {
      if (
        !isRec(item) ||
        !onlyFields(item, ['from', 'to'], ctx) ||
        !EXPANSION_UNFOLD_FACES.some((f) => f === item.from) ||
        item.to !== item.from ||
        links.some((l) => l.from === item.from)
      )
        return mechanismIssue(ctx, 'exact authored bijection only; never repair or invent faces');
      links.push({ from: String(item.from), to: String(item.to) });
    }
  } else if (c.links !== undefined)
    return mechanismIssue(ctx, 'unknown/missing/disputed correspondence cannot fabricate links');
  const correspondence = fact(
    c,
    base,
    ctx,
    'expansion-58-correspondence',
    'correspondence',
    ['matched', 'unresolved'] as const,
    (v, s) => {
      if (!resolved) return simpleBody(c, base, 'correspondence', v, s);
      const names = EXPANSION_UNFOLD_FACES.map((f) => `${f} matches ${f}`);
      return scoped(
        `${literal(String(c.actor))}\\s+(?:states|reports|records)\\s+${literal(base.identity)}\\s+correspondence\\s+is\\s+${literal(v[0])}\\s+with\\s+${list(names)}\\s+on\\s+cube-cross`,
        base.scope,
        base.period,
      );
    },
    ['links'],
  );
  const final = result(raw.result, base, ctx, '58', ['unfolded', 'unresolved'] as const);
  if (
    !unfolding ||
    !correspondence ||
    !final ||
    correspondence.actorId !== unfolding.actorId ||
    final.actorId !== unfolding.actorId
  )
    return mechanismIssue(
      ctx,
      'unfolding/correspondence/result must retain the same supplied owner',
    );
  const q = measurement(raw.measurement, base, ctx, `${base.identity} edge`, unfolding.actorId);
  if (!q) return null;
  if (resolved && 'value' in correspondence && correspondence.value !== 'matched')
    return mechanismIssue(ctx, 'resolved correspondence must be source matched');
  return {
    ...base.story,
    storyId: '58',
    kind: 'geometry-projection',
    preset: 'unfold',
    template: 'cube',
    net: 'cube-cross',
    actors: base.actors,
    identity: base.identity,
    scope: base.scope,
    period: base.period,
    measurement: q,
    faces,
    unfolding,
    correspondence,
    links: resolved
      ? faces.map((f, i) => ({
          id: `expansion-58-link-${i}`,
          fromId: f.id,
          toId: f.id,
          role: 'correspondence' as const,
          evidence: correspondence.evidence,
        }))
      : [],
    result: final,
  };
}
