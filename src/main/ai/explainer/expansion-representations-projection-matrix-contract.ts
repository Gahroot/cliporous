import type {
  CoordinateCorrespondence,
  CoordinateFrame,
  DerivedMatrixCell,
  ExactMatrixTerm,
  ExpansionCoordinateProjectionScene,
  ExpansionMatrixProductScene,
  MatrixProduct,
  MatrixProductRequest,
  MatrixQualification,
  ProjectionMatrixBeatEvidence,
  SourceCoordinate,
  SuppliedMatrix,
  SuppliedMatrixCell,
} from '../../remotion/compositions/explainer/expansion/representations/projection-matrix-types';
import {
  type ExpansionEntity,
  expansionEntityId,
} from '../../remotion/compositions/explainer/expansion/scene-types';
import {
  add,
  compare,
  compatibleBasis,
  decimalRational,
  divide,
  multiply,
  rational,
} from '../../remotion/compositions/explainer/expansion/value-logic';
import {
  type ExpansionBasis,
  type ExpansionEvidenceSpan,
  type ExpansionQuantity,
  type ExpansionRational,
  EXPANSION_LIMITS as L,
} from '../../remotion/compositions/explainer/expansion/value-types';
import { parseExpansionQuantity } from './expansion-quantity-contract';
import {
  expansionAssertedRelation,
  expansionEntities,
  expansionSourceLabel,
  expansionSourceSpan,
  expansionStoryBase,
} from './expansion-source-contract';
import { onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue, strictMechanismBeats } from './mechanism-contract';

