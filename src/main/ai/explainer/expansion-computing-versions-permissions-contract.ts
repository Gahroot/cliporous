/** STEP16: facts only; neither parser performs a merge or grants access. */
import { expansionEntry } from '../../remotion/compositions/explainer/expansion/catalog';
import type {
  ExpansionReplicaMergeScene,
  ExpansionSoftwareScopeScene,
  VersionsPermissionsFact,
  VersionsPermissionsStatus,
} from '../../remotion/compositions/explainer/expansion/computing/versions-permissions-types';
import type {
  ExpansionEntity,
  ExpansionStoryBase,
} from '../../remotion/compositions/explainer/expansion/scene-types';
import { EXPANSION_LIMITS } from '../../remotion/compositions/explainer/expansion/value-types';
import {
  type ExpansionSourceEvidence,
  expansionEntities,
  expansionSourceLabel,
  expansionSourceSpan,
} from './expansion-source-contract';
import { onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue, strictMechanismBeats } from './mechanism-contract';

const phases = ['setup', 'action', 'response', 'check', 'resolve'] as const;
const wordFields = phases.map((p) => `${p}Word`);
function literal(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}
function same(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
function label(
  raw: unknown,
  e: ExpansionSourceEvidence,
  ctx: ParseContext,
  max = 28,
): string | null {
  const s = expansionSourceLabel(raw, e, ctx, max);
  return s &&
    /^[a-z][a-z0-9 -]*$/i.test(s) &&
    !/\b(?:secret|password|token|credential|url)\b/i.test(s)
    ? s
    : mechanismIssue(ctx, 'use bounded neutral local labels, never code, URLs or secrets');
}
function matches(
  e: ExpansionSourceEvidence,
  body: string,
  scope: string,
  period: string,
  status?: VersionsPermissionsStatus,
): boolean {
  const place = `(?:for|among) ${literal(scope)} (?:during|in) ${literal(period)}`;
  let pattern = `(?:${body} ${place}|${place}, ${body})`;
  if (status?.state === 'simulated' || status?.state === 'illustrative')
    pattern = `In (?:this|the) ${literal(status.qualification)}, ${pattern}`;
  if (status && 'condition' in status && status.condition)
    pattern = `(?:${literal(status.condition)}, ${pattern}|${pattern},? ${literal(status.condition)})`;
  return new RegExp(`^(?:${pattern})[.]$`, 'i').test(e.text);
}
function parse(raw: Rec, ctx: ParseContext, id: '69' | '70') {
  const entry = expansionEntry(raw.kind, raw.preset);
  const template = id === '69' ? 'replica-board' : 'permission-board';
  if (
    !entry ||
    entry.id !== id ||
    raw.template !== template ||
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
        'scope',
        'period',
        'entities',
        'records',
        'relations',
        'startWord',
        'endWord',
        'layout',
        ...wordFields,
      ],
      ctx,
    )
  )
    return mechanismIssue(ctx, 'exact computing preset/template and strict fields required');
  const win = ctx.win;
  if (
    !Number.isFinite(win.startTime) ||
    !Number.isFinite(win.endTime) ||
    win.endTime - win.startTime < 5 ||
    win.endTime - win.startTime > 12 ||
    !Number.isSafeInteger(win.startWord) ||
    !Number.isSafeInteger(win.endWord) ||
    win.startWord < 0 ||
    win.endWord < win.startWord ||
    win.endWord >= ctx.words.length ||
    (raw.startWord !== undefined && raw.startWord !== win.startWord) ||
    (raw.endWord !== undefined && raw.endWord !== win.endWord) ||
    (raw.layout !== undefined && !entry.layouts.some((v) => v === raw.layout))
  )
    return mechanismIssue(ctx, 'complete finite 5–12s window and offered layout required');
  if (
    (raw.visualMode !== 'diagram' && raw.visualMode !== 'hybrid') ||
    (raw.evidence !== 'source-stated' && raw.evidence !== 'illustrative')
  )
    return mechanismIssue(ctx, 'explicit mode and source evidence required');
  let previous = -Infinity;
  for (let i = win.startWord; i <= win.endWord; i++) {
    const w = ctx.words[i];
    if (
      !w ||
      !Number.isFinite(w.start) ||
      !Number.isFinite(w.end) ||
      w.end <= w.start ||
      w.start < win.startTime ||
      w.end > win.endTime ||
      w.start < previous - 1e-7
    )
      return mechanismIssue(ctx, 'all source words need finite positive nonoverlapping intervals');
    previous = w.end;
  }
  if (
    ctx.words[win.startWord].start < win.startTime + 0.25 - 1e-7 ||
    previous > win.endTime - 0.35 + 1e-7
  )
    return mechanismIssue(ctx, 'retain .25/.35 source padding');
  const locals: ExpansionSourceEvidence[] = [];
  let from = win.startWord;
  for (let i = from; i <= win.endWord; i++)
    if (/[.!?;]$/.test(ctx.words[i].text) || i === win.endWord) {
      const e = expansionSourceSpan({ fromWord: from, toWord: i }, ctx);
      if (!e) return null;
      locals.push(e);
      from = i + 1;
    }
  if (locals.length !== 5 || locals.some((e, i) => raw[wordFields[i]] !== e.span.fromWord))
    return mechanismIssue(ctx, 'five distinct complete clause starts required');
  const times = strictMechanismBeats(raw, ctx, wordFields, [1, 1, 1, 1], 0.8);
  if (!times || times.some((t, i) => i > 0 && t - times[i - 1] < 1) || win.endTime - times[4] < 0.8)
    return mechanismIssue(ctx, 'one-second beat gaps and .8 final hold required');
  const setup = locals[0];
  const scope = label(raw.scope, setup, ctx, 40),
    period = label(raw.period, setup, ctx, 32);
  const entities = expansionEntities(raw.entities, ctx, id);
  const title = label(raw.label, setup, ctx, 48),
    subject = label(raw.subject, setup, ctx, 34),
    outcome = label(raw.outcome, locals[4], ctx, 54);
  if (
    !scope ||
    !period ||
    !entities ||
    !title ||
    !subject ||
    !outcome ||
    !entities.some((e) => same(e.label, subject))
  )
    return null;
  if (
    entities.some(
      (e) =>
        e.evidence.fromWord !== setup.span.fromWord ||
        e.evidence.toWord !== setup.span.toWord ||
        !label(e.label, setup, ctx),
    )
  )
    return mechanismIssue(ctx, 'all entities must be introduced locally');
  const names = entities.map((e) => literal(e.label));
  const list =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  if (
    !matches(
      setup,
      `(?:${literal(title)} includes ${list}|${list} belong to ${literal(title)})`,
      scope,
      period,
    )
  )
    return mechanismIssue(
      ctx,
      'setup must explicitly introduce this scope, period and entity population',
    );
  const ref = (value: unknown): ExpansionEntity | null =>
    typeof value === 'string'
      ? (entities.find((e) => same(e.label, value)) ??
        mechanismIssue(ctx, 'unknown actor/resource/replica reference'))
      : mechanismIssue(ctx, 'references must be source labels');
  const parseFacts = (
    input: unknown,
    group: 'records' | 'relations',
  ): VersionsPermissionsFact[] | null => {
    const cap = group === 'records' ? EXPANSION_LIMITS.records : EXPANSION_LIMITS.relations;
    if (!Array.isArray(input) || input.length !== 2 || input.length > cap)
      return mechanismIssue(
        ctx,
        'this strict template needs two records and two relations within caps',
      );
    const facts: VersionsPermissionsFact[] = [];
    for (const [index, v] of input.entries()) {
      if (
        !isRec(v) ||
        !onlyFields(
          v,
          [
            'actor',
            'resource',
            'replica',
            'otherReplica',
            'version',
            'operation',
            'result',
            'role',
            'state',
            'qualification',
            'condition',
            'scope',
            'period',
            'evidence',
          ],
          ctx,
        )
      )
        return null;
      const e = expansionSourceSpan(v.evidence, ctx),
        own = locals[(group === 'records' ? 1 : 3) + index];
      if (!e || e.span.fromWord !== own.span.fromWord || e.span.toWord !== own.span.toWord)
        return mechanismIssue(ctx, 'each fact owns its complete beat clause');
      const actor = ref(v.actor),
        resource = ref(v.resource);
      if (
        !actor ||
        !resource ||
        actor.id === resource.id ||
        typeof v.scope !== 'string' ||
        typeof v.period !== 'string' ||
        !same(v.scope, scope) ||
        !same(v.period, period)
      )
        return mechanismIssue(ctx, 'retain actor/resource and local scope/period');
      const state = v.state;
      let status: VersionsPermissionsStatus;
      const condition = v.condition === undefined ? undefined : label(v.condition, e, ctx, 96);
      if (
        condition === null ||
        (condition &&
          (!/^(?:if|unless|when|provided that|assuming)\s/i.test(condition) ||
            /\b\d+\b/.test(condition)))
      )
        return mechanismIssue(ctx, 'complete explicit condition required');
      if (state === 'known' && v.qualification === undefined && condition === undefined)
        status = { state };
      else if (state === 'conditional' && v.qualification === undefined && condition)
        status = { state, condition };
      else if (
        ['unknown', 'missing', 'disputed', 'simulated', 'illustrative'].includes(String(state))
      ) {
        const q = label(v.qualification, e, ctx, 96);
        if (!q || q !== state)
          return mechanismIssue(ctx, 'states must remain distinct and explicitly source-qualified');
        status = {
          state: state as 'unknown' | 'missing' | 'disputed' | 'simulated' | 'illustrative',
          qualification: q,
          ...(condition ? { condition } : {}),
        };
      } else return mechanismIssue(ctx, 'invalid status or omitted condition');
      if ((state === 'simulated' || state === 'illustrative') && raw.evidence !== 'illustrative')
        return mechanismIssue(ctx, 'teaching facts cannot become measured');
      const result = label(v.result, e, ctx, 28);
      if (!result) return null;
      if (
        (['unknown', 'missing', 'disputed'].includes(String(state)) && result !== state) ||
        (['unknown', 'missing', 'disputed'].includes(result) && result !== state)
      )
        return mechanismIssue(ctx, 'unavailable facts cannot imply success or become known');
      let body: string;
      let extra: {
        replicaId?: string;
        otherReplicaId?: string;
        version?: string;
        operation?: 'read' | 'write' | 'delete' | 'execute';
      } = {};
      if (id === '69') {
        const replica = ref(v.replica);
        if (!replica || [actor.id, resource.id].includes(replica.id) || v.operation !== undefined)
          return mechanismIssue(ctx, 'version facts require explicit replica, never operations');
        extra = { replicaId: replica.id };
        if (group === 'records') {
          if (['unknown', 'missing', 'disputed'].includes(String(state))) {
            if (v.version !== undefined || v.role !== 'version' || v.otherReplica !== undefined)
              return mechanismIssue(ctx, 'unavailable versions cannot acquire invented identity');
            body = `(?:${literal(actor.label)} reports version of ${literal(resource.label)} on ${literal(replica.label)} as ${result}|${literal(actor.label)} records ${literal(replica.label)} version of ${literal(resource.label)} as ${result})`;
          } else {
            const version = label(v.version, e, ctx, 28);
            if (
              !version ||
              v.role !== 'version' ||
              v.otherReplica !== undefined ||
              result !== 'retained'
            )
              return mechanismIssue(ctx, 'retain explicit version identity without ordering');
            body = `(?:${literal(actor.label)} reports ${literal(replica.label)} holding version ${literal(version)} of ${literal(resource.label)} as retained|${literal(actor.label)} records version ${literal(version)} of ${literal(resource.label)} on ${literal(replica.label)} as retained)`;
            extra.version = version;
          }
        } else {
          const other = ref(v.otherReplica);
          if (
            !other ||
            [actor.id, resource.id, replica.id].includes(other.id) ||
            v.version !== undefined ||
            v.role !== (index === 0 ? 'conflict' : 'merge') ||
            !(
              index === 0
                ? ['conflict', 'unknown', 'missing', 'disputed']
                : ['merged', 'unresolved', 'unknown', 'missing', 'disputed']
            ).includes(result)
          )
            return mechanismIssue(ctx, 'explicit replica pair and conflict/merge result required');
          body = `(?:${literal(actor.label)} reports ${literal(index === 0 ? 'conflict' : 'merge')} of ${literal(resource.label)} between ${literal(replica.label)} and ${literal(other.label)} as ${literal(result)}|${literal(actor.label)} records ${literal(resource.label)} between ${literal(replica.label)} and ${literal(other.label)} with ${literal(index === 0 ? 'conflict' : 'merge')} status ${literal(result)})`;
          extra.otherReplicaId = other.id;
        }
      } else {
        if (
          v.replica !== undefined ||
          v.otherReplica !== undefined ||
          v.version !== undefined ||
          v.role !== 'permission' ||
          typeof v.operation !== 'string' ||
          !['read', 'write', 'delete', 'execute'].includes(v.operation) ||
          !['allowed', 'denied', 'conditional', 'unknown', 'missing', 'disputed'].includes(
            result,
          ) ||
          (result === 'conditional' && state !== 'conditional') ||
          (state === 'conditional' && result !== 'conditional')
        )
          return mechanismIssue(ctx, 'explicit operation/resource permission status required');
        const operation = v.operation as 'read' | 'write' | 'delete' | 'execute';
        body = `(?:${literal(actor.label)} has ${operation} permission on ${literal(resource.label)} as ${result}|${operation} permission for ${literal(actor.label)} on ${literal(resource.label)} is ${result})`;
        extra.operation = operation;
      }
      if (!matches(e, body, scope, period, status))
        return mechanismIssue(
          ctx,
          'fact must match its entire actor-owned local clause, including result and condition',
        );
      facts.push({
        id: `expansion-${id}-${group}-${index}`,
        actorId: actor.id,
        resourceId: resource.id,
        role: v.role as VersionsPermissionsFact['role'],
        result,
        status,
        scope,
        period,
        evidence: e.span,
        ...extra,
      });
    }
    return facts;
  };
  const records = parseFacts(raw.records, 'records'),
    relations = parseFacts(raw.relations, 'relations');
  if (!records || !relations) return null;
  const teaching = [...records, ...relations].filter(
    (f) => f.status.state === 'simulated' || f.status.state === 'illustrative',
  );
  if (
    teaching.length &&
    [...records, ...relations].some(
      (f) =>
        !['unknown', 'missing', 'disputed'].includes(f.status.state) &&
        f.status.state !== teaching[0].status.state,
    )
  )
    return mechanismIssue(
      ctx,
      'simulated and illustrative facts cannot become measured or exchange qualification',
    );
  if (
    id === '69' &&
    (records[0].replicaId === records[1].replicaId ||
      [...records, ...relations].some(
        (f) => f.actorId !== records[0].actorId || f.resourceId !== records[0].resourceId,
      ) ||
      relations.some(
        (f) =>
          !records.some((r) => r.replicaId === f.replicaId) ||
          !records.some((r) => r.replicaId === f.otherReplicaId),
      ))
  )
    return mechanismIssue(ctx, 'same source actor/resource and declared replica pair required');
  if (outcome !== relations[1].result)
    return mechanismIssue(ctx, 'outcome must retain the exact source result');
  const [setupAt, actionAt, responseAt, checkAt, resolveAt] = times;
  const story: ExpansionStoryBase = {
    storyId: id,
    visualMode: raw.visualMode as 'diagram' | 'hybrid',
    evidence: raw.evidence as 'source-stated' | 'illustrative',
    label: title,
    subject,
    outcome,
    setupAt,
    actionAt,
    responseAt,
    checkAt,
    resolveAt,
  };
  return {
    ...story,
    entities,
    records,
    relations,
    scope,
    period,
    sourceSpans: {
      setup: locals[0].span,
      action: locals[1].span,
      response: locals[2].span,
      check: locals[3].span,
      resolve: locals[4].span,
    },
  };
}
export function parseExpansionReplicaMerge(
  raw: Rec,
  ctx: ParseContext,
): ExpansionReplicaMergeScene | null {
  const parsed = parse(raw, ctx, '69');
  return parsed
    ? {
        ...parsed,
        kind: 'version-state',
        preset: 'replica-merge',
        storyId: '69',
        template: 'replica-board',
      }
    : null;
}
export function parseExpansionSoftwareScope(
  raw: Rec,
  ctx: ParseContext,
): ExpansionSoftwareScopeScene | null {
  const parsed = parse(raw, ctx, '70');
  return parsed
    ? {
        ...parsed,
        kind: 'property-access',
        preset: 'software-scope',
        storyId: '70',
        template: 'permission-board',
      }
    : null;
}
