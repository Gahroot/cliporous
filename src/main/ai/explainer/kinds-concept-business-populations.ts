import {
  BUSINESS_POPULATIONS_LAYOUTS,
  type BusinessPopulationsScene,
  type CohortArrival,
  type CohortMember,
  type CustomerCohortScene,
  type DistributionMember,
  type InventoryDemandScene,
  BUSINESS_POPULATIONS_LIMITS as LIMIT,
  type PopulationDistributionScene,
} from '../../remotion/compositions/explainer/concepts/business-populations/types';
import type { SceneCue } from '../../remotion/compositions/explainer/types';
import {
  populationPattern as p,
  populationClause,
  populationDistinct,
  populationEntries,
  populationInteger,
  populationLabel,
  populationMatch,
  populationStory,
  populationText,
} from './concept-business-populations-contract';
import { type AnyKindSpec, isRec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

export function parsePopulationDistribution(
  raw: Rec,
  ctx: ParseContext,
): PopulationDistributionScene | null {
  if (
    raw.preset !== 'customer-concentration' &&
    raw.preset !== 'workload-spread' &&
    raw.preset !== 'average-hides-tail'
  )
    return mechanismIssue(ctx, 'unknown population-distribution preset');
  if (raw.mode !== 'qualitative' && raw.mode !== 'quantitative')
    return mechanismIssue(ctx, 'choose explicit qualitative or quantitative population mode');
  if (
    (raw.unit !== 'orders' && raw.unit !== 'tasks') ||
    (raw.preset === 'customer-concentration' && raw.unit !== 'orders') ||
    (raw.preset === 'workload-spread' && raw.unit !== 'tasks')
  )
    return mechanismIssue(ctx, 'distribution units must match the illustrated orders or tasks');
  const story = populationStory(raw, ctx);
  const entries = populationEntries(raw.members, 2, LIMIT.distributionMembers, ctx);
  if (!story || !entries) return null;
  const members: DistributionMember[] = [];
  for (const [index, entry] of entries.entries()) {
    const label = populationLabel(entry.label, ctx);
    if (!label) return null;
    if (raw.mode === 'quantitative') {
      if (
        !populationInteger(entry.amount, LIMIT.amountPerMember) ||
        entry.level !== undefined ||
        !populationMatch(
          entry.evidenceWord,
          `${p(label)} (?:receives|has) ${entry.amount} ${raw.unit}`,
          ctx,
          story.condition,
        )
      )
        return mechanismIssue(
          ctx,
          'each quantitative member needs a bounded integer and its own amount/unit evidence',
        );
      members.push({ id: `member-${index}`, label, level: 'middle', amount: entry.amount });
    } else {
      if (
        entry.amount !== undefined ||
        (entry.level !== 'low' && entry.level !== 'middle' && entry.level !== 'high')
      )
        return mechanismIssue(
          ctx,
          'qualitative distribution accepts low/middle/high, never generated counts',
        );
      const words = { low: '(?:few|little)', middle: '(?:some|moderate)', high: '(?:many|most)' };
      if (
        !populationMatch(
          entry.evidenceWord,
          `${p(label)} (?:receives|has) ${words[entry.level]} ${raw.unit}`,
          ctx,
          story.condition,
        )
      )
        return null;
      members.push({ id: `member-${index}`, label, level: entry.level });
    }
  }
  if (
    !populationDistinct(
      members.map((member) => member.label),
      ctx,
    )
  )
    return null;
  const subject = p(story.subject);
  const final =
    raw.preset === 'customer-concentration'
      ? 'orders are concentrated'
      : raw.preset === 'workload-spread'
        ? 'workloads differ'
        : 'average hides (?:the )?(?:tail|outliers|spread)';
  if (!populationMatch(raw.resolveWord, `${subject} ${final}`, ctx, story.condition)) return null;
  let populationSize: number | undefined;
  let average: number | undefined;
  if (raw.mode === 'quantitative') {
    if (raw.populationSize !== members.length)
      return mechanismIssue(
        ctx,
        'quantitative population needs its complete source-backed denominator',
      );
    const clause = populationClause(raw.populationWord, ctx, story.condition);
    const prefix = `${populationText(story.subject)} includes all ${members.length} members: `;
    const names = clause?.startsWith(prefix)
      ? clause
          .slice(prefix.length)
          .split(/,\s*|\s+and\s+/)
          .map(populationText)
      : [];
    if (
      names.length !== members.length ||
      new Set(names).size !== names.length ||
      members.some((member) => !names.includes(populationText(member.label)))
    )
      return mechanismIssue(
        ctx,
        'population denominator evidence must enumerate exactly these actors',
      );
    populationSize = members.length;
    const amounts = members.map((member) => member.amount ?? 0);
    const total = amounts.reduce((sum, amount) => sum + amount, 0);
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    if (total > LIMIT.carriers || max === min)
      return mechanismIssue(ctx, 'distribution must vary and fit the twelve-carrier budget');
    if (raw.preset === 'customer-concentration' && max <= total / 2)
      return mechanismIssue(ctx, 'customer concentration needs a supported dominant member');
    for (const member of members)
      member.level = member.amount === max ? 'high' : member.amount === min ? 'low' : 'middle';
    if (raw.average !== undefined || raw.preset === 'average-hides-tail') {
      if (
        typeof raw.average !== 'number' ||
        !Number.isFinite(raw.average) ||
        raw.average < 0 ||
        raw.average > LIMIT.amountPerMember ||
        Math.abs(raw.average - total / members.length) > 1e-6 ||
        !populationMatch(
          raw.averageWord,
          `${subject} average is ${p(String(raw.average))} ${raw.unit}`,
          ctx,
          story.condition,
        )
      )
        return mechanismIssue(
          ctx,
          'average needs matching units, complete population and an exact source-backed arithmetic mean',
        );
      average = raw.average;
    }
  } else if (
    raw.populationSize !== undefined ||
    raw.average !== undefined ||
    raw.populationWord !== undefined ||
    raw.averageWord !== undefined
  ) {
    return mechanismIssue(
      ctx,
      'qualitative distribution cannot present a denominator or numerical average',
    );
  } else if (
    new Set(members.map((member) => member.level)).size < 2 ||
    (raw.preset === 'customer-concentration' && !members.some((member) => member.level === 'high'))
  ) {
    return mechanismIssue(
      ctx,
      'illustrative distribution still needs source-backed unequal amounts',
    );
  }
  return {
    kind: 'population-distribution',
    preset: raw.preset,
    mode: raw.mode,
    unit: raw.unit,
    ...story,
    members,
    ...(populationSize !== undefined ? { populationSize } : {}),
    ...(average !== undefined ? { average } : {}),
  };
}

export function parseCustomerCohort(raw: Rec, ctx: ParseContext): CustomerCohortScene | null {
  if (raw.preset !== 'retention' && raw.preset !== 'churn')
    return mechanismIssue(ctx, 'unknown customer-cohort preset');
  if (raw.mode !== 'qualitative' && raw.mode !== 'quantitative')
    return mechanismIssue(ctx, 'cohort needs an explicit evidence mode');
  const story = populationStory(raw, ctx);
  const startPeriod = populationLabel(raw.startPeriod, ctx);
  const endPeriod = populationLabel(raw.endPeriod, ctx);
  const entries = populationEntries(raw.members, 2, LIMIT.originalCustomers, ctx);
  const newEntries = populationEntries(raw.arrivals, 0, LIMIT.newCustomers, ctx);
  if (
    !story ||
    !startPeriod ||
    !endPeriod ||
    !entries ||
    !newEntries ||
    !populationDistinct([startPeriod, endPeriod], ctx)
  )
    return null;
  const members: CohortMember[] = [];
  const arrivals: CohortArrival[] = [];
  for (const [index, entry] of entries.entries()) {
    const label = populationLabel(entry.label, ctx);
    if (!label || (entry.status !== 'retained' && entry.status !== 'departed'))
      return mechanismIssue(ctx, 'original cohort members need retained or departed status');
    if (
      !populationMatch(
        entry.startWord,
        `${p(label)} (?:starts|belongs) in ${p(startPeriod)} in ${p(story.subject)}`,
        ctx,
        story.condition,
      ) ||
      !populationMatch(
        entry.evidenceWord,
        `${p(label)} ${entry.status === 'retained' ? '(?:remains|stays)' : '(?:leaves|departs)'} in ${p(endPeriod)} in ${p(story.subject)}`,
        ctx,
        story.condition,
      )
    )
      return null;
    members.push({ id: `original-${index}`, label, status: entry.status });
  }
  for (const [index, entry] of newEntries.entries()) {
    const label = populationLabel(entry.label, ctx);
    if (
      !label ||
      entry.status !== undefined ||
      entry.startWord !== undefined ||
      !populationMatch(
        entry.evidenceWord,
        `${p(label)} joins ${p(story.subject)} in ${p(endPeriod)} as a new customer`,
        ctx,
        story.condition,
      )
    )
      return mechanismIssue(
        ctx,
        'arrivals need explicit new-customer evidence and cannot be retained originals',
      );
    arrivals.push({ id: `arrival-${index}`, label });
  }
  if (
    !populationDistinct(
      [...members, ...arrivals].map((member) => member.label),
      ctx,
    )
  )
    return null;
  const retained = members.filter((member) => member.status === 'retained').length;
  const departed = members.length - retained;
  if ((raw.preset === 'retention' && !retained) || (raw.preset === 'churn' && !departed))
    return mechanismIssue(ctx, 'cohort preset must match supported original-member outcomes');
  if (
    !populationMatch(
      raw.resolveWord,
      `${p(story.subject)} ${raw.preset === 'retention' ? 'retains' : 'loses'} named customers`,
      ctx,
      story.condition,
    )
  )
    return null;
  let counts: CustomerCohortScene['counts'];
  if (raw.mode === 'quantitative') {
    if (!isRec(raw.counts) || !isRec(raw.countWords))
      return mechanismIssue(ctx, 'quantitative cohort needs all four actor-bound count statements');
    counts = { starting: members.length, retained, departed, arrivals: arrivals.length };
    const verbs = {
      starting: 'starts with',
      retained: 'retains',
      departed: 'loses',
      arrivals: 'adds',
    };
    for (const key of ['starting', 'retained', 'departed', 'arrivals'] as const) {
      if (
        raw.counts[key] !== counts[key] ||
        !populationMatch(
          raw.countWords[key],
          `${p(story.subject)} ${verbs[key]} ${counts[key]} customers? in ${p(key === 'starting' ? startPeriod : endPeriod)}`,
          ctx,
          story.condition,
        )
      )
        return mechanismIssue(
          ctx,
          'cohort counts must conserve original membership and exclude arrivals from retention',
        );
    }
  } else if (raw.counts !== undefined || raw.countWords !== undefined)
    return mechanismIssue(ctx, 'qualitative cohort cannot display a population size or rate');
  return {
    kind: 'customer-cohort',
    preset: raw.preset,
    mode: raw.mode,
    ...story,
    startPeriod,
    endPeriod,
    members,
    arrivals,
    ...(counts ? { counts } : {}),
  };
}

export function parseInventoryDemand(raw: Rec, ctx: ParseContext): InventoryDemandScene | null {
  if (raw.preset !== 'surplus' && raw.preset !== 'shortage' && raw.preset !== 'balanced')
    return mechanismIssue(ctx, 'unknown inventory-demand preset');
  if (raw.mode !== 'qualitative' && raw.mode !== 'quantitative')
    return mechanismIssue(ctx, 'inventory needs an explicit evidence mode');
  const story = populationStory(raw, ctx);
  const productLabel = populationLabel(raw.productLabel, ctx);
  const stockLabel = populationLabel(raw.stockLabel, ctx);
  const demandLabel = populationLabel(raw.demandLabel, ctx);
  if (
    !story ||
    !productLabel ||
    !stockLabel ||
    !demandLabel ||
    !populationDistinct([stockLabel, demandLabel], ctx)
  )
    return null;
  const relation =
    raw.preset === 'surplus' ? 'exceeds' : raw.preset === 'shortage' ? 'falls short of' : 'matches';
  if (
    !populationMatch(
      raw.resolveWord,
      `${p(stockLabel)} ${relation} ${p(demandLabel)}`,
      ctx,
      story.condition,
    )
  )
    return null;
  let stockCount = raw.preset === 'surplus' ? 4 : 3;
  let demandCount = raw.preset === 'shortage' ? 4 : 3;
  let quantities: InventoryDemandScene['quantities'];
  if (raw.mode === 'quantitative') {
    if (
      raw.unit !== 'products' ||
      !populationInteger(raw.stockCount, LIMIT.inventoryActors) ||
      !populationInteger(raw.demandCount, LIMIT.inventoryActors) ||
      raw.stockCount + raw.demandCount === 0
    )
      return mechanismIssue(
        ctx,
        'inventory needs finite integer counts 0..6 and the products unit',
      );
    stockCount = raw.stockCount;
    demandCount = raw.demandCount;
    if (
      !populationMatch(
        raw.stockWord,
        `${p(stockLabel)} holds ${stockCount} products? of ${p(productLabel)}`,
        ctx,
        story.condition,
      ) ||
      !populationMatch(
        raw.demandWord,
        `${p(demandLabel)} requests ${demandCount} products? of ${p(productLabel)}`,
        ctx,
        story.condition,
      )
    )
      return null;
    if (
      (raw.preset === 'surplus' && stockCount <= demandCount) ||
      (raw.preset === 'shortage' && stockCount >= demandCount) ||
      (raw.preset === 'balanced' && stockCount !== demandCount)
    )
      return mechanismIssue(ctx, 'stock/demand counts contradict the stated inventory result');
    quantities = { stock: stockCount, demand: demandCount, unit: 'products' };
  } else {
    if (['stockCount', 'demandCount', 'unit'].some((field) => raw[field] !== undefined))
      return mechanismIssue(ctx, 'qualitative inventory must not smuggle in numerical quantities');
    if (
      !populationMatch(
        raw.stockWord,
        `${p(stockLabel)} holds ${p(productLabel)}`,
        ctx,
        story.condition,
      ) ||
      !populationMatch(
        raw.demandWord,
        `${p(demandLabel)} requests ${p(productLabel)}`,
        ctx,
        story.condition,
      )
    )
      return null;
  }
  return {
    kind: 'inventory-demand',
    preset: raw.preset,
    mode: raw.mode,
    ...story,
    productLabel,
    stockLabel,
    demandLabel,
    stock: Array.from({ length: stockCount }, (_, index) => ({ id: `stock-${index}` })),
    demand: Array.from({ length: demandCount }, (_, index) => ({ id: `demand-${index}` })),
    ...(quantities ? { quantities } : {}),
  };
}

const COMMON = {
  layouts: BUSINESS_POPULATIONS_LAYOUTS,
  durationSec: [5, 12] as const,
  cues: (scene: BusinessPopulationsScene): SceneCue[] => [
    { kind: 'tick', at: scene.actionAt, gain: 0.3 },
    { kind: 'slide', at: scene.responseAt, gain: 0.3 },
    { kind: 'tick', at: scene.checkAt, gain: 0.25 },
  ],
};
const STORY =
  '"label":"source title","subject":"source group","outcome":"exact final clause","condition":"complete source condition only if present","setupWord":N,"actionWord":N,"responseWord":N,"checkWord":N,"resolveWord":N';
const LIMITS =
  'Five source-word beats, 5–12s, 0.6/1/1/1s gaps, ≥0.8s final hold. Actor/period labels ≤18 characters. Every label quotes source. Evidence indices address WHOLE local clauses; no negated, proposed or swapped-actor claims. Qualitative actors are explicitly illustrative, never a chart, ratio or retention rate. Quantitative integers are exact counts, not percentages. ';

export const CONCEPT_BUSINESS_POPULATIONS_SPECS = [
  {
    ...COMMON,
    kind: 'population-distribution',
    family: 'data',
    describe:
      'Persistent named customers receive unequal orders or workers receive unequal tasks. Contrast a supported average with the surviving tail; never invent an 80/20 ratio or erase an outlier.',
    schema: `{"kind":"population-distribution","preset":"customer-concentration|workload-spread|average-hides-tail","mode":"qualitative|quantitative","unit":"orders|tasks","members":[{"label":"Ada","level":"low|middle|high (qualitative only)","amount":N,"evidenceWord":N}],"populationSize":N,"populationWord":N,"average":N,"averageWord":N,${STORY}}`,
    limits: `${LIMITS}2–4 members; each receives/has few/some/many orders/tasks (qualitative) OR 0–6 orders/tasks with amount evidence, total ≤12. Quantitative population clause: SUBJECT includes all N members: NAME, NAME. Final clause: SUBJECT orders are concentrated / workloads differ / average hides the tail. average-hides-tail quantitative requires SUBJECT average is N UNIT, the exact arithmetic mean. Omit all quantitative fields for qualitative mode.`,
    triggers: [
      /\bcustomer\w*\b.{0,90}\b(?:concentrat|unequal)/,
      /\bworkload\w*\b.{0,70}\b(?:spread|unequal|differ)/,
      /\baverage\b.{0,60}\b(?:hides|tail|outliers)/,
    ],
    avoid:
      'Not an invented Pareto chart, a funnel, a trend, or unrelated quantities without an explicit named population.',
    parse: parsePopulationDistribution,
  },
  {
    ...COMMON,
    kind: 'customer-cohort',
    family: 'story',
    describe:
      'Track the SAME named starting customers across two source-stated periods. Separate retained originals, departed originals and new arrivals; no invented rates or periods.',
    schema: `{"kind":"customer-cohort","preset":"retention|churn","mode":"qualitative|quantitative","startPeriod":"source period","endPeriod":"source period","members":[{"label":"Ada","status":"retained|departed","startWord":N,"evidenceWord":N}],"arrivals":[{"label":"Cy","evidenceWord":N}],"counts":{"starting":N,"retained":N,"departed":N,"arrivals":N},"countWords":{"starting":N,"retained":N,"departed":N,"arrivals":N},${STORY}}`,
    limits: `${LIMITS}2–6 originals and 0–2 arrivals; each NAME starts/belongs in START in SUBJECT, then NAME remains/stays/leaves/departs in END in SUBJECT. Arrival: NAME joins SUBJECT in END as a new customer. Final: SUBJECT retains/loses named customers. Quantitative needs four count clauses: SUBJECT starts with N customers in START; SUBJECT retains/loses/adds N customers in END. Counts exactly match named actors. Omit counts/countWords in qualitative mode.`,
    triggers: [
      /\b(?:cohort|retention|churn)\b/,
      /\b(?:customers|subscribers)\b.{0,70}\b(?:remain|leave|retained|depart)/,
    ],
    avoid:
      'Not new-user acquisition presented as retention, guessed month labels or fabricated percentage survival.',
    parse: parseCustomerCohort,
  },
  {
    ...COMMON,
    kind: 'inventory-demand',
    family: 'compare',
    describe:
      'Match persistent physical shelf products to separate incoming customer demand. Show leftover stock, unmet demand, or balanced matching without manufacturing stock or hiding customers.',
    schema: `{"kind":"inventory-demand","preset":"surplus|shortage|balanced","mode":"qualitative|quantitative","productLabel":"source product","stockLabel":"source stock","demandLabel":"source demand","stockWord":N,"demandWord":N,"stockCount":N,"demandCount":N,"unit":"products",${STORY}}`,
    limits: `${LIMITS}Quantitative: each count 0–6; STOCK holds N products of PRODUCT; DEMAND requests N products of PRODUCT. Qualitative: STOCK holds PRODUCT; DEMAND requests PRODUCT, omit counts/unit. Final: STOCK exceeds / falls short of / matches DEMAND, consistent with counts. Distinct stock/demand labels; never claim a trend from one comparison.`,
    triggers: [
      /\b(?:inventory|stock)\b.{0,100}\b(?:demand|surplus|shortage)/,
      /\b(?:demand|orders)\b.{0,90}\b(?:outstrips|exceeds|stock)/,
    ],
    avoid:
      'Not a supply trend, production simulation, payment transaction or a single undifferentiated queue.',
    parse: parseInventoryDemand,
  },
] satisfies AnyKindSpec[];
