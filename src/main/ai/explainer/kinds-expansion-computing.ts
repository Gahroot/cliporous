import { expansionStory } from '../../remotion/compositions/explainer/expansion/catalog';
import type { ExpansionComputingScene } from '../../remotion/compositions/explainer/expansion/computing/types';
import type { ExpansionStoryBase } from '../../remotion/compositions/explainer/expansion/scene-types';
import {
  parseExpansionBatchStream,
  parseExpansionCacheFreshness,
} from './expansion-computing-cache-stream-contract';
import {
  parseExpansionHeldOutGeneralization,
  parseExpansionPopulationDrift,
} from './expansion-computing-generalization-drift-contract';
import {
  parseExpansionIdempotentRetry,
  parseExpansionProductWalkthrough,
} from './expansion-computing-retry-product-contract';
import {
  parseExpansionReplicaMerge,
  parseExpansionSoftwareScope,
} from './expansion-computing-versions-permissions-contract';
import type { ExpansionPresetSpec } from './expansion-preset-spec';
import type { KindFamily, ParseContext, Rec } from './kind-spec';

const envelope =
  'kind,preset,visualMode:diagram|hybrid,label,subject,outcome,evidence:source-stated|illustrative,startWord,endWord,layout:stack|stack-flipped,setupWord,actionWord,responseWord,checkWord,resolveWord';
