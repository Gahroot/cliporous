import { expansionStory } from '../../remotion/compositions/explainer/expansion/catalog';
import type { ExpansionPhysicalScene } from '../../remotion/compositions/explainer/expansion/physical/types';
import type { ExpansionStoryBase } from '../../remotion/compositions/explainer/expansion/scene-types';
import {
  parseExpansionDirectionalField,
  parseExpansionEnergyBudget,
} from './expansion-physical-energy-field-contract';
import {
  parseExpansionInterference,
  parseExpansionMaterialStateCycle,
} from './expansion-physical-interference-cycle-contract';
import {
  parseExpansionDiffusionFilter,
  parseExpansionSharedResource,
} from './expansion-physical-resource-diffusion-contract';
import {
  parseExpansionIncentiveExternality,
  parseExpansionSupplyChain,
} from './expansion-physical-supply-incentives-contract';
import type { ExpansionPresetSpec } from './expansion-preset-spec';
import type { KindFamily, ParseContext, Rec } from './kind-spec';

const envelope =
  'kind,preset,visualMode:diagram|hybrid,label,subject,outcome,evidence:source-stated|illustrative,startWord,endWord,layout:stack|stack-flipped,setupWord,actionWord,responseWord,checkWord,resolveWord';
const span = '{fromWord,toWord}:complete locally attributed source clause';
const entities = `[{label,evidence:${span}}]:source references, never caller IDs`;
const rational = '{numerator:bounded safe integer,denominator:bounded positive integer}';
const quantity = `{actor,claim,state:known|unknown|missing|disputed|conditional|simulated|illustrative,basis:{unit,period,population,denominator?:${rational}},amount?:{kind:rational,value:${rational}},alternatives?,condition?,qualifier?,evidence:${span}}`;
const fact = `{actor,targets:[source label],scope,period,role,state:known|unknown|missing|disputed|conditional|simulated|illustrative,value?,condition?,qualifier?,evidence:${span}}`;
const tradeFact = `{actor,target,stage,role,claim,value,state:stated|unknown|missing|disputed|conditional|simulated|illustrative,scope,period,condition?,qualifier?,evidence:${span}}`;
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
  if (entry.kind !== kind || entry.preset !== preset)
    throw new Error('Authored physical route disagrees with frozen catalog');
  return {
    storyId: id,
    kind,
    preset,
    family,
    describe: entry.purpose,
    schema: `${envelope}; ${fields}`,
    limits: `${entry.sourceRequirements} No invented inventories, balances, winners, causal effects, grants, losses, efficiency, physical simulation, concentrations, filter effectiveness, numerical telemetry or medical validity. Derivations:${entry.allowedDerivations.join(',') || 'none'}; only77 permits authored signal-sum sampling from complete compatible supplied operands, preserving their basis and derived teaching status, never a new measured source assertion. Actor/claim/relation/condition/value/unit/period/population/denominator bind locally; another actor's value is insufficient. Known, unknown, missing, disputed, conditional, simulated and illustrative remain distinct, never known zero or truth. 8 actors,12 records,16 relations; stricter preset caps apply. Both modes preserve source, identity, qualification, domain values and time; precision remains planar. Five complete distinct source clauses >=1s apart,5–12s complete window,>=.8s final hold. Domain parameters never at/...At. Closed project-authored templates only: no caller IDs, geometry, coordinates, SVG, HTML, code, evaluators, files, URLs, treatments, arbitrary simulation or live operations. References show provenance, not guaranteed truth.`,
    layouts: ['stack', 'stack-flipped'],
    durationSec: [5, 12],
    triggers,
    avoid: entry.avoidHint,
    parse,
    cues: (s) => [
      { at: s.setupAt, kind: 'whoosh', gain: 0.22 },
      { at: s.actionAt, kind: 'tick', gain: 0.22 },
      { at: s.responseAt, kind: 'tick', gain: 0.2 },
      { at: s.checkAt, kind: 'tick', gain: 0.18 },
      { at: s.resolveAt, kind: 'tick', gain: 0.26 },
    ],
  };
}
/** Local definitions only; real views and render fixtures must exist before global registration. */
export const EXPANSION_PHYSICAL_SPECS: readonly ExpansionPresetSpec<ExpansionPhysicalScene>[] = [
  definition(
    '73',
    'inventory-demand',
    'supply-chain',
    'process',
    `template:supply-modules; entities:${entities}; actor,scope,period; records:[${tradeFact}] exactly stage,inventory,transfer,replacement,result; relations:[{from,to,role,evidence:${span}}]; quantities:[${quantity}]; 4 actors,5 records,5 relations,7 quantities; no computed balances`,
    [/\b(?:supply chain|inventory transfer|replacement stock|supply stages|inventory stages)\b/i],
    parseExpansionSupplyChain,
  ),
  definition(
    '74',
    'market-exchange',
    'incentive-externality',
    'process',
    `template:incentive-board; entities:${entities}; actor,scope,period; records:[${tradeFact}] exactly exchange,payment,benefit,external-effect,result; relations:[{from,to,role,evidence:${span}}]; quantities:[${quantity}]; explicit source paying/benefiting/effect actors; 4 actors,5 records,5 relations,7 quantities`,
    [/\b(?:externality|externalities|incentives|who pays|who benefits|external effects)\b/i],
    parseExpansionIncentiveExternality,
  ),
  definition(
    '75',
    'resource-allocation',
    'shared-resource',
    'process',
    `template:single-request; entities:${entities}; resource,requester,population,period; records:[{role:limit|request,quantity:${quantity}}]; access:{condition,evidence:${span}}; decision:{state:granted|denied|unknown|missing|disputed|conditional|simulated|illustrative,result:granted|denied|unresolved,condition,evidence:${span}}; one supplied request/limit, explicit access rule and actual known/unresolved decision only`,
    [/\b(?:shared resource|resource limit|resource requests|access rules|allocation condition)\b/i],
    parseExpansionSharedResource,
  ),
  definition(
    '76',
    'material-process',
    'diffusion-filter',
    'process',
    `template:qualitative-filter; entities:${entities}; material,reservoir,filter,population,period; model:supplied|illustrative|simulated; movement:spreads toward; records:[{role:inventory,quantity:${quantity}}]; filterRule:{relation:passes|retains,condition,evidence:${span}}; result:{state:stated|unresolved,relation:passes|retains|unresolved,evidence:${span}}; only supplied relation or explicitly qualified qualitative teaching model`,
    [
      /\b(?:diffusion|diffuses|filter channel|material filter|passes the filter|retained by filter)\b/i,
    ],
    parseExpansionDiffusionFilter,
  ),
  definition(
    '77',
    'signal-composition',
    'interference',
    'process',
    `template:analytic-superposition; entities:${entities}; scope,period,condition?; records:[${fact}] role:composition; relations:[${fact}] role:result; waves:[{actor,model:sine,amplitude:${quantity},frequency:${quantity},phaseData:${quantity},domainDuration:${quantity}}]; exactly 3 entities,2 sine waves,1 composition,1 result; parameter claims:amplitude/frequency/phase/duration, units:metre/hertz/radian/second; unknown parameters disable unsupported numeric sampling; authored signal-sum is derived teaching, not telemetry`,
    [/\b(?:interference|wave superposition|signals combine|wave phase|analytic waves)\b/i],
    parseExpansionInterference,
  ),
  definition(
    '78',
    'material-process',
    'state-cycle',
    'process',
    `template:source-state-cycle; entities:${entities}; scope,period,condition?; records:[${fact}] roles:initial-state,forward-transition,return-transition; relations:[${fact}] role:result; exactly2 entities,3 records,1result; source state conditions and actual unresolved/stated cycle only`,
    [/\b(?:state cycle|material cycle|phase transition|returns to its state|cycle conditions)\b/i],
    parseExpansionMaterialStateCycle,
  ),
  definition(
    '79',
    'conservation-flow',
    'energy-budget',
    'process',
    `template:energy-carriers; entities:${entities}; actor,scope,period; records:[{quantity:${quantity}}]; relations:[{from,to,claim,evidence:${span}}]; claims:input energy|output energy|loss|stored energy; units:joule|kilojoule, identical compatible basis; resolve retains expressly known/unknown loss; do not derive absent loss/balance/efficiency`,
    [
      /\b(?:energy budget|energy transfers|unknown loss|stored energy|input energy|output energy)\b/i,
    ],
    parseExpansionEnergyBudget,
  ),
  definition(
    '80',
    'field-map',
    'directional-field',
    'process',
    `template:uniform-field|radial-field; evidence:illustrative; domain:teaching-plane; qualification:illustrative teaching model|simulated teaching model; entities:${entities}; actor,scope,period; records:[{quantity:${quantity}}]; relations:[{from,to,claim,evidence:${span}}]; claims:strength unit ratio, direction unit degree (uniform only); explicit teaching parameters never known measured facts; no destinations invented`,
    [/\b(?:directional field|uniform field|radial field|teaching field|field direction)\b/i],
    parseExpansionDirectionalField,
  ),
];
