import { SHARED_DEPENDENCY_SOURCE_FIXTURES } from '../../remotion/compositions/explainer/business/capital/dependency-fixtures';
import { DIAGRAM_LAYOUTS } from '../../remotion/compositions/explainer/diagrams/types';
import type {
  FinanceActor,
  FlowTransfer,
  FundFlowScene,
  OwnershipChangeScene,
  PortfolioExposureScene,
} from '../../remotion/compositions/explainer/finance/types';
import type { SceneCue } from '../../remotion/compositions/explainer/types';
import { parseCapitalDependencyLens } from './business-capital-dependency-contract';
import { escaped } from './concept-business-operations-contract';
import {
  actorPattern,
  conservesMoney,
  distinctActors,
  financeActor,
  financeClaim,
  moneyPattern,
  parseMoney,
  sameCurrency,
  shareCount,
  validOwnership,
} from './finance-contract';
import { hybridPhrase, hybridStory, includesPhrase, onlyFields } from './hybrid-contract';
import { isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

function actors(raw: unknown, ctx: ParseContext): FinanceActor[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 2) return null;
  const parsed = raw.map((entry) => financeActor(entry, ctx));
  if (parsed.some((actor) => !actor)) return null;
  return parsed.flatMap((actor) => (actor ? [actor] : []));
}
function transfers(
  raw: unknown,
  from: FinanceActor[],
  to: FinanceActor[],
  ctx: ParseContext,
): FlowTransfer[] | null {
  if (!Array.isArray(raw) || raw.length !== Math.max(from.length, to.length)) return null;
  const parsed: FlowTransfer[] = [];
  for (const [i, value] of raw.entries()) {
    if (
      !isRec(value) ||
      !onlyFields(value, ['from', 'to', 'amount'], ctx) ||
      value.from !== from[Math.min(i, from.length - 1)].id ||
      value.to !== to[Math.min(i, to.length - 1)].id ||
      !isRec(value.amount)
    )
      return null;
    if (value.amount.state === 'qualitative' && onlyFields(value.amount, ['state'], ctx)) {
      parsed.push({ from: value.from, to: value.to, amount: { state: 'qualitative' } });
    } else if (
      value.amount.state === 'measured' &&
      onlyFields(value.amount, ['state', 'money'], ctx)
    ) {
      const money = parseMoney(value.amount.money, ctx);
      if (!money || money.minorUnits === 0) return null;
      parsed.push({ from: value.from, to: value.to, amount: { state: 'measured', money } });
    } else return null;
  }
  return parsed;
}
export function parseFundFlow(raw: Rec, ctx: ParseContext): FundFlowScene | null {
  const parsed = hybridStory(raw, ctx, [
    'account',
    'sources',
    'targets',
    'contributions',
    'deployments',
    'retained',
    'period',
  ]);
  if (!parsed) return null;
  const preset = raw.preset;
  if (preset !== 'capital-deployment' && preset !== 'proceeds-distribution')
    return mechanismIssue(ctx, 'unsupported fund-flow preset');
  const account = financeActor(raw.account, ctx),
    sources = actors(raw.sources, ctx),
    targets = actors(raw.targets, ctx);
  const period = hybridPhrase(raw.period, ctx, 28);
  if (
    !account ||
    !sources ||
    !targets ||
    !period ||
    !includesPhrase(parsed.spans.setup, period) ||
    !distinctActors([account, ...sources, ...targets]) ||
    account.label !== parsed.story.subject
  )
    return mechanismIssue(
      ctx,
      'fund needs distinct source-named actors, a fund subject and a setup-stated period/event',
    );
  const contributions = transfers(raw.contributions, sources, [account], ctx),
    deployments = transfers(raw.deployments, [account], targets, ctx);
  const retained =
    raw.retained === undefined || raw.retained === null ? null : parseMoney(raw.retained, ctx);
  if (!contributions || !deployments || (raw.retained != null && !retained))
    return mechanismIssue(ctx, 'bounded directed transfers with explicit amount states required');
  const all = [...contributions, ...deployments];
  const quantitative = all.every((edge) => edge.amount.state === 'measured');
  if (!quantitative && (all.some((edge) => edge.amount.state === 'measured') || retained))
    return mechanismIssue(ctx, 'do not mix measured and unscaled qualitative money flows');
  if (
    quantitative &&
    !conservesMoney(
      contributions.flatMap((e) => (e.amount.state === 'measured' ? [e.amount.money] : [])),
      deployments.flatMap((e) => (e.amount.state === 'measured' ? [e.amount.money] : [])),
      retained,
    )
  )
    return mechanismIssue(
      ctx,
      'source-stated inputs must equal deployments plus stated retained money in one currency',
    );
  const suffix = `(?: (?:during|in|for) ${escaped(period)})?`;
  const inputVerb =
    preset === 'capital-deployment'
      ? '(?:contributes?|invests?|deposits?)'
      : '(?:pays?|sends?|remits?)';
  const outputVerb =
    preset === 'capital-deployment'
      ? '(?:deploys?|invests?|sends?)'
      : '(?:distributes?|pays?|returns?)';
  for (const [i, edge] of contributions.entries()) {
    const quantity =
      edge.amount.state === 'measured'
        ? moneyPattern(edge.amount.money)
        : '(?:capital|money|proceeds)';
    if (
      !financeClaim(
        parsed.spans.action,
        `${actorPattern(sources[i])} ${inputVerb} ${quantity} (?:to|into|in) ${actorPattern(account)}${suffix}`,
        parsed.story.condition,
      )
    )
      return mechanismIssue(
        ctx,
        'contribution/proceeds evidence must bind the source actor, amount, currency, fund and period in the action span',
      );
  }
  for (const [i, edge] of deployments.entries()) {
    const quantity =
      edge.amount.state === 'measured'
        ? moneyPattern(edge.amount.money)
        : '(?:capital|money|proceeds)';
    if (
      !financeClaim(
        parsed.spans.response,
        `${actorPattern(account)} ${outputVerb} ${quantity} (?:to|into|in) ${actorPattern(targets[i])}${suffix}`,
        parsed.story.condition,
      )
    )
      return mechanismIssue(
        ctx,
        'deployment/distribution evidence must bind fund, amount and recipient in the response span',
      );
  }
  if (
    retained &&
    !financeClaim(
      parsed.spans.check,
      `${actorPattern(account)} (?:retains?|keeps?) ${moneyPattern(retained)}${suffix}`,
      parsed.story.condition,
    )
  )
    return mechanismIssue(ctx, 'retained money must be explicitly stated in the check span');
  if (
    !/^(?:capital reaches investments|proceeds reach investors|money follows the stated paths)$/i.test(
      parsed.story.outcome,
    )
  )
    return mechanismIssue(
      ctx,
      'resolve the payment relationship, not an invented return, fee or profit',
    );
  return {
    kind: 'fund-flow',
    preset,
    ...parsed.story,
    account,
    sources,
    targets,
    contributions,
    deployments,
    retained,
    period,
  };
}

