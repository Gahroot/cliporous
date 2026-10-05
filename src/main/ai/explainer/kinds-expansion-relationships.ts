import { expansionStory } from '../../remotion/compositions/explainer/expansion/catalog';
import type { ExpansionStoryBase } from '../../remotion/compositions/explainer/expansion/scene-types';
import type { ExpansionPresetSpec } from './expansion-preset-spec';
import {
  parseExpansionApprovalHandoff,
  parseExpansionDependency,
} from './expansion-relationships-approval-dependency-contract';
import {
  parseExpansionCapacityMatch,
  parseExpansionMatrixLinks,
} from './expansion-relationships-matrix-matching-contract';
import {
  parseExpansionSetOperations,
  parseExpansionTopology,
} from './expansion-relationships-sets-topology-contract';
import {
  parseExpansionDualRights,
  parseExpansionTaxonomy,
} from './expansion-relationships-taxonomy-rights-contract';
import type { KindFamily, ParseContext, Rec } from './kind-spec';

const envelope =
  'kind,preset,visualMode:diagram|hybrid,label,subject,outcome,evidence:source-stated|illustrative,startWord,endWord,layout:stack|stack-flipped,setupWord,actionWord,responseWord,checkWord,resolveWord,condition?';
const span = '{fromWord,toWord} (one complete locally attributed source clause)';
const entities = `[{label,evidence:${span}}] (labels as references, never caller IDs)`;
const rational = '{numerator:safe bounded integer,denominator:positive bounded integer}';
const quantity = `{actor,claim,state:known|conditional|simulated|illustrative|unknown|missing|disputed,basis:{unit,period,population,denominator?:${rational}},amount?:{kind:rational,value:${rational}}|{kind:money,value:{currency:USD|EUR|GBP,minorUnits}},alternatives?:[amount,amount],condition?,qualifier?,evidence:${span}}`;
const rightsState =
  'state:known|conditional|unknown|missing|disputed|illustrative|simulated,status?,condition?,qualifier?,alternatives?';
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
  if (entry.kind !== kind || entry.preset !== preset || entry.allowedDerivations.length)
    throw new Error('Authored relationship preset disagrees with the frozen source-only route');
  return {
    storyId,
    kind,
    preset,
    family,
    describe: entry.purpose,
    schema: `${envelope}; ${fields}`,
    limits: `${entry.sourceRequirements} Preserve actor, claim, scope, period, direction, qualification, unit and denominator. At most8 named entities,12 records,16 relations and4x4 matrices; lower preset caps apply. Derivations: none. No invented membership, link, share, approval, control, match, selection, schedule, numeric total or resilience result. Source references establish provenance, not guaranteed truth. Unknown/missing/disputed/conditional/simulated/illustrative are not known zeros, denials, exclusion or absence. Five distinct complete source clauses in5–12s, >=1s beat gaps, final hold>=.8s. Only authored templates, never caller IDs, arbitrary geometry, coordinates, HTML, URLs or evaluators; no treatment.`,
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

/** Local source definitions; runtime registration waits for actual views and render fixtures. */
export const EXPANSION_RELATIONSHIPS_SPECS = [
  definition(
    '33',
    'relation-structure',
    'taxonomy',
    'framework',
    `template:nested-categories; period,scope; entities:${entities}; records:[{entity,type:category|member,evidence:${span}}]; relations:[{from,to,role:parent|membership,scope,period,evidence:${span},${rightsState}}]; included|excluded status, explicit acyclic hierarchy only, never inferred inheritance or transitivity`,
    [/\b(?:taxonomy|categories|subcategory|member of|parent category|classified as)\b/i],
    parseExpansionTaxonomy,
  ),
  definition(
    '34',
    'ownership-change',
    'dual-rights',
    'compare',
    `template:dual-rights-board; period,scope; entities:${entities}; records:[{entity,type:actor|resource,evidence:${span}}]; relations:[{actor,resource,right:economic|voting|control,scope,period,evidence:${span},${rightsState},share?:{quantity:${quantity},denominatorUnit:count|percent|ratio,basisEvidence:${span}}}]; granted|denied status, separate explicit rights; control has no numeric share and is never inferred from economic/voting shares`,
    [
      /\b(?:economic rights|voting rights|control rights|separate rights|ownership and control|vote share)\b/i,
    ],
    parseExpansionDualRights,
  ),
  definition(
    '35',
    'agent-team',
    'approval-handoff',
    'process',
    `template:approval-stations; scope,period; entities:${entities}; owner,approver,workItem; records:[{type:request|authorization|handoff,actor,target,item,claim,scope,period,state,condition?,evidence:${span}}]; result:{actor,subject,claim,scope,period,state:complete|unresolved|pending|unknown|missing|disputed|conditional,condition?,evidence:${span}}; values?:[{actor,entity,claim,quantity:${quantity}}]; authorization allowed|denied|pending|unknown|missing|disputed|conditional must be actually stated; request/role/handoff never grants approval`,
    [
      /\b(?:approver|approval handoff|authorization pending|approval denied|work owner|requests approval)\b/i,
    ],
    parseExpansionApprovalHandoff,
  ),
  definition(
    '36',
    'relation-structure',
    'dependency',
    'framework',
    `template:typed-links; scope,period; entities:${entities}; actor; relations:[{type:dependency|transfer|order|flow,actor,from,to,claim,scope,period,state:known|unknown|missing|disputed|conditional,condition?,evidence:${span}}]; result:{actor,subject,claim,scope,period,state,condition?,evidence:${span}}; values?:[{actor,entity,claim,quantity:${quantity}}]; only dependencies form an acyclic requirement graph; a transfer or order is not an inferred dependency/duration`,
    [
      /\b(?:depends on|dependency links|requires .* before|typed dependency|not a transfer|order is not)\b/i,
    ],
    parseExpansionDependency,
  ),
  definition(
    '37',
    'relation-structure',
    'matrix-links',
    'framework',
    `period,population; entities:${entities}; matrix:{rows:[labels],columns:[labels]} <=4x4; relations:[{from,to,role:association|dependency|transfer,direction:undirected|from-to,state,condition?,qualifier?,evidence:${span}}]; matrix and graph use same entity/relation IDs; unrecorded cell means not-supplied, never zero, absent or an invented link`,
    [
      /\b(?:matrix and links|matrix links|pair relations|adjacency matrix|same entities|unrecorded cell)\b/i,
    ],
    parseExpansionMatrixLinks,
  ),
  definition(
    '38',
    'semantic-sort',
    'capacity-match',
    'process',
    `period,population; entities:${entities}; candidates:[labels],destinations:[labels]; eligibility:[{candidate,destination,state,status?:eligible|denied,evidence:${span},condition?,qualifier?}]; records:[{type:capacity,destination,quantity:${quantity}}|{type:match,candidate,state,status:matched|unresolved,destination?,evidence:${span},condition?,qualifier?}]; supplied matches and exact source capacities only; unresolved is not denied; no assignment solver or inferred spare capacity`,
    [
      /\b(?:capacity match|matching capacity|eligible candidates|unresolved match|supplied matches|available slots)\b/i,
    ],
    parseExpansionCapacityMatch,
  ),
  definition(
    '39',
    'venn',
    'set-operations',
    'framework',
    `template:named-sets; scope,period; entities:${entities}; members:[labels],sets:[labels]; memberships:[{member,set,state,membership?:included|excluded,qualification?,condition?,evidence:${span}}]; operation:{kind:intersection|union|exclusion,left,right,evidence:${span}}; selection:{state:complete,members:[labels],evidence:${span}}|{state:unresolved,qualification:unresolved,evidence:${span}}; selection must be source supplied, never generated from membership; unknown/missing are not excluded`,
    [
      /\b(?:set intersection|set union|set exclusion|belongs to both|selected intersection|membership unknown)\b/i,
    ],
    parseExpansionSetOperations,
  ),
  definition(
    '40',
    'collective-pattern',
    'topology',
    'framework',
    `template:chain|ring|diamond; scope,period; entities:${entities}; edges:[{from,to,role:dependency|transfer|membership,state,status?:present|absent|failed,qualification?,condition?,evidence:${span}}]; failure:{from,to,role,state:conditional,condition,effect:failed|absent|unknown|missing|disputed,evidence:${span}}; result:{actor,claim,state,result?:continues|stops|unchanged,qualification?,condition?,evidence:${span}}; authored layout eligibility is not asserted connectivity; no inferred alternate path/resilience winner`,
    [
      /\b(?:network resilience|topology|ring network|link failure|diamond network|alternate route)\b/i,
    ],
    parseExpansionTopology,
  ),
] as const;
