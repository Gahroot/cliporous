/** Stories 37–38: sparse typed pairs and supplied matching decisions, never a graph/assignment solver. */
import type {
  CapacityEligibility,
  CapacityMatchRecord,
  CapacityRecord,
  ExpansionCapacityMatchScene,
  ExpansionMatrixLinksScene,
  MatrixMatchingBeatEvidence,
  MatrixMatchingQualification,
  MatrixPairRelation,
  MatrixPairRole,
} from '../../remotion/compositions/explainer/expansion/relationships/matrix-matching-types';
import {
  type ExpansionEntity,
  expansionEntityId,
} from '../../remotion/compositions/explainer/expansion/scene-types';
import { compatibleBasis } from '../../remotion/compositions/explainer/expansion/value-logic';
import {
  type ExpansionEvidenceSpan,
  EXPANSION_LIMITS as L,
} from '../../remotion/compositions/explainer/expansion/value-types';
import { parseExpansionQuantity } from './expansion-quantity-contract';
import {
  expansionEntities,
  expansionSourceLabel,
  expansionSourceSpan,
  expansionStoryBase,
} from './expansion-source-contract';
import { onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue, strictMechanismBeats } from './mechanism-contract';

const PHASES = ['setup', 'action', 'response', 'check', 'resolve'] as const;
const WORDS = PHASES.map((phase) => `${phase}Word`);
function key(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/’/g, "'")
    .replace(/−/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
function literal(text: string): string {
  return key(text)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
}
function named(text: string): string {
  return `(?:the\\s+)?${literal(text)}`;
}
function joined(entities: readonly ExpansionEntity[]): string {
  return entities.map((entity) => named(entity.label)).join('\\s+and\\s+');
}
/** Full authored state grammar, including explicit denial/absence. Never strip a negated verb. */
function clause(text: string, body: string, condition?: string): boolean {
  if (
    /[<>`{}]|https?:\/\/|www\./i.test(text) ||
    text.split(/\s+/).length > L.evidenceWords ||
    [...text].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    return false;
  const grammar = condition
    ? `(?:${literal(condition)},\\s*${body}|${body},?\\s+${literal(condition)})`
    : body;
  return new RegExp(`^(?:${grammar})[.;]$`, 'i').test(key(text));
}
function scope(period: string, population: string, body: string): string {
  return `(?:${body}\\s+(?:during|in)\\s+${literal(period)}\\s+(?:among|for)\\s+${literal(population)}|(?:during|in)\\s+${literal(period)}\\s+(?:among|for)\\s+${literal(population)},\\s*${body})`;
}
function sameSpan(left: ExpansionEvidenceSpan, right: ExpansionEvidenceSpan): boolean {
  return left.fromWord === right.fromWord && left.toWord === right.toWord;
}
function localBase(raw: Rec, ctx: ParseContext, id: '37' | '38') {
  const b = expansionStoryBase(raw, ctx, id, [
    'entities',
    'period',
    'population',
    ...(id === '37'
      ? ['matrix', 'relations']
      : ['candidates', 'destinations', 'eligibility', 'records']),
  ]);
  if (!b || !strictMechanismBeats(raw, ctx, WORDS, [1, 1, 1, 1], 0.8)) return null;
  const sourceWords = ctx.words.slice(ctx.win.startWord, ctx.win.endWord + 1);
  if (
    sourceWords.some(
      (word, index) =>
        word.start < ctx.win.startTime ||
        word.end > ctx.win.endTime ||
        word.end < word.start ||
        (index > 0 && word.start < (sourceWords[index - 1]?.start ?? word.start)),
    )
  )
    return mechanismIssue(
      ctx,
      'source word times must retain ordered, nonreversed bounds inside the complete scene',
    );
  const entities = expansionEntities(raw.entities, ctx, id);
  const period = expansionSourceLabel(raw.period, b.spans.setup, ctx, L.period);
  const population = expansionSourceLabel(raw.population, b.spans.setup, ctx, L.population);
  if (!entities || entities.length < 2 || !period || !population)
    return mechanismIssue(
      ctx,
      'relationships need two to eight distinct source-owned entities and a local scope',
    );
  const spans: ExpansionEvidenceSpan[] = [];
  for (const phase of PHASES) {
    const index = ctx.inWin(raw[`${phase}Word`]);
    if (index === null) return null;
    let fromWord = index,
      toWord = index;
    while (
      fromWord > ctx.win.startWord &&
      !/[.!?;][”"’')\]]*$/.test(ctx.words[fromWord - 1]?.text ?? '')
    )
      fromWord--;
    while (toWord < ctx.win.endWord && !/[.!?;][”"’')\]]*$/.test(ctx.words[toWord]?.text ?? ''))
      toWord++;
    const evidence = expansionSourceSpan({ fromWord, toWord }, ctx);
    if (!evidence) return null;
    spans.push(evidence.span);
  }
  const [setup, action, response, check, resolve] = spans;
  if (!setup || !action || !response || !check || !resolve) return null;
  const sourceSpans: MatrixMatchingBeatEvidence = { setup, action, response, check, resolve };
  const { treatment: _treatment, ...story } = b.story;
  return { story, spans: b.spans, sourceSpans, entities, period, population };
}
type Base = NonNullable<ReturnType<typeof localBase>>;
function reference(
  raw: unknown,
  entities: readonly ExpansionEntity[],
  ctx: ParseContext,
): ExpansionEntity | null {
  return (
    (typeof raw === 'string'
      ? entities.find((entity) => key(entity.label) === key(raw))
      : undefined) ??
    mechanismIssue(
      ctx,
      'endpoints must quote existing entity labels; never accept raw IDs or invented actors',
    )
  );
}
function axis(
  raw: unknown,
  entities: readonly ExpansionEntity[],
  cap: number,
  ctx: ParseContext,
): ExpansionEntity[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > cap)
    return mechanismIssue(
      ctx,
      'named axes/groups must be nonempty and respect the authored entity/dimension cap',
    );
  const result: ExpansionEntity[] = [];
  for (const label of raw) {
    const entity = reference(label, entities, ctx);
    if (!entity || result.some((entry) => entry.id === entity.id))
      return mechanismIssue(
        ctx,
        'axes/groups must use distinct supplied entities, not duplicate aliases',
      );
    result.push(entity);
  }
  return result;
}
function entries(raw: unknown, cap: number, ctx: ParseContext): Rec[] | null {
  return Array.isArray(raw) && raw.length >= 1 && raw.length <= cap && raw.every(isRec)
    ? raw
    : mechanismIssue(
        ctx,
        `include one to ${cap} complete source-owned records; never truncate overflow`,
      );
}
function qualification(
  entry: Rec,
  evidence: { text: string },
  b: Base,
  ctx: ParseContext,
  assertedBody: string,
  unresolvedBody: (qualifier: string) => string,
  unresolvedAlias = false,
): MatrixMatchingQualification | null {
  if (entry.state === 'known') {
    if ('qualifier' in entry || 'condition' in entry || !clause(evidence.text, assertedBody))
      return mechanismIssue(
        ctx,
        'known facts must be explicit unqualified assertions in their own complete clause',
      );
    return { state: 'known' };
  }
  if (entry.state === 'conditional') {
    const condition = expansionSourceLabel(entry.condition, evidence.text, ctx, L.qualifier);
    if (
      !condition ||
      condition !== b.story.condition ||
      'qualifier' in entry ||
      !clause(evidence.text, assertedBody, condition)
    )
      return mechanismIssue(
        ctx,
        'conditional facts must retain the exact source condition without evaluating it',
      );
    return { state: 'conditional', condition };
  }
  if (entry.state === 'unknown' || entry.state === 'missing' || entry.state === 'disputed') {
    const qualifier = expansionSourceLabel(entry.qualifier, evidence.text, ctx, L.qualifier);
    if (
      !qualifier ||
      (qualifier !== entry.state &&
        !(unresolvedAlias && entry.state === 'unknown' && qualifier === 'unresolved')) ||
      'condition' in entry ||
      !clause(evidence.text, unresolvedBody(qualifier))
    )
      return mechanismIssue(
        ctx,
        'unknown, missing and disputed facts retain their source status, not a negative or zero',
      );
    return { state: entry.state, qualifier };
  }
  if (entry.state === 'illustrative' || entry.state === 'simulated') {
    const qualifier = expansionSourceLabel(entry.qualifier, evidence.text, ctx, L.qualifier);
    const allowed =
      entry.state === 'illustrative'
        ? ['illustrative example', 'teaching example']
        : ['simulation', 'simulated example'];
    if (
      !qualifier ||
      !allowed.includes(qualifier) ||
      b.story.evidence !== 'illustrative' ||
      'condition' in entry ||
      !clause(evidence.text, `In\\s+this\\s+${literal(qualifier)},\\s*${assertedBody}`)
    )
      return mechanismIssue(
        ctx,
        'teaching/simulated facts keep their explicit nonmeasured qualification',
      );
    return { state: entry.state, qualifier };
  }
  return mechanismIssue(
    ctx,
    'unsupported fact state; no inferred relation, eligibility or assignment',
  );
}
function isUnresolved(state: MatrixMatchingQualification['state']): boolean {
  return state === 'unknown' || state === 'missing' || state === 'disputed';
}

export function parseExpansionMatrixLinks(
  raw: Rec,
  ctx: ParseContext,
): ExpansionMatrixLinksScene | null {
  const b = localBase(raw, ctx, '37');
  if (!b) return null;
  if (!isRec(raw.matrix) || !onlyFields(raw.matrix, ['rows', 'columns'], ctx))
    return mechanismIssue(
      ctx,
      'matrix accepts only source-named rows and columns, never dimensions/coordinates/cell values',
    );
  const rows = axis(raw.matrix.rows, b.entities, L.matrixRows, ctx);
  const columns = axis(raw.matrix.columns, b.entities, L.matrixColumns, ctx);
  if (!rows || !columns) return null;
  if (new Set([...rows, ...columns].map((entity) => entity.id)).size !== b.entities.length)
    return mechanismIssue(ctx, 'matrix and graph must contain exactly the same stable entity set');
  const setup = `(?:${named(b.story.subject)}:\\s*Matrix\\s+rows\\s+list\\s+${joined(rows)}\\s+and\\s+columns\\s+list\\s+${joined(columns)}|${named(b.story.subject)}\\s+shows\\s+row\\s+entities\\s+${joined(rows)}\\s+and\\s+column\\s+entities\\s+${joined(columns)})`;
  if (!clause(b.spans.setup, scope(b.period, b.population, setup)))
    return mechanismIssue(
      ctx,
      'setup must explicitly bind the complete matrix axes and graph entities to the same scope',
    );
  const supplied = entries(raw.relations, L.relations, ctx);
  if (!supplied) return null;
  const relations: MatrixPairRelation[] = [];
  for (const [index, entry] of supplied.entries()) {
    if (
      !onlyFields(
        entry,
        ['from', 'to', 'role', 'direction', 'state', 'condition', 'qualifier', 'evidence'],
        ctx,
      )
    )
      return null;
    const from = reference(entry.from, rows, ctx),
      to = reference(entry.to, columns, ctx);
    const evidence = expansionSourceSpan(entry.evidence, ctx);
    const role = (['association', 'dependency', 'transfer'] as const).find(
      (candidate) => candidate === entry.role,
    );
    if (!from || !to || !evidence || !role || from.id === to.id)
      return mechanismIssue(
        ctx,
        'each pair needs distinct supplied endpoints and an authored typed relation',
      );
    if (entry.direction !== (role === 'association' ? 'undirected' : 'from-to'))
      return mechanismIssue(
        ctx,
        'association is undirected; dependency/transfer need their explicit source endpoint direction',
      );
    if (
      relations.some(
        (relation) =>
          relation.fromId === from.id && relation.toId === to.id && relation.role === role,
      )
    )
      return mechanismIssue(
        ctx,
        'a typed pair may appear only once; reject contradictory duplicate cells',
      );
    const a = named(from.label),
      z = named(to.label);
    const body =
      role === 'association'
        ? `(?:${a}\\s+is\\s+associated\\s+with\\s+${z}|An\\s+association\\s+links\\s+${a}\\s+and\\s+${z})`
        : role === 'dependency'
          ? `(?:${a}\\s+depends\\s+on\\s+${z}|${z}\\s+is\\s+a\\s+dependency\\s+of\\s+${a})`
          : `(?:${a}\\s+transfers\\s+work\\s+to\\s+${z}|Work\\s+is\\s+transferred\\s+from\\s+${a}\\s+to\\s+${z})`;
    const pair = role === 'association' ? `${a}\\s+and\\s+${z}` : `${a}\\s+to\\s+${z}`;
    const fact = qualification(
      entry,
      evidence,
      b,
      ctx,
      scope(b.period, b.population, body),
      (qualifier) =>
        scope(
          b.period,
          b.population,
          `(?:${pair}\\s+${role}\\s+(?:is|remains)\\s+${literal(qualifier)}|The\\s+${role}\\s+${role === 'association' ? `between\\s+${a}\\s+and\\s+${z}` : `from\\s+${a}\\s+to\\s+${z}`}\\s+(?:is|remains)\\s+${literal(qualifier)})`,
        ),
    );
    if (!fact) return null;
    relations.push({
      id: expansionEntityId('37', b.entities.length + index),
      fromId: from.id,
      toId: to.id,
      role: role as MatrixPairRole,
      direction: role === 'association' ? 'undirected' : 'from-to',
      evidence: evidence.span,
      ...fact,
    });
  }
  if (
    !relations.some((relation) => sameSpan(relation.evidence, b.sourceSpans.action)) ||
    !relations.some((relation) => sameSpan(relation.evidence, b.sourceSpans.response)) ||
    !clause(
      b.spans.check,
      scope(
        b.period,
        b.population,
        `(?:Unrecorded\\s+cells\\s+in\\s+${named(b.story.subject)}\\s+remain\\s+unspecified|Cells\\s+without\\s+records\\s+in\\s+${named(b.story.subject)}\\s+stay\\s+unspecified)`,
      ),
    ) ||
    !clause(
      b.spans.resolve,
      `(?:${named(b.story.subject)}\\s+preserves\\s+only\\s+stated\\s+pairs|${named(b.story.subject)}\\s+keeps\\s+the\\s+supplied\\s+pairs\\s+without\\s+adding\\s+links)`,
    )
  )
    return mechanismIssue(
      ctx,
      'matrix beats must reveal supplied pairs, preserve unrecorded cells and resolve without inferred links',
    );
  return {
    ...b.story,
    storyId: '37',
    kind: 'relation-structure',
    preset: 'matrix-links',
    entities: b.entities,
    period: b.period,
    population: b.population,
    matrix: {
      rowIds: rows.map((entity) => entity.id),
      columnIds: columns.map((entity) => entity.id),
      unrecordedCellMeaning: 'not-supplied',
    },
    graph: {
      entityIds: b.entities.map((entity) => entity.id),
      relationIds: relations.map((relation) => relation.id),
    },
    relations,
    sourceSpans: b.sourceSpans,
    meaning: 'same-entities-explicit-pairs-only',
  };
}

export function parseExpansionCapacityMatch(
  raw: Rec,
  ctx: ParseContext,
): ExpansionCapacityMatchScene | null {
  const b = localBase(raw, ctx, '38');
  if (!b) return null;
  const candidates = axis(raw.candidates, b.entities, L.actors - 1, ctx),
    destinations = axis(raw.destinations, b.entities, L.actors - 1, ctx);
  if (!candidates || !destinations) return null;
  if (
    candidates.length + destinations.length !== b.entities.length ||
    new Set([...candidates, ...destinations].map((entity) => entity.id)).size !== b.entities.length
  )
    return mechanismIssue(
      ctx,
      'candidates and destinations must partition the exact entity set with no mismatched endpoints',
    );
  const setup = `(?:${named(b.story.subject)}:\\s*Candidates\\s+${joined(candidates)}\\s+seek\\s+destinations\\s+${joined(destinations)}|${named(b.story.subject)}\\s+lists\\s+${joined(candidates)}\\s+as\\s+candidates\\s+and\\s+${joined(destinations)}\\s+as\\s+destinations)`;
  if (!clause(b.spans.setup, scope(b.period, b.population, setup)))
    return mechanismIssue(
      ctx,
      'setup must explicitly introduce the complete named candidate/destination sets and source scope',
    );
  const suppliedEligibility = entries(raw.eligibility, L.relations, ctx),
    suppliedRecords = entries(raw.records, L.records, ctx);
  if (!suppliedEligibility || !suppliedRecords) return null;
  const eligibility: CapacityEligibility[] = [];
  for (const [index, entry] of suppliedEligibility.entries()) {
    if (
      !onlyFields(
        entry,
        ['candidate', 'destination', 'state', 'status', 'condition', 'qualifier', 'evidence'],
        ctx,
      )
    )
      return null;
    const candidate = reference(entry.candidate, candidates, ctx),
      destination = reference(entry.destination, destinations, ctx);
    const evidence = expansionSourceSpan(entry.evidence, ctx);
    if (!candidate || !destination || !evidence) return null;
    if (
      eligibility.some(
        (record) => record.candidateId === candidate.id && record.destinationId === destination.id,
      )
    )
      return mechanismIssue(
        ctx,
        'eligibility endpoints may occur only once; contradictory supplied judgments are rejected',
      );
    const unresolved = isUnresolved(entry.state as MatrixMatchingQualification['state']);
    if (unresolved ? 'status' in entry : entry.status !== 'eligible' && entry.status !== 'denied')
      return mechanismIssue(
        ctx,
        'unknown eligibility has no allowed/denied result; supplied judgments must be explicitly typed',
      );
    const a = named(candidate.label),
      z = named(destination.label);
    const body =
      entry.status === 'eligible'
        ? `(?:${a}\\s+is\\s+eligible\\s+for\\s+${z}|${z}\\s+accepts\\s+${a}\\s+as\\s+eligible)`
        : `(?:${a}\\s+is\\s+ineligible\\s+for\\s+${z}|${a}\\s+is\\s+denied\\s+eligibility\\s+for\\s+${z}|${z}\\s+denies\\s+eligibility\\s+to\\s+${a})`;
    const fact = qualification(
      entry,
      evidence,
      b,
      ctx,
      scope(b.period, b.population, body),
      (qualifier) =>
        scope(
          b.period,
          b.population,
          `(?:${a}\\s+eligibility\\s+for\\s+${z}\\s+(?:is|remains)\\s+${literal(qualifier)}|Eligibility\\s+of\\s+${a}\\s+at\\s+${z}\\s+(?:is|remains)\\s+${literal(qualifier)})`,
        ),
    );
    if (!fact) return null;
    eligibility.push({
      id: expansionEntityId('38', b.entities.length + index),
      candidateId: candidate.id,
      destinationId: destination.id,
      evidence: evidence.span,
      ...fact,
      ...(!unresolved ? { status: entry.status as 'eligible' | 'denied' } : {}),
    });
  }
  const records: (CapacityRecord | CapacityMatchRecord)[] = [];
  for (const [index, entry] of suppliedRecords.entries()) {
    const id = expansionEntityId('38', b.entities.length + eligibility.length + index);
    if (entry.type === 'capacity') {
      if (!onlyFields(entry, ['type', 'destination', 'quantity'], ctx)) return null;
      const destination = reference(entry.destination, destinations, ctx),
        quantity = parseExpansionQuantity(entry.quantity, ctx);
      if (!destination || !quantity)
        return mechanismIssue(
          ctx,
          'capacities need a supplied destination and a complete exact quantity assertion',
        );
      if (
        key(quantity.actor) !== key(destination.label) ||
        key(quantity.claim) !== 'capacity' ||
        quantity.basis.unit !== 'count' ||
        key(quantity.basis.period) !== key(b.period) ||
        key(quantity.basis.population) !== key(b.population)
      )
        return mechanismIssue(
          ctx,
          'capacity must bind this destination, capacity claim, count unit, period, population and supplied denominator',
        );
      const amounts =
        quantity.state === 'disputed'
          ? quantity.alternatives
          : 'amount' in quantity
            ? [quantity.amount]
            : [];
      if (
        amounts.some(
          (amount) =>
            amount.kind !== 'rational' ||
            amount.value.numerator < 0 ||
            amount.value.denominator !== 1,
        )
      )
        return mechanismIssue(
          ctx,
          'named-candidate capacity is an exact nonnegative whole count, never a signed/fractional/rate/money conversion',
        );
      if (
        (quantity.state === 'conditional' && quantity.condition !== b.story.condition) ||
        ((quantity.state === 'illustrative' || quantity.state === 'simulated') &&
          b.story.evidence !== 'illustrative')
      )
        return mechanismIssue(
          ctx,
          'capacity qualifications must agree with the source story, not become measured facts',
        );
      const previous = records.find(
        (record): record is CapacityRecord => record.type === 'capacity',
      );
      if (previous && !compatibleBasis(previous.quantity.basis, quantity.basis))
        return mechanismIssue(
          ctx,
          'all supplied capacities must use the exact same unit, period, population and denominator basis',
        );
      if (
        records.some(
          (record) => record.type === 'capacity' && record.destinationId === destination.id,
        )
      )
        return mechanismIssue(
          ctx,
          'each destination has exactly one supplied capacity status, not contradictory records',
        );
      records.push({ id, type: 'capacity', destinationId: destination.id, quantity });
    } else if (entry.type === 'match') {
      if (
        !onlyFields(
          entry,
          [
            'type',
            'candidate',
            'destination',
            'state',
            'status',
            'condition',
            'qualifier',
            'evidence',
          ],
          ctx,
        )
      )
        return null;
      const candidate = reference(entry.candidate, candidates, ctx),
        evidence = expansionSourceSpan(entry.evidence, ctx);
      if (!candidate || !evidence) return null;
      if (records.some((record) => record.type === 'match' && record.candidateId === candidate.id))
        return mechanismIssue(
          ctx,
          'each candidate has exactly one supplied match/unresolved status; never assign twice',
        );
      const unresolved = isUnresolved(entry.state as MatrixMatchingQualification['state']);
      const destination = unresolved ? undefined : reference(entry.destination, destinations, ctx);
      if (
        unresolved
          ? entry.status !== 'unresolved' || 'destination' in entry
          : !destination || entry.status !== 'matched'
      )
        return mechanismIssue(
          ctx,
          'supplied matches need matching endpoints; unresolved status must not invent a destination',
        );
      const a = named(candidate.label),
        z = destination ? named(destination.label) : '';
      const fact = qualification(
        entry,
        evidence,
        b,
        ctx,
        scope(
          b.period,
          b.population,
          `(?:${a}\\s+is\\s+matched\\s+to\\s+${z}|The\\s+supplied\\s+match\\s+places\\s+${a}\\s+at\\s+${z})`,
        ),
        (qualifier) =>
          scope(
            b.period,
            b.population,
            `(?:${a}\\s+match\\s+(?:is|remains)\\s+${literal(qualifier)}|The\\s+match\\s+for\\s+${a}\\s+(?:is|stays)\\s+${literal(qualifier)})`,
          ),
        true,
      );
      if (!fact) return null;
      const common = {
        id,
        type: 'match' as const,
        candidateId: candidate.id,
        evidence: evidence.span,
      };
      if (fact.state === 'unknown' || fact.state === 'missing' || fact.state === 'disputed')
        records.push({ ...common, ...fact, status: 'unresolved' });
      else if (
        destination &&
        (fact.state === 'known' ||
          fact.state === 'conditional' ||
          fact.state === 'illustrative' ||
          fact.state === 'simulated')
      )
        records.push({ ...common, ...fact, status: 'matched', destinationId: destination.id });
      else return mechanismIssue(ctx, 'a supplied match must preserve its named destination');
    } else
      return mechanismIssue(
        ctx,
        'record type must be capacity or match; no invented results or evaluators',
      );
  }
  if (
    records.length !== b.entities.length ||
    destinations.some(
      (destination) =>
        !records.some(
          (record) => record.type === 'capacity' && record.destinationId === destination.id,
        ),
    ) ||
    candidates.some(
      (candidate) =>
        !records.some((record) => record.type === 'match' && record.candidateId === candidate.id),
    )
  )
    return mechanismIssue(
      ctx,
      'every destination needs capacity evidence and every candidate needs a supplied match or unresolved status',
    );
  // Count only for contradiction rejection. Never emit counts, residual slots, scores or assignments.
  for (const record of records) {
    if (record.type !== 'match' || record.status !== 'matched') continue;
    const judgment = eligibility.find(
      (entry) =>
        entry.candidateId === record.candidateId && entry.destinationId === record.destinationId,
    );
    if (!judgment)
      return mechanismIssue(
        ctx,
        'supplied match endpoints need their own source eligibility status, never a different pair',
      );
    const sameQualification =
      judgment.state === record.state &&
      (judgment.state !== 'conditional' ||
        (record.state === 'conditional' && judgment.condition === record.condition)) &&
      ((judgment.state !== 'illustrative' && judgment.state !== 'simulated') ||
        (record.state === judgment.state && record.qualifier === judgment.qualifier));
    if (judgment.status === 'denied' && (judgment.state === 'known' || sameQualification))
      return mechanismIssue(
        ctx,
        'supplied match contradicts explicit denied eligibility in the same source scope',
      );
    // A source-supplied match is an independent fact. Unknown eligibility stays unknown,
    // and conditional eligibility is not evaluated or promoted to a known result.
  }
  for (const record of records) {
    if (
      record.type !== 'capacity' ||
      !('amount' in record.quantity) ||
      record.quantity.amount.kind !== 'rational'
    )
      continue;
    const quantity = record.quantity;
    const occupied = records.filter(
      (match) =>
        match.type === 'match' &&
        match.status === 'matched' &&
        match.destinationId === record.destinationId &&
        (quantity.state === 'known' ||
          match.state === 'known' ||
          (match.state === quantity.state &&
            (match.state !== 'conditional' ||
              (quantity.state === 'conditional' && match.condition === quantity.condition)))),
    ).length;
    if (occupied > record.quantity.amount.value.numerator)
      return mechanismIssue(
        ctx,
        'supplied matches conflict with the source capacity; reject without inventing a replacement assignment',
      );
  }
  if (
    !records.some(
      (record) =>
        record.type === 'capacity' && sameSpan(record.quantity.evidence, b.sourceSpans.action),
    ) ||
    !eligibility.some((record) => sameSpan(record.evidence, b.sourceSpans.response)) ||
    !records.some(
      (record) => record.type === 'match' && sameSpan(record.evidence, b.sourceSpans.check),
    ) ||
    !clause(
      b.spans.resolve,
      `(?:${named(b.story.subject)}\\s+retains\\s+supplied\\s+matches\\s+and\\s+unresolved\\s+candidates|${named(b.story.subject)}\\s+keeps\\s+source\\s+matches\\s+without\\s+settling\\s+unresolved\\s+candidates)`,
    )
  )
    return mechanismIssue(
      ctx,
      'matching beats must use capacity, eligibility and supplied results, never solve an unresolved assignment',
    );
  return {
    ...b.story,
    storyId: '38',
    kind: 'semantic-sort',
    preset: 'capacity-match',
    entities: b.entities,
    candidateIds: candidates.map((entity) => entity.id),
    destinationIds: destinations.map((entity) => entity.id),
    period: b.period,
    population: b.population,
    eligibility,
    records,
    sourceSpans: b.sourceSpans,
    meaning: 'supplied-matches-not-solved-assignment',
  };
}