export function parseOwnershipChange(raw: Rec, ctx: ParseContext): OwnershipChangeScene | null {
  const parsed = hybridStory(raw, ctx, [
    'holder',
    'company',
    'shares',
    'beforeTotal',
    'issued',
    'afterTotal',
    'beforePercent',
    'afterPercent',
    'valuation',
  ]);
  if (!parsed) return null;
  const preset = raw.preset;
  if (preset !== 'share-issue' && preset !== 'stake-value-separation')
    return mechanismIssue(ctx, 'unsupported ownership preset');
  const holder = financeActor(raw.holder, ctx),
    company = financeActor(raw.company, ctx);
  const shares = shareCount(raw.shares),
    beforeTotal = shareCount(raw.beforeTotal),
    issued = shareCount(raw.issued, preset === 'stake-value-separation'),
    afterTotal = shareCount(raw.afterTotal);
  const beforePercent = raw.beforePercent,
    afterPercent = raw.afterPercent;
  if (
    !holder ||
    !company ||
    !distinctActors([holder, company]) ||
    company.label !== parsed.story.subject ||
    shares === null ||
    beforeTotal === null ||
    issued === null ||
    afterTotal === null ||
    typeof beforePercent !== 'number' ||
    typeof afterPercent !== 'number' ||
    !validOwnership(shares, beforeTotal, issued, afterTotal, beforePercent, afterPercent)
  )
    return mechanismIssue(
      ctx,
      'retain safe-integer shares; after total must equal before plus issued, and both stated percentages must match their denominators',
    );
  const h = actorPattern(holder),
    c = actorPattern(company),
    condition = parsed.story.condition;
  if (
    !financeClaim(
      parsed.spans.setup,
      `${h} (?:owns?|holds?) ${shares} of ${beforeTotal} shares (?:in|of) ${c}`,
      condition,
    ) ||
    !financeClaim(
      parsed.spans.setup,
      `${h} (?:owns?|holds?) ${beforePercent}(?: percent|%) of ${c}`,
      condition,
    ) ||
    !financeClaim(parsed.spans.action, `${c} (?:issues?|adds?) ${issued} new shares`, condition) ||
    !financeClaim(
      parsed.spans.response,
      `${h} (?:keeps?|retains?|still owns?) ${shares} of ${afterTotal} shares (?:in|of) ${c}`,
      condition,
    ) ||
    !financeClaim(
      parsed.spans.check,
      `${h} (?:now owns?|now holds?|holds?) ${afterPercent}(?: percent|%) of ${c}`,
      condition,
    )
  )
    return mechanismIssue(
      ctx,
      'bind holder, company, share counts and each percentage to the corresponding local ownership beat',
    );
  let valuation: OwnershipChangeScene['valuation'];
  if (
    isRec(raw.valuation) &&
    raw.valuation.state === 'unknown' &&
    onlyFields(raw.valuation, ['state'], ctx)
  ) {
    if (
      !/\b(?:value|valuation) (?:is )?(?:not stated|unstated|unknown)\b/i.test(parsed.spans.check)
    )
      return mechanismIssue(ctx, 'unknown valuation must remain explicitly unstated in the source');
    valuation = { state: 'unknown' };
  } else if (
    isRec(raw.valuation) &&
    raw.valuation.state === 'measured' &&
    onlyFields(raw.valuation, ['state', 'before', 'after'], ctx)
  ) {
    const before = parseMoney(raw.valuation.before, ctx),
      after = parseMoney(raw.valuation.after, ctx);
    if (
      !before ||
      !after ||
      !sameCurrency([before, after]) ||
      !financeClaim(
        parsed.spans.check,
        `${c} before valuation is ${moneyPattern(before)}`,
        condition,
      ) ||
      !financeClaim(parsed.spans.check, `${c} after valuation is ${moneyPattern(after)}`, condition)
    )
      return mechanismIssue(
        ctx,
        'company valuations need explicit before/after evidence in a compatible currency; no inferred holder loss',
      );
    valuation = { state: 'measured', before, after };
  } else
    return mechanismIssue(
      ctx,
      'valuation must be explicitly unknown or two source-stated compatible company values',
    );
  if (
    !/^(?:Share count stays the same|Percentage and value are different)$/i.test(
      parsed.story.outcome,
    )
  )
    return mechanismIssue(ctx, 'do not convert percentage dilution into an unstated value loss');
  return {
    kind: 'ownership-change',
    preset,
    ...parsed.story,
    holder,
    company,
    shares,
    beforeTotal,
    issued,
    afterTotal,
    beforePercent,
    afterPercent,
    valuation,
  };
}

