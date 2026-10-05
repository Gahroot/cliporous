/** STEP17: closed energy transfers and qualified authored teaching fields. No derivations. */

import { expansionEntry } from '../../remotion/compositions/explainer/expansion/catalog';
import type {
  EnergyFieldRecord,
  EnergyFieldRelation,
  ExpansionDirectionalFieldScene,
  ExpansionEnergyBudgetScene,
  ExpansionEnergyFieldScene,
} from '../../remotion/compositions/explainer/expansion/physical/energy-field-types';
import type { ExpansionStoryBase } from '../../remotion/compositions/explainer/expansion/scene-types';
import { compatibleBasis } from '../../remotion/compositions/explainer/expansion/value-logic';
import type { ExpansionQuantity } from '../../remotion/compositions/explainer/expansion/value-types';
import { parseExpansionQuantity } from './expansion-quantity-contract';
import {
  expansionAssertedRelation,
  expansionEntities,
  expansionSourceLabel,
  expansionSourceSpan,
} from './expansion-source-contract';
import { onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue, strictMechanismBeats } from './mechanism-contract';

const PHASES = ['setup', 'action', 'response', 'check', 'resolve'] as const;
const BEATS = PHASES.map((p) => `${p}Word`);
function safe(text: string): boolean {
  return (
    !/[<>`{}[\]\\()]|=>|\w+:\/\/|www\.|javascript:|data:|\b(?:eval|function)\b|\b\S+\.(?:svg|html|png|js|tsx)\b/i.test(
      text,
    ) && ![...text].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  );
}
function lit(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}
function quantityPredicate(
  q: ExpansionQuantity,
  body: string,
  text: string,
  labels: string[],
): boolean {
  const prefix =
    q.state === 'illustrative' || q.state === 'simulated'
      ? `in\\s+this\\s+${lit(q.qualifier)},\\s*`
      : '';
  return expansionAssertedRelation(
    text,
    new RegExp(prefix + body, 'iu'),
    q.state === 'conditional' ? q.condition : undefined,
    labels,
  );
}
function parse(raw: Rec, ctx: ParseContext, id: '79' | '80'): ExpansionEnergyFieldScene | null {
  const fail = (message: string) => mechanismIssue(ctx, message);
  if (
    !isRec(raw) ||
    !onlyFields(
      raw,
      [
        'kind',
        'preset',
        'template',
        'visualMode',
        'evidence',
        'label',
        'subject',
        'outcome',
        'actor',
        'scope',
        'period',
        'entities',
        'records',
        'relations',
        'domain',
        'qualification',
        'layout',
        'startWord',
        'endWord',
        ...BEATS,
      ],
      ctx,
    )
  )
    return fail('closed energy/field source schema required');
  if (
    id === '79'
      ? raw.template !== 'energy-carriers' ||
        raw.domain !== undefined ||
        raw.qualification !== undefined
      : typeof raw.template !== 'string' ||
        !['uniform-field', 'radial-field'].includes(raw.template) ||
        raw.domain !== 'teaching-plane' ||
        typeof raw.qualification !== 'string' ||
        !['illustrative teaching model', 'simulated teaching model'].includes(raw.qualification) ||
        raw.evidence !== 'illustrative'
  )
    return fail('exact authored template/domain and visible teaching qualification required');
  const { win, words } = ctx;
  if (
    !Number.isSafeInteger(win.startWord) ||
    !Number.isSafeInteger(win.endWord) ||
    win.startWord < 0 ||
    win.endWord >= words.length ||
    win.endWord < win.startWord ||
    !Number.isFinite(win.startTime) ||
    !Number.isFinite(win.endTime)
  )
    return fail('complete finite source window required');
  for (let i = win.startWord; i <= win.endWord; i++) {
    const w = words[i],
      previous = i > win.startWord ? words[i - 1] : undefined;
    if (
      !w ||
      typeof w.text !== 'string' ||
      !w.text.trim() ||
      !safe(w.text) ||
      !Number.isFinite(w.start) ||
      !Number.isFinite(w.end) ||
      w.end <= w.start ||
      w.start < win.startTime ||
      w.end > win.endTime ||
      (previous && w.start < previous.end - 1e-7)
    )
      return fail('finite positive nonoverlapping plain source words required');
  }
  if (
    words[win.startWord].start < win.startTime + 0.25 - 1e-7 ||
    words[win.endWord].end > win.endTime - 0.35 + 1e-7 ||
    !/[.!?;][”"’')\]]*$/.test(words[win.endWord].text)
  )
    return fail('complete source clauses with .25/.35 speech padding required');
  // The shared hybrid envelope treats a local quantity condition as a global story
  // condition. Here each quantity owns its own qualification; never widen that scope.
  const entry = expansionEntry(raw.kind, raw.preset);
  if (
    entry?.id !== id ||
    win.endTime - win.startTime < 5 ||
    win.endTime - win.startTime > 12 ||
    (raw.visualMode !== 'diagram' && raw.visualMode !== 'hybrid') ||
    (raw.evidence !== 'source-stated' && raw.evidence !== 'illustrative') ||
    (raw.startWord !== undefined && raw.startWord !== win.startWord) ||
    (raw.endWord !== undefined && raw.endWord !== win.endWord) ||
    (raw.layout !== undefined && !entry.layouts.some((layout) => layout === raw.layout))
  )
    return fail('exact kind/preset, complete 5–12s envelope, mode and offered layout required');
  const sources = [];
  for (const field of BEATS) {
    const fromWord = ctx.inWin(raw[field]);
    if (fromWord === null) return fail('five source-clause beats required');
    let toWord = fromWord;
    while (toWord < win.endWord && !/[.!?;][”"’')\]]*$/.test(words[toWord].text)) toWord++;
    const source = expansionSourceSpan({ fromWord, toWord }, ctx);
    if (!source) return null;
    sources.push(source);
  }
  if (new Set(sources.map((s) => s.span.fromWord)).size !== 5)
    return fail('five distinct complete clauses required');
  const label = expansionSourceLabel(raw.label, sources[0], ctx, 48);
  const subject = expansionSourceLabel(raw.subject, sources[0], ctx, 34);
  const outcome = expansionSourceLabel(raw.outcome, sources[4], ctx, 54);
  if (!label || !subject || !outcome)
    return fail('setup/resolve labels require exact local source evidence');
  const spans = {
    setup: sources[0].text,
    action: sources[1].text,
    response: sources[2].text,
    check: sources[3].text,
    resolve: sources[4].text,
  };
  const times = strictMechanismBeats(raw, ctx, BEATS, [1, 1, 1, 1], 0.8);
  if (
    !times ||
    times.some((t, i) => i > 0 && t - times[i - 1] < 1 - 1e-7) ||
    win.endTime - times[4] < 0.8 - 1e-7
  )
    return fail('five 1s-separated beats and .8s final hold required');
  const [setupAt, actionAt, responseAt, checkAt, resolveAt] = times;
  const story: ExpansionStoryBase = {
    storyId: id,
    visualMode: raw.visualMode,
    evidence: raw.evidence,
    label,
    subject,
    outcome,
    setupAt,
    actionAt,
    responseAt,
    checkAt,
    resolveAt,
  };
  const base = { story, spans };
  if (raw.setupWord !== win.startWord) return fail('setup must retain the first source clause');
  for (const field of BEATS) {
    const index = ctx.inWin(raw[field]);
    if (index === null || (index > 0 && !/[.!?;][”"’')\]]*$/.test(words[index - 1].text)))
      return fail('beats must begin five distinct complete clauses');
  }
  const resolve = expansionSourceSpan({ fromWord: raw.resolveWord, toWord: win.endWord }, ctx);
  const entities = expansionEntities(raw.entities, ctx, id);
  const actor = entities?.find((e) => e.label === raw.actor);
  const scope = expansionSourceLabel(raw.scope, base.spans.setup, ctx, 40);
  const period = expansionSourceLabel(raw.period, base.spans.setup, ctx, 32);
  if (!resolve || !entities || !actor || !scope || !period || actor.label !== raw.subject)
    return fail('exact setup actor/scope/period required');
  const qualified = id === '80' ? `\\s+as\\s+an?\\s+${lit(String(raw.qualification))}` : '';
  const scopePattern = `\\s+for\\s+${lit(scope)}\\s+during\\s+${lit(period)}`;
  const setup = `${lit(base.story.label)}\\s+(?:tracks|follows)\\s+${lit(actor.label)}${qualified}${scopePattern}`;
  if (
    !expansionAssertedRelation(base.spans.setup, new RegExp(setup, 'iu'), undefined, [
      base.story.label,
      actor.label,
      scope,
      period,
    ])
  )
    return fail('setup must assert the exact tracked identity and qualified teaching basis');
  if (!Array.isArray(raw.records) || raw.records.length < 1 || raw.records.length > 12)
    return fail('one to twelve exact quantity records required');
  const records: EnergyFieldRecord[] = [];
  const keys = new Set<string>();
  for (const [i, v] of raw.records.entries()) {
    if (!isRec(v) || !onlyFields(v, ['quantity'], ctx))
      return fail('records contain only source quantities');
    const q = parseExpansionQuantity(v.quantity, ctx);
    if (!q) return fail('exact locally bound quantity required');
    const owner = entities.find((e) => e.label === q.actor);
    if (!owner || q.basis.period !== period || q.basis.population !== scope)
      return fail('quantity actor/period/population must match retained scene identities');
    if (id === '79') {
      if (
        !['joule', 'kilojoule'].includes(q.basis.unit) ||
        !['input energy', 'output energy', 'loss', 'stored energy'].includes(q.claim)
      )
        return fail('energy quantities require explicit joule/kilojoule claims');
      if (records[0] && !compatibleBasis(records[0].quantity.basis, q.basis))
        return fail(
          'energy quantities require an identical compatible basis; no automatic conversion',
        );
    } else {
      if (
        q.state === 'known' ||
        !['strength', 'direction'].includes(q.claim) ||
        q.basis.unit !== (q.claim === 'strength' ? 'ratio' : 'degree') ||
        q.basis.denominator !== undefined
      )
        return fail('field parameters are qualified teaching values, never measured facts');
      if (raw.template === 'radial-field' && q.claim === 'direction')
        return fail('radial direction is authored, not a supplied orientation');
      const amounts = 'amount' in q ? [q.amount] : q.state === 'disputed' ? q.alternatives : [];
      if (
        amounts.some(
          (a) =>
            a.kind !== 'rational' ||
            Math.abs(a.value.numerator / a.value.denominator) >
              (q.claim === 'strength' ? 1000 : 360),
        )
      )
        return fail('bounded exact teaching parameters required');
    }
    const key = `${owner.id}:${q.claim}`;
    if (keys.has(key)) return fail('duplicate actor/claim records are not aliases');
    keys.add(key);
    records.push({ id: `expansion-${id}-record-${i}`, actorId: owner.id, quantity: q });
  }
  if (!Array.isArray(raw.relations) || raw.relations.length < 1 || raw.relations.length > 16)
    return fail('one to sixteen source relations required');
  const relations: EnergyFieldRelation[] = [];
  const relationKeys = new Set<string>();
  for (const [i, v] of raw.relations.entries()) {
    if (!isRec(v) || !onlyFields(v, ['from', 'to', 'claim', 'evidence'], ctx))
      return fail('closed source transfer/model relation required');
    const from = entities.find((e) => e.label === v.from),
      to = entities.find((e) => e.label === v.to);
    const record = records.find((r) => r.actorId === from?.id && r.quantity.claim === v.claim);
    const s = expansionSourceSpan(v.evidence, ctx);
    if (!from || !to || !record || !s || (id === '79' && from.id === to.id))
      return fail('relation needs explicit actors, quantity and complete local evidence');
    const body =
      id === '79'
        ? `${lit(from.label)}\\s+(?:transfers|routes)\\s+${lit(record.quantity.claim)}\\s+to\\s+${lit(to.label)}${scopePattern}`
        : `${lit(from.label)}\\s+(?:illustrates|depicts)\\s+${lit(String(raw.template))}\\s+on\\s+${lit(String(raw.domain))}${scopePattern}`;
    if (id === '80' && (from.id !== actor.id || to.id !== actor.id))
      return fail(
        'authored field is tied to its tracked source actor, not fabricated destinations',
      );
    if (
      !quantityPredicate(record.quantity, body, s.text, [
        from.label,
        to.label,
        record.quantity.claim,
        scope,
        period,
      ])
    )
      return fail(
        'source must assert this transfer or qualified authored field, not inferred behavior',
      );
    const key = `${from.id}:${to.id}:${record.id}`;
    if (relationKeys.has(key)) return fail('duplicate relations rejected');
    relationKeys.add(key);
    relations.push({
      id: `expansion-${id}-relation-${i}`,
      fromId: from.id,
      toId: to.id,
      recordId: record.id,
      evidence: s.span,
    });
  }
  if (id === '79') {
    if (
      !records.some(
        (r) => r.quantity.evidence.fromWord === raw.resolveWord && r.quantity.claim === 'loss',
      ) ||
      raw.outcome !== 'loss'
    )
      return fail(
        'resolve must explicitly retain source loss, including unknown loss; never infer it',
      );
  } else {
    const body = `${lit(base.story.label)}\\s+(?:remains|stays)\\s+an?\\s+${lit(String(raw.qualification))}${scopePattern}`;
    if (
      raw.outcome !== raw.qualification ||
      !expansionAssertedRelation(resolve, new RegExp(body, 'iu'), undefined, [
        base.story.label,
        scope,
        period,
      ])
    )
      return fail('resolve must preserve explicit teaching qualification, not a measured result');
  }
  const common = {
    ...base.story,
    sourceSpans: spans,
    actorId: actor.id,
    scope,
    period,
    entities,
    records,
    relations,
  };
  return id === '79'
    ? {
        ...common,
        storyId: '79',
        kind: 'conservation-flow',
        preset: 'energy-budget',
        template: 'energy-carriers',
      }
    : {
        ...common,
        storyId: '80',
        kind: 'field-map',
        preset: 'directional-field',
        template: raw.template === 'radial-field' ? 'radial-field' : 'uniform-field',
        domain: 'teaching-plane',
        qualification:
          raw.qualification === 'simulated teaching model'
            ? 'simulated teaching model'
            : 'illustrative teaching model',
      };
}
export function parseExpansionEnergyBudget(
  raw: Rec,
  ctx: ParseContext,
): ExpansionEnergyBudgetScene | null {
  const scene = parse(raw, ctx, '79');
  return scene?.storyId === '79' ? scene : null;
}
export function parseExpansionDirectionalField(
  raw: Rec,
  ctx: ParseContext,
): ExpansionDirectionalFieldScene | null {
  const scene = parse(raw, ctx, '80');
  return scene?.storyId === '80' ? scene : null;
}
