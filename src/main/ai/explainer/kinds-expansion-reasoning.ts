import { expansionStory } from '../../remotion/compositions/explainer/expansion/catalog';
import type { ExpansionStoryBase } from '../../remotion/compositions/explainer/expansion/scene-types';
import type { ExpansionPresetSpec } from './expansion-preset-spec';
import {
  parseArgumentMapReasonsObjections,
  parseConditionalComparisonAssumptionToggle,
} from './expansion-reasoning-argument-contract';
import {
  parseExpansionConfounder,
  parseExpansionMissingEvidenceMap,
} from './expansion-reasoning-information-contract';
import {
  parseExpansionSameFacts,
  parseExpansionScopedStatements,
} from './expansion-reasoning-scope-contract';
import {
  parseClaimSourceBoard,
  parseEvidenceToClaimTrace,
} from './expansion-reasoning-trace-contract';
import type { KindFamily, ParseContext, Rec } from './kind-spec';

const envelope =
  'kind,preset,visualMode:diagram|hybrid,label,subject,outcome,evidence:source-stated,startWord,endWord,layout:stack|stack-flipped,setupWord,actionWord,responseWord,checkWord,resolveWord';
const span = '{fromWord,toWord} (one complete locally attributed source clause)';
const entities = `[{label,evidence:${span}}] (references below are exact entity labels, never IDs)`;
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
  return {
    storyId,
    kind,
    preset,
    family,
    describe: entry.purpose,
    schema: `${envelope}; ${fields}`,
    limits: `${entry.sourceRequirements} Keep complete local ownership, negation, conditions and uncertainty. At most 8 entities, 12 records and 16 relations; only authored source templates. Five distinct source clauses, 5–12 seconds, final hold >=0.8 seconds. No winner, truth guarantee, outside facts, caller IDs or treatment.`,
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

/** Unregistered local definitions. Parent wraps only after the real views and fixtures exist. */
export const EXPANSION_REASONING_SPECS = [
  definition(
    '01',
    'retrieval-grounding',
    'trace-chain',
    'process',
    `entities:${entities}; records:[{entity,role:excerpt|claim,content,source? (excerpt only),evidence:${span}}]; relations:[{from,to,role:provenance|support,evidence:${span},condition?}]`,
    [/\b(?:cit(?:e|es|ation)|provenance|source reference|evidence trace)\b/i],
    parseEvidenceToClaimTrace,
  ),
  definition(
    '02',
    'evidence-conflict',
    'claim-source-board',
    'compare',
    `entities:${entities}; records:[{entity,role:statement,content,source,evidence:${span}}]; relations:[{from,to,role:provenance|rebuttal,evidence:${span},condition?}]; state:disputed|unresolved`,
    [/\b(?:conflicting (?:evidence|sources|statements)|sources disagree|claim versus evidence)\b/i],
    parseClaimSourceBoard,
  ),
  definition(
    '03',
    'argument-map',
    'reasons-objections',
    'framework',
    `entities:${entities}; claim:label; nodes:[{entity,actor,role:claim|premise|objection,statement,evidence:${span},condition?}]; edges:[{from,to,role:support|rebuttal,state:stated|qualified|unknown|disputed|negated,evidence:${span},qualifier?,condition?}]; resolution:unknown|disputed|unresolved`,
    [/\b(?:premises?|objections?|rebuttals?|argument tree|supports the claim)\b/i],
    parseArgumentMapReasonsObjections,
  ),
  definition(
    '04',
    'conditional-comparison',
    'assumption-toggle',
    'compare',
    `condition (complete source condition); entities:${entities}; actor:label; alternatives:[label,label]; effects:[{alternative,actor,text,condition,evidence:${span}}]; resolution:unknown|disputed|unresolved`,
    [/\b(?:assuming|under the assumption|if instead|conditional alternatives)\b/i],
    parseConditionalComparisonAssumptionToggle,
  ),
  definition(
    '05',
    'relationship-analysis',
    'confounder',
    'framework',
    `scope; entities:${entities}; association:{from,to,evidence:${span}}; factor:{entity,affects:[label,label],certainty:stated|possible,qualification?:may|might|could,condition?,evidence:${span}}; causalStatus:{from,to,qualification,evidence:${span}}; resolutionEvidence:${span}`,
    [/\b(?:correlation|association|confound(?:er|ing)|third factor|causation not established)\b/i],
    parseExpansionConfounder,
  ),
  definition(
    '06',
    'retrieval-grounding',
    'missing-evidence-map',
    'framework',
    `scope; entities:${entities}; records:[{owner,topic,state:known|missing|unknown,content? (known only),qualification? (missing/unknown only),evidence:${span}}]; focusRecord:index; nonFalse:{record:index,qualification,evidence:${span}}; resolution:{record:index,status:unresolved,evidence:${span}}`,
    [
      /\b(?:missing (?:evidence|information)|not yet known|unknown information|known versus unknown)\b/i,
    ],
    parseExpansionMissingEvidenceMap,
  ),
  definition(
    '07',
    'evidence-conflict',
    'scoped-statements',
    'compare',
    `actors:${entities}; statements:[{label,actor,source,version,period,scope,claim,status:reported|disputed|unresolved,evidence:${span},condition?}]; relations:[{fromLabel,toLabel,role:scope-distinction|conflict,dimension?:actor|version|period|scope,status:disputed|unresolved,evidence:${span},condition?}]; result:{status:disputed|unresolved,evidence:${span},condition?}; reported means exact source attribution, never truth or certainty; retain every modal or negated word`,
    [/\b(?:different (?:scopes|versions|periods)|scoped statements|contradiction in context)\b/i],
    parseExpansionScopedStatements,
  ),
  definition(
    '08',
    'framing-comparison',
    'same-facts',
    'compare',
    `actors:${entities}; facts:[{actor,label,quantity:{actor,claim,state:known|conditional|simulated|illustrative|unknown|missing|disputed,basis:{unit:count|ratio|percent|percentage-point|percent-change|second|minute|hour|day|millimetre|centimetre|metre|square-metre|cubic-metre|gram|kilogram|joule|kilojoule|watt|hertz|radian|degree|byte|item/second|USD|EUR|GBP,period,population,denominator?:{numerator,denominator}},amount?:{kind:rational,value:{numerator,denominator}}|{kind:money,value:{currency:USD|EUR|GBP,minorUnits}},alternatives?:[amount,amount],condition?,qualifier?,evidence:${span}}}]; frames:[{label,factIndexes:[indexes of identical full pool],referenceFactIndex,evidence:${span}},{label,factIndexes:[same indexes],referenceFactIndex,evidence:${span}}]; relations:[{fromLabel,toLabel,role:reference-change|denominator-change,evidence:${span},condition?}]; result:{status:unchanged,evidence:${span},condition?}; no derived ratios`,
    [
      /\b(?:same facts|different framing|change (?:the )?(?:reference|denominator)|framing comparison)\b/i,
    ],
    parseExpansionSameFacts,
  ),
] as const;