export function parsePortfolioExposure(raw: Rec, ctx: ParseContext): PortfolioExposureScene | null {
  const parsed = hybridStory(raw, ctx, ['funds', 'exposure', 'holdings', 'dependencyLens']);
  if (!parsed) return null;
  const preset = raw.preset;
  if (preset !== 'shared-holdings' && preset !== 'shared-driver')
    return mechanismIssue(ctx, 'unsupported portfolio preset');
  const funds = actors(raw.funds, ctx),
    exposure = financeActor(raw.exposure, ctx);
  if (
    !funds ||
    funds.length !== 2 ||
    !exposure ||
    !distinctActors([...funds, exposure]) ||
    funds.some((fund) => !includesPhrase(parsed.spans.setup, fund.label))
  )
    return mechanismIssue(
      ctx,
      'two distinct source-introduced funds and a named exposure required',
    );
  const dependencyLens =
    raw.dependencyLens === undefined
      ? undefined
      : parseCapitalDependencyLens(raw, ctx, funds, exposure, parsed.story);
  if (raw.dependencyLens !== undefined && !dependencyLens) return null;
  if (!Array.isArray(raw.holdings) || raw.holdings.length > 6)
    return mechanismIssue(ctx, 'holdings are bounded to six explicit entries');
  const holdings: PortfolioExposureScene['holdings'] = [];
  for (const value of raw.holdings) {
    if (!isRec(value) || !onlyFields(value, ['fundId', 'holding'], ctx)) return null;
    const fund = funds.find((f) => f.id === value.fundId),
      holding = financeActor(value.holding, ctx);
    if (
      !fund ||
      !holding ||
      funds.some((f) => f.id === holding.id || f.label === holding.label) ||
      holdings.some(
        (h) =>
          (h.fundId === fund.id && h.holding.id === holding.id) ||
          (h.holding.id === holding.id && h.holding.label !== holding.label) ||
          (h.holding.label === holding.label && h.holding.id !== holding.id),
      )
    )
      return mechanismIssue(
        ctx,
        'holding identity must be consistent across funds; no duplicate or relabelled company',
      );
    if (
      !financeClaim(
        parsed.spans.action,
        `${actorPattern(fund)} (?:holds?|owns?) ${actorPattern(holding)}`,
        parsed.story.condition,
      )
    )
      return mechanismIssue(
        ctx,
        'each holding must belong to the stated fund in local action evidence',
      );
    holdings.push({ fundId: fund.id, holding });
  }
  if (preset === 'shared-holdings') {
    if (
      funds.some(
        (fund) =>
          !holdings.some(
            (h) =>
              h.fundId === fund.id &&
              h.holding.id === exposure.id &&
              h.holding.label === exposure.label,
          ),
      ) ||
      funds.some((fund) => holdings.filter((h) => h.fundId === fund.id).length > 3)
    )
      return mechanismIssue(
        ctx,
        'shared holding must be explicitly present in both funds with one stable identity; at most three per fund',
      );
  } else if (
    !dependencyLens &&
    (holdings.length ||
      funds.some(
        (fund) =>
          !financeClaim(
            parsed.spans.action,
            `${actorPattern(fund)} (?:is exposed to|depends on|is affected by) ${actorPattern(exposure)}`,
            parsed.story.condition,
          ),
      ))
  )
    return mechanismIssue(
      ctx,
      'shared driver needs explicit exposure for both funds, not invented direct holdings',
    );
  if (
    !includesPhrase(parsed.spans.response, exposure.label) ||
    !/\b(?:shared|both|overlap)\b/i.test(parsed.spans.response) ||
    !/^shared exposure$/i.test(parsed.story.outcome)
  )
    return mechanismIssue(
      ctx,
      'resolve only source-backed shared exposure, not identical risk or a correlation coefficient',
    );
  holdings.sort(
    (a, b) =>
      a.fundId.localeCompare(b.fundId) ||
      Number(b.holding.id === exposure.id) - Number(a.holding.id === exposure.id) ||
      a.holding.id.localeCompare(b.holding.id),
  );
  return {
    kind: 'portfolio-exposure',
    preset,
    ...parsed.story,
    funds,
    exposure,
    holdings,
    ...(dependencyLens ? { dependencyLens } : {}),
  };
}

