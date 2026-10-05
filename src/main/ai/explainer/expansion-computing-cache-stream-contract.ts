import type {
  CacheStreamFact,
  CacheStreamState,
  ExpansionBatchStreamScene,
  ExpansionCacheFreshnessScene,
} from '../../remotion/compositions/explainer/expansion/computing/cache-stream-types';
import { expansionEntityId } from '../../remotion/compositions/explainer/expansion/scene-types';
import type { ExpansionEvidenceSpan } from '../../remotion/compositions/explainer/expansion/value-types';
import {
  expansionEntities,
  expansionSourceLabel,
  expansionSourceSpan,
  expansionStoryBase,
} from './expansion-source-contract';
import { onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue, strictMechanismBeats } from './mechanism-contract';

const phases = ['setup', 'action', 'response', 'check', 'resolve'] as const;
function lit(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
}
function clause(text: string, body: string): boolean {
  return (
    !/[<>`{}]|https?:\/\/|www\./i.test(text) &&
    new RegExp(`^(?:${body})[.;]$`, 'i').test(text.trim())
  );
}
function parse(raw: Rec, ctx: ParseContext, id: '65' | '66') {
  const fail = (message: string) => mechanismIssue(ctx, message);
  const duration = ctx.win.endTime - ctx.win.startTime;
  if (
    !Number.isFinite(duration) ||
    duration < 5 ||
    duration > 12 ||
    !Number.isSafeInteger(ctx.win.startWord) ||
    !Number.isSafeInteger(ctx.win.endWord) ||
    ctx.win.startWord < 0 ||
    ctx.win.endWord >= ctx.words.length ||
    ctx.win.endWord < ctx.win.startWord ||
    ctx.words
      .slice(ctx.win.startWord, ctx.win.endWord + 1)
      .some(
        (word, i, words) =>
          !Number.isFinite(word.start) ||
          !Number.isFinite(word.end) ||
          word.end <= word.start ||
          word.start < ctx.win.startTime + 0.25 - 1e-7 ||
          word.end > ctx.win.endTime - 0.35 + 1e-7 ||
          (i > 0 && word.start < words[i - 1].end - 1e-7),
      )
  )
    return fail('complete words need finite positive nonoverlap, 5–12 seconds and .25/.35 padding');
  const b = expansionStoryBase(raw, ctx, id, [
    'template',
    'entities',
    'records',
    'relations',
    'scope',
    'period',
  ]);
  if (
    !b ||
    !strictMechanismBeats(
      raw,
      ctx,
      phases.map((p) => `${p}Word`),
      [1, 1, 1, 1],
      0.8,
    )
  )
    return null;
  if (raw.template !== (id === '65' ? 'cache-board' : 'input-buffer'))
    return fail('only the authored story template is allowed');
  const entities = expansionEntities(raw.entities, ctx, id);
  const scope = expansionSourceLabel(raw.scope, b.spans.setup, ctx, 40);
  const period = expansionSourceLabel(raw.period, b.spans.setup, ctx, 32);
  if (!entities || !scope || !period || entities.length < 2)
    return fail('setup needs actor, source identities, scope and period');
  const local = (body: string) =>
    `(?:${body} at ${lit(scope)} during ${lit(period)}|At ${lit(scope)} during ${lit(period)}, ${body})`;
  if (
    !clause(
      b.spans.setup,
      local(
        `${lit(b.story.subject)} (?:lists|names) ${entities.map((e) => lit(e.label)).join(' and ')}`,
      ),
    )
  )
    return fail('setup must explicitly introduce every identity in its scope and period');
  const spans: ExpansionEvidenceSpan[] = [];
  for (const phase of phases) {
    const start = ctx.inWin(raw[`${phase}Word`]);
    if (start === null || (start > 0 && !/[.!?;]$/.test(ctx.words[start - 1].text)))
      return fail('beats must begin complete clauses');
    let end = start;
    while (end < ctx.win.endWord && !/[.!?;]$/.test(ctx.words[end].text)) end++;
    const source = expansionSourceSpan({ fromWord: start, toWord: end }, ctx);
    if (!source) return null;
    spans.push(source.span);
  }
  if (
    !Array.isArray(raw.records) ||
    raw.records.length !== 3 ||
    !Array.isArray(raw.relations) ||
    raw.relations.length !== 1
  )
    return fail(
      'authored template needs exactly three records and one result relation (lower than 12/16 caps)',
    );
  const roles =
    id === '65'
      ? ['version', 'freshness', 'cache-action', 'result']
      : ['grouping', 'arrival', 'processing', 'result'];
  const facts: CacheStreamFact[] = [];
  for (const [index, entry] of [...raw.records, ...raw.relations].entries()) {
    if (
      !isRec(entry) ||
      !onlyFields(
        entry,
        [
          'actor',
          'targets',
          'role',
          'scope',
          'period',
          'evidence',
          'state',
          'value',
          'condition',
          'qualifier',
        ],
        ctx,
      )
    )
      return null;
    const actor = entities.find((e) => e.label === entry.actor);
    const targets = Array.isArray(entry.targets)
      ? entry.targets.map((label) => entities.find((e) => e.label === label))
      : [];
    const evidence = expansionSourceSpan(entry.evidence, ctx);
    const span = spans[index + 1];
    if (
      !actor ||
      actor.id !== entities[0].id ||
      !targets.length ||
      targets.some((t) => !t || t.id === actor.id) ||
      new Set(targets.map((t) => t?.id)).size !== targets.length ||
      entry.role !== roles[index] ||
      entry.scope !== scope ||
      entry.period !== period ||
      !evidence ||
      evidence.span.fromWord !== span.fromWord ||
      evidence.span.toWord !== span.toWord
    )
      return fail(
        'fact actor, identities, role, scope, period and complete phase evidence must agree',
      );
    if (
      index &&
      JSON.stringify(entry.targets) !==
        JSON.stringify([...raw.records, ...raw.relations][0].targets)
    )
      return fail('all phases must preserve the exact same source input identities and order');
    const targetLabels = targets.map((t) => lit(t?.label ?? '')).join(' and ');
    const value = entry.value;
    const values: Record<string, readonly string[]> = {
      freshness: ['fresh', 'stale', 'unverified'],
      'cache-action': ['serve', 'refresh', 'bypass', 'retain'],
      arrival: ['together', 'individually', 'unordered'],
      processing: ['batch', 'per-item', 'pending'],
      result: ['served', 'refreshed', 'bypassed', 'retained', 'processed', 'pending'],
    };
    const validValue =
      typeof value === 'string' &&
      (entry.role === 'version'
        ? /^v[0-9]{1,6}$/.test(value)
        : entry.role === 'grouping'
          ? entities.some(
              (e) => e.label === value && e.id !== actor.id && !targets.some((t) => t?.id === e.id),
            )
          : values[String(entry.role)]?.includes(value));
    const body = (v: string) =>
      local(
        `${lit(actor.label)} (?:reports|records) ${targetLabels} ${lit(String(entry.role))} as ${lit(v)}`,
      );
    let qualification: CacheStreamState;
    if (entry.state === 'unknown' || entry.state === 'missing' || entry.state === 'disputed') {
      if (
        'value' in entry ||
        'condition' in entry ||
        entry.qualifier !== entry.state ||
        !clause(evidence.text, body(entry.state))
      )
        return fail(
          'unknown/missing/disputed facts must retain absence, never a value or known zero',
        );
      qualification = { state: entry.state, qualifier: entry.state };
    } else {
      if (!validValue || typeof value !== 'string')
        return fail(
          'value must match the source-stated authored domain, not TTL/rates or invented effects',
        );
      const predicate = body(value);
      if (
        entry.state === 'known' &&
        !('condition' in entry) &&
        !('qualifier' in entry) &&
        clause(evidence.text, predicate)
      )
        qualification = { state: 'known', value };
      else if (
        entry.state === 'conditional' &&
        typeof entry.condition === 'string' &&
        /^if [\p{L}\p{N} -]+$/u.test(entry.condition) &&
        entry.condition === b.story.condition &&
        !('qualifier' in entry) &&
        clause(
          evidence.text,
          `(?:${lit(entry.condition)}, ${predicate}|${predicate},? ${lit(entry.condition)})`,
        )
      )
        qualification = { state: 'conditional', value, condition: entry.condition };
      else if (
        (entry.state === 'simulated' || entry.state === 'illustrative') &&
        entry.qualifier === (entry.state === 'simulated' ? 'simulation' : 'teaching example') &&
        b.story.evidence === 'illustrative' &&
        !('condition' in entry) &&
        clause(evidence.text, `In this ${lit(String(entry.qualifier))}, ${predicate}`)
      )
        qualification = { state: entry.state, value, qualifier: String(entry.qualifier) };
      else return fail('retain exact local qualification, condition, result and assertion');
    }
    facts.push({
      id: expansionEntityId(id, entities.length + index),
      actorId: actor.id,
      targetIds: targets.flatMap((target) => (target ? [target.id] : [])),
      role: entry.role as CacheStreamFact['role'],
      scope,
      period,
      evidence: evidence.span,
      qualification,
    });
  }
  if (b.story.condition && !facts.some((f) => f.qualification.state === 'conditional'))
    return fail('scene condition must qualify a local fact');
  const [setup, action, response, check, resolve] = spans;
  return {
    ...b.story,
    kind: id === '65' ? 'request-routing' : 'computing-flow',
    preset: id === '65' ? 'cache-freshness' : 'batch-stream',
    template: raw.template,
    entities,
    records: facts.slice(0, 3),
    relations: facts.slice(3),
    scope,
    period,
    sourceSpans: { setup, action, response, check, resolve },
  };
}
export function parseExpansionCacheFreshness(
  raw: Rec,
  ctx: ParseContext,
): ExpansionCacheFreshnessScene | null {
  return parse(raw, ctx, '65') as ExpansionCacheFreshnessScene | null;
}
export function parseExpansionBatchStream(
  raw: Rec,
  ctx: ParseContext,
): ExpansionBatchStreamScene | null {
  return parse(raw, ctx, '66') as ExpansionBatchStreamScene | null;
}
