import { expansionStory } from '../../remotion/compositions/explainer/expansion/catalog';
import type { ExpansionStoryBase } from '../../remotion/compositions/explainer/expansion/scene-types';
import {
  parseExpansionLinkedScale,
  parseExpansionPackingClearance,
} from './expansion-geometry-fit-scale-contract';
import {
  parseExpansionDimensionalScaling,
  parseExpansionRegionOverlap,
} from './expansion-geometry-regions-dimensions-contract';
import {
  parseExpansionSectionScan,
  parseExpansionSolidUnfold,
} from './expansion-geometry-section-unfold-contract';
import {
  parseExpansionReachability,
  parseExpansionViewpointOcclusion,
} from './expansion-geometry-visibility-access-contract';
import type { ExpansionPresetSpec } from './expansion-preset-spec';
import type { KindFamily, ParseContext, Rec } from './kind-spec';

const envelope =
  'kind,preset,visualMode:diagram|hybrid,label,subject,outcome,evidence:source-stated|illustrative,startWord,endWord,layout:stack|stack-flipped,setupWord,actionWord,responseWord,checkWord,resolveWord';
const span = '{fromWord,toWord} (complete locally attributed source clause)';
const entities = `[{label,evidence:${span}}] (source labels as references, never caller IDs)`;
const rational = '{numerator:bounded safe integer,denominator:bounded positive integer}';
const quantity = `{actor,claim,state:known|conditional|simulated|illustrative|unknown|missing|disputed,basis:{unit,period,population,denominator?:${rational}},amount?:{kind:rational,value:${rational}},alternatives?:[amount,amount],condition?,qualifier?,evidence:${span}}`;
const qualification =
  'state:known|conditional|simulated|illustrative|unknown|missing|disputed,value?,condition?,qualifier?';
