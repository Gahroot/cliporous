import { expansionStory } from '../../remotion/compositions/explainer/expansion/catalog';
import type { ExpansionStoryBase } from '../../remotion/compositions/explainer/expansion/scene-types';
import type { ExpansionPresetSpec } from './expansion-preset-spec';
import {
  parseExpansionDelayThroughput,
  parseExpansionPeriodicPhase,
} from './expansion-temporal-delay-phase-contract';
import {
  parseExpansionAlignedStateComparison,
  parseExpansionHysteresis,
} from './expansion-temporal-history-twin-contract';
import {
  parseExpansionCriticalPath,
  parseExpansionParallelLanes,
} from './expansion-temporal-lanes-critical-contract';
import {
  parseExpansionExpiry,
  parseExpansionReversible,
} from './expansion-temporal-reversible-expiry-contract';
import type { KindFamily, ParseContext, Rec } from './kind-spec';

const envelope =
  'kind,preset,visualMode:diagram|hybrid,label,subject,outcome,evidence:source-stated|illustrative,startWord,endWord,layout:stack|stack-flipped,setupWord,actionWord,responseWord,checkWord,resolveWord';
const span = '{fromWord,toWord} (one complete locally attributed source clause)';
const entities = `[{label,evidence:${span}}] (declared labels as references, never caller IDs)`;
const rational = '{numerator:safe bounded integer,denominator:positive bounded integer}';
const quantity = `{actor,claim,state:known|conditional|simulated|illustrative|unknown|missing|disputed,basis:{unit,period,population,denominator?:${rational}},amount?:{kind:rational,value:${rational}}|{kind:money,value:{currency:USD|EUR|GBP,minorUnits}},alternatives?:[amount,amount],condition?,qualifier?,evidence:${span}}`;
const context = 'actor,resource,scope,period';
const permission = `state:allowed|denied|unknown|conditional,status?:allowed|denied,condition?,evidence:${span}`;
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
  const derivations = storyId === '42' ? 'critical-path' : 'none';
  if (
    entry.kind !== kind ||
    entry.preset !== preset ||
    entry.allowedDerivations.join(',') !== (storyId === '42' ? 'critical-path' : '')
  )
    throw new Error(
      'Authored temporal definition disagrees with its frozen route/derivation policy',
    );
  return {
    storyId,
    kind,
    preset,
    family,
    describe: entry.purpose,
    schema: `${envelope}; ${fields}`,
    limits: `${entry.sourceRequirements} Preserve actor, claim, scope, period, direction, condition, qualification, exact units and denominator. At most8 named entities,12 records and16 relations; lower preset caps apply. Derivations: ${derivations}. Only story42 may derive a critical path from complete compatible known durations, explicit complete acyclic prerequisites and a source-stated earliest-start/independent-resource schedule basis; retain all operands and ties, mark outputs derived. No invented concurrency, duration, rate, reciprocal, permission, state, result, synchronization, threshold, winner or forecast. Unknown/missing/disputed/conditional/simulated/illustrative are not known zeros, denials or absence. Five distinct complete source clauses in5–12s, >=1s beat gaps, final hold>=.8s. Represented schedule/timestamp/period values use separately named data fields, never at/...At animation seconds. Both modes preserve identical facts, identities, time and qualifications. Only authored templates, never caller IDs, coordinates, SVG/HTML, URLs or evaluators; no treatment. Source provenance is not guaranteed truth.`,
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

/** Local source definitions only; runtime registration waits for actual views/render fixtures. */
export const EXPANSION_TEMPORAL_SPECS = [
  definition(
    '41',
    'temporal-structure',
    'parallel-lanes',
    'process',
    `template:task-lanes; actor,scope,period; entities:${entities}; tasks:[{task:declared label,duration?:${quantity}}]; relations:[{actor,claim,scope,period,type:concurrent|before,from,to,state:known|unknown|missing|disputed|conditional,condition?,evidence:${span}}]; result:{actor,claim,scope,period,state:complete|unresolved|unknown|missing|disputed|conditional,condition?,evidence:${span}}; explicit order/overlap only, no schedule inferred from durations`,
    [
      /\b(?:concurrent tasks|parallel tasks|parallel lanes|runs alongside|tasks overlap|at the same time)\b/i,
    ],
    parseExpansionParallelLanes,
  ),
  definition(
    '42',
    'temporal-structure',
    'critical-path',
    'process',
    `template:dependency-schedule; actor,scope,period; entities:${entities}; tasks:[{task:declared label,duration:${quantity},prerequisites:{actor,claim:prerequisites,scope,period,state:known,prerequisites:[task labels],evidence:${span}}}]; basis:{actor,claim:schedule basis,scope,period,state:known,origin:project start,policy:earliest-start,resourceModel:independent,evidence:${span}}; result:{actor,claim:critical path calculation,scope,period,state:requested,operation:critical-path,evidence:${span}}; no caller relations or schedule values; complete known nonnegative compatible durations and complete explicit prerequisite lists including sourced none; retain tied critical paths, source operands and exact derived domain offsets`,
    [
      /\b(?:critical path|task prerequisites|acyclic dependencies|earliest start|project duration|dependent tasks)\b/i,
    ],
    parseExpansionCriticalPath,
  ),
  definition(
    '43',
    'state-transition',
    'reversible',
    'process',
    `template:state-rail; evidence:source-stated; route?:source-only; ${context}; entities:${entities}; states:[labels]; records:[{type:state,${context},state:known|unknown|conditional,value?:state label,condition?,evidence:${span}}]; relations:[{${context},from,to,${permission}}]; result:{${context},${permission}}; independent directional permissions and actual state check, never infer reverse authorization or executed state`,
    [
      /\b(?:reversible states|reverse transition|allowed transition|forward and reverse|return to state|reversibility)\b/i,
    ],
    parseExpansionReversible,
  ),
  definition(
    '44',
    'temporal-structure',
    'expiry',
    'process',
    `template:expiry-window; evidence:source-stated; route?:source-only; ${context},timingBasis; entities:${entities}; events:[labels]; records:[{${context},type:deadline,representedDeadline:${quantity}}|{${context},type:validity,representedStart:${quantity},representedEnd:${quantity}}|{${context},type:attempt,event,representedEventTime:${quantity}}]; relations:[{${context},event,${permission}}]; result:{${context},event,${permission}}; one explicit deadline/window and all attempted events; identical unit/period/clock basis, no permission derived from timestamp order`,
    [/\b(?:expiry|expires|validity window|deadline|attempt time|authorization window)\b/i],
    parseExpansionExpiry,
  ),
  definition(
    '45',
    'temporal-structure',
    'delay-throughput',
    'compare',
    `template:separate-dimensions; period,population; entities:${entities}; records:[{actor,dimension:latency|throughput,quantity:${quantity}}]; relations:[{from,to,dimension:latency|throughput,basis:{unit,period,population,denominator?},comparisonLabel:qualitative comparison,state,order?:lower|higher|equal,condition?,qualifier?,evidence:${span}}]; latency:second|minute|hour|day, throughput:item/second, retain independent dimensions without reciprocal conversion or winner`,
    [
      /\b(?:latency and throughput|delay and throughput|latency|processing rate|independent throughput|items per second)\b/i,
    ],
    parseExpansionDelayThroughput,
  ),
  definition(
    '46',
    'synchronization',
    'periodic-phase',
    'compare',
    `template:bounded-cycles; period,population; entities:${entities}; signals:[{actor,template:cycle-dial|sine|pulse,state,direction?:clockwise|counterclockwise,condition?,qualifier?,evidence:${span}}]; records:[{actor,dimension:period|phase,reference?:actor label,quantity:${quantity}}]; relations:[{from,to,state,relationship?:leads|lags|aligned,condition?,qualifier?,evidence:${span}}]; supplied period in0.1–60seconds, signed phase within+-360degrees or+-8radians, sine/pulse explicitly illustrative/simulated; no calculated frequency, phase offset or wrapping`,
    [
      /\b(?:periodic phase|cycle period|phase aligned|leads the cycle|lags behind|phase relationship|periodic signals)\b/i,
    ],
    parseExpansionPeriodicPhase,
  ),
  definition(
    '47',
    'state-transition',
    'hysteresis',
    'process',
    `template:two-state-history; actor,scope,period; entities:${entities}; states:[two labels]; rules:[{role:enter|leave,actor,from,to,condition,threshold?,state:conditional|simulated|illustrative,qualification?,evidence:${span}}]; thresholds:[{role:enter|leave,quantity:${quantity}}]; history:[{actor,dataTime,state,value?:state label,condition?,qualification?,evidence:${span}}]; result:{actor,claim:current state,state,value?:state label,condition?,qualification?,evidence:${span}}; two distinct explicitly supplied directional conditions, retained source history; no computed threshold crossing/state`,
    [
      /\b(?:hysteresis|enter and leave|retained history|different thresholds|history dependent|leave condition)\b/i,
    ],
    parseExpansionHysteresis,
  ),
  definition(
    '48',
    'digital-twin',
    'aligned-state-comparison',
    'compare',
    `template:same-subject-pair; actor,scope,period; entities:${entities}; views:[two labels]; snapshots:[{actor,view,claim,dataTime,controls:[source labels],condition,state,value?,qualification?,evidence:${span}}]; quantities:[{view,quantity:${quantity}}]; alignment:{actor,left:view label,right:view label,evidence:${span}}; result:{actor,claim:state comparison,state,result?:same|different,condition?,qualification?,evidence:${span}}; same subject and source controls, conditional/simulated snapshots retain their own qualifications; no computed difference, forecast or conveyor-gate fallback`,
    [
      /\b(?:aligned states|same subject|state comparison|supplied conditions|aligned snapshots|simulated comparison)\b/i,
    ],
    parseExpansionAlignedStateComparison,
  ),
] as const;