const PHASES = ['setup', 'action', 'response', 'check', 'resolve'] as const;
const SCALAR = '[+-]?\\d+(?:\\.\\d{1,6})?(?:/\\d+)?';
function key(text: string): string {
  return text.normalize('NFKC').replace(/−/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
}
function lit(text: string): string {
  return key(text)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
}
function joined(labels: readonly string[]): string {
  return labels.map(lit).join('\\s+and\\s+');
}
function same(a: ExpansionEvidenceSpan, b: ExpansionEvidenceSpan): boolean {
  return a.fromWord === b.fromWord && a.toWord === b.toWord;
}
function list(raw: unknown, minimum: number, cap: number, ctx: ParseContext): Rec[] | null {
  return Array.isArray(raw) && raw.length >= minimum && raw.length <= cap && raw.every(isRec)
    ? raw
    : mechanismIssue(
        ctx,
        `require ${minimum}–${cap} complete records; overflow is never truncated`,
      );
}
function base(raw: Rec, ctx: ParseContext, id: '53' | '54') {
  if (
    !Number.isSafeInteger(ctx.win.startWord) ||
    !Number.isSafeInteger(ctx.win.endWord) ||
    ctx.win.startWord < 0 ||
    ctx.win.endWord >= ctx.words.length ||
    ctx.win.endWord < ctx.win.startWord ||
    ctx.words
      .slice(ctx.win.startWord, ctx.win.endWord + 1)
      .some(
        (word, index, words) =>
          !Number.isFinite(word.start) ||
          !Number.isFinite(word.end) ||
          word.end <= word.start ||
          word.start < ctx.win.startTime ||
          word.end > ctx.win.endTime ||
          (index > 0 && word.start < words[index - 1].end - 1e-7),
      )
  )
    return mechanismIssue(
      ctx,
      'all source words must be finite, positive, nonoverlapping and inside the complete window',
    );
  const b = expansionStoryBase(raw, ctx, id, [
    'template',
    'entities',
    'period',
    'population',
    'records',
    'relations',
    ...(id === '53' ? ['frames'] : []),
  ]);
  if (
    !b ||
    !strictMechanismBeats(
      raw,
      ctx,
      PHASES.map((phase) => `${phase}Word`),
      [1, 1, 1, 1],
      0.8,
    )
  )
    return null;
  const entities = expansionEntities(raw.entities, ctx, id);
  const period = expansionSourceLabel(raw.period, b.spans.setup, ctx, L.period);
  const population = expansionSourceLabel(raw.population, b.spans.setup, ctx, L.population);
  if (!entities || !period || !population) return null;
  const spans: ExpansionEvidenceSpan[] = [];
  for (const phase of PHASES) {
    const index = ctx.inWin(raw[`${phase}Word`]);
    if (index === null) return null;
    let end = index;
    while (end < ctx.win.endWord && !/[.!?;]$/.test(ctx.words[end].text)) end++;
    const evidence = expansionSourceSpan({ fromWord: index, toWord: end }, ctx);
    if (!evidence) return null;
    spans.push(evidence.span);
  }
  const [setup, action, response, check, resolve] = spans;
  if (!setup || !action || !response || !check || !resolve) return null;
  const sourceSpans: ProjectionMatrixBeatEvidence = { setup, action, response, check, resolve };
  const { treatment: _treatment, ...story } = b.story;
  return { ...b, story, entities, period, population, sourceSpans };
}
type Base = NonNullable<ReturnType<typeof base>>;
function scope(b: Base, body: string, denominator = ''): string {
  return `(?:${body}\\s+during\\s+${lit(b.period)}\\s+among\\s+${lit(b.population)}${denominator}|During\\s+${lit(b.period)}\\s+among\\s+${lit(b.population)}${denominator},\\s*${body})`;
}
function asserted(text: string, body: string, b: Base, condition?: string): boolean {
  return expansionAssertedRelation(text, new RegExp(body, 'i'), condition, [
    b.period,
    b.population,
    b.story.subject,
  ]);
}
function entity(raw: unknown, b: Base, ctx: ParseContext): ExpansionEntity | null {
  return (
    (typeof raw === 'string'
      ? b.entities.find((value) => key(value.label) === key(raw))
      : undefined) ??
    mechanismIssue(ctx, 'actor references must name an introduced source entity, not a caller ID')
  );
}
function qualification(raw: Rec, b: Base, ctx: ParseContext): MatrixQualification | null {
  if (raw.state === 'known' && !('qualifier' in raw) && !('condition' in raw))
    return { state: 'known' };
  if (
    raw.state === 'conditional' &&
    typeof raw.condition === 'string' &&
    raw.condition === b.story.condition &&
    !('qualifier' in raw)
  )
    return { state: 'conditional', condition: raw.condition };
  if (
    (raw.state === 'unknown' || raw.state === 'missing' || raw.state === 'disputed') &&
    raw.qualifier === raw.state &&
    !('condition' in raw)
  )
    return { state: raw.state, qualifier: raw.state };
  if (
    ((raw.state === 'illustrative' && raw.qualifier === 'teaching example') ||
      (raw.state === 'simulated' && raw.qualifier === 'simulation')) &&
    b.story.evidence === 'illustrative' &&
    !('condition' in raw)
  )
    return { state: raw.state, qualifier: String(raw.qualifier) };
  return mechanismIssue(
    ctx,
    'retain the exact fact/condition/absence/dispute/teaching qualification',
  );
}
function qualified(body: string, q: MatrixQualification): string {
  return q.state === 'illustrative' || q.state === 'simulated'
    ? `In\\s+this\\s+${lit(q.qualifier)},\\s*${body}`
    : body;
}
function conditionOf(q: MatrixQualification): string | undefined {
  return q.state === 'conditional' ? q.condition : undefined;
}
function unresolved(
  q: MatrixQualification,
): q is { readonly state: 'unknown' | 'missing' | 'disputed'; readonly qualifier: string } {
  return q.state === 'unknown' || q.state === 'missing' || q.state === 'disputed';
}

function coordinateProjection(
  raw: Rec,
  ctx: ParseContext,
): ExpansionCoordinateProjectionScene | null {
  const b = base(raw, ctx, '53');
  if (!b) return null;
  if (raw.template !== 'orthographic-xy' && raw.template !== 'reference-xy')
    return mechanismIssue(
      ctx,
      'coordinate projection only accepts orthographic-xy or reference-xy authored templates',
    );
  if (b.story.evidence !== 'illustrative')
    return mechanismIssue(ctx, 'keep the projection explicitly schematic, not measured geometry');
  const frameInputs = list(raw.frames, 1, L.actors, ctx),
    inputs = list(raw.records, 2, L.records, ctx),
    pairs = list(raw.relations, 1, L.relations, ctx);
  if (!frameInputs || !inputs || !pairs) return null;
  const frames: CoordinateFrame[] = [];
  for (const [index, entry] of frameInputs.entries()) {
    if (!onlyFields(entry, ['label', 'axes', 'evidence'], ctx)) return null;
    const evidence = expansionSourceSpan(entry.evidence, ctx);
    const label = evidence ? expansionSourceLabel(entry.label, evidence, ctx, L.actorLabel) : null;
    if (
      !evidence ||
      !label ||
      !same(evidence.span, b.sourceSpans.setup) ||
      !Array.isArray(entry.axes) ||
      entry.axes.length !== 2 ||
      !entry.axes.every(
        (axis: unknown, i: number) =>
          isRec(axis) &&
          onlyFields(axis, ['axis', 'positive'], ctx) &&
          axis.axis === (i === 0 ? 'x' : 'y') &&
          axis.positive === (i === 0 ? 'right' : 'up'),
      ) ||
      frames.some((frame) => key(frame.label) === key(label))
    )
      return mechanismIssue(
        ctx,
        'frames use only supplied identities and the authored rightward-x/upward-y axis reference',
      );
    frames.push({
      id: expansionEntityId('53', b.entities.length + index),
      label,
      axes: [
        { axis: 'x', positive: 'right' },
        { axis: 'y', positive: 'up' },
      ],
      evidence: evidence.span,
    });
  }
  const frame = (value: unknown) =>
    typeof value === 'string' ? frames.find((entry) => key(entry.label) === key(value)) : undefined;
  if (
    !asserted(
      b.spans.setup,
      scope(
        b,
        `${lit(b.story.subject)}\\s+(?:lists|names)\\s+${joined(b.entities.map((value) => value.label))}\\s+in\\s+${joined(frames.map((value) => value.label))}\\s+with\\s+rightward\\s+x\\s+and\\s+upward\\s+y\\s+axes`,
      ),
      b,
    )
  )
    return mechanismIssue(ctx, 'setup must supply the complete actors, frames and oriented axes');
  const records: SourceCoordinate[] = [];
  for (const [index, entry] of inputs.entries()) {
    if (!onlyFields(entry, ['actor', 'frame', 'axis', 'quantity'], ctx)) return null;
    const actor = entity(entry.actor, b, ctx),
      reference = frame(entry.frame);
    if (!actor || !reference || (entry.axis !== 'x' && entry.axis !== 'y'))
      return mechanismIssue(
        ctx,
        'coordinate records must reference introduced actors/frames and an authored x or y axis',
      );
    const quantity = parseExpansionQuantity(entry.quantity, ctx);
    if (
      !quantity ||
      key(quantity.actor) !== key(actor.label) ||
      key(quantity.claim) !== key(`${reference.label} ${entry.axis} coordinate`) ||
      key(quantity.basis.period) !== key(b.period) ||
      key(quantity.basis.population) !== key(b.population) ||
      !['metre', 'centimetre', 'millimetre', 'ratio'].includes(quantity.basis.unit) ||
      (quantity.state === 'conditional' && quantity.condition !== b.story.condition) ||
      records.some(
        (record) =>
          record.actorId === actor.id &&
          record.frameId === reference.id &&
          record.axis === entry.axis,
      )
    )
      return mechanismIssue(
        ctx,
        'coordinates must retain actor, axis, frame, signed value, status and exact source basis',
      );
    records.push({
      id: expansionEntityId('53', b.entities.length + frames.length + index),
      actorId: actor.id,
      frameId: reference.id,
      axis: entry.axis,
      quantity,
    });
  }
  const relations: CoordinateCorrespondence[] = [];
  for (const [index, entry] of pairs.entries()) {
    if (
      !onlyFields(
        entry,
        [
          'fromActor',
          'toActor',
          'fromFrame',
          'toFrame',
          'state',
          'qualifier',
          'condition',
          'evidence',
        ],
        ctx,
      )
    )
      return null;
    const from = entity(entry.fromActor, b, ctx),
      to = entity(entry.toActor, b, ctx),
      fromFrame = frame(entry.fromFrame),
      toFrame = frame(entry.toFrame),
      evidence = expansionSourceSpan(entry.evidence, ctx);
    if (
      !from ||
      !to ||
      !fromFrame ||
      !toFrame ||
      !evidence ||
      entry.qualifier !== 'schematic' ||
      (entry.state !== 'illustrative' && entry.state !== 'conditional') ||
      (entry.state === 'illustrative'
        ? 'condition' in entry
        : typeof entry.condition !== 'string' || entry.condition !== b.story.condition) ||
      relations.some(
        (pair) =>
          pair.fromActorId === from.id &&
          pair.toActorId === to.id &&
          pair.fromFrameId === fromFrame.id &&
          pair.toFrameId === toFrame.id,
      )
    )
      return mechanismIssue(
        ctx,
        'retain unique source correspondence endpoints, schematic qualification and the complete local condition',
      );
    const body = `In\\s+this\\s+schematic,\\s*(?:${lit(from.label)}\\s+in\\s+${lit(fromFrame.label)}\\s+corresponds\\s+to\\s+${lit(to.label)}\\s+in\\s+${lit(toFrame.label)}|${lit(to.label)}\\s+in\\s+${lit(toFrame.label)}\\s+is\\s+the\\s+supplied\\s+correspondence\\s+of\\s+${lit(from.label)}\\s+in\\s+${lit(fromFrame.label)})\\s+by\\s+${lit(raw.template)}\\s+projection`;
    if (
      !asserted(
        evidence.text,
        scope(b, body),
        b,
        entry.state === 'conditional' ? String(entry.condition) : undefined,
      )
    )
      return mechanismIssue(
        ctx,
        'projection is an explicitly schematic supplied correspondence, never calculated geometry',
      );
    const operands = records.filter(
      (record) =>
        (record.actorId === from.id && record.frameId === fromFrame.id) ||
        (record.actorId === to.id && record.frameId === toFrame.id),
    );
    if (
      !operands.some((record) => record.actorId === from.id && record.frameId === fromFrame.id) ||
      !operands.some((record) => record.actorId === to.id && record.frameId === toFrame.id) ||
      operands.some((record) => !compatibleBasis(record.quantity.basis, operands[0].quantity.basis))
    )
      return mechanismIssue(
        ctx,
        'correspondence endpoints must retain supplied coordinates on one compatible basis',
      );
    const common = {
      id: expansionEntityId('53', b.entities.length + frames.length + records.length + index),
      fromActorId: from.id,
      toActorId: to.id,
      fromFrameId: fromFrame.id,
      toFrameId: toFrame.id,
      qualifier: 'schematic' as const,
      evidence: evidence.span,
    };
    relations.push(
      entry.state === 'conditional'
        ? { ...common, state: 'conditional', condition: String(entry.condition) }
        : { ...common, state: 'illustrative' },
    );
  }
  if (
    !records.some((record) => same(record.quantity.evidence, b.sourceSpans.action)) ||
    !records.some((record) => same(record.quantity.evidence, b.sourceSpans.response)) ||
    !relations.some((relation) => same(relation.evidence, b.sourceSpans.check)) ||
    !asserted(
      b.spans.resolve,
      `${lit(b.story.subject)}\\s+(?:keeps\\s+only|preserves)\\s+supplied\\s+coordinates`,
      b,
    )
  )
    return null;
  return {
    ...b.story,
    storyId: '53',
    kind: 'geometry-projection',
    preset: 'coordinates',
    template: raw.template,
    entities: b.entities,
    frames,
    records,
    relations,
    period: b.period,
    population: b.population,
    sourceSpans: b.sourceSpans,
    meaning: 'supplied-coordinates-only',
  };
}

function inputRational(raw: unknown, ctx: ParseContext): ExpansionRational | null {
  if (
    !isRec(raw) ||
    !onlyFields(raw, ['numerator', 'denominator'], ctx) ||
    typeof raw.numerator !== 'number' ||
    typeof raw.denominator !== 'number' ||
    raw.denominator <= 0
  )
    return null;
  const value = rational(raw.numerator, raw.denominator);
  return value.ok ? value.value : mechanismIssue(ctx, `exact rational rejected: ${value.error}`);
}
function sourceRational(text: string): ExpansionRational | null {
  const [first, second] = text.split('/');
  const left = decimalRational(first);
  if (!left.ok) return null;
  if (second === undefined) return left.value;
  const right = decimalRational(second);
  if (!right.ok || right.value.numerator <= 0) return null;
  const result = divide(left.value, right.value);
  return result.ok ? result.value : null;
}
function basis(raw: unknown, b: Base, ctx: ParseContext): ExpansionBasis | null {
  if (
    !isRec(raw) ||
    !onlyFields(raw, ['unit', 'period', 'population', 'denominator'], ctx) ||
    raw.unit !== 'ratio' ||
    raw.period !== b.period ||
    raw.population !== b.population
  )
    return mechanismIssue(
      ctx,
      'matrix operands are dimensionless ratios on the exact supplied period/population basis',
    );
  const denominator =
    raw.denominator === undefined ? undefined : inputRational(raw.denominator, ctx);
  if (denominator === null || (denominator && denominator.numerator <= 0))
    return mechanismIssue(
      ctx,
      'matrix reference denominator must be an exact finite positive rational',
    );
  return {
    unit: 'ratio',
    period: b.period,
    population: b.population,
    ...(denominator ? { denominator } : {}),
  };
}
function labels(raw: unknown, text: string, ctx: ParseContext): string[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 4)
    return mechanismIssue(ctx, 'matrix axes must contain one to four supplied labels');
  const result: string[] = [];
  for (const entry of raw) {
    const value = expansionSourceLabel(entry, text, ctx, 20);
    if (!value || result.some((label) => key(label) === key(value)))
      return mechanismIssue(
        ctx,
        'matrix axis identities must be unique bounded labels quoted in the operand assertion',
      );
    result.push(value);
  }
  return result;
}
function mergedQualification(
  request: MatrixQualification,
  left: MatrixQualification,
  right: MatrixQualification,
  ctx: ParseContext,
): MatrixQualification | null {
  const qualifiedInputs = [request, left, right].filter(
    (value) => value.state !== 'known' && !unresolved(value),
  );
  if (qualifiedInputs.some((value) => JSON.stringify(value) !== JSON.stringify(qualifiedInputs[0])))
    return mechanismIssue(
      ctx,
      'mixed conditions or teaching qualifications cannot be promoted into an unqualified product',
    );
  return qualifiedInputs[0] ?? { state: 'known' };
}