const fact = `actor,scope,period,${qualification},evidence:${span}`;
const sectionFact = `${fact},identity,claim,alternatives?`;
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
  if (
    entry.kind !== kind ||
    entry.preset !== preset ||
    entry.allowedDerivations.join(',') !== (id === '64' ? 'dimensional-scaling' : '')
  )
    throw new Error('Authored geometry route/derivation disagrees with the frozen catalog');
  return {
    storyId: id,
    kind,
    preset,
    family,
    describe: entry.purpose,
    schema: `${envelope}; ${fields}`,
    limits: `${entry.sourceRequirements} No invented part, face, region, enclosure, membership, measurement, fit verdict, visibility, existence, permission, route, geography, travel time or numeric output. Derivations: ${id === '64' ? 'dimensional-scaling with explicit source worked request and complete compatible nonnegative exact rational operands' : 'none'}. Retain source operands, identities, basis, conditions and qualifications, mark permitted output derived. Unknown/missing/disputed/conditional/simulated/illustrative never become known zero, absence, approval or measured truth. Actor/claim/scope/period/unit/population/denominator must bind locally; another actor number is insufficient.8 actors,12 records,16 relations; lower preset caps apply. Both modes preserve exact facts/source/identity/domain values/time and planar numerical evidence. Five distinct full source clauses and five beats >=1s,5–12s window,>=.8s final hold. Represented dimensions/scale/data do not use at/...At animation names. Only fixed authored templates/viewpoints/nets/parts; no caller geometry/polygons/world or camera coordinates/SVG/HTML/code/function evaluator/URL/file/IDs/treatment. Authored render geometry is schematic unless source measurements actually determine it; analytic kit area/volume/clearance values are not display facts. References are provenance, not guaranteed truth.`,
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
/** Local definitions only; registration waits for actual pack views/render fixtures. */
export const EXPANSION_GEOMETRY_SPECS = [
  definition(
    '57',
    'section-view',
    'scan',
    'process',
    `template:box|cylinder|gadget|house; actors:${entities}; identity,scope,period; parts:[{${sectionFact},part:authored interior name}]; section:{${sectionFact},part,value?:intersects|misses}; measurement:${quantity} bound to selected part width; result:{${sectionFact},value?:revealed|not-revealed|unresolved}; supplied interior/section facts only, no computed area/volume`,
    [
      /\b(?:section scan|section scanner|interior parts|cut through|cross section|section reveals)\b/i,
    ],
    parseExpansionSectionScan,
  ),
  definition(
    '58',
    'geometry-projection',
    'unfold',
    'process',
    `template:cube; net:cube-cross; actors:${entities}; identity,scope,period; faces:[front,right,left,top,bottom,back]; unfolding:{${sectionFact}}; correspondence:{${sectionFact},links?:[{from:face label,to:matched face label}]}; measurement:${quantity} bound to cube edge; result:{${sectionFact},value?:unfolded|unresolved}; six identities and explicit authored correspondence, no invented face or numeric net measurements`,
    [/\b(?:cube net|solid unfolding|unfold the cube|matched faces|unfolded net|six faces)\b/i],
    parseExpansionSolidUnfold,
  ),
  definition(
    '59',
    'floorplan-fit',
    'packing-clearance',
    'compare',
    `template:tray-block; actor,identity,scope,period; entities:${entities}; representation:schematic source qualification; records:[{${fact},label,role:container|part,template:tray|block}]; dimensions:[{record,axis:width|height|depth|clearance,reference?:container label,quantity:${quantity}}]; relations:[{${fact},type:candidate,from:part,to:container,identity}]; result:{${fact},part,container,verdict:fits|blocked|unknown}; stated fit and supplied clearance are independent, no geometry-derived verdict`,
    [
      /\b(?:packing clearance|clearance|fit in the tray|packing fit|container dimensions|fits inside)\b/i,
    ],
    parseExpansionPackingClearance,
  ),
  definition(
    '60',
    'scale-hierarchy',
    'linked-scale',
    'process',
    `template:object-room-building; actor,identity,scope,period; entities:${entities}; representation:schematic|measured; records:[{${fact},label,level:object|room|building,identity}]; dimensions:[{record,axis:width|height|depth,quantity:${quantity}}]; relations:[{${fact},type:encloses,from,to,identity}]; result:{${fact},identity,levels:[exact object,room,building labels]}; same tracked identity, explicit adjacent enclosures; no derived dimension or scale ratio`,
    [
      /\b(?:linked scale|same object at different scales|object room building|enclosing levels|scale hierarchy|tracked identity)\b/i,
    ],
    parseExpansionLinkedScale,
  ),
  definition(
    '61',
    'robot-perception',
    'viewpoint-occlusion',
    'process',
    `template:robot-panel|robot-box; viewpoint:front|isometric; scope,period; entities:${entities}; records:[{${fact},role:existence,target,value?:present|absent}|{${fact},role:visibility,target,occluder,viewpoint,value?:hidden|visible}]; relations:[{${fact},role:occlusion,target,occluder,viewpoint,value?:blocked|clear}]; existence and visibility separate source assertions, hidden is not absent`,
    [
      /\b(?:viewpoint occlusion|occluder|hidden is not absent|blocked view|target visibility|robot viewpoint)\b/i,
    ],
    parseExpansionViewpointOcclusion,
  ),
  definition(
    '62',
    'property-access',
    'reachability',
    'process',
    `template:gate-route|courtyard-route; scope,period; entities:${entities}; records:[{${fact},role:route|permission,from,to,route,value?:connected|disconnected|allowed|denied}]; relations:[{${fact},role:reachability,from,to,route,value?:reachable|unreachable}]; separate source route, permission and stated outcome; no travel/path/authorization inference`,
    [
      /\b(?:reachability|reachable route|access route|gate route|connection is not permission|courtyard route)\b/i,
    ],
    parseExpansionReachability,
  ),
  definition(
    '63',
    'region-relation',
    'overlap',
    'process',
    `template:two-authored-regions; entities:${entities}; actor,scope,period,condition?,member,regions:[two labels]; membership:{actor,member,region,${qualification},evidence:${span}}; restriction:{actor,region,${qualification},evidence:${span}}; overlap:{actor,left,right,${qualification},evidence:${span}}; result:{actor,claim:region summary,evidence:${span}}; explicit memberships/restrictions, never infer from drawing or supply maps/polygons`,
    [
      /\b(?:region boundaries|overlapping regions|region membership|overlap restriction|restricted region|two regions)\b/i,
    ],
    parseExpansionRegionOverlap,
  ),
  definition(
    '64',
    'geometry-projection',
    'dimensional-scaling',
    'process',
    `template:line-length|square-area|cube-volume; operation:dimensional-scaling; entities:${entities}; actor,scope,period,condition?; scale:${quantity}; original:${quantity}; request:{actor,operation:dimensional-scaling,evidence:${span}}; result:{actor,state,qualifier?,condition?,evidence:${span}}; exact linear/square/cube relationship and explicit compatible length/area/volume units, retain original scale/operands/basis`,
    [
      /\b(?:length area volume|dimensional scaling|square the scale|cube the scale|scaling length|scale factor)\b/i,
    ],
    parseExpansionDimensionalScaling,
  ),
] as const;
