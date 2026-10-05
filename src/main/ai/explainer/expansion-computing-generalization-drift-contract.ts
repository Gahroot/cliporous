/** STEP16: exact source templates, two supplied results, no derivations or execution. */

import { expansionEntry } from '../../remotion/compositions/explainer/expansion/catalog';
import type {
  ExpansionGeneralizationDriftRecord,
  ExpansionGeneralizationDriftScene,
} from '../../remotion/compositions/explainer/expansion/computing/generalization-drift-types';
import type { ExpansionStoryBase } from '../../remotion/compositions/explainer/expansion/scene-types';
import { parseExpansionQuantity } from './expansion-quantity-contract';
import {
  type ExpansionSourceEvidence,
  expansionEntities,
  expansionSourceLabel,
  expansionSourceSpan,
} from './expansion-source-contract';
import { onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue, strictMechanismBeats } from './mechanism-contract';

const WORDS = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'];
function literal(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}
function same(a: string, b: string): boolean {
  return a.normalize('NFKC').toLowerCase() === b.normalize('NFKC').toLowerCase();
}
function matches(e: ExpansionSourceEvidence, body: string): boolean {
  return (
    !/[<>`]|(?:https?|file|data|javascript):|www\.|\b(?:fetch|eval|exec|require)\s*\(/i.test(
      e.text,
    ) && new RegExp(`^(?:${body})[.;]$`, 'iu').test(e.text)
  );
}
function spanEqual(
  a: { fromWord: number; toWord: number },
  b: { fromWord: number; toWord: number },
): boolean {
  return a.fromWord === b.fromWord && a.toWord === b.toWord;
}
function sourceAt(raw: Rec, field: string, ctx: ParseContext): ExpansionSourceEvidence | null {
  const from = ctx.inWin(raw[field]);
  if (from === null) return mechanismIssue(ctx, 'beats must start complete source clauses');
  let to = from;
  while (to < ctx.win.endWord && !/[.!?;][”"’')\]]*$/.test(ctx.words[to].text)) to++;
  return expansionSourceSpan({ fromWord: from, toWord: to }, ctx);
}
function parse(
  raw: Rec,
  ctx: ParseContext,
  id: '71' | '72',
): ExpansionGeneralizationDriftScene | null {
  const fail = (message: string) => mechanismIssue(ctx, message);
  const entry = expansionEntry(raw.kind, raw.preset);
  if (
    !entry ||
    entry.id !== id ||
    !onlyFields(
      raw,
      [
        'kind',
        'preset',
        'visualMode',
        'label',
        'subject',
        'outcome',
        'evidence',
        'startWord',
        'endWord',
        'layout',
        'continues',
        'transition',
        'entities',
        'actor',
        'scope',
        'period',
        'metric',
        'template',
        'records',
        ...WORDS,
      ],
      ctx,
    )
  )
    return fail(
      'use only the recognized preset and authored source fields; no blanket condition or treatment',
    );
  if (
    (raw.startWord !== undefined && raw.startWord !== ctx.win.startWord) ||
    (raw.endWord !== undefined && raw.endWord !== ctx.win.endWord) ||
    (raw.layout !== undefined && !entry.layouts.some((layout) => layout === raw.layout)) ||
    (raw.continues !== undefined && typeof raw.continues !== 'boolean') ||
    (raw.transition !== undefined && !['grow', 'slide', 'fade'].includes(String(raw.transition)))
  )
    return fail('retain the complete source envelope and offered layout/transition');
  if (raw.evidence !== 'source-stated' && raw.evidence !== 'illustrative')
    return fail('evidence must retain source-stated or illustrative qualification');
  if (raw.visualMode !== 'diagram' && raw.visualMode !== 'hybrid')
    return fail('use diagram or hybrid only');
  const w = ctx.win;
  const duration = w.endTime - w.startTime;
  if (
    !Number.isFinite(w.startTime) ||
    !Number.isFinite(w.endTime) ||
    duration < 5 ||
    duration > 12 ||
    !Number.isSafeInteger(w.startWord) ||
    !Number.isSafeInteger(w.endWord) ||
    w.startWord < 0 ||
    w.endWord >= ctx.words.length ||
    w.startWord > w.endWord
  )
    return fail('retain a finite complete 5–12s window');
  let previous = -Infinity;
  for (let i = w.startWord; i <= w.endWord; i++) {
    const word = ctx.words[i];
    if (
      !word ||
      !Number.isFinite(word.start) ||
      !Number.isFinite(word.end) ||
      word.end <= word.start ||
      word.start < w.startTime ||
      word.end > w.endTime ||
      word.start < previous - 1e-7
    )
      return fail('all source words need finite positive non-overlapping intervals (1e-7)');
    previous = word.end;
  }
  if (
    ctx.words[w.startWord].start < w.startTime + 0.25 - 1e-7 ||
    previous > w.endTime - 0.35 + 1e-7
  )
    return fail('preserve 0.25s lead-in and 0.35s tail');
  const times = strictMechanismBeats(raw, ctx, WORDS, [1, 1, 1, 1], 0.8);
  if (!times || times.some((t, i) => i > 0 && t - times[i - 1] < 1) || w.endTime - times[4] < 0.8)
    return fail('five distinct beats need one-second gaps and 0.8s final hold');
  const locals = WORDS.map((field) => sourceAt(raw, field, ctx));
  if (locals.some((e) => !e)) return null;
  const [setup, action, response, check, resolve] = locals as ExpansionSourceEvidence[];
  if (
    setup.span.fromWord !== w.startWord ||
    resolve.span.toWord !== w.endWord ||
    locals.some((e, i) => i > 0 && e?.span.fromWord !== (locals[i - 1]?.span.toWord ?? -2) + 1)
  )
    return fail('exactly five complete contiguous clauses own this authored template');
  const label = expansionSourceLabel(raw.label, setup, ctx, 48);
  const subject = expansionSourceLabel(raw.subject, setup, ctx, 34);
  const outcome = expansionSourceLabel(raw.outcome, resolve, ctx, 54);
  if (!label || !subject || !outcome)
    return fail('labels must quote their own setup or resolve clause');
  const [setupAt, actionAt, responseAt, checkAt, resolveAt] = times;
  const story: Omit<ExpansionStoryBase, 'storyId'> = {
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
  const entities = expansionEntities(raw.entities, ctx, id);
  const actor = entities?.find((e) => typeof raw.actor === 'string' && same(e.label, raw.actor));
  const scope = expansionSourceLabel(raw.scope, setup, ctx, 40);
  const period = expansionSourceLabel(raw.period, setup, ctx, 32);
  const metric = expansionSourceLabel(raw.metric, setup, ctx, 28);
  if (
    !entities ||
    entities.length !== 3 ||
    !actor ||
    !scope ||
    !period ||
    !metric ||
    !same(actor.label, subject) ||
    entities.some((e) => !spanEqual(e.evidence, setup.span))
  )
    return fail(
      'one actor and two distinct dataset identities must be introduced in local scope/period',
    );
  const datasets = entities.filter((e) => e.id !== actor.id);
  const template = id === '71' ? 'training-held-out' : 'condition-pair';
  if (raw.template !== template) return fail('use the exact authored template');
  const names = datasets.map((e) => literal(e.label)).join('\\s+and\\s+');
  const intro = `${literal(actor.label)}\\s+(?:evaluates|assesses)\\s+${literal(metric)}\\s+(?:using|with)\\s+${names}\\s+(?:among|for)\\s+${literal(scope)}\\s+(?:during|in)\\s+${literal(period)}`;
  if (!matches(setup, intro))
    return fail('setup must bind the same actor, metric, datasets, scope and period');
  if (!Array.isArray(raw.records) || raw.records.length !== 2)
    return fail(
      'authored lower cap: exactly two records, three actors and two generated relations',
    );
  const records: ExpansionGeneralizationDriftRecord[] = [];
  for (const [i, value] of raw.records.entries()) {
    if (
      !isRec(value) ||
      !onlyFields(
        value,
        ['dataset', 'sample', 'role', 'condition', 'population', 'evidence', 'result'],
        ctx,
      )
    )
      return fail('record contains non-authored fields');
    const binding = i === 0 ? action : check;
    const resultClause = i === 0 ? response : resolve;
    const evidence = expansionSourceSpan(value.evidence, ctx);
    const dataset = datasets[i];
    const role =
      id === '71' ? (i === 0 ? 'training' : 'held-out') : i === 0 ? 'baseline' : 'changed';
    const sample = expansionSourceLabel(value.sample, binding, ctx, 28);
    const condition = expansionSourceLabel(value.condition, binding, ctx, 40);
    const population = expansionSourceLabel(value.population, binding, ctx, 40);
    if (
      !evidence ||
      !spanEqual(evidence.span, binding.span) ||
      value.dataset !== dataset.label ||
      value.role !== role ||
      !sample ||
      !condition ||
      !population
    )
      return fail(
        'dataset/sample/role/condition/population must belong to this exact binding clause',
      );
    const body = `${literal(actor.label)}\\s+(?:uses|includes)\\s+${literal(dataset.label)}\\s+as\\s+${role}\\s+examples\\s+(?:with|containing)\\s+${literal(sample)}\\s+under\\s+${literal(condition)}\\s+(?:among|for)\\s+${literal(population)}\\s+(?:during|in)\\s+${literal(period)}`;
    if (!matches(binding, body))
      return fail(
        'source must explicitly assert this actor/dataset/sample role, condition, population and period',
      );
    const result = parseExpansionQuantity(value.result, ctx);
    if (
      !result ||
      !spanEqual(result.evidence, resultClause.span) ||
      result.actor !== dataset.label ||
      result.claim !== `${actor.label} ${metric} under ${condition}` ||
      result.basis.population !== population ||
      result.basis.period !== period ||
      !result.basis.denominator
    )
      return fail(
        'each supplied outcome must locally bind model/metric/condition/dataset and exact numeric basis',
      );
    if (
      (result.state === 'simulated' || result.state === 'illustrative') &&
      raw.evidence !== 'illustrative'
    )
      return fail('teaching results cannot be promoted to source-measured truth');
    records.push({
      id: `expansion-${id}-record-${i}`,
      datasetId: dataset.id,
      sample,
      role,
      condition,
      population,
      evidence: evidence.span,
      result,
    });
  }
  const [a, b] = records;
  if (same(a.sample, b.sample))
    return fail('training and held-out or changed samples must be explicitly distinct');
  if (
    a.result.basis.unit !== b.result.basis.unit ||
    JSON.stringify(a.result.basis.denominator) !== JSON.stringify(b.result.basis.denominator)
  )
    return fail('supplied outcomes require the same unit and exact denominator; no normalization');
  if (
    id === '71' &&
    (a.population !== b.population ||
      a.condition !== b.condition ||
      a.result.state !== b.result.state ||
      ('condition' in a.result &&
        (!('condition' in b.result) || a.result.condition !== b.result.condition)) ||
      ('qualifier' in a.result &&
        (!('qualifier' in b.result) || a.result.qualifier !== b.result.qualifier)))
  )
    return fail(
      'training/held-out outcomes need comparable population, condition and qualification',
    );
  if (id === '72' && a.population === b.population && a.condition === b.condition)
    return fail('drift requires an explicit changed population or operating condition');
  const common = {
    ...story,
    entities,
    actorId: actor.id,
    scope,
    period,
    metric,
    records: [a, b] as const,
    relations: records.map((r) => ({
      fromId: actor.id,
      toId: r.datasetId,
      role: 'provenance' as const,
      evidence: r.evidence,
      condition: r.condition,
    })),
  };
  return id === '71'
    ? {
        ...common,
        storyId: '71',
        kind: 'model-training',
        preset: 'held-out-generalization',
        template: 'training-held-out',
      }
    : {
        ...common,
        storyId: '72',
        kind: 'model-evaluation',
        preset: 'population-drift',
        template: 'condition-pair',
      };
}
export function parseExpansionHeldOutGeneralization(
  raw: Rec,
  ctx: ParseContext,
): Extract<ExpansionGeneralizationDriftScene, { storyId: '71' }> | null {
  const scene = parse(raw, ctx, '71');
  return scene?.storyId === '71' ? scene : null;
}
export function parseExpansionPopulationDrift(
  raw: Rec,
  ctx: ParseContext,
): Extract<ExpansionGeneralizationDriftScene, { storyId: '72' }> | null {
  const scene = parse(raw, ctx, '72');
  return scene?.storyId === '72' ? scene : null;
}