function matrixProduct(raw: Rec, ctx: ParseContext): ExpansionMatrixProductScene | null {
  const b = base(raw, ctx, '54');
  if (!b) return null;
  if (raw.template !== 'row-column-product')
    return mechanismIssue(
      ctx,
      'matrix-product only accepts the authored row-column-product template',
    );
  if (
    !asserted(
      b.spans.setup,
      scope(
        b,
        `${lit(b.story.subject)}\\s+(?:lists|names)\\s+${joined(b.entities.map((entry) => entry.label))}`,
      ),
      b,
    )
  )
    return mechanismIssue(
      ctx,
      'matrix setup must explicitly introduce the exact supplied actor set and period/population',
    );
  const inputs = list(raw.records, 2, L.records, ctx),
    pairs = list(raw.relations, 1, L.relations, ctx);
  if (!inputs || !pairs) return null;
  const records: SuppliedMatrix[] = [];
  for (const [index, entry] of inputs.entries()) {
    if (
      !onlyFields(
        entry,
        [
          'actor',
          'label',
          'claim',
          'basis',
          'rows',
          'columns',
          'values',
          'state',
          'qualifier',
          'condition',
          'evidence',
        ],
        ctx,
      )
    )
      return null;
    const actor = entity(entry.actor, b, ctx),
      evidence = expansionSourceSpan(entry.evidence, ctx),
      q = qualification(entry, b, ctx),
      dimension = basis(entry.basis, b, ctx);
    if (!actor || !evidence || !q || !dimension) return null;
    const label = expansionSourceLabel(entry.label, evidence, ctx, L.actorLabel),
      claim = expansionSourceLabel(entry.claim, evidence, ctx, L.claim),
      rowLabels = labels(entry.rows, evidence.text, ctx),
      columnLabels = labels(entry.columns, evidence.text, ctx);
    if (
      !label ||
      !claim ||
      !rowLabels ||
      !columnLabels ||
      records.some((record) => key(record.label) === key(label))
    )
      return mechanismIssue(
        ctx,
        'matrix labels/claims and unique row/column identities must belong to this complete operand assertion',
      );
    const absent = unresolved(q),
      count = rowLabels.length * columnLabels.length;
    if (
      absent
        ? 'values' in entry
        : !Array.isArray(entry.values) ||
          entry.values.length !== rowLabels.length ||
          !entry.values.every(
            (row: unknown) => Array.isArray(row) && row.length === columnLabels.length,
          )
    )
      return mechanismIssue(
        ctx,
        'matrix values must be complete 4×4-bounded operands; absent/disputed matrices never acquire zero cells',
      );
    // Denominator is a separate source slot, never an ordinal cell capture.
    const denom = dimension.denominator ? `\\s+with\\s+denominator\\s+${SCALAR}` : '';
    const values = absent
      ? lit(q.state)
      : Array.from({ length: count }, () => `(${SCALAR})`).join('\\s*,\\s*');
    const intro = `${lit(actor.label)}\\s+${lit(label)}\\s+${lit(claim)}\\s+matrix\\s+(?:has|supplies)\\s+rows\\s+${joined(rowLabels)}\\s+and\\s+columns\\s+${joined(columnLabels)}\\s+with\\s+values\\s+${values}\\s+ratio`;
    const body = qualified(scope(b, intro, denom), q);
    if (!asserted(evidence.text, body, b, conditionOf(q)))
      return mechanismIssue(
        ctx,
        'matrix assertion must bind actor, claim, axes, every row-major signed cell, qualification and basis',
      );
    const full = conditionOf(q)
      ? `(?:${lit(conditionOf(q) ?? '')},\\s*${body}|${body},?\\s+${lit(conditionOf(q) ?? '')})`
      : body;
    const match = new RegExp(`^(?:${full})[.;]$`, 'i').exec(key(evidence.text));
    if (!match)
      return mechanismIssue(
        ctx,
        'retain the complete unambiguous signed matrix assertion and source condition',
      );
    const captures = match.slice(1).filter((value): value is string => value !== undefined);
    if (dimension.denominator) {
      const notation = new RegExp(`\\bwith\\s+denominator\\s+(${SCALAR})`, 'i').exec(
        key(evidence.text),
      )?.[1];
      const supplied = notation ? sourceRational(notation) : null;
      const equality = supplied ? compare(supplied, dimension.denominator) : null;
      if (!equality?.ok || equality.value !== 0)
        return mechanismIssue(
          ctx,
          'matrix denominator must exactly match its own source assertion',
        );
    }
    const id = expansionEntityId('54', b.entities.length + index);
    const rows = rowLabels.map((label, i) => ({
      id: `${id}-row-${i}`,
      label,
      evidence: evidence.span,
    }));
    const columns = columnLabels.map((label, i) => ({
      id: `${id}-column-${i}`,
      label,
      evidence: evidence.span,
    }));
    const cells: SuppliedMatrixCell[] = [];
    if (!absent && Array.isArray(entry.values))
      for (let r = 0; r < rows.length; r++)
        for (let c = 0; c < columns.length; c++) {
          const inputRow: unknown = entry.values[r];
          if (!Array.isArray(inputRow)) return null;
          const value = inputRational(inputRow[c], ctx),
            supplied = sourceRational(captures[r * columns.length + c]);
          const equality = value && supplied ? compare(value, supplied) : null;
          if (!value || !equality?.ok || equality.value !== 0)
            return mechanismIssue(
              ctx,
              'every matrix cell must retain its exact supplied signed rational',
            );
          // This branch is reachable only for an asserted, complete, qualified numeric matrix.
          if (unresolved(q))
            return mechanismIssue(ctx, 'unresolved matrices cannot supply numeric cells');
          const quantity: ExpansionQuantity = {
            actor: actor.label,
            claim,
            basis: dimension,
            evidence: evidence.span,
            ...q,
            amount: { kind: 'rational', value, notation: captures[r * columns.length + c] },
          };
          cells.push({
            id: `${id}-cell-${r}-${c}`,
            rowId: rows[r].id,
            columnId: columns[c].id,
            quantity,
          });
        }
    records.push({
      id,
      actorId: actor.id,
      label,
      claim,
      basis: dimension,
      rows,
      columns,
      cells,
      evidence: evidence.span,
      ...q,
    });
  }
  const relations: MatrixProductRequest[] = [],
    products: MatrixProduct[] = [];
  for (const [index, entry] of pairs.entries()) {
    if (
      !onlyFields(
        entry,
        ['actor', 'left', 'right', 'operation', 'state', 'qualifier', 'condition', 'evidence'],
        ctx,
      )
    )
      return null;
    const actor = entity(entry.actor, b, ctx),
      evidence = expansionSourceSpan(entry.evidence, ctx),
      q = qualification(entry, b, ctx);
    const left =
      typeof entry.left === 'string'
        ? records.find((record) => key(record.label) === key(String(entry.left)))
        : undefined;
    const right =
      typeof entry.right === 'string'
        ? records.find((record) => key(record.label) === key(String(entry.right)))
        : undefined;
    if (
      !actor ||
      !evidence ||
      !q ||
      unresolved(q) ||
      !left ||
      !right ||
      entry.operation !== 'matrix-product' ||
      relations.some((relation) => relation.leftId === left.id && relation.rightId === right.id) ||
      left.actorId !== actor.id ||
      right.actorId !== actor.id ||
      key(left.claim) !== key(right.claim) ||
      !compatibleBasis(left.basis, right.basis) ||
      left.columns.length !== right.rows.length ||
      left.columns.some((column, i) => key(column.label) !== key(right.rows[i].label))
    )
      return mechanismIssue(
        ctx,
        'matrix-product requires exact actor/claim/basis and compatible inner axis identities, not just matching dimensions',
      );
    const body = scope(
      b,
      `${lit(actor.label)}\\s+(?:requests\\s+the\\s+worked|asks\\s+to\\s+work\\s+the)\\s+matrix-product\\s+calculation\\s+for\\s+${lit(left.claim)}\\s+using\\s+${lit(left.label)}\\s+times\\s+${lit(right.label)}`,
    );
    if (!asserted(evidence.text, qualified(body, q), b, conditionOf(q)))
      return mechanismIssue(
        ctx,
        'only an explicit source worked matrix-product calculation authorizes arithmetic',
      );
    const productQualification = mergedQualification(q, left, right, ctx);
    if (!productQualification) return null;
    const id = expansionEntityId('54', b.entities.length + records.length + index);
    const request: MatrixProductRequest = {
      id,
      actorId: actor.id,
      leftId: left.id,
      rightId: right.id,
      operation: 'matrix-product',
      evidence: evidence.span,
      ...q,
    };
    relations.push(request);
    const common = {
      id: `${id}-product`,
      requestId: id,
      operandIds: [left.id, right.id] as const,
      rows: left.rows,
      columns: right.columns,
      qualification: productQualification,
    };
    if (unresolved(left) || unresolved(right)) {
      products.push({ ...common, state: 'unavailable', reason: 'unresolved-operands', cells: [] });
      continue;
    }
    const cells: DerivedMatrixCell[] = [];
    for (let r = 0; r < left.rows.length; r++)
      for (let c = 0; c < right.columns.length; c++) {
        const terms: ExactMatrixTerm[] = [];
        let result: ExpansionRational = { numerator: 0, denominator: 1 };
        for (let k = 0; k < left.columns.length; k++) {
          const a = left.cells[r * left.columns.length + k],
            z = right.cells[k * right.columns.length + c];
          if (
            !a ||
            !z ||
            !('amount' in a.quantity) ||
            !('amount' in z.quantity) ||
            a.quantity.amount.kind !== 'rational' ||
            z.quantity.amount.kind !== 'rational'
          )
            return null;
          const term = multiply(a.quantity.amount.value, z.quantity.amount.value);
          if (!term.ok)
            return mechanismIssue(ctx, `bounded matrix product rejected: ${term.error}`);
          const sum = add(result, term.value);
          if (!sum.ok) return mechanismIssue(ctx, `bounded matrix sum rejected: ${sum.error}`);
          terms.push({
            leftCellId: a.id,
            rightCellId: z.id,
            operands: [a.quantity.amount.value, z.quantity.amount.value],
            product: term.value,
          });
          result = sum.value;
        }
        cells.push({
          id: `${id}-product-cell-${r}-${c}`,
          rowId: left.rows[r].id,
          columnId: right.columns[c].id,
          state: 'derived',
          operation: 'matrix-product',
          terms,
          result,
          basis: left.basis,
          evidence: [left.evidence, right.evidence, evidence.span],
        });
      }
    products.push({ ...common, state: 'derived', operation: 'matrix-product', cells });
  }
  if (
    !records.some((record) => same(record.evidence, b.sourceSpans.action)) ||
    !records.some((record) => same(record.evidence, b.sourceSpans.response)) ||
    !relations.some((request) => same(request.evidence, b.sourceSpans.check)) ||
    !asserted(
      b.spans.resolve,
      `${lit(b.story.subject)}\\s+(?:keeps|retains)\\s+the\\s+supplied\\s+operands`,
      b,
    )
  )
    return null;
  return {
    ...b.story,
    storyId: '54',
    kind: 'linear-algebra',
    preset: 'matrix-product',
    template: 'row-column-product',
    entities: b.entities,
    records,
    relations,
    products,
    period: b.period,
    population: b.population,
    sourceSpans: b.sourceSpans,
  };
}

/** Keep otherwise-silent fail-closed branches visible to the planner review pass. */
export function parseExpansionCoordinateProjection(
  raw: Rec,
  ctx: ParseContext,
): ExpansionCoordinateProjectionScene | null {
  const before = ctx.issues.length;
  const scene = coordinateProjection(raw, ctx);
  return (
    scene ??
    (ctx.issues.length === before
      ? mechanismIssue(
          ctx,
          'coordinate projection requires the exact authored template, axis/frame identities, schematic qualification and complete source facts',
        )
      : null)
  );
}
export function parseExpansionMatrixProduct(
  raw: Rec,
  ctx: ParseContext,
): ExpansionMatrixProductScene | null {
  const before = ctx.issues.length;
  const scene = matrixProduct(raw, ctx);
  return (
    scene ??
    (ctx.issues.length === before
      ? mechanismIssue(
          ctx,
          'matrix product requires complete source-bound operands, exact dimensions and an authored worked-calculation request',
        )
      : null)
  );
}
