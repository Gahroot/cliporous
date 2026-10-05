import { expansionStory } from '../../remotion/compositions/explainer/expansion/catalog';
import type { ExpansionStoryBase } from '../../remotion/compositions/explainer/expansion/scene-types';
import type { ExpansionPresetSpec } from './expansion-preset-spec';
import {
  parseExpansionAggregationLoss,
  parseExpansionCompressionLoss,
} from './expansion-representations-information-loss-contract';
import {
  parseExpansionCoordinateProjection,
  parseExpansionMatrixProduct,
} from './expansion-representations-projection-matrix-contract';
import {
  parseExpansionEquivalence,
  parseExpansionUnitConversion,
} from './expansion-representations-units-equivalence-contract';
import {
  parseExpansionFactorization,
  parseExpansionVectorBasis,
} from './expansion-representations-vector-factorization-contract';
import type { KindFamily, ParseContext, Rec } from './kind-spec';

const envelope =
  'kind,preset,visualMode:diagram|hybrid,label,subject,outcome,evidence:source-stated|illustrative,startWord,endWord,layout:stack|stack-flipped,setupWord,actionWord,responseWord,checkWord,resolveWord';
const span = '{fromWord,toWord} (complete locally attributed source clause)';
const entities = `[{label,evidence:${span}}] (labels are source references, never supplied IDs)`;
const rational = '{numerator:bounded safe integer,denominator:bounded positive integer}';
const quantity = `{actor,claim,state:known|conditional|simulated|illustrative|unknown|missing|disputed,basis:{unit,period,population,denominator?:${rational}},amount?:{kind:rational,value:${rational}},alternatives?:[amount,amount],condition?,qualifier?,evidence:${span}}`;
const fact = `actor,scope,period,state:known|conditional|unknown|missing|disputed|simulated|illustrative,condition?,qualifier?,evidence:${span}`;
const representationFact = `actor,identity,population,period,evidence:${span}`;
const matrixQualification = `state:known|conditional|unknown|missing|disputed|simulated|illustrative,condition?,qualifier?,evidence:${span}`;
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
    throw new Error('Authored representations definition disagrees with its frozen route');
  return {
    storyId: id,
    kind,
    preset,
    family,
    describe: entry.purpose,
    schema: `${envelope}; ${fields}`,
    limits: `${entry.sourceRequirements} No invented operand, ratio, aggregate total, recovery, coordinate, frame, coefficient, numeric output, condition or identity. Derivations: ${entry.allowedDerivations.join(',') || 'none'} only for this exact preset and its explicit source request; retain all operands/basis/source states and mark results derived. Unknown/missing/disputed/conditional/simulated/illustrative never become known zero, a unique answer or measured truth. Bind each actor/claim/unit/period/population/denominator locally; matching another actor's number is insufficient. Signed exact bounded rational arithmetic, reject overflow/zero denominators/incompatible basis; no lossy rounding. 8 actors,12 records,16 relations,4x4 per matrix,100 displayed population marks, lower preset caps apply. Five distinct complete source clauses and five beats with >=1s gaps,5–12s window and >=.8s final hold. Domain values are never at/...At animation fields. Both modes retain identical source facts/identity/qualification/time and planar numerical evidence. Only authored unit/geometry/algebra/view templates; no caller camera/geometry/SVG/HTML/code/function evaluator/URL/file/IDs/treatment. References establish provenance, not guaranteed truth.`,
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
/** Local definitions only: no runtime registration before actual views and render fixtures. */
export const EXPANSION_REPRESENTATIONS_SPECS = [
  definition(
    '49',
    'representation-transform',
    'unit-conversion',
    'process',
    `template:compatible-units; actors:${entities}; identity,population,period; quantity:${quantity}; conversion:{${representationFact},fromUnit,toUnit}; result:{${representationFact},operation:unit-conversion}; outcome:conversion; exact authored compatible metric/time/mass/energy pair only, never exchange rates or approximate angular conversions`,
    [
      /\b(?:unit conversion|convert units|centimetres? to metres?|metres? to centimetres?|grams? to kilograms?|minutes? to seconds?|same quantity)\b/i,
    ],
    parseExpansionUnitConversion,
  ),
  definition(
    '50',
    'representation-transform',
    'equivalence',
    'compare',
    `template:equivalent-views; actors:${entities}; identity,population,period; quantities:[selected:${quantity},total:${quantity}]; views:[two or three distinct set|area|length]; aggregation:{${representationFact},marks?:integer,unitsPerMark?:${rational}}; result:{${representationFact},operation:ratio}; outcome:equivalent views; same source identity/count unit/basis, exact coverage and explicit aggregate legend; no invented people or fractional individual marks`,
    [
      /\b(?:equivalent views|same fraction|same ratio|set area and length|different representations|equivalent representations)\b/i,
    ],
    parseExpansionEquivalence,
  ),
  definition(
    '51',
    'information-transform',
    'aggregation-loss',
    'process',
    `template:grouped-records; actor,scope,period; entities:${entities}; records:[{${fact},label,stage:input|output,details:[source details]}]; quantities:[{record:label,detail,quantity:${quantity}}]; relations:[{${fact},type:grouping|correspondence|retained|omitted,from:record label,to:record label,detail?}]; result:{${fact},from,to,behavior:lossless|lossy|unknown}; no derived totals/averages or inferred omission; no raster templates`,
    [
      /\b(?:aggregation loss|grouped records|aggregation loses|detail is omitted|retained detail|grouping hides)\b/i,
    ],
    parseExpansionAggregationLoss,
  ),
  definition(
    '52',
    'information-transform',
    'compression-loss',
    'process',
    `template:paired-records; actor,scope,period; entities:${entities}; records:[{${fact},label,stage:input|output,details:[source details]}]; quantities:[{record:label,detail,quantity:${quantity}}]; relations:[{${fact},type:grouping|correspondence|retained|omitted,from,to,detail?}]; result:{${fact},from,to,behavior:lossless|lossy|unknown}; original authored bounded records only, no derived compression ratio/recovery or uploaded raster`,
    [
      /\b(?:lossless compression|lossy compression|compression loses|compressed record|retains all details|compression loss)\b/i,
    ],
    parseExpansionCompressionLoss,
  ),
  definition(
    '53',
    'geometry-projection',
    'coordinates',
    'process',
    `template:orthographic-xy|reference-xy; evidence:illustrative; condition?; period,population; entities:${entities}; frames:[{label,axes:[{axis:x,positive:right},{axis:y,positive:up}],evidence:${span}}]; records:[{actor,frame:label,axis:x|y,quantity:${quantity}}]; relations:[{fromActor,toActor,fromFrame,toFrame,state:illustrative|conditional,qualifier:schematic,condition?,evidence:${span}}]; source-supplied coordinates only, no derived/projected coordinate or caller camera/geometry`,
    [
      /\b(?:orthographic projection|reference frame|coordinate frames|schematic projection|supplied coordinates|projection axes)\b/i,
    ],
    parseExpansionCoordinateProjection,
  ),
  definition(
    '54',
    'linear-algebra',
    'matrix-product',
    'process',
    `template:row-column-product; condition?; period,population; entities:${entities}; records:[{actor,label,claim,basis:{unit:ratio,period,population,denominator?:${rational}},rows:[source axis labels],columns:[source axis labels],values?:[[${rational}]],${matrixQualification}}]; relations:[{actor,left:matrix label,right:matrix label,operation:matrix-product,${matrixQualification}}]; complete compatible source matrix operands<=4x4 each, no values on unresolved matrices; retain row/column identities and each exact product term`,
    [
      /\b(?:matrix product|matrix multiplication|row column product|multiply matrices|compatible matrices)\b/i,
    ],
    parseExpansionMatrixProduct,
  ),
  definition(
    '55',
    'linear-algebra',
    'vector-basis',
    'process',
    `template:planar-components|spatial-components; entities:${entities}; actor,scope,period,condition?,frame,axes:[x,y] or[x,y,z]; vector:{label,components:[{axis,direction:positive|negative|zero|unknown|missing|disputed,quantity:${quantity}}]}; basis:[same supplied vector shape]; correspondence:{actor,frame,vector:label,basis:[labels],evidence:${span}}; result:{actor,claim:component display,evidence:${span}}; no derived components, coefficients, norms, rotations or frames`,
    [
      /\b(?:vector basis|basis vectors|vector components|signed components|component directions|supplied vector)\b/i,
    ],
    parseExpansionVectorBasis,
  ),
  definition(
    '56',
    'equation',
    'factorization',
    'process',
    `template:common-factor|integer-difference-of-squares; operation:factorization; entities:${entities}; actor,scope,period,condition?,symbol:x|y|z; operands:[{role:linear coefficient|constant term|common factor|inner coefficient|inner constant|first base|second base|square coefficient,quantity:${quantity}}]; request:{actor,operation:factorization,evidence:${span}}; result:{actor,state,qualifier?,condition?,evidence:${span}}; exact authored identity only from complete source operands, never parse arbitrary expressions/LaTex/code`,
    [
      /\b(?:factorization|factorisation|common factor|difference of squares|factor an expression|factored identity)\b/i,
    ],
    parseExpansionFactorization,
  ),
] as const;