const COMMON = {
  layouts: DIAGRAM_LAYOUTS,
  durationSec: [5, 12],
  limits:
    'Source phrases: title 48, subject 34, actors 28, condition 96, outcome 54. Five source clause-start word indices; 5–12s, 0.8s final hold. Explicit diagram or hybrid mode and evidence source-stated/illustrative.',
} as const;
const STORY =
  '"visualMode":"hybrid","label":"source title","subject":"source subject","outcome":"final source phrase","evidence":"illustrative","setupWord":0,"actionWord":12,"responseWord":24,"checkWord":36,"resolveWord":48';
export const portfolioExposureSpec = {
  ...COMMON,
  kind: 'portfolio-exposure',
  family: 'framework',
  describe:
    'Two funds share a source-stated holding or common driver despite different names. Optional dependencyLens v1 exposes their distinct source-held firms and supported common driver; not measured correlation. Preserve company identity; other exposures remain unknown.',
  schema: `{"kind":"portfolio-exposure","preset":"shared-holdings|shared-driver",${STORY},"funds":[{"id":"a","label":"Fund A"},{"id":"b","label":"Fund B"}],"exposure":{"id":"company","label":"ExampleCo"},"holdings":[{"fundId":"a","holding":{"id":"company","label":"ExampleCo"}},{"fundId":"b","holding":{"id":"company","label":"ExampleCo"}}]}
OP-58 opt-in source example: ${SHARED_DEPENDENCY_SOURCE_FIXTURES.map((fixture) => JSON.stringify(fixture.raw)).join('\n')}`,
  limits: `${COMMON.limits} Exactly two named funds; 2–6 holdings, up to 3 per fund, with shared identity first. For historical shared-driver holdings=[] and exposure is the named driver. Setup names both funds. Action each fund holds/owns COMPANY or is exposed to/depends on DRIVER. Response explicitly names shared exposure. Outcome: Shared exposure. No weights or correlation coefficients. Optional OP-58 shared-driver dependencyLens:{version:1,firms:[{fundId,identity:{id,label,source:{fromWord,toWord}},holdingSource:{fromWord,toWord},driverSource:{fromWord,toWord}}],modelSource:{fromWord,toWord}} retains holdings=[] and has exactly two distinct firms, one per fund. Setup complete clauses: FUND is a fund; FIRM is a company; DRIVER is a common/shared driver. Action each FUND holds FIRM; response each FIRM depends on DRIVER with explicit shared exposure. Independent action modelSource: FUND_A and FUND_B maintain asset ownership and economic claim records. All edges use full local positive clauses, no conditions/swaps/cropped qualifiers. Model layers inspect records only, no payout/control/rights inference. Five entities/four edges, >=1.5s fixed-font full fact reading after handoff; no invented other exposures, numeric risk, geometry, assets, future versions or render functions. Absent lens preserves historical scene; invalid lens rejects, never downgrades to direct exposure.`,
  triggers: [
    /\b(?:portfolio|funds?|etfs?)\b.{0,100}\b(?:overlap|same holding|shared|exposure)\b/i,
    /\bshared (?:holdings?|driver|exposure)\b/i,
  ],
  avoid:
    'Not identical risk, measured correlation, or a claim that absent data proves diversification.',
  parse: parsePortfolioExposure,
  cues: (scene: PortfolioExposureScene): SceneCue[] => [
    { kind: 'flip', at: scene.actionAt, gain: 0.3 },
    { kind: 'tick', at: scene.responseAt, gain: 0.3 },
  ],
} as const;