const span = '{fromWord,toWord} (complete locally attributed source clause)';
const entities = `[{label,evidence:${span}}] (source labels as references, never caller IDs)`;
const rational = '{numerator:bounded safe integer,denominator:bounded positive integer}';
const quantity = `{actor,claim,state:known|conditional|simulated|illustrative|unknown|missing|disputed,basis:{unit,period,population,denominator?:${rational}},amount?:{kind:rational,value:${rational}},alternatives?:[amount,amount],condition?,qualifier?,evidence:${span}}`;
const cacheFact = `{actor,targets:[source label],scope,period,role,state:known|conditional|simulated|illustrative|unknown|missing|disputed,value?,condition?,qualifier?,evidence:${span}}`;
const retryFact = `{actor,identity,role,claim,value,state:stated|conditional|simulated|illustrative|unknown|missing|disputed,scope,period,condition?,qualifier?,shape?:form|table|task|result,evidence:${span}}`;
const permissionFact = `{actor,resource,replica?,otherReplica?,version?,operation?:read|write|delete|execute,result,role,state:known|conditional|simulated|illustrative|unknown|missing|disputed,condition?,qualification?,scope,period,evidence:${span}}`;
function definition<T extends ExpansionStoryBase & { kind: string; preset: string }>(
  id: T['storyId'],
  kind: T['kind'],
  preset: T['preset'],
  family: KindFamily,
  fields: string,
  triggers: readonly RegExp[],
  parse: (raw: Rec, ctx: ParseContext) => T | null,
): ExpansionPresetSpec<T> {
  const entry = expansionStory(id);
  if (entry.kind !== kind || entry.preset !== preset || entry.allowedDerivations.length !== 0)
    throw new Error('Authored computing route/derivation disagrees with frozen catalog');
  return {
    storyId: id,
    kind,
    preset,
    family,
    describe: entry.purpose,
    schema: `${envelope}; ${fields}`,
    limits: `${entry.sourceRequirements} No invented freshness, TTL, rate, processing order, attempt, retry success, deduplication, effect, result, replica winner, permission grant, model score, generalization, drift cause or performance. Derivations: none; preserve supplied facts and operands without normalization or computed outcomes. Actor/claim/resource/operation/scope/period/unit/population/denominator must bind locally; another actor's number is insufficient. Unknown/missing/disputed/conditional/simulated/illustrative never become known zero, absence, authorization or measured truth. 8 actors,12 records,16 relations; stricter preset caps apply. Both modes preserve facts, identities, qualifications, source evidence, domain values and time; numeric evidence remains planar. Five complete distinct source beats >=1s,5–12s window,>=.8s final hold. Represented versions, schedules and data never use at/...At animation names. Authored fixed templates only: no caller IDs, geometry, coordinates, SVG, HTML, code, function evaluator, files, URLs, credentials, live UI, actual permission/model/network effects or treatment. References are provenance, not guaranteed truth.`,
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
/** Local schemas only; global registration waits for actual pack views and render fixtures. */
export const EXPANSION_COMPUTING_SPECS: readonly ExpansionPresetSpec<ExpansionComputingScene>[] = [
  definition(
    '65',
    'request-routing',
    'cache-freshness',
    'process',
    `template:cache-board; entities:${entities}; scope,period,condition?:explicit source condition; records:[${cacheFact}] roles:version|freshness|cache-action; relations:[${cacheFact}] role:result; exactly three records and one result relation`,
    [/\b(?:cache freshness|stale cache|cached version|fresh cache|invalidate the cache)\b/i],
    parseExpansionCacheFreshness,
  ),
  definition(
    '66',
    'computing-flow',
    'batch-stream',
    'process',
    `template:input-buffer; entities:${entities}; scope,period,condition?:explicit source condition; records:[${cacheFact}] roles:grouping|arrival|processing; relations:[${cacheFact}] role:result; supplied batch/stream behavior only, three records and one result relation`,
    [
      /\b(?:batch processing|stream processing|batch versus stream|batch and stream|input buffer|arrival behavior)\b/i,
    ],
    parseExpansionBatchStream,
  ),
  definition(
    '67',
    'agent-workflow',
    'idempotent-retry',
    'process',
    `template:request-attempts; evidence:source-stated; entities:${entities}; actor,identity,scope,period; records:[${retryFact}] exactly request,attempt,effect,condition,result with no shape; relations:[{from,to,role:provenance,evidence:${span}}]; quantities:[${quantity}]; two entities,five records,<=5 relations,<=7 independent source quantities; no derived retry success or deduplication`,
    [
      /\b(?:idempotent|same request|retry attempt|retry effect|request identity|duplicate effect)\b/i,
    ],
    parseExpansionIdempotentRetry,
  ),
  definition(
    '68',
    'product-walkthrough',
    'form-result',
    'process',
    `template:neutral-form; evidence:source-stated; entities:${entities}; actor,identity,scope,period; records:[${retryFact}] exactly form,field,action,condition,result with shape:form|table|task|result; relations:[{from,to,role:provenance,evidence:${span}}]; quantities:[${quantity}]; original neutral noninteractive UI only; two entities,five records,<=5 relations,<=7 quantities`,
    [/\b(?:product walkthrough|form result|submit the form|form fields|result table|task form)\b/i],
    parseExpansionProductWalkthrough,
  ),
  definition(
    '69',
    'version-state',
    'replica-merge',
    'process',
    `template:replica-board; entities:${entities}; scope,period; records:[${permissionFact}] role:version; relations:[${permissionFact}] role:conflict|merge; supplied versions/conflict and actual merged or unresolved result only`,
    [/\b(?:replica merge|replica conflict|conflicting versions|replicas|unresolved merge)\b/i],
    parseExpansionReplicaMerge,
  ),
  definition(
    '70',
    'property-access',
    'software-scope',
    'process',
    `template:permission-board; entities:${entities}; scope,period; records:[${permissionFact}] role:permission; relations:[${permissionFact}] role:permission; explicit actor/resource/operation and supplied allowed/denied/conditional/unknown condition, never live authorization`,
    [
      /\b(?:software permissions|resource permission|read permission|write permission|permission scope|denied operation)\b/i,
    ],
    parseExpansionSoftwareScope,
  ),
  definition(
    '71',
    'model-training',
    'held-out-generalization',
    'compare',
    `template:training-held-out; entities:${entities}; actor,scope,period,metric; records:[{dataset,sample,role:training|held-out,condition,population,evidence:${span},result:${quantity}}]; exactly three entities and two comparable supplied results, separate sample identities; no inferred generalization score`,
    [/\b(?:held-out|held out|training examples|generalization|training and test)\b/i],
    parseExpansionHeldOutGeneralization,
  ),
  definition(
    '72',
    'model-evaluation',
    'population-drift',
    'compare',
    `template:condition-pair; entities:${entities}; actor,scope,period,metric; records:[{dataset,sample,role:baseline|changed,condition,population,evidence:${span},result:${quantity}}]; exactly three entities and two supplied outcomes sharing metric/unit/denominator, explicit changed condition/population, unresolved outcomes retained`,
    [
      /\b(?:population drift|evaluation drift|changed population|changed operating condition|distribution shift)\b/i,
    ],
    parseExpansionPopulationDrift,
  ),
] as const;
