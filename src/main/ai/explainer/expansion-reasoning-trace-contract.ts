/** Stories 01–02 only. Authored clause grammars, not a truth or natural-language evaluator. */

import type {
  ClaimSourceBoardScene,
  EvidenceToClaimTraceScene,
  ReasoningTraceBeatEvidence,
  ReasoningTraceRecord,
  ReasoningTraceRelation,
} from '../../remotion/compositions/explainer/expansion/reasoning/trace-types';
import type { ExpansionEntity } from '../../remotion/compositions/explainer/expansion/scene-types';
import {
  EXPANSION_LIMITS,
  type ExpansionEvidenceSpan,
} from '../../remotion/compositions/explainer/expansion/value-types';
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

function normalized(text: string): string {
  return text.normalize('NFKC').replace(/’/g, "'").replace(/−/g, '-').replace(/\s+/g, ' ').trim();
}
function key(text: string): string {
  return normalized(text).toLowerCase();
}
function literal(text: string): string {
  return normalized(text)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
}
function named(text: string): string {
  return `(?:the\\s+)?${literal(text)}`;
}
function unsafe(text: string): boolean {
  return (
    /[<>`{}]|https?:\/\/|www\./i.test(text) ||
    [...text].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  );
}
function terminal(text: string): boolean {
  return /[.!?;][”"’')\]]*$/.test(text);
}
function sameSpan(a: ExpansionEvidenceSpan, b: ExpansionEvidenceSpan): boolean {
  return a.fromWord === b.fromWord && a.toWord === b.toWord;
}

/** All slots are escaped source phrases. Only authored verbs and condition placement vary. */
function clauseMatches(text: string, body: string, condition?: string): boolean {
  if (unsafe(text)) return false;
  const clause = normalized(text)
    .replace(/[.;][”"’')\]]*$/, '')
    .trim();
  const pattern =
    condition === undefined
      ? body
      : `(?:${literal(condition)},\\s*${body}|${body},?\\s+${literal(condition)})`;
  return new RegExp(`^(?:${pattern})$`, 'i').test(clause);
}

function beatEvidence(value: unknown, ctx: ParseContext): ExpansionEvidenceSpan | null {
  const index = ctx.inWin(value);
  if (index === null || !ctx.words[index])
    return mechanismIssue(ctx, 'each beat needs a source clause');
  let fromWord = index;
  let toWord = index;
  while (fromWord > ctx.win.startWord && !terminal(ctx.words[fromWord - 1]?.text ?? '')) fromWord--;
  while (toWord < ctx.win.endWord && !terminal(ctx.words[toWord]?.text ?? '')) toWord++;
  return expansionSourceSpan({ fromWord, toWord }, ctx)?.span ?? null;
}
function traceBase(raw: Rec, ctx: ParseContext, id: '01' | '02') {
  const base = expansionStoryBase(raw, ctx, id, [
    'entities',
    'records',
    'relations',
    ...(id === '02' ? ['state'] : []),
  ]);
  if (!base) return null;
  const setup = beatEvidence(raw.setupWord, ctx);
  const action = beatEvidence(raw.actionWord, ctx);
  const response = beatEvidence(raw.responseWord, ctx);
  const check = beatEvidence(raw.checkWord, ctx);
  const resolve = beatEvidence(raw.resolveWord, ctx);
  if (!setup || !action || !response || !check || !resolve) return null;
  if (new Set([setup, action, response, check, resolve].map((span) => span.fromWord)).size !== 5)
    return mechanismIssue(ctx, 'five beats must identify five distinct complete source clauses');
  const sourceSpans: ReasoningTraceBeatEvidence = { setup, action, response, check, resolve };
  // The shared base rejects treatment at runtime; omit its optional type from local scenes too.
  const { treatment: _treatment, ...story } = base.story;
  return { story, spans: base.spans, sourceSpans };
}

function reference(
  raw: unknown,
  evidence: ExpansionSourceEvidence,
  entities: readonly ExpansionEntity[],
  ctx: ParseContext,
): ExpansionEntity | null {
  const label = expansionSourceLabel(raw, evidence, ctx, EXPANSION_LIMITS.actorLabel);
  const entity = label ? entities.find((entry) => key(entry.label) === key(label)) : undefined;
  return (
    entity ??
    mechanismIssue(ctx, 'references must name an existing local entity label, never an ID')
  );
}

function attribution(
  role: ReasoningTraceRecord['role'],
  entity: string,
  content: string,
  source?: string,
): string {
  const e = named(entity);
  const c = literal(content);
  const quoted = `(?:${c}|"${c}"|“${c}”|'${c}')`;
  const says = '(?:states|says|asserts|reads)(?:\\s+that)?';
  if (role === 'claim') return `${e}\\s+${says}\\s+${quoted}`;
  const s = named(source ?? '');
  const supplies =
    role === 'excerpt'
      ? '(?:contains|includes|provides|supplies|records|presents)'
      : '(?:reports|records|presents|states)';
  return `(?:${s}\\s+${supplies}\\s+${e}\\s+(?:stating|saying|reading)\\s+${quoted}|${e}\\s+(?:from|in)\\s+${s}\\s+${says}\\s+${quoted}|According\\s+to\\s+${s},\\s*${e}\\s+${says}\\s+${quoted})`;
}

function parseRecords(
  raw: unknown,
  ctx: ParseContext,
  id: '01' | '02',
  entities: readonly ExpansionEntity[],
): ReasoningTraceRecord[] | null {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > EXPANSION_LIMITS.records)
    return mechanismIssue(ctx, 'trace needs two to twelve complete locally attributed records');
  const records: ReasoningTraceRecord[] = [];
  for (const entry of raw) {
    if (
      !isRec(entry) ||
      !onlyFields(entry, ['entity', 'role', 'content', 'source', 'evidence'], ctx)
    )
      return mechanismIssue(ctx, 'records accept only entity, role, content, source and evidence');
    const evidence = expansionSourceSpan(entry.evidence, ctx);
    if (!evidence) return null;
    const entity = reference(entry.entity, evidence, entities, ctx);
    const content = expansionSourceLabel(entry.content, evidence, ctx, EXPANSION_LIMITS.claim);
    const role = entry.role;
    if (!entity || !content || unsafe(content)) return null;
    if (
      (role !== 'excerpt' && role !== 'claim' && role !== 'statement') ||
      (id === '01' ? role === 'statement' : role !== 'statement')
    )
      return mechanismIssue(
        ctx,
        'trace-chain uses excerpt/claim records; claim-source-board uses statements',
      );
    if (records.some((record) => record.entityId === entity.id))
      return mechanismIssue(
        ctx,
        'each named record needs one unambiguous complete content assertion',
      );
    if (role === 'claim') {
      if (
        'source' in entry ||
        !clauseMatches(evidence.text, attribution(role, entity.label, content))
      )
        return mechanismIssue(
          ctx,
          'a named claim must state its entire content in this exact clause',
        );
      records.push({ entityId: entity.id, role, content, evidence: evidence.span });
    } else {
      const source = reference(entry.source, evidence, entities, ctx);
      if (
        !source ||
        source.id === entity.id ||
        !clauseMatches(evidence.text, attribution(role, entity.label, content, source.label))
      )
        return mechanismIssue(
          ctx,
          'bind the complete excerpt/statement to its own named source in one clause',
        );
      records.push({
        entityId: entity.id,
        role,
        content,
        sourceId: source.id,
        evidence: evidence.span,
      });
    }
  }
  const recordIds = new Set(records.map((record) => record.entityId));
  const used = new Set(recordIds);
  for (const record of records) {
    if (record.role === 'claim') continue;
    if (recordIds.has(record.sourceId))
      return mechanismIssue(
        ctx,
        'source identities must be distinct from claim/excerpt/statement identities',
      );
    used.add(record.sourceId);
  }
  if (entities.some((entity) => !used.has(entity.id)))
    return mechanismIssue(ctx, 'every displayed entity must participate in an attributed record');
  return records;
}

function traceLink(
  excerpt: string,
  source: string,
  claim: string,
  role: 'provenance' | 'support',
): string {
  const x = `${named(excerpt)}\\s+(?:from|in)\\s+${named(source)}`;
  const c = named(claim);
  return role === 'support'
    ? `(?:${x}\\s+(?:supports|backs|provides\\s+support\\s+for|is\\s+evidence\\s+for)\\s+${c}|${c}\\s+(?:is\\s+supported\\s+by|draws\\s+support\\s+from|is\\s+backed\\s+by)\\s+${x})`
    : `(?:${c}\\s+(?:cites|references|quotes|draws\\s+on)\\s+${x}|${x}\\s+(?:is\\s+cited\\s+by|is\\s+referenced\\s+by|is\\s+quoted\\s+by)\\s+${c})`;
}
function conflictClause(a: string, sourceA: string, b: string, sourceB: string): string {
  const left = `${named(a)}\\s+(?:from|in)\\s+${named(sourceA)}`;
  const right = `${named(b)}\\s+(?:from|in)\\s+${named(sourceB)}`;
  return `(?:${left}\\s+(?:conflicts\\s+with|contradicts|is\\s+inconsistent\\s+with|disagrees\\s+with)\\s+${right}|${left}\\s+and\\s+${right}\\s+(?:conflict|disagree|contradict\\s+each\\s+other))`;
}

/** Direct polarity/antonym contradictions only; all actor, time and scope text must agree. */
function opposingContents(first: string, second: string): boolean {
  const a = key(first);
  const b = key(second);
  const uncertainOrNested =
    /\b(?:if|unless|when|assuming|provided|may|might|could|would|should|will|perhaps|maybe|possibly|probably|allegedly|supposedly|unverified|plans?|proposes?|hopes?|says?|said|reports?|reported|states?|stated|claims?|claimed|believes?|believed|and|but|or)\b/;
  if (uncertainOrNested.test(a) || uncertainOrNested.test(b)) return false;
  const polarity = (positive: string, negative: string): boolean => {
    if (
      /\b(?:not|never|no|without|cannot|can't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|don't|doesn't|didn't)\b/.test(
        positive,
      )
    )
      return false;
    const match = /^(.+?)\s+(is|are|was|were|has|have|had|do|does|did)\s+(.+)$/.exec(positive);
    if (match) {
      const [, actor, verb, predicate] = match;
      if (
        actor &&
        verb &&
        predicate &&
        new RegExp(
          `^${literal(actor)}\\s+${literal(verb)}\\s+not\\s+${literal(predicate)}$`,
          'i',
        ).test(negative)
      )
        return true;
    }
    // Authored inflection pairs, not an arbitrary conjugation or semantic evaluator.
    for (const [past, base] of [
      ['arrived', 'arrive'],
      ['passed', 'pass'],
      ['opened', 'open'],
      ['closed', 'close'],
    ]) {
      const event = new RegExp(`^(.+?)\\s+${past}(\\s+.+)?$`).exec(positive);
      if (
        event?.[1] &&
        new RegExp(
          `^${literal(event[1])}\\s+did\\s+not\\s+${base}${literal(event[2] ?? '') ? `\\s+${literal((event[2] ?? '').trim())}` : ''}$`,
        ).test(negative)
      )
        return true;
    }
    for (const [left, right] of [
      ['open', 'closed'],
      ['approved', 'denied'],
      ['present', 'absent'],
      ['available', 'unavailable'],
      ['complete', 'incomplete'],
      ['enabled', 'disabled'],
      ['sealed', 'unsealed'],
    ]) {
      const opposite = new RegExp(`^(.+?)\\s+(is|are|was|were)\\s+${left}(\\s+.+)?$`).exec(
        positive,
      );
      if (
        opposite?.[1] &&
        opposite[2] &&
        new RegExp(
          `^${literal(opposite[1])}\\s+${literal(opposite[2])}\\s+${right}${opposite[3] ? `\\s+${literal(opposite[3].trim())}` : ''}$`,
        ).test(negative)
      )
        return true;
    }
    return false;
  };
  return polarity(a, b) || polarity(b, a);
}

function parseRelations(
  raw: unknown,
  ctx: ParseContext,
  id: '01' | '02',
  entities: readonly ExpansionEntity[],
  records: readonly ReasoningTraceRecord[],
): ReasoningTraceRelation[] | null {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > EXPANSION_LIMITS.relations)
    return mechanismIssue(ctx, 'include two to sixteen explicitly evidenced typed relations');
  const relations: ReasoningTraceRelation[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!isRec(entry) || !onlyFields(entry, ['from', 'to', 'role', 'evidence', 'condition'], ctx))
      return mechanismIssue(
        ctx,
        'relations accept only named endpoints, role, evidence and condition',
      );
    const evidence = expansionSourceSpan(entry.evidence, ctx);
    if (!evidence) return null;
    const from = reference(entry.from, evidence, entities, ctx);
    const to = reference(entry.to, evidence, entities, ctx);
    const role = entry.role;
    const condition =
      entry.condition === undefined
        ? undefined
        : expansionSourceLabel(entry.condition, evidence, ctx, EXPANSION_LIMITS.qualifier);
    if (!from || !to || condition === null) return null;
    if (
      from.id === to.id ||
      (role !== 'provenance' && role !== 'support' && role !== 'rebuttal') ||
      (id === '01' ? role === 'rebuttal' : role === 'support')
    )
      return mechanismIssue(ctx, 'relation role and distinct endpoints must belong to this story');
    if (condition !== undefined && !/^(?:if|unless|when|provided that|assuming)\b/i.test(condition))
      return mechanismIssue(
        ctx,
        'relation condition must retain the complete authored source condition',
      );
    const a = records.find((record) => record.entityId === from.id);
    const b = records.find((record) => record.entityId === to.id);
    let supported = false;
    if (role === 'provenance' && b && b.role !== 'claim' && b.sourceId === from.id) {
      supported = condition === undefined && sameSpan(evidence.span, b.evidence);
    } else if (id === '01' && a?.role === 'excerpt' && b?.role === 'claim' && role !== 'rebuttal') {
      const source = entities.find((entity) => entity.id === a.sourceId);
      supported =
        !!source &&
        clauseMatches(
          evidence.text,
          traceLink(from.label, source.label, to.label, role),
          condition,
        );
    } else if (
      id === '02' &&
      role === 'rebuttal' &&
      a?.role === 'statement' &&
      b?.role === 'statement'
    ) {
      const sourceA = entities.find((entity) => entity.id === a.sourceId);
      const sourceB = entities.find((entity) => entity.id === b.sourceId);
      supported =
        !!sourceA &&
        !!sourceB &&
        sourceA.id !== sourceB.id &&
        opposingContents(a.content, b.content) &&
        clauseMatches(
          evidence.text,
          conflictClause(from.label, sourceA.label, to.label, sourceB.label),
          condition,
        );
    }
    if (!supported)
      return mechanismIssue(
        ctx,
        'bind the asserted relation, exact endpoints and source scope in one full local clause; citation is not proof and disagreement is not adjudication',
      );
    const identity = `${from.id}/${to.id}/${role}`;
    if (seen.has(identity))
      return mechanismIssue(ctx, 'duplicate typed relations are not extra evidence');
    seen.add(identity);
    relations.push({
      fromId: from.id,
      toId: to.id,
      role,
      evidence: evidence.span,
      ...(condition ? { condition } : {}),
    });
  }
  return relations;
}

function traceData(raw: Rec, ctx: ParseContext, id: '01' | '02') {
  const base = traceBase(raw, ctx, id);
  if (!base) return null;
  const entities = expansionEntities(raw.entities, ctx, id);
  if (!entities) return null;
  const records = parseRecords(raw.records, ctx, id, entities);
  if (!records) return null;
  const relations = parseRelations(raw.relations, ctx, id, entities, records);
  if (!relations) return null;
  for (const record of records) {
    if (
      record.role !== 'claim' &&
      !relations.some(
        (relation) =>
          relation.role === 'provenance' &&
          relation.fromId === record.sourceId &&
          relation.toId === record.entityId,
      )
    )
      return mechanismIssue(
        ctx,
        'each attributed record needs its explicit source-to-record provenance link',
      );
    const connected =
      id === '01'
        ? relations.some(
            (relation) =>
              records.some(
                (other) => other.role === 'excerpt' && relation.fromId === other.entityId,
              ) &&
              records.some((other) => other.role === 'claim' && relation.toId === other.entityId) &&
              (relation.fromId === record.entityId || relation.toId === record.entityId),
          )
        : relations.some(
            (relation) =>
              relation.role === 'rebuttal' &&
              (relation.fromId === record.entityId || relation.toId === record.entityId),
          );
    if (!connected)
      return mechanismIssue(
        ctx,
        'every record must participate in the trace/conflict, not an unrelated displayed fact',
      );
  }
  return { ...base, entities, records, relations };
}

export function parseEvidenceToClaimTrace(
  raw: Rec,
  ctx: ParseContext,
): EvidenceToClaimTraceScene | null {
  const data = traceData(raw, ctx, '01');
  if (!data) return null;
  const { story, sourceSpans, spans, entities, records, relations } = data;
  const excerpt = records.find(
    (record) => record.role === 'excerpt' && sameSpan(record.evidence, sourceSpans.action),
  );
  const claim = records.find(
    (record) => record.role === 'claim' && sameSpan(record.evidence, sourceSpans.response),
  );
  if (!excerpt || excerpt.role !== 'excerpt' || !claim)
    return mechanismIssue(
      ctx,
      'action introduces the attributed excerpt; response states the named claim',
    );
  const x = entities.find((entity) => entity.id === excerpt.entityId);
  const s = entities.find((entity) => entity.id === excerpt.sourceId);
  const c = entities.find((entity) => entity.id === claim.entityId);
  if (
    !x ||
    !s ||
    !c ||
    !relations.some(
      (relation) =>
        relation.fromId === x.id &&
        relation.toId === c.id &&
        sameSpan(relation.evidence, sourceSpans.check),
    )
  )
    return mechanismIssue(
      ctx,
      'check must explicitly link this excerpt and its source to this claim',
    );
  const setup = `(?:${named(c.label)}\\s+(?:is\\s+traced\\s+to|is\\s+linked\\s+to|draws\\s+on)\\s+${named(s.label)}\\s+and\\s+${named(x.label)}|${named(story.subject)}\\s+(?:traces|links|connects)\\s+${named(c.label)}\\s+(?:to|with)\\s+${named(x.label)}\\s+(?:from|in)\\s+${named(s.label)}|${named(story.subject)}\\s+(?:introduces|names)\\s+${named(s.label)},\\s*${named(x.label)}\\s+and\\s+${named(c.label)})`;
  const retained = `${named(c.label)}\\s+(?:retains|keeps)\\s+(?:its|the)\\s+(?:citation|reference|source\\s+reference|provenance\\s+link)(?:\\s+as\\s+(?:provenance|origin),\\s*not\\s+(?:proof|truth)|,\\s*not\\s+(?:proof|truth))?`;
  const provenance = `(?:${named(c.label)}'s\\s+(?:citation|reference)|(?:the\\s+)?(?:citation|reference)\\s+for\\s+${named(c.label)})\\s+(?:shows|records|preserves)\\s+(?:provenance|origin),\\s*not\\s+(?:proof|truth)`;
  if (
    !clauseMatches(spans.setup, setup) ||
    !clauseMatches(spans.resolve, `(?:${retained}|${provenance})`)
  )
    return mechanismIssue(
      ctx,
      'setup must introduce this exact trace; resolve retains its citation as origin, never a truth guarantee',
    );
  return {
    ...story,
    storyId: '01',
    kind: 'retrieval-grounding',
    preset: 'trace-chain',
    entities,
    records,
    relations,
    sourceSpans,
    citationMeaning: 'provenance-not-proof',
  };
}

export function parseClaimSourceBoard(raw: Rec, ctx: ParseContext): ClaimSourceBoardScene | null {
  const data = traceData(raw, ctx, '02');
  if (!data) return null;
  const { story, sourceSpans, spans, entities, records, relations } = data;
  const state = raw.state;
  if (state !== 'disputed' && state !== 'unresolved')
    return mechanismIssue(
      ctx,
      'claim-source-board requires an explicit disputed or unresolved state, never a winner',
    );
  const a = records.find((record) => sameSpan(record.evidence, sourceSpans.action));
  const b = records.find((record) => sameSpan(record.evidence, sourceSpans.response));
  if (a?.role !== 'statement' || b?.role !== 'statement')
    return mechanismIssue(
      ctx,
      'action and response must each attribute a distinct complete statement',
    );
  const left = entities.find((entity) => entity.id === a.entityId);
  const right = entities.find((entity) => entity.id === b.entityId);
  const sourceA = entities.find((entity) => entity.id === a.sourceId);
  const sourceB = entities.find((entity) => entity.id === b.sourceId);
  if (
    !left ||
    !right ||
    !sourceA ||
    !sourceB ||
    !relations.some(
      (relation) =>
        relation.role === 'rebuttal' &&
        sameSpan(relation.evidence, sourceSpans.check) &&
        ((relation.fromId === left.id && relation.toId === right.id) ||
          (relation.fromId === right.id && relation.toId === left.id)),
    )
  )
    return mechanismIssue(
      ctx,
      'check must explicitly name the locally opposing statements and their own sources',
    );
  const setup = `(?:${named(story.subject)}\\s+(?:compares|juxtaposes|contrasts)\\s+${named(left.label)}\\s+(?:from|in)\\s+${named(sourceA.label)}\\s+and\\s+${named(right.label)}\\s+(?:from|in)\\s+${named(sourceB.label)}|${named(sourceA.label)}\\s+and\\s+${named(sourceB.label)}\\s+(?:disagree|conflict)\\s+about\\s+${named(story.subject)})`;
  const resolve = `(?:${named(story.subject)}|(?:the\\s+)?(?:conflict|dispute)\\s+over\\s+${named(story.subject)})\\s+(?:remains|stays|is\\s+still|is)\\s+${state}`;
  if (
    !clauseMatches(spans.setup, setup) ||
    !clauseMatches(spans.resolve, resolve) ||
    !new RegExp(`\\b${state}\\b`, 'i').test(story.outcome)
  )
    return mechanismIssue(
      ctx,
      'setup binds the compared sources; resolve and outcome preserve disputed/unresolved status without adjudication',
    );
  return {
    ...story,
    storyId: '02',
    kind: 'evidence-conflict',
    preset: 'claim-source-board',
    entities,
    records,
    relations,
    sourceSpans,
    state,
  };
}
