/** Step 8 stories 05–06. Local semantic parsers, deliberately not global kind registration. */
import type {
  ExpansionConfounderScene,
  ExpansionConfoundingFactor,
  ExpansionInformationRecord,
  ExpansionMissingEvidenceMapScene,
} from '../../remotion/compositions/explainer/expansion/reasoning/information-types';
import type { ExpansionEntity } from '../../remotion/compositions/explainer/expansion/scene-types';
import {
  EXPANSION_LIMITS,
  type ExpansionEvidenceSpan,
} from '../../remotion/compositions/explainer/expansion/value-types';
import {
  expansionAssertedRelation,
  expansionEntities,
  expansionSourceLabel,
  expansionSourceSpan,
  expansionStoryBase,
  type ExpansionSourceEvidence,
} from './expansion-source-contract';
import { onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

const BEATS = ['setup', 'action', 'response', 'check', 'resolve'] as const;

function canonical(text: string): string {
  return text.normalize('NFKC').replace(/’/g, "'").replace(/−/g, '-').replace(/\s+/g, ' ').trim();
}

/** Every interpolated endpoint is literal text, never a model-authored pattern. */
function literal(text: string): string {
  return canonical(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}

function sameLabel(left: string, right: string): boolean {
  return canonical(left).toLowerCase() === canonical(right).toLowerCase();
}

function sameSpan(left: ExpansionEvidenceSpan, right: ExpansionEvidenceSpan): boolean {
  return left.fromWord === right.fromWord && left.toWord === right.toWord;
}

/** Intentional modal/negative assertions need a whole authored grammar, not affirmative masking. */
function exactClause(
  evidence: ExpansionSourceEvidence,
  authoredBody: string,
  condition?: string,
): boolean {
  let text = canonical(evidence.text);
  if (
    !text ||
    text.split(/\s+/).length > EXPANSION_LIMITS.evidenceWords ||
    /[<>`]|https?:\/\/|www\./i.test(text) ||
    [...text].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  ) return false;
  text = text.replace(/[.;][”"’')\]]*$/, '').trim();
  const body = condition
    ? `(?:${literal(condition)},\\s*${authoredBody}|${authoredBody},?\\s+${literal(condition)})`
    : authoredBody;
  return new RegExp(`^(?:${body})$`, 'iu').test(text);
}

function entityRef(raw: unknown, entities: readonly ExpansionEntity[], ctx: ParseContext): ExpansionEntity | null {
  const label = ctx.str(raw, EXPANSION_LIMITS.actorLabel);
  const entity = label ? entities.find((candidate) => sameLabel(candidate.label, label)) : undefined;
  return entity ?? mechanismIssue(ctx, 'references must be exact declared entity labels, not IDs or invented aliases');
}

function recordIndex(raw: unknown, length: number, ctx: ParseContext): number | null {
  return typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0 && raw < length
    ? raw
    : mechanismIssue(ctx, 'record references must be existing zero-based integer indices');
}

function sourceEnvelope(raw: Rec, ctx: ParseContext, id: '05' | '06', fields: readonly string[]) {
  const base = expansionStoryBase(raw, ctx, id, ['entities', ...fields]);
  if (!base) return null;
  if (base.story.evidence !== 'source-stated')
    return mechanismIssue(ctx, 'these information stories require actual source-stated facts, not an invented illustration');
  const { treatment, ...story } = base.story;
  if (treatment !== undefined) return mechanismIssue(ctx, 'no treatment is supported by these local stories');
  const locals: ExpansionSourceEvidence[] = [];
  for (const beat of BEATS) {
    const index = ctx.inWin(raw[`${beat}Word`]);
    if (index === null) return null;
    const local = expansionSourceSpan({
      fromWord: index,
      toWord: index + base.spans[beat].split(/\s+/).length - 1,
    }, ctx);
    if (!local) return mechanismIssue(ctx, 'five distinct complete clause-start beats are required');
    locals.push(local);
  }
  const [setup, action, response, check, resolve] = locals;
  if (!setup || !action || !response || !check || !resolve) return null;
  return { story, beats: { setup, action, response, check, resolve } };
}

function atBeat(raw: unknown, beat: ExpansionSourceEvidence, ctx: ParseContext): ExpansionSourceEvidence | null {
  const evidence = expansionSourceSpan(raw, ctx);
  return evidence && sameSpan(evidence.span, beat.span)
    ? evidence
    : mechanismIssue(ctx, 'this fact must retain its exact complete local beat clause');
}

function scopeAt(body: string, scope: string, prepositions = '(?:among|for|in)'): string {
  const place = `${prepositions}\\s+${literal(scope)}`;
  return `(?:${body}\\s+${place}|${place},\\s*${body})`;
}

/**
 * Raw: scope; entities:{label,evidence}[]; association:{from,to,evidence};
 * factor:{entity,affects:[label,label],certainty:'stated'|'possible',qualification?,condition?,evidence};
 * causalStatus:{from,to,qualification,evidence}; resolutionEvidence:{fromWord,toWord}.
 * All entity references are labels. No numeric influence or causal proof is accepted.
 */
export function parseExpansionConfounder(raw: Rec, ctx: ParseContext): ExpansionConfounderScene | null {
  const base = sourceEnvelope(raw, ctx, '05', ['scope', 'association', 'factor', 'causalStatus', 'resolutionEvidence']);
  if (!base) return null;
  const { story, beats } = base;
  const entities = expansionEntities(raw.entities, ctx, '05');
  const scope = expansionSourceLabel(raw.scope, beats.setup, ctx, EXPANSION_LIMITS.population);
  if (!entities || entities.length !== 3 || !scope)
    return mechanismIssue(ctx, 'confounder needs exactly two named variables and a distinct locally described third factor');
  if (!isRec(raw.association) || !onlyFields(raw.association, ['from', 'to', 'evidence'], ctx)) return null;
  const from = entityRef(raw.association.from, entities, ctx);
  const to = entityRef(raw.association.to, entities, ctx);
  const associationEvidence = atBeat(raw.association.evidence, beats.action, ctx);
  if (!from || !to || from.id === to.id || !associationEvidence)
    return mechanismIssue(ctx, 'association requires two distinct locally named endpoints');
  const x = literal(from.label);
  const y = literal(to.label);
  if (
    (!sameLabel(story.subject, from.label) && !sameLabel(story.subject, to.label)) ||
    !sameSpan(from.evidence, beats.setup.span) || !sameSpan(to.evidence, beats.setup.span) ||
    !expansionAssertedRelation(beats.setup, new RegExp(scopeAt(
      `${literal(story.label)}\\s+(?:tracks|examines|compares|follows|studies|reviews|considers)\\s+(?:both\\s+)?${x}\\s+and\\s+${y}`,
      scope,
    ), 'iu'))
  ) return mechanismIssue(ctx, 'setup must introduce the two variables and their exact shared scope');
  const associationBody = `(?:${x}\\s+(?:is|was)\\s+(?:associated|correlated|linked)\\s+with\\s+${y}|${x}\\s+and\\s+${y}\\s+(?:(?:are|were)\\s+(?:associated|correlated|linked)|(?:move|vary)\\s+together))`;
  if (!expansionAssertedRelation(associationEvidence, new RegExp(scopeAt(associationBody, scope), 'iu')))
    return mechanismIssue(ctx, 'an actual scoped association must be asserted; mere mentions, predictions and negated links are not association proof');

  if (!isRec(raw.factor) || !onlyFields(raw.factor, ['entity', 'affects', 'certainty', 'qualification', 'condition', 'evidence'], ctx)) return null;
  const factorEntity = entityRef(raw.factor.entity, entities, ctx);
  const factorEvidence = atBeat(raw.factor.evidence, beats.response, ctx);
  if (
    !factorEntity || !factorEvidence || factorEntity.id === from.id || factorEntity.id === to.id ||
    !sameSpan(factorEntity.evidence, beats.response.span) ||
    !Array.isArray(raw.factor.affects) || raw.factor.affects.length !== 2
  ) return mechanismIssue(ctx, 'the third factor must be distinct and explicitly affect both association endpoints');
  const first = entityRef(raw.factor.affects[0], entities, ctx);
  const second = entityRef(raw.factor.affects[1], entities, ctx);
  if (!first || !second || first.id === second.id || ![from.id, to.id].includes(first.id) || ![from.id, to.id].includes(second.id))
    return mechanismIssue(ctx, 'factor affects must name exactly the two association endpoints');
  const condition = raw.factor.condition === undefined
    ? undefined
    : expansionSourceLabel(raw.factor.condition, factorEvidence, ctx, EXPANSION_LIMITS.qualifier);
  if (condition === null || (condition === undefined) !== (story.condition === undefined) ||
    (condition !== undefined && story.condition !== undefined && !sameLabel(condition, story.condition)))
    return mechanismIssue(ctx, 'retain the complete factor condition locally; do not omit it or apply another clause condition');
  let factor: ExpansionConfoundingFactor;
  const commonFactor = {
    entityId: factorEntity.id,
    affectsIds: [first.id, second.id] as const,
    evidence: factorEvidence.span,
    ...(condition ? { condition } : {}),
  };
  let activeVerb: string;
  let passiveVerb: string;
  if (raw.factor.certainty === 'stated') {
    if (raw.factor.qualification !== undefined)
      return mechanismIssue(ctx, 'stated factor effects cannot discard or invent a modal qualification');
    activeVerb = '(?:affects|influences|shapes)';
    passiveVerb = 'are\\s+(?:affected|influenced|shaped)';
    factor = { ...commonFactor, certainty: 'stated' };
  } else if (raw.factor.certainty === 'possible') {
    const qualification = expansionSourceLabel(raw.factor.qualification, factorEvidence, ctx, 5);
    if (qualification !== 'may' && qualification !== 'might' && qualification !== 'could')
      return mechanismIssue(ctx, 'possible factor effects must preserve the exact source may/might/could qualification');
    activeVerb = `${literal(qualification)}\\s+(?:affect|influence|shape)`;
    passiveVerb = `${literal(qualification)}\\s+be\\s+(?:affected|influenced|shaped)`;
    factor = { ...commonFactor, certainty: 'possible', qualification };
  } else return mechanismIssue(ctx, 'factor certainty must distinguish stated effects from source-qualified possibility');
  const f = literal(factorEntity.label);
  const pairs = [[x, y], [y, x]].map(([a, b]) =>
    `(?:${f}\\s+${activeVerb}\\s+(?:both\\s+)?${a}\\s+and\\s+${b}|(?:both\\s+)?${a}\\s+and\\s+${b}\\s+${passiveVerb}\\s+by\\s+${f}|${f}\\s+is\\s+(?:a|the)\\s+(?:third|shared|common)\\s+factor\\s+that\\s+${activeVerb}\\s+(?:both\\s+)?${a}\\s+and\\s+${b})`);
  if (!exactClause(factorEvidence, scopeAt(`(?:${pairs.join('|')})`, scope), condition))
    return mechanismIssue(ctx, 'the complete factor clause must bind its identity, both variables, scope, possibility and condition; no invented influence');

  if (!isRec(raw.causalStatus) || !onlyFields(raw.causalStatus, ['from', 'to', 'qualification', 'evidence'], ctx)) return null;
  const causeFrom = entityRef(raw.causalStatus.from, entities, ctx);
  const causeTo = entityRef(raw.causalStatus.to, entities, ctx);
  const causalEvidence = atBeat(raw.causalStatus.evidence, beats.check, ctx);
  const qualification = causalEvidence
    ? expansionSourceLabel(raw.causalStatus.qualification, causalEvidence, ctx, EXPANSION_LIMITS.qualifier)
    : null;
  if (!causeFrom || !causeTo || causeFrom.id === causeTo.id || ![from.id, to.id].includes(causeFrom.id) || ![from.id, to.id].includes(causeTo.id) || !causalEvidence || !qualification)
    return mechanismIssue(ctx, 'causal status must concern these same two variables in its own source clause');
  const cx = literal(causeFrom.label);
  const cy = literal(causeTo.label);
  const q = literal(qualification);
  let causalBody: string;
  if (/^(?:not (?:established|demonstrated|proven|proved)|unproven|unestablished|unresolved|unknown)$/i.test(qualification)) {
    causalBody = scopeAt(`(?:a\\s+|the\\s+)?causal\\s+(?:effect|link)\\s+(?:of|from)\\s+${cx}\\s+(?:on|to)\\s+${cy}\\s+(?:is|remains)\\s+${q}`, scope);
    causalBody += `|(?:a\\s+|the\\s+)?causal\\s+(?:effect|link)\\s+(?:of|from)\\s+${cx}\\s+(?:on|to)\\s+${cy}\\s+(?:among|for|in)\\s+${literal(scope)}\\s+(?:is|remains)\\s+${q}`;
    causalBody += `|${scopeAt(`causation\\s+from\\s+${cx}\\s+to\\s+${cy}\\s+(?:is|remains)\\s+${q}`, scope)}`;
  } else if (/^has not been (?:shown|demonstrated|proven|proved)$/i.test(qualification)) {
    causalBody = scopeAt(`${cx}\\s+${q}\\s+to\\s+cause\\s+${cy}`, scope);
  } else if (/^does not (?:establish|prove|demonstrate)$/i.test(qualification)) {
    causalBody = `(?:the\\s+)?association\\s+between\\s+${cx}\\s+and\\s+${cy}\\s+(?:among|for|in)\\s+${literal(scope)}\\s+${q}\\s+causation`;
    causalBody += `|${scopeAt(`(?:the\\s+)?association\\s+between\\s+${cx}\\s+and\\s+${cy}\\s+${q}\\s+causation`, scope)}`;
  } else return mechanismIssue(ctx, 'only explicitly unestablished causation is supported; absence of proof is not proof of no effect');
  if (!exactClause(causalEvidence, `(?:${causalBody})`))
    return mechanismIssue(ctx, 'retain the exact scoped causal qualification; correlation never supplies causal status by itself');
  const resolutionEvidence = atBeat(raw.resolutionEvidence, beats.resolve, ctx);
  const resolutionBody = `(?:(?:the\\s+)?causal\\s+(?:direction|question|link)|causation)\\s+(?:remains|stays|is)\\s+(?:unresolved|unproven|unestablished|open)`;
  if (!resolutionEvidence || !exactClause(resolutionEvidence, scopeAt(resolutionBody, scope)) ||
    !/\b(?:unresolved|unproven|unestablished|open)\b/i.test(story.outcome))
    return mechanismIssue(ctx, 'resolution must preserve the explicitly open causal question in this scope, not a fabricated proven result');
  return {
    ...story,
    storyId: '05', kind: 'relationship-analysis', preset: 'confounder', evidence: 'source-stated',
    scope, entities,
    association: { fromId: from.id, toId: to.id, role: 'association', evidence: associationEvidence.span },
    factor,
    causalStatus: { fromId: causeFrom.id, toId: causeTo.id, status: 'unestablished', qualification, evidence: causalEvidence.span },
    resolutionEvidence: resolutionEvidence.span,
  };
}

function authoredList(labels: readonly string[]): string {
  if (labels.length === 1) return literal(labels[0] ?? '');
  if (labels.length === 2) return `${literal(labels[0] ?? '')}\\s+and\\s+${literal(labels[1] ?? '')}`;
  return `${labels.slice(0, -1).map(literal).join(',\\s*')},?\\s+and\\s+${literal(labels[labels.length - 1] ?? '')}`;
}

const ABSENT_QUALIFICATIONS = {
  missing: /^(?:missing|absent|unavailable|not (?:supplied|provided|available|recorded|reported|stated)|no)$/i,
  unknown: /^(?:unknown|undetermined|not (?:known|determined))$/i,
};
const NOT_KNOWN_CONTENT = /\b(?:unknown|missing|unavailable|undetermined|unresolved|uncertain|unverified|hypothetical|illustrative|simulated|may|might|could|perhaps|maybe)\b|\bnot (?:known|determined|supplied|provided|available|recorded|reported|stated|established)\b|\bno (?:information|evidence|data|records?|results?)\b/i;

/**
 * Raw: scope; entities:{label,evidence}[]; records:{owner:label,topic,state,evidence,
 * content (known only) OR qualification (missing/unknown only)}[]; focusRecord:index;
 * nonFalse:{record:index,qualification,evidence}; resolution:{record:index,status:'unresolved',evidence}.
 * Missing/unknown have no value/content slot; zero/false are accepted only when explicitly known.
 */
export function parseExpansionMissingEvidenceMap(raw: Rec, ctx: ParseContext): ExpansionMissingEvidenceMapScene | null {
  const base = sourceEnvelope(raw, ctx, '06', ['scope', 'records', 'focusRecord', 'nonFalse', 'resolution']);
  if (!base) return null;
  const { story, beats } = base;
  if (story.condition !== undefined)
    return mechanismIssue(ctx, 'missing-evidence-map represents actual known/absent information, not conditional content');
  const entities = expansionEntities(raw.entities, ctx, '06');
  const scope = expansionSourceLabel(raw.scope, beats.setup, ctx, EXPANSION_LIMITS.population);
  if (!entities || !scope || entities.some((entity) => !sameSpan(entity.evidence, beats.setup.span)))
    return mechanismIssue(ctx, 'information owners and scope must be introduced by the complete setup clause');
  if (!Array.isArray(raw.records) || raw.records.length < 2 || raw.records.length > EXPANSION_LIMITS.records)
    return mechanismIssue(ctx, 'include two to twelve locally owned information records without truncation');
  const records: ExpansionInformationRecord[] = [];
  const recordSpans: ExpansionEvidenceSpan[] = [];
  const keys = new Set<string>();
  for (const [index, entry] of raw.records.entries()) {
    if (!isRec(entry)) return mechanismIssue(ctx, 'each information record must be an object');
    const fields = entry.state === 'known'
      ? ['owner', 'topic', 'state', 'content', 'evidence']
      : ['owner', 'topic', 'state', 'qualification', 'evidence'];
    if (!onlyFields(entry, fields, ctx)) return null;
    const owner = entityRef(entry.owner, entities, ctx);
    const evidence = expansionSourceSpan(entry.evidence, ctx);
    const topic = evidence ? expansionSourceLabel(entry.topic, evidence, ctx, EXPANSION_LIMITS.claim) : null;
    if (!owner || !evidence || !topic) return null;
    const key = `${owner.id}:${canonical(topic).toLowerCase()}`;
    if (keys.has(key)) return mechanismIssue(ctx, 'an owner/topic pair must not have duplicated or conflicting information states');
    keys.add(key);
    const common = { id: `expansion-06-record-${index}`, ownerId: owner.id, topic, evidence: evidence.span };
    const actor = literal(owner.label);
    const subject = literal(topic);
    const place = literal(scope);
    let predicate: string;
    if (entry.state === 'known') {
      const content = expansionSourceLabel(entry.content, evidence, ctx, EXPANSION_LIMITS.claim);
      if (!content || NOT_KNOWN_CONTENT.test(content) ||
        evidence.span.fromWord < beats.action.span.fromWord || evidence.span.toWord >= beats.response.span.fromWord)
        return mechanismIssue(ctx, 'known content must be an actual local action-stage assertion, not an unknown, missing or qualified value');
      const value = literal(content);
      predicate = scopeAt(`(?:${actor}(?:'s)?\\s+${subject}\\s+(?:is|was|equals|reads)\\s+${value}|${actor}\\s+(?:reports|records|lists|states)\\s+${subject}\\s+(?:as|of)\\s+${value}|${subject}\\s+for\\s+${actor}\\s+(?:is|was)\\s+${value})`, scope, '(?:in|for|during)');
      predicate += `|for\\s+${actor}\\s+in\\s+${place},\\s*${subject}\\s+(?:(?:is|was|equals|reads)\\s+${value}|(?:reports|records|states)\\s+${value})`;
      if (!exactClause(evidence, `(?:${predicate})`))
        return mechanismIssue(ctx, 'known content, owner, topic and scope must be bound in one complete assertion, not another actor evidence');
      records.push({ ...common, state: 'known', content });
    } else if (entry.state === 'missing' || entry.state === 'unknown') {
      const qualification = expansionSourceLabel(entry.qualification, evidence, ctx, EXPANSION_LIMITS.qualifier);
      if (!qualification || !ABSENT_QUALIFICATIONS[entry.state].test(qualification) ||
        evidence.span.fromWord < beats.response.span.fromWord || evidence.span.toWord >= beats.check.span.fromWord)
        return mechanismIssue(ctx, 'missing and unknown must keep their distinct explicit local response-stage qualification, never zero or false');
      const q = literal(qualification);
      predicate = scopeAt(`(?:${actor}(?:'s)?\\s+${subject}\\s+(?:is|was|remains)\\s+${q}|${subject}\\s+for\\s+${actor}\\s+(?:is|was|remains)\\s+${q})`, scope, '(?:in|for|during)');
      predicate += `|for\\s+${actor}\\s+in\\s+${place},\\s*${subject}\\s+(?:is|was|remains)\\s+${q}`;
      if (entry.state === 'missing' && /^no$/i.test(qualification))
        predicate += `|${scopeAt(`${actor}\\s+(?:has|had)\\s+${q}\\s+${subject}`, scope, '(?:in|for|during)')}`;
      if (!exactClause(evidence, `(?:${predicate})`))
        return mechanismIssue(ctx, 'absence must belong to this owner/topic/scope in the full local assertion; missing and unknown are not inferred');
      records.push({ ...common, state: entry.state, qualification });
    } else return mechanismIssue(ctx, 'information state must be known, missing or unknown; absent information is not a false/zero state');
    recordSpans.push(evidence.span);
  }
  if (!records.some((record) => record.state === 'known') || !records.some((record) => record.state !== 'known') ||
    !recordSpans.some((span) => sameSpan(span, beats.action.span)) ||
    !recordSpans.some((span) => sameSpan(span, beats.response.span)) ||
    entities.some((entity) => !records.some((record) => record.ownerId === entity.id)))
    return mechanismIssue(ctx, 'both known and expressly absent information need real beat-local records; no unused invented owners');
  const topics = [...new Set(records.map((record) => record.topic))];
  const owners = authoredList(entities.map((entity) => entity.label));
  const topicList = authoredList(topics);
  const intro = `(?:tracks|reviews|examines|covers|lists|maps)\\s+${topicList}`;
  const setupBody = `(?:${literal(scope)}\\s+${intro}\\s+for\\s+${owners}|for\\s+${owners},\\s*${literal(scope)}\\s+${intro}|${literal(scope)}\\s+(?:distinguishes|separates)\\s+known\\s+information\\s+from\\s+(?:missing|unknown)\\s+information\\s+for\\s+${owners})`;
  if (!expansionAssertedRelation(beats.setup, new RegExp(setupBody, 'iu')))
    return mechanismIssue(ctx, 'setup must actually introduce this scoped information review and its owners, not merely mention their names');
  const focusIndex = recordIndex(raw.focusRecord, records.length, ctx);
  const focus = focusIndex === null ? undefined : records[focusIndex];
  const focusOwner = focus ? entities.find((entity) => entity.id === focus.ownerId) : undefined;
  if (!focus || focus.state === 'known' || !focusOwner || !sameLabel(story.subject, focusOwner.label))
    return mechanismIssue(ctx, 'focus must be an explicitly absent record owned by the introduced story subject');
  if (!isRec(raw.nonFalse) || !onlyFields(raw.nonFalse, ['record', 'qualification', 'evidence'], ctx) ||
    !isRec(raw.resolution) || !onlyFields(raw.resolution, ['record', 'status', 'evidence'], ctx)) return null;
  if (recordIndex(raw.nonFalse.record, records.length, ctx) !== focusIndex ||
    recordIndex(raw.resolution.record, records.length, ctx) !== focusIndex || raw.resolution.status !== 'unresolved')
    return mechanismIssue(ctx, 'non-false check and unresolved resolution must concern the same absent focus record, not another actor result');
  const nonFalseEvidence = atBeat(raw.nonFalse.evidence, beats.check, ctx);
  const qualification = nonFalseEvidence
    ? expansionSourceLabel(raw.nonFalse.qualification, nonFalseEvidence, ctx, EXPANSION_LIMITS.qualifier)
    : null;
  if (!nonFalseEvidence || !qualification ||
    !/^(?:not false(?: information)?|not a false result|not evidence of falsity|not equivalent to false|not zero or false|not a zero or false value)$/i.test(qualification))
    return mechanismIssue(ctx, 'the check must explicitly preserve not-false semantics, not fabricate a negative/zero result');
  const owner = literal(focusOwner.label);
  const topic = literal(focus.topic);
  const place = literal(scope);
  const state = literal(focus.state);
  const q = literal(qualification);
  const checkBody = `(?:${state}\\s+${topic}\\s+for\\s+${owner}\\s+in\\s+${place}\\s+(?:is|remains)\\s+${q}|for\\s+${owner}\\s+in\\s+${place},\\s*${state}\\s+${topic}\\s+(?:is|remains)\\s+${q}|${owner}(?:'s)?\\s+${topic}\\s+in\\s+${place}\\s+is\\s+${state},?\\s+${q}${focus.state === 'missing' ? `|(?:the\\s+)?absence\\s+of\\s+${topic}\\s+for\\s+${owner}\\s+in\\s+${place}\\s+(?:is|remains)\\s+${q}` : ''})`;
  if (!exactClause(nonFalseEvidence, checkBody))
    return mechanismIssue(ctx, 'not-false qualification must explicitly bind this absent topic, owner and scope locally');
  const resolutionEvidence = atBeat(raw.resolution.evidence, beats.resolve, ctx);
  const resolutionBody = `(?:${scopeAt(`${owner}(?:'s)?\\s+${topic}\\s+(?:remains|stays)\\s+unresolved`, scope, '(?:in|for|during)')}|for\\s+${owner}\\s+in\\s+${place},\\s*${topic}\\s+(?:remains|stays)\\s+unresolved|(?:the\\s+)?${topic}\\s+question\\s+for\\s+${owner}\\s+in\\s+${place}\\s+(?:remains|stays)\\s+open)`;
  if (!resolutionEvidence || !exactClause(resolutionEvidence, resolutionBody) ||
    !canonical(story.outcome).toLowerCase().includes(canonical(focus.topic).toLowerCase()) ||
    !/\b(?:unresolved|open)\b/i.test(story.outcome))
    return mechanismIssue(ctx, 'resolve must retain the same owner/topic as explicitly unresolved, not invent a result or silently fill missing evidence');
  return {
    ...story,
    storyId: '06', kind: 'retrieval-grounding', preset: 'missing-evidence-map', evidence: 'source-stated',
    scope, entities, records, focusRecordId: focus.id,
    nonFalse: { recordId: focus.id, qualification, evidence: nonFalseEvidence.span },
    resolution: { recordId: focus.id, status: 'unresolved', evidence: resolutionEvidence.span },
  };
}
