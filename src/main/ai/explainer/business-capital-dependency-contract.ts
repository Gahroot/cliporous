import { capitalDependencyReadingFits } from '../../remotion/compositions/explainer/business/capital/dependency-presentation';
import type {
  CapitalDependencyFirm,
  CapitalDependencyLens,
} from '../../remotion/compositions/explainer/business/capital/dependency-types';
import type { BusinessWordSpan } from '../../remotion/compositions/explainer/business/types';
import type { DiagramStory } from '../../remotion/compositions/explainer/diagrams/types';
import type { FinanceActor } from '../../remotion/compositions/explainer/finance/types';
import {
  boundedBusinessInput,
  businessEvidenceText,
  businessIdentity,
  businessSpan,
} from './business-contract';
import { escaped } from './concept-business-operations-contract';
import { distinctActors } from './finance-contract';
import { onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

function clause(source: BusinessWordSpan, pattern: string, ctx: ParseContext): boolean {
  const before = ctx.words[source.fromWord - 1]?.text ?? '';
  return (
    (source.fromWord === ctx.win.startWord || /[.!?;]$/u.test(before)) &&
    /[.!?;]$/u.test(ctx.words[source.toWord]?.text ?? '') &&
    new RegExp(`^${pattern}[.]?$`, 'iu').test(businessEvidenceText(source, ctx))
  );
}
function inPhase(
  source: BusinessWordSpan,
  raw: Rec,
  fromField: string,
  toField: string,
  ctx: ParseContext,
): boolean {
  const from = ctx.inWin(raw[fromField]),
    to = ctx.inWin(raw[toField]);
  return from !== null && to !== null && source.fromWord >= from && source.toWord < to;
}
function setupClause(raw: Rec, pattern: string, ctx: ParseContext): boolean {
  const from = ctx.inWin(raw.setupWord),
    to = ctx.inWin(raw.actionWord);
  if (from === null || to === null) return false;
  let start = from;
  for (let end = from; end < to; end++) {
    if (!/[.!?;]$/u.test(ctx.words[end]?.text ?? '')) continue;
    if (clause({ fromWord: start, toWord: end }, pattern, ctx)) return true;
    start = end + 1;
  }
  return false;
}

/** Opt-in OP-58 refinement, never an inference from the historical direct fund/driver graph. */
export function parseCapitalDependencyLens(
  raw: Rec,
  ctx: ParseContext,
  funds: readonly FinanceActor[],
  exposure: FinanceActor,
  story: DiagramStory,
): CapitalDependencyLens | null {
  if (!boundedBusinessInput(raw, ctx) || !isRec(raw)) return null;
  const value = raw.dependencyLens;
  if (
    raw.preset !== 'shared-driver' ||
    story.condition ||
    (story.evidence !== 'source-stated' && story.evidence !== 'illustrative') ||
    !Array.isArray(raw.holdings) ||
    raw.holdings.length !== 0 ||
    funds.length !== 2 ||
    !isRec(value) ||
    !onlyFields(value, ['version', 'firms', 'modelSource'], ctx) ||
    value.version !== 1 ||
    !Array.isArray(value.firms) ||
    value.firms.length !== 2
  )
    return mechanismIssue(
      ctx,
      'dependency lens v1 requires two distinct source funds/firms, empty legacy holdings and explicit qualitative evidence',
    );
  if (
    funds.some((fund) => !setupClause(raw, `${escaped(fund.label)} is a fund`, ctx)) ||
    !setupClause(raw, `${escaped(exposure.label)} is a (?:common|shared) driver`, ctx)
  )
    return mechanismIssue(
      ctx,
      'dependency fund/driver identities need complete positive setup clauses',
    );
  const firms: CapitalDependencyFirm[] = [];
  for (const entry of value.firms) {
    if (
      !isRec(entry) ||
      !onlyFields(entry, ['fundId', 'identity', 'holdingSource', 'driverSource'], ctx)
    )
      return null;
    const fund = funds.find((candidate) => candidate.id === entry.fundId);
    const identity = businessIdentity(entry.identity, ctx);
    const holdingSource = businessSpan(entry.holdingSource, ctx);
    const driverSource = businessSpan(entry.driverSource, ctx);
    if (
      !fund ||
      !identity ||
      !holdingSource ||
      !driverSource ||
      firms.some((firm) => firm.fundId === fund.id) ||
      !inPhase(identity.source, raw, 'setupWord', 'actionWord', ctx) ||
      !clause(identity.source, `${escaped(identity.label)} is a company`, ctx) ||
      !inPhase(holdingSource, raw, 'actionWord', 'responseWord', ctx) ||
      !clause(holdingSource, `${escaped(fund.label)} holds ${escaped(identity.label)}`, ctx) ||
      !inPhase(driverSource, raw, 'responseWord', 'checkWord', ctx) ||
      !clause(driverSource, `${escaped(identity.label)} depends on ${escaped(exposure.label)}`, ctx)
    )
      return mechanismIssue(
        ctx,
        'each fund/firm holding and firm/driver edge needs its complete local positive clause; no swaps, cropped conditions or invented exposure',
      );
    firms.push({ fundId: fund.id, identity, holdingSource, driverSource });
  }
  if (!distinctActors([...funds, exposure, ...firms.map((firm) => firm.identity)]))
    return mechanismIssue(
      ctx,
      'funds, two different firms and common driver retain distinct stable identities',
    );
  firms.sort((a, b) => (a.fundId < b.fundId ? -1 : a.fundId > b.fundId ? 1 : 0));
  const modelSource = businessSpan(value.modelSource, ctx);
  const finalHoldSeconds = ctx.win.endTime - story.resolveAt;
  if (
    !modelSource ||
    !inPhase(modelSource, raw, 'actionWord', 'responseWord', ctx) ||
    !clause(
      modelSource,
      `${escaped(funds[0].label)} and ${escaped(funds[1].label)} maintain asset ownership and economic claim records`,
      ctx,
    ) ||
    !Number.isFinite(finalHoldSeconds) ||
    finalHoldSeconds < 0.8
  )
    return mechanismIssue(
      ctx,
      'dependency record models need explicit source meaning and an actual >=0.8s final source hold; inspection is not payout or risk',
    );
  const lens: CapitalDependencyLens = { version: 1, firms, modelSource, finalHoldSeconds };
  if (!capitalDependencyReadingFits(story, funds, exposure, lens))
    return mechanismIssue(
      ctx,
      'complete dependency facts must fit fixed-font rails and >=1.5s reading time after the actual handoff',
    );
  return lens;
}
