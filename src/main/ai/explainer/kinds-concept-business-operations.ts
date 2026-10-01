import {
  type AllocationProject,
  BUSINESS_OPERATIONS_LAYOUTS,
  type MarketExchangeScene,
  type ResourceAllocationScene,
  type UnitEconomicsScene,
} from '../../remotion/compositions/explainer/concepts/business-operations/types';
import {
  businessPhrase,
  businessStory,
  escaped,
  hasClaim,
  monetaryUnit,
  money,
  quantityPattern,
  relationship,
  resourceCount,
} from './concept-business-operations-contract';
import { type AnyKindSpec, isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

/** Each direction is supported in its own beat window, not by global actor mentions. */
export function parseMarketExchange(raw: Rec, ctx: ParseContext): MarketExchangeScene | null {
  if (
    raw.preset !== 'direct-sale' &&
    raw.preset !== 'platform-fee' &&
    raw.preset !== 'unmatched-market'
  )
    return mechanismIssue(ctx, 'market-exchange needs a named authored preset');
  const grounded = businessStory(raw, ctx);
  const seller = businessPhrase(raw.seller, ctx);
  const buyer = businessPhrase(raw.buyer, ctx);
  const product = businessPhrase(raw.product, ctx);
  if (!grounded || !seller || !buyer || !product || seller.toLowerCase() === buyer.toLowerCase())
    return mechanismIssue(ctx, 'market actors must be distinct source phrases with a product');
  const { story, spans } = grounded;
  if (story.subject.toLowerCase() !== product.toLowerCase())
    return mechanismIssue(ctx, 'the retained market subject must be the traded product');
  const s = escaped(seller);
  const b = escaped(buyer);
  const p = escaped(product);
  if (!hasClaim(spans.setup, relationship(`^${s} owns (?:the )?${p}$`)))
    return mechanismIssue(ctx, 'setup must state this seller owns this product');
  const actors = {
    seller: { id: 'seller' as const, label: seller },
    buyer: { id: 'buyer' as const, label: buyer },
    product,
  };
  if (raw.preset === 'unmatched-market') {
    if (
      raw.amount !== undefined ||
      raw.unit !== undefined ||
      raw.platform !== undefined ||
      raw.fee !== undefined
    )
      return mechanismIssue(ctx, 'unmatched-market must not invent a price, fee or payment');
    if (
      !hasClaim(spans.action, relationship(`^${b} finds no match with ${s}$`), true) ||
      !hasClaim(spans.response, relationship(`^${s} keeps (?:the )?${p}$`)) ||
      !hasClaim(spans.check, relationship(`^${b} makes no payment to ${s}$`), true) ||
      !hasClaim(spans.resolve, relationship(`^${s} keeps (?:the )?${p}$`)) ||
      story.outcome.toLowerCase() !== `${seller} keeps ${product}`.toLowerCase()
    )
      return mechanismIssue(
        ctx,
        'unmatched evidence must retain seller ownership and explicitly leave this buyer unpaid/unmatched',
      );
    return { kind: 'market-exchange', preset: 'unmatched-market', ...story, ...actors };
  }
  const amount = money(raw.amount);
  const unit = monetaryUnit(raw.unit, ctx);
  if (amount === null || !unit)
    return mechanismIssue(
      ctx,
      'completed exchanges require a positive explicit amount and monetary unit',
    );
  const platform = raw.preset === 'platform-fee' ? businessPhrase(raw.platform, ctx) : null;
  const fee = raw.preset === 'platform-fee' ? money(raw.fee) : null;
  if (raw.preset === 'direct-sale' && (raw.platform !== undefined || raw.fee !== undefined))
    return mechanismIssue(ctx, 'direct-sale cannot contain an invented platform or fee');
  if (
    raw.preset === 'platform-fee' &&
    (!platform ||
      fee === null ||
      fee >= amount ||
      [seller, buyer].some((actor) => actor.toLowerCase() === platform.toLowerCase()))
  )
    return mechanismIssue(
      ctx,
      'platform-fee requires a distinct source platform and a positive fee below payment',
    );
  const payee = escaped(platform ?? seller);
  const q = quantityPattern(amount, unit);
  if (
    !hasClaim(spans.action, relationship(`^${b} pays ${q} to ${payee} for (?:the )?${p}$`)) ||
    !hasClaim(spans.response, relationship(`^${s} transfers (?:the )?${p} to ${b}$`)) ||
    !hasClaim(spans.check, relationship(`^${b} owns (?:the )?${p}$`)) ||
    !hasClaim(spans.resolve, relationship(`^${b} keeps (?:the )?${p}$`)) ||
    story.outcome.toLowerCase() !== `${buyer} keeps ${product}`.toLowerCase()
  )
    return mechanismIssue(
      ctx,
      'sale needs this buyer paying, this seller transferring ownership, and the same buyer retaining the product',
    );
  if (platform && fee !== null) {
    const net = Math.round((amount - fee) * 100) / 100;
    if (
      !hasClaim(
        spans.check,
        relationship(`^${payee} keeps ${quantityPattern(fee, unit)} as fee$`),
      ) ||
      !hasClaim(spans.check, relationship(`^${payee} pays ${quantityPattern(net, unit)} to ${s}$`))
    )
      return mechanismIssue(
        ctx,
        'the local platform fee plus stated seller payment must equal buyer payment',
      );
  } else if (!hasClaim(spans.check, relationship(`^${s} receives ${q}$`)))
    return mechanismIssue(ctx, 'the seller must receive the same payment, not an unrelated amount');
  return {
    kind: 'market-exchange',
    preset: raw.preset === 'platform-fee' ? 'platform-fee' : 'direct-sale',
    ...story,
    ...actors,
    payment: { amount, unit },
    ...(platform && fee !== null
      ? { platform: { id: 'platform' as const, label: platform, fee } }
      : {}),
  };
}

/** Conserved individually tracked time/capacity carriers, with local competing uses. */
export function parseResourceAllocation(
  raw: Rec,
  ctx: ParseContext,
): ResourceAllocationScene | null {
  if (raw.preset !== 'reallocate' && raw.preset !== 'constrained-projects')
    return mechanismIssue(ctx, 'resource-allocation needs reallocate or constrained-projects');
  const grounded = businessStory(raw, ctx);
  const total = resourceCount(raw.total);
  const unit = businessPhrase(raw.unit, ctx, 16);
  if (
    !grounded ||
    total === null ||
    total === 0 ||
    !unit ||
    !/^(?:hours|minutes|days|shifts|slots)$/i.test(unit) ||
    !Array.isArray(raw.projects) ||
    raw.projects.length !== 2
  )
    return mechanismIssue(
      ctx,
      'allocation needs 1–12 stated whole time/capacity units and exactly two projects',
    );
  const { story, spans } = grounded;
  const parseProject = (entry: unknown, id: AllocationProject['id']): AllocationProject | null => {
    if (!isRec(entry)) return null;
    const label = businessPhrase(entry.label, ctx);
    const before = resourceCount(entry.before);
    const after = resourceCount(entry.after);
    const requested = resourceCount(entry.requested);
    if (!label || before === null || after === null || requested === null) return null;
    const actor = escaped(label);
    if (
      !hasClaim(
        spans.setup,
        relationship(`^${actor} starts with ${quantityPattern(before, unit)}$`),
      ) ||
      !hasClaim(
        spans.action,
        relationship(`^${actor} requests ${quantityPattern(requested, unit)}$`),
      ) ||
      !hasClaim(spans.check, relationship(`^${actor} has ${quantityPattern(after, unit)}$`))
    )
      return null;
    return { id, label, before, after, requested };
  };
  const first = parseProject(raw.projects[0], 'project-0');
  const second = parseProject(raw.projects[1], 'project-1');
  if (!first || !second || first.label.toLowerCase() === second.label.toLowerCase())
    return mechanismIssue(
      ctx,
      'each distinct project needs its own locally stated initial, requested and final quantities',
    );
  const subject = escaped(story.subject);
  if (
    !hasClaim(spans.setup, relationship(`^${subject} has ${quantityPattern(total, unit)}$`)) ||
    first.before + second.before > total ||
    first.after + second.after > total
  )
    return mechanismIssue(
      ctx,
      'finite capacity must be stated and conserved, including the unassigned reserve',
    );
  if (raw.preset === 'reallocate') {
    const receiver = first.after > first.before ? first : second;
    const donor = receiver === first ? second : first;
    const moved = receiver.after - receiver.before;
    if (
      first.before + second.before !== total ||
      first.after + second.after !== total ||
      moved <= 0 ||
      donor.before - donor.after !== moved ||
      first.requested !== first.after ||
      second.requested !== second.after ||
      !hasClaim(
        spans.response,
        relationship(
          `^${escaped(receiver.label)} receives ${quantityPattern(moved, unit)} from ${escaped(donor.label)}$`,
        ),
      ) ||
      !hasClaim(
        spans.resolve,
        relationship(`^${escaped(donor.label)} gives up ${quantityPattern(moved, unit)}$`),
      ) ||
      story.outcome.toLowerCase() !== `${donor.label} gives up ${moved} ${unit}`.toLowerCase()
    )
      return mechanismIssue(
        ctx,
        'reallocation must visibly cost the named donor exactly what the named receiver gains',
      );
  } else {
    if (
      first.before !== 0 ||
      second.before !== 0 ||
      first.after + second.after !== total ||
      first.requested + second.requested <= total ||
      [first, second].some((project) => project.after > project.requested)
    )
      return mechanismIssue(
        ctx,
        'constrained projects start from a finite reserve, assign it once, and leave explicitly unmet requests',
      );
    for (const project of [first, second]) {
      if (
        !hasClaim(
          spans.response,
          relationship(
            `^${subject} assigns ${quantityPattern(project.after, unit)} to ${escaped(project.label)}$`,
          ),
        ) ||
        !hasClaim(
          spans.check,
          relationship(
            `^${escaped(project.label)} lacks ${quantityPattern(project.requested - project.after, unit)}$`,
          ),
        )
      )
        return mechanismIssue(
          ctx,
          'each assignment and unmet quantity must belong to that project, not another request',
        );
    }
    if (
      !hasClaim(spans.resolve, /^requests exceed capacity$/i) ||
      story.outcome.toLowerCase() !== 'requests exceed capacity'
    )
      return mechanismIssue(
        ctx,
        'constrained-projects needs the source-stated unresolved capacity outcome',
      );
  }
  return {
    kind: 'resource-allocation',
    preset: raw.preset,
    ...story,
    total,
    unit,
    projects: [first, second],
  };
}

/** Arithmetic is per the exact stated sale denominator and only the enumerated costs. */
export function parseUnitEconomics(raw: Rec, ctx: ParseContext): UnitEconomicsScene | null {
  if (
    raw.preset !== 'positive-margin' &&
    raw.preset !== 'break-even' &&
    raw.preset !== 'negative-margin'
  )
    return mechanismIssue(ctx, 'unit-economics needs a supported sign-specific preset');
  const grounded = businessStory(raw, ctx);
  const saleUnit = businessPhrase(raw.saleUnit, ctx, 28);
  const unit = monetaryUnit(raw.unit, ctx);
  const revenue = money(raw.revenue);
  if (
    !grounded ||
    !saleUnit ||
    !unit ||
    revenue === null ||
    !Array.isArray(raw.costs) ||
    raw.costs.length < 1 ||
    raw.costs.length > 3
  )
    return mechanismIssue(
      ctx,
      'unit economics requires one explicit sale denominator, revenue, monetary unit and 1–3 stated costs',
    );
  const { story, spans } = grounded;
  if (
    !relationship(`^(?:one|1) ${escaped(story.subject)}$`).test(saleUnit) ||
    !hasClaim(
      spans.setup,
      relationship(`^${escaped(saleUnit)} brings ${quantityPattern(revenue, unit)} in revenue$`),
    )
  )
    return mechanismIssue(
      ctx,
      'do not invent a per-unit denominator or attribute unrelated revenue to this sale',
    );
  const costs: UnitEconomicsScene['costs'] = [];
  for (const [index, entry] of raw.costs.entries()) {
    if (!isRec(entry)) return mechanismIssue(ctx, 'cost entries must be bounded records');
    const label = businessPhrase(entry.label, ctx);
    const amount = money(entry.amount, true);
    if (
      !label ||
      amount === null ||
      costs.some((cost) => cost.label.toLowerCase() === label.toLowerCase()) ||
      !hasClaim(
        spans.action,
        relationship(
          `^${escaped(label)} costs ${quantityPattern(amount, unit)} per ${escaped(saleUnit)}$`,
        ),
      )
    )
      return mechanismIssue(
        ctx,
        'each distinct cost must state its own amount, unit and matching denominator in the cost span',
      );
    costs.push({ id: `cost-${index}`, label, amount });
  }
  const cents = costs.reduce((sum, cost) => sum + Math.round(cost.amount * 100), 0);
  const total = cents / 100;
  const remainder = (Math.round(revenue * 100) - cents) / 100;
  if (
    typeof raw.remainder !== 'number' ||
    !Number.isFinite(raw.remainder) ||
    raw.remainder !== remainder ||
    (raw.preset === 'positive-margin' && remainder <= 0) ||
    (raw.preset === 'break-even' && remainder !== 0) ||
    (raw.preset === 'negative-margin' && remainder >= 0)
  )
    return mechanismIssue(
      ctx,
      'preset and signed remainder must match revenue less the complete stated cost list',
    );
  const outcome =
    remainder < 0
      ? `Stated-cost shortfall is ${-remainder} ${unit}`
      : `Stated-cost remainder is ${remainder} ${unit}`;
  if (
    !hasClaim(
      spans.response,
      relationship(`^stated costs total ${quantityPattern(total, unit)} per ${escaped(saleUnit)}$`),
    ) ||
    !hasClaim(
      spans.check,
      relationship(
        `^revenue less stated costs leaves ${quantityPattern(remainder, unit)} per ${escaped(saleUnit)}$`,
      ),
    ) ||
    !hasClaim(spans.resolve, relationship(`^${escaped(outcome)}$`)) ||
    story.outcome.toLowerCase() !== outcome.toLowerCase()
  )
    return mechanismIssue(
      ctx,
      'state cost total, signed subtraction and final remainder/shortfall locally; no net-profit inference',
    );
  return {
    kind: 'unit-economics',
    preset: raw.preset,
    ...story,
    saleUnit,
    unit,
    revenue,
    costs,
    remainder,
  };
}

const STORY_SCHEMA =
  '"label":"source phrase","subject":"source product/resource","outcome":"final source claim","condition":"complete source condition only if present","setupWord":N,"actionWord":N,"responseWord":N,"checkWord":N,"resolveWord":N';
const LIMITS =
  'Source phrases only; label ≤32, subject ≤24, outcome ≤40, condition ≤56, actor ≤22, unit ≤16. Five clause-start word indices; 5–12s with ≥0.6/1/1/1s gaps and ≥0.8s final hold. No pip.';

export const CONCEPT_BUSINESS_OPERATIONS_SPECS = [
  {
    kind: 'resource-allocation',
    family: 'compare',
    describe:
      'A finite reserve of source-stated time/capacity tickets moves between two workbenches. Reallocation reduces a donor; constrained projects leave visible empty requested slots.',
    schema: `{"kind":"resource-allocation","preset":"reallocate|constrained-projects",${STORY_SCHEMA},"total":8,"unit":"hours","projects":[{"label":"Design","before":4,"after":6,"requested":6},{"label":"Testing","before":4,"after":2,"requested":2}]}`,
    limits: `${LIMITS} Exactly 2 projects, counts 0–12, total 1–12, units hours/minutes/days/shifts/slots. Setup: subject has TOTAL UNIT; each project starts with BEFORE UNIT. Action: each project requests REQUESTED UNIT. Response reallocate: receiver receives DELTA UNIT from donor. Check: each project has AFTER UNIT. Resolve: donor gives up DELTA UNIT. Reallocate uses all resources before/after and requests equal final amounts. Constrained: initially both 0, response subject assigns AFTER UNIT to each project; check also each project lacks REQUESTED-AFTER UNIT; resolve Requests exceed capacity. No invented capacity or growth.`,
    layouts: BUSINESS_OPERATIONS_LAYOUTS,
    durationSec: [5, 12],
    triggers: [
      /\b(?:reallocate|reallocation|capacity|resources)\b.{0,100}\b(?:project|hours|slots|requests?)\b/,
      /\brequests exceed capacity\b/,
    ],
    avoid:
      'Not budget exhaustion or free extra capacity: explicitly conserve competing uses and show opportunity cost/unmet demand.',
    parse: parseResourceAllocation,
    cues: (scene: ResourceAllocationScene) => [
      { kind: 'slide' as const, at: scene.actionAt, gain: 0.35 },
      { kind: 'tick' as const, at: scene.checkAt, gain: 0.3 },
    ],
  },
  {
    kind: 'unit-economics',
    family: 'data',
    describe:
      'One stated sale becomes cost invoices and a remainder, empty break-even tray, or explicitly unfilled cost/shortfall. Only stated costs, never inferred net profit.',
    schema: `{"kind":"unit-economics","preset":"positive-margin|break-even|negative-margin",${STORY_SCHEMA},"saleUnit":"one parcel","unit":"dollars","revenue":12,"costs":[{"label":"Materials","amount":5},{"label":"Delivery","amount":3}],"remainder":4}`,
    limits: `${LIMITS} saleUnit is one/1 plus subject, ≤28. 1–3 unique costs, monetary amounts 0–1000000, ≤2 decimals, revenue >0. Setup: SALEUNIT brings REVENUE UNIT in revenue. Action: each LABEL costs AMOUNT UNIT per SALEUNIT. Response: Stated costs total TOTAL UNIT per SALEUNIT. Check: Revenue less stated costs leaves SIGNED-REMAINDER UNIT per SALEUNIT. Resolve: Stated-cost remainder is REMAINDER UNIT (positive/zero), or Stated-cost shortfall is ABS-REMAINDER UNIT (negative). Raw remainder must equal exact cent arithmetic. No omitted denominator/costs or profit/return claim.`,
    layouts: BUSINESS_OPERATIONS_LAYOUTS,
    durationSec: [5, 12],
    triggers: [
      /\b(?:unit economics|break.even|margin|shortfall)\b/,
      /\b(?:sale|revenue)\b.{0,100}\b(?:costs?|remainder)\b/,
    ],
    avoid:
      'Not total business profit, unstated costs, arbitrary denominators, predicted returns, or a growth chart.',
    parse: parseUnitEconomics,
    cues: (scene: UnitEconomicsScene) => [
      { kind: 'flip' as const, at: scene.actionAt, gain: 0.35 },
      { kind: 'tick' as const, at: scene.checkAt, gain: 0.3 },
    ],
  },
  {
    kind: 'market-exchange',
    family: 'process',
    describe:
      'Two-sided ownership and payment, direct or with a stated deducted platform fee. Unmatched buyers never transact. Actors and arithmetic must be explicit in local beat evidence.',
    schema: `{ "kind":"market-exchange","preset":"direct-sale|platform-fee|unmatched-market",${STORY_SCHEMA},"seller":"Maker","buyer":"Buyer","product":"parcel","amount":12,"unit":"dollars","platform":"Market only for platform-fee","fee":2 }`,
    limits: `${LIMITS} Setup: seller owns product. Action: buyer pays AMOUNT UNIT to seller/platform for product. Response: seller transfers product to buyer. Check: buyer owns product; seller receives payment OR platform keeps FEE UNIT as fee and pays PAYMENT-FEE UNIT to seller. Resolve: buyer keeps product. Unmatched instead: buyer finds no match with seller; seller keeps product; buyer makes no payment to seller; seller keeps product. Omit amount/unit/platform/fee for unmatched; platform/fee only for platform-fee.`,
    layouts: BUSINESS_OPERATIONS_LAYOUTS,
    durationSec: [5, 12],
    triggers: [
      /\b(?:buyer|customer)\b.{0,100}\b(?:pays?|payment|match)\b/,
      /\b(?:seller|platform)\b.{0,100}\b(?:fee|sale|ownership|transfers?)\b/,
    ],
    avoid:
      'Not a payment prop, proposed purchase, reversed ownership, unstated fee or guaranteed marketplace growth.',
    parse: parseMarketExchange,
    cues: (scene: MarketExchangeScene) => [
      { kind: 'slide' as const, at: scene.actionAt, gain: 0.35 },
      { kind: 'tick' as const, at: scene.responseAt, gain: 0.35 },
    ],
  },
] satisfies AnyKindSpec[];
