import { expansionStory } from '../../remotion/compositions/explainer/expansion/catalog';
import type { ExpansionStoryBase } from '../../remotion/compositions/explainer/expansion/scene-types';
import {
  parseExpansionExploreExploit,
  parseExpansionSequentialEvidence,
} from './expansion-decisions-explore-evidence-contract';
import {
  parseExpansionDecisionTree,
  parseExpansionWeightedCriteria,
} from './expansion-decisions-priority-tree-contract';
import {
  parseExpansionFrontierRoute,
  parseExpansionLocalGlobal,
} from './expansion-decisions-search-landscape-contract';
import {
  parseExpansionPareto,
  parseExpansionSieve,
} from './expansion-decisions-sieve-frontier-contract';
import type { ExpansionPresetSpec } from './expansion-preset-spec';
import type { KindFamily, ParseContext, Rec } from './kind-spec';

const envelope =
  'kind,preset,visualMode:diagram|hybrid,label,subject,outcome,evidence:source-stated|illustrative,startWord,endWord,layout:stack|stack-flipped,setupWord,actionWord,responseWord,checkWord,resolveWord,condition?';
const span = '{fromWord,toWord} (one complete locally attributed source clause)';
const rational = '{numerator:safe bounded integer,denominator:positive bounded integer}';
const entities = `[{label,evidence:${span}}] (all references use exact labels, never caller IDs)`;
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
    limits: `${entry.sourceRequirements} Preserve actor, scope, conditions, unit, period, denominator, precision and source status. At most 8 entities, 12 records and 16 relations; lower preset caps apply. Derivations: ${derivations}. Pareto only derives from complete comparable known operands, retaining operands/basis; nondominance is not universal superiority. No invented winner, weights, scores, reward, test result, route or optimum. Unknown/missing/disputed/conditional/simulated/illustrative are not measured zeros or failed alternatives. Five distinct source clauses, 5–12 seconds and final hold >=0.8 seconds. No arbitrary evaluator, coordinates, geometry, URLs, caller IDs or treatment.`,
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

/** Local source definitions, not runtime registrations or renderer-completion evidence. */
export const EXPANSION_DECISIONS_SPECS = [
  definition(
    '25',
    'constraint-choice',
    'sieve',
    'framework',
    `entities:${entities}; period,population; requirements:[{label,content,evidence:${span}}]; records:[{option,requirement,state:known|conditional|unknown|missing|disputed|illustrative|simulated,status?:pass|fail,condition?,qualifier?,alternatives?:[pass,fail],evidence:${span}}]; complete supplied checks, no inferred elimination or winner`,
    [
      /\b(?:constraint sieve|requirements|pass.fail conditions|eligible options|meets requirement)\b/i,
    ],
    parseExpansionSieve,
  ),
  definition(
    '26',
    'tradeoff-frontier',
    'pareto',
    'compare',
    `entities:${entities}; period,population; criteria:[{label,direction:minimize|maximize,evidence:${span}}]; records:[{option,criterion,quantity:${quantity}}]; comparisonEvidence:${span}; complete comparable option/criterion matrix only; equal options do not strictly dominate; qualification is retained`,
    [/\b(?:Pareto|trade.?off frontier|nondominan(?:t|ce)|not dominated|comparable criteria)\b/i],
    parseExpansionPareto,
  ),
  definition(
    '27',
    'constraint-choice',
    'weighted-criteria',
    'compare',
    `entities:${entities}; owner,candidates:[label,label]; criteria:[{entity,weight?:${quantity}}]; priorities?:{before:{order:[labels],evidence:${span}},after:{order:[labels],evidence:${span}}}; effects:[{candidate,criterion,actor,text,state,qualifier?,condition?,evidence:${span}}]; scores?:[{candidate,quantity:${quantity}}]; resolution:{state:unknown|unresolved|disputed}|{state:source-chosen,choice}; source weights or both qualitative priority orders, no derived score/winner`,
    [
      /\b(?:priority change|priorities change|weighted criteria|criterion weights|ranks .* before|changes priorities)\b/i,
    ],
    parseExpansionWeightedCriteria,
  ),
  definition(
    '28',
    'conditional-choice',
    'decision-tree',
    'framework',
    `entities:${entities}; owner,root; nodes:[{entity,actor,role:condition|outcome,text,state,qualifier?,condition?,evidence:${span}}]; branches:[{from,to,test,evidence:${span}}]; resolution:{state:unknown|unresolved|disputed}|{state:source-chosen,choice}; bounded acyclic connected tree, each condition has 2–4 supplied alternatives, unresolved outcomes stay unresolved`,
    [/\b(?:decision tree|conditional branches|on branch|if .* then|unknown branch)\b/i],
    parseExpansionDecisionTree,
  ),
  definition(
    '29',
    'spatial-search',
    'frontier-route',
    'framework',
    `template:grid-route; qualification:source|illustrative|simulated; entities:${entities}; nodes:[{node,slot:start|upper|lower|goal,status:open|blocked|unknown|missing|disputed,evidence:${span},condition?}]; links:[{from,to,status,evidence:${span},cost?:${quantity},condition?}]; goal; rule:{kind:equal-cost|supplied-cost,evidence:${span}}; frontier:{nodes:[labels],evidence:${span}}; route:{nodes:[labels],cost?:${quantity},evidence:${span}}; result:{status:supplied|unresolved,evidence:${span}}; fixed four-slot map, supplied routes only, no generated shortest path`,
    [/\b(?:search frontier|stated frontier|route search|open link|blocked route|grid route)\b/i],
    parseExpansionFrontierRoute,
  ),
  definition(
    '30',
    'optimization-landscape',
    'local-global',
    'compare',
    `template:two-well; qualification:illustrative|simulated; entities:${entities}; objective:{label,direction:minimize,evidence:${span}}; wells:[{option,role:local|global|unresolved,evidence:${span},value?:${quantity},condition?}]; branch:{from,to,status:supplied|unresolved,evidence:${span},condition?}; result:{status:scoped|unresolved,evidence:${span}}; qualified two-well teaching model only, no arbitrary function or real-world optimum`,
    [/\b(?:local.*global|local optimum|global optimum|two.well|optimization landscape)\b/i],
    parseExpansionLocalGlobal,
  ),
  definition(
    '31',
    'adaptive-choice',
    'explore-exploit',
    'framework',
    `entities:${entities}; scope,period; events:[{option,behavior:explore|exploit,state,qualification?,condition?,evidence:${span}}]; rewards:[{option,quantity:${quantity}}]; decision:{state:unresolved|conditional|known,option?,condition?,qualification,evidence:${span}}; optional route:source-only,template:named-options; ordered supplied behavior, retain named options and source rewards/unknowns, no synthesized reward or best choice`,
    [
      /\b(?:explore.*exploit|exploration.*exploitation|policy explores|policy exploits|rewards are unknown)\b/i,
    ],
    parseExpansionExploreExploit,
  ),
  definition(
    '32',
    'conditional-choice',
    'sequential-evidence',
    'framework',
    `entities:${entities}; scope,period; tests:[{option,label,state,outcome?:passed|failed|positive|negative|inconclusive,qualification?,condition?,evidence:${span}}]; gathering:{evidence:${span}}; conclusion:{state:unresolved,qualification:unknown information is not false|missing information is not false|evidence gathering continues,evidence:${span}}; optional route:source-only,template:ordered-tests; preserve exact ordered tests and retained options, no invented result or Bayesian update`,
    [
      /\b(?:sequential evidence|ordered tests|evidence gathering|gather evidence|unknown information is not false)\b/i,
    ],
    parseExpansionSequentialEvidence,
  ),
] as const;
