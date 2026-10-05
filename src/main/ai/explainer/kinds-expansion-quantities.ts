import { expansionStory } from '../../remotion/compositions/explainer/expansion/catalog';
import type { ExpansionStoryBase } from '../../remotion/compositions/explainer/expansion/scene-types';
import type { ExpansionPresetSpec } from './expansion-preset-spec';
import {
  parseExpansionDenominator,
  parseExpansionPartition,
} from './expansion-quantities-denominator-partition-contract';
import {
  parseExpansionDeviation,
  parseExpansionSmallMultiples,
} from './expansion-quantities-deviation-multiples-contract';
import {
  parseExpansionHistogram,
  parseExpansionSubgroupReversal,
} from './expansion-quantities-distribution-contract';
import {
  parseExpansionCalendarSeasonality,
  parseExpansionRankChange,
} from './expansion-quantities-ranking-calendar-contract';
import type { KindFamily, ParseContext, Rec } from './kind-spec';

const envelope =
  'kind,preset,visualMode:diagram|hybrid,label,subject,outcome,evidence:source-stated|illustrative,startWord,endWord,layout:stack|stack-flipped,setupWord,actionWord,responseWord,checkWord,resolveWord,condition?';
const span = '{fromWord,toWord} (one complete locally attributed source clause)';
const rational = '{numerator:safe bounded integer,denominator:positive bounded integer}';
const entities = `[{label,evidence:${span}}] (references below quote exact entity labels, never IDs)`;
const quantity = `{actor,claim,state:known|conditional|simulated|illustrative|unknown|missing|disputed,basis:{unit,period,population,denominator?:${rational}},amount?:{kind:rational,value:${rational}}|{kind:money,value:{currency:USD|EUR|GBP,minorUnits}},alternatives?:[amount,amount],condition?,qualifier?,evidence:${span}}`;
function definition<T extends ExpansionStoryBase & { kind: string; preset: string }>(
  storyId: T['storyId'],
  kind: T['kind'],
  preset: T['preset'],
  family: KindFamily,
  fields: string,
  triggers: readonly RegExp[],
  parse: (raw: Rec, ctx: ParseContext) => T | null,
): ExpansionPresetSpec<T> {
  const entry = expansionStory(storyId);
  if (entry.kind !== kind || entry.preset !== preset)
    throw new Error('Authored preset disagrees with its frozen catalog route');
  const derivations = entry.allowedDerivations.length ? entry.allowedDerivations.join('|') : 'none';
  return {
    storyId,
    kind,
    preset,
    family,
    describe: entry.purpose,
    schema: `${envelope}; ${fields}`,
    limits: `${entry.sourceRequirements} Preserve actor, scope, unit, period, denominator and source numeric precision. At most 8 entities, 12 records and 16 relations; lower preset caps apply. Derivations: ${derivations}, complete known operands only, marked derived with operands/basis. Unknown/missing/disputed/conditional/simulated/illustrative are not measured zeros. Five distinct source clauses, 5–12 seconds and final hold >=0.8 seconds. No winner, truth guarantee, fabricated trend, missing remainder, arbitrary evaluator, caller IDs or treatment.`,
    layouts: ['stack', 'stack-flipped'],
    durationSec: [5, 12],
    triggers,
    avoid: entry.avoidHint,
    parse,
    cues: (scene) => [
      { at: scene.setupAt, kind: 'whoosh', gain: 0.22 },
      { at: scene.actionAt, kind: 'tick', gain: 0.22 },
      { at: scene.responseAt, kind: 'tick', gain: 0.2 },
      { at: scene.checkAt, kind: 'tick', gain: 0.18 },
      { at: scene.resolveAt, kind: 'tick', gain: 0.26 },
    ],
  };
}