export const ownershipChangeSpec = {
  ...COMMON,
  kind: 'ownership-change',
  family: 'data',
  describe:
    'Share issue or stake/value separation: retained shares, explicit changing denominator and checked percentages; dollar value stays unknown unless stated.',
  schema: `{"kind":"ownership-change","preset":"share-issue|stake-value-separation",${STORY},"holder":{"id":"ada","label":"Ada"},"company":{"id":"co","label":"ExampleCo"},"shares":40,"beforeTotal":100,"issued":100,"afterTotal":200,"beforePercent":40,"afterPercent":20,"valuation":{"state":"unknown"}}`,
  limits: `${COMMON.limits} Setup: holder owns SHARES of TOTAL shares in COMPANY; holder owns PERCENT percent of COMPANY. Action: COMPANY issues NEW new shares. Response: holder keeps SHARES of TOTAL shares in COMPANY. Check: holder now owns PERCENT percent of COMPANY; Value is not stated OR COMPANY before/after valuation is AMOUNT CURRENCY with measured valuation.before/after money objects. Resolve: Share count stays the same / Percentage and value are different.`,
  triggers: [
    /\b(?:dilution|diluted|new shares|share issue)\b/i,
    /\bshares\b.{0,80}\b(?:percentage|percent|valuation)\b/i,
  ],
  avoid: 'Not a dollar loss, pre/post-money inference, options or liquidation rights.',
  parse: parseOwnershipChange,
  cues: (scene: OwnershipChangeScene): SceneCue[] => [
    { kind: 'flip', at: scene.actionAt, gain: 0.3 },
    { kind: 'tick', at: scene.checkAt, gain: 0.3 },
  ],
} as const;

export const fundFlowSpec = {
  ...COMMON,
  kind: 'fund-flow',
  family: 'process',
  describe:
    'Trace capital into a fund and out to investments, or source-stated proceeds into a fund and back to investors; conserve exact minor units. Diagram/hybrid equally valid.',
  schema: `{"kind":"fund-flow","preset":"capital-deployment|proceeds-distribution",${STORY},"period":"this round","account":{"id":"fund","label":"Atlas Fund"},"sources":[{"id":"ada","label":"Ada"}],"targets":[{"id":"shop","label":"Shop"}],"contributions":[{"from":"ada","to":"fund","amount":{"state":"measured","money":{"minorUnits":10000,"currency":"USD"}}}],"deployments":[{"from":"fund","to":"shop","amount":{"state":"measured","money":{"minorUnits":10000,"currency":"USD"}}}]}`,
  limits: `${COMMON.limits} 1–2 sources/targets with distinct ids. Amount state qualitative (no money) or measured with bounded integer minorUnits and USD/EUR/GBP; never mix. Repeat the same source period if used in transfer clauses. Action: source contributes/pays AMOUNT CURRENCY to fund. Response: fund deploys/distributes AMOUNT CURRENCY to target. Check: fund retains AMOUNT CURRENCY only if supplied. Outcomes: Capital reaches investments / Proceeds reach investors / Money follows the stated paths. Omit retained unless stated. No fees or fabricated gain.`,
  triggers: [
    /\b(?:fund|pooled capital)\b.{0,100}\b(?:contribut\w*|deploy\w*|distribut\w*|proceeds)\b/i,
    /\b(?:contributed capital|fund flows?)\b/i,
  ],
  avoid: 'Not generic allocation, unit economics, returns, fees or market performance.',
  parse: parseFundFlow,
  cues: (scene: FundFlowScene): SceneCue[] => [
    { kind: 'slide', at: scene.actionAt, gain: 0.3 },
    { kind: 'tick', at: scene.responseAt, gain: 0.3 },
  ],
} as const;
