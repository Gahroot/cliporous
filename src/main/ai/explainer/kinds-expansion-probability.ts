import { expansionStory } from '../../remotion/compositions/explainer/expansion/catalog';
import type { ExpansionStoryBase } from '../../remotion/compositions/explainer/expansion/scene-types';
import type { ExpansionPresetSpec } from './expansion-preset-spec';
import {
  parseExpansionBaseRate,
  parseExpansionBayesUpdate,
} from './expansion-probability-base-update-contract';
import {
  parseExpansionConditioning,
  parseExpansionSelectionBias,
} from './expansion-probability-conditioning-sampling-contract';
import {
  parseExpansionCalibration,
  parseExpansionRiskMatrix,
} from './expansion-probability-risk-calibration-contract';
import {
  parseExpansionQualifiedInterval,
  parseExpansionRepeatedSamples,
} from './expansion-probability-variation-range-contract';
import type { KindFamily, ParseContext, Rec } from './kind-spec';

const envelope =
  'kind,preset,visualMode:diagram|hybrid,label,subject,outcome,evidence:source-stated|illustrative,startWord,endWord,layout:stack|stack-flipped,setupWord,actionWord,responseWord,checkWord,resolveWord,condition?';
const span = '{fromWord,toWord} (one complete locally attributed source clause)';
const entities = `[{label,evidence:${span}}] (references below are exact entity labels, never IDs)`;
const quantity = `{actor,claim,state:known|conditional|simulated|illustrative|unknown|missing|disputed,basis:{unit,period,population,denominator?:{numerator,denominator}},amount?:{kind:rational,value:{numerator,denominator}}|{kind:money,value:{currency:USD|EUR|GBP,minorUnits}},alternatives?:[amount,amount],condition?,qualifier?,evidence:${span}}`;
const display =
  '{mode:individual|aggregate,marks:integer<=100} (known integer counts only, total<=100; aggregation retains exact members per mark)';
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
    limits: `${entry.sourceRequirements} Preserve local actor, period, population, denominator, numeric precision and qualifications. At most 8 entities, 12 records, 100 total population marks; lower preset caps apply. Only complete known operands may use the exact whitelisted ratio derivation; no inferred confidence, fitted curve or zero for unknown. Five distinct source clauses, 5–12 seconds, final hold >=0.8 seconds. No winner, truth guarantee, diagnosis, arbitrary templates, caller IDs or treatment.`,
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

/** Unregistered local definitions; registration requires actual views and production fixtures. */
export const EXPANSION_PROBABILITY_SPECS = [
  definition(
    '09',
    'probability-workbench',
    'base-rate',
    'framework',
    `entities:${entities}; population,subset,selection; representation:counts|rates; records:[{role:population-total|subset-total|selected-total|selected-subset|prevalence|selection-rate|selected-prevalence,quantity:${quantity}}]; relationEvidence:${span}; counts require all four totals, rates all three compatible supplied rates; display is explicitly schematic, never individual people`,
    [/\b(?:base rate|prevalence|false positives?|selection rate|selected prevalence)\b/i],
    parseExpansionBaseRate,
  ),
  definition(
    '10',
    'probability-workbench',
    'bayes-update',
    'framework',
    `entities:${entities}; population,hypothesis,evidenceLabel,complement?; updateMode:derive|source-stated|unresolved; records:[{role:prior|likelihood-hypothesis|likelihood-complement|posterior,quantity:${quantity}}]; relationEvidence:${span}; derive requires complete complementary likelihoods, exact prior and explicit exhaustive complement; source-stated retains posterior, unresolved invents none`,
    [/\b(?:Bayes|Bayesian|prior belief|posterior|likelihood|belief update)\b/i],
    parseExpansionBayesUpdate,
  ),
  definition(
    '11',
    'probability-workbench',
    'conditioning',
    'framework',
    `entities:${entities}; owner,population,event,subset,denominator (the same subset); inclusion:{rule,evidence:${span}}; counts:{population:{quantity:${quantity},display?:${display}},subset:{quantity:${quantity},display?:${display}},event:{quantity:${quantity},display?:${display}}}; derive?:ratio`,
    [
      /\b(?:conditional probability|given that|conditioning|subset denominator|within the subset)\b/i,
    ],
    parseExpansionConditioning,
  ),
  definition(
    '12',
    'sampling-frame',
    'selection-bias',
    'framework',
    `entities:${entities}; owner,frame; selection:{rule,evidence:${span}}; eligibility:[{group,rule,status:represented|excluded,evidence:${span}}]; measurements:[{quantity:${quantity},display?:${display}}]; resolveGroup (an explicitly excluded group); excluded from the sampling frame never means absent from the world`,
    [
      /\b(?:selection bias|sampling frame|excluded groups?|inclusion rule|sample versus population)\b/i,
    ],
    parseExpansionSelectionBias,
  ),
  definition(
    '13',
    'probability-workbench',
    'repeated-samples',
    'compare',
    `entities:${entities}; population:{entity,period,evidence:${span}}; samples:[{entity,quantity:${quantity}}]; meaning:{qualification:supplied samples|illustrative samples|teaching samples,evidence:${span}}; resolutionEvidence:${span}; at least two source samples, no invented random observations or statistical confidence`,
    [/\b(?:repeated samples|sampling variation|sample to sample|samples differ)\b/i],
    parseExpansionRepeatedSamples,
  ),
  definition(
    '14',
    'uncertainty-range',
    'qualified-interval',
    'compare',
    `entities:${entities}; population:{entity,period,evidence:${span}}; actor; lower:${quantity}; upper:${quantity}; meaning:{kind:range|bounds|estimate|uncertain,qualification,evidence:${span}}; resolutionEvidence:${span}; retain endpoint basis and stated uncertainty meaning, never invent confidence level`,
    [
      /\b(?:uncertainty range|estimate range|range of estimates|lower bound|upper bound|uncertain interval)\b/i,
    ],
    parseExpansionQualifiedInterval,
  ),
  definition(
    '15',
    'quadrant',
    'risk-matrix',
    'compare',
    `entities:${entities}; records:[{actor,event,likelihood:dimension,impact:dimension}]; dimension={state:qualitative,label,period,population,evidence:${span},condition?}|{state:unknown,qualifier,period,population,evidence:${span},condition?}|{state:quantity,quantity:${quantity}}; check:{evidence:${span},condition?}; result:{status:scoped,evidence:${span},condition?}; qualitative dimensions are not numerical scores`,
    [
      /\b(?:risk matrix|probability versus impact|likelihood and impact|low likelihood|high impact)\b/i,
    ],
    parseExpansionRiskMatrix,
  ),
  definition(
    '16',
    'probability-workbench',
    'calibration',
    'compare',
    `entities:${entities}; records:[{label,actor,prediction:${quantity},observation:${quantity},comparison:{state:compared,relation:below|equal|above,evidence:${span},condition?}|{state:uncompared,evidence:${span},condition?},deriveRatios?:boolean}]; result:{status:scoped,evidence:${span},condition?}; paired comparable basis; unknown observations remain uncompared, no fitted accuracy judgment`,
    [
      /\b(?:calibration|predictions? and observations?|predicted versus observed|forecast calibration)\b/i,
    ],
    parseExpansionCalibration,
  ),
] as const;