/** Local source definitions, not global KindSpec registrations or renderer-completion evidence. */
export const EXPANSION_QUANTITIES_SPECS = [
  definition(
    '17',
    'distribution-view',
    'histogram',
    'framework',
    `entities:${entities}; actor,metric,valueUnit; representation:bins|observations; records: bins=[{label,lower:${rational},upper:${rational},rangeEvidence:${span},count:${quantity}}] or observations=[{quantity:${quantity}}]; supplied ordered nonoverlapping lower-inclusive/upper-exclusive bins, no fabricated smooth curve or draws`,
    [/\b(?:histogram|distribution|long tail|ordered bins|frequency bins)\b/i],
    parseExpansionHistogram,
  ),
  definition(
    '18',
    'distribution-view',
    'subgroup-reversal',
    'compare',
    `entities:${entities}; actors:[label,label]; groups:[label,...]; metric,aggregatePopulation; records:[{actor,group,numerator:${quantity},denominator:${quantity}}]; aggregateEvidence:${span}; reversalEvidence:${span}; subgroupHigher,aggregateHigher; complete matching groups and supplied positive denominators, exact source-scoped reversal`,
    [
      /\b(?:Simpson|subgroup reversal|aggregate reversal|within each group|reverses when combined)\b/i,
    ],
    parseExpansionSubgroupReversal,
  ),
  definition(
    '19',
    'quantity-comparison',
    'denominator',
    'compare',
    `entities:${entities}; owner,metric; comparisons:[{entity,actor,amount:${quantity},reference:${quantity}}]; ordering?:{from,to,evidence:${span}}; derive?:[{operation:ratio,row}|{operation:difference,left,right}|{operation:percent-change,from,to}]; keep each reference total and basis, distinguish percentages from points and changes`,
    [
      /\b(?:absolute versus relative|absolute and relative|relative change|percentage points|reference total|different denominators)\b/i,
    ],
    parseExpansionDenominator,
  ),
  definition(
    '20',
    'composition-view',
    'partition',
    'framework',
    `entities:${entities}; owner,whole; total:${quantity}; parts:[{entity,role:part|remainder,quantity:${quantity},membership:${span}}]; parts belong to the actual supplied whole; explicitly missing remainder stays missing, no derived completion`,
    [
      /\b(?:part to whole|part-to-whole|partition|unknown remainder|remaining portion|composition of)\b/i,
    ],
    parseExpansionPartition,
  ),
  definition(
    '21',
    'ranking',
    'rank-change',
    'compare',
    `entities:${entities}; criterion; states:[{period,records:[{actor,quantity:${quantity},rank?:integer,unrankedEvidence?:${span}}]},{period,records:[same identities]}]; comparison:{fromPeriod,toPeriod,evidence:${span},condition?}; result:{status:scoped,evidence:${span},condition?}; ranks are supplied count-unit quantities named '<criterion> rank'; preserve ties/unranked, no inferred ordering`,
    [/\b(?:ranking change|rank change|changed ranks|overtook|previous ranking|new ranking)\b/i],
    parseExpansionRankChange,
  ),
  definition(
    '22',
    'temporal-pattern',
    'calendar-seasonality',
    'framework',
    `entities:${entities}; records:[{actor,label,calendar:{year,month},quantity:${quantity}}]; relations:[{fromRecord,toRecord,role:before|same-period,evidence:${span},condition?}]; result:{status:scoped,evidence:${span},condition?}; supplied month/year or ISO year-month only, no fabricated cycles/forecast; calendar facts never animation seconds`,
    [/\b(?:seasonality|calendar pattern|month by month|monthly pattern|seasonal pattern)\b/i],
    parseExpansionCalendarSeasonality,
  ),
  definition(
    '23',
    'quantity-comparison',
    'deviation',
    'compare',
    `entities:${entities}; actor,domain; target:${quantity}; observation:${quantity}; comparison:{evidence:${span}}; result:{state:derived,operation:difference,evidence?:${span},quantity?:${quantity}}|{state:source-qualified,quantity:${quantity}}; relative?:${quantity}; derived path needs complete known operands and authored subtraction relation or an exactly matching supplied result, never arbitrary formulas or invented rates`,
    [
      /\b(?:deviation|target versus actual|target and observation|above target|below target|missed the target)\b/i,
    ],
    parseExpansionDeviation,
  ),
  definition(
    '24',
    'quantity-comparison',
    'small-multiples',
    'compare',
    `entities:${entities}; domain; records:[{entity,quantity:${quantity}}] (2–4 options); comparison:{evidence:${span}}; conclusion:{qualification,evidence:${span}}; expressly common unit/domain/period/population/denominator, no forced comparability or universal winner`,
    [
      /\b(?:small multiples|side by side|shared scale|same units|common domain|comparable panels)\b/i,
    ],
    parseExpansionSmallMultiples,
  ),
] as const;
