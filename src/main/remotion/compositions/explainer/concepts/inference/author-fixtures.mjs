// Reproducible synthetic source stories. Run from the repository root, after reading the target.
import fs from 'node:fs';
import { conceptFixtureWords } from '../fixture-words.ts';
const path = 'scripts/explainer-stills/fixtures/concept-inference.json';
const palettes = JSON.parse(fs.readFileSync('scripts/explainer-stills/fixtures/clay-cognition.json', 'utf8'));
const light = palettes[0].palette;
const dark = palettes[1].palette;
const defs = [
  {kind:'token-choice',preset:'next-token',label:'Next word choice',subject:'writer',outcome:'keeps flies as a continuation',sentence:'Time',candidates:['flies','falls'],selected:'flies',nextCandidates:['like','above'],blocks:[
    'Next word choice shows writer continuing a sentence beginning with Time.',
    'writer considers flies and falls after Time.',
    'writer selects flies after Time as a continuation.',
    'writer considers like and above after flies.',
    'writer keeps flies as a continuation for this particular sentence.'
  ],visuals:['Orient the sentence and empty continuation slot.','Reveal distinct candidate word tiles.','Move only flies into the sentence; keep falls visible.','Reveal the next candidate words without choosing a winner.','Hold the continued sentence and all remaining alternatives.']},
  {kind:'token-choice',preset:'uncertain-choice',label:'Uncertain word choice',subject:'writer',outcome:'choice remains uncertain',uncertainty:'choice remains uncertain',sentence:'Time',candidates:['flies','falls','waits'],selected:'flies',nextCandidates:['like','above'],blocks:[
    'Uncertain word choice shows writer continuing a sentence beginning with Time.',
    'writer considers flies and falls and waits after Time.',
    'writer tentatively selects flies after Time as a possible continuation.',
    'writer considers like and above after flies.',
    'writer keeps flies as a tentative continuation and choice remains uncertain.'
  ],visuals:['Orient the prefix without a verdict.','Reveal three source candidates at equal scale.','Seat the tentative word with a divided underline; alternatives stay.','Offer subsequent candidates without probabilities.','Hold alternatives and the complete uncertainty qualifier.']},
  {kind:'expert-selection',preset:'single-specialist',label:'Specialist selection',subject:'invoice task',outcome:'holds sum',experts:[{label:'math expert',role:'math',selected:true,contribution:'sum'},{label:'vision expert',role:'vision',selected:false}],blocks:[
    'Specialist selection concerns invoice task and these named specialist roles.',
    'invoice task selects math expert. invoice task leaves vision expert inactive.',
    'math expert returns sum to invoice task for the requested arithmetic.',
    'The same task receives the contribution while the other station stays inactive.',
    'invoice task holds sum for the requested invoice in this illustration.'
  ],visuals:['Orient one task folder and calculator/camera specialist stations.','Open only the selected calculator station and dispatch its request.','Reveal the named sum contribution at that station.','Return that contribution to the original task folder.','Hold the task with its contribution; vision stays inactive.']},
  {kind:'expert-selection',preset:'specialist-team',label:'Selected specialist team',subject:'report task',outcome:'holds summary and chart',experts:[{label:'language expert',role:'language',selected:true,contribution:'summary'},{label:'math expert',role:'math',selected:true,contribution:'chart'},{label:'code expert',role:'code',selected:false}],blocks:[
    'Selected specialist team concerns report task and its explicitly named specialist roles.',
    'report task selects language expert. report task selects math expert. report task leaves code expert inactive.',
    'language expert returns summary to report task. math expert returns chart to report task.',
    'The original task receives both contributions while the code station stays inactive.',
    'report task holds summary and chart for the requested report in this illustration.'
  ],visuals:['Orient the same task and book/calculator/laptop tools.','Select only language and math; leave code shutter closed.','Reveal the two separately identified contributions.','Return both contributions to the same folder.','Hold both contributions and explicit nonselection; no universal architecture claim.']},
  {kind:'edge-cloud',preset:'local-processing',label:'Local camera processing',subject:'camera',outcome:'retains outline',device:'camera',localWork:'frame',localResult:'outline',blocks:[
    'Local camera processing illustrates camera handling a frame on its own processor.',
    'camera processes frame locally for this particular illustrated operation.',
    'camera produces outline from frame locally on its processor.',
    'The resulting outline stays on the device for this operation.',
    'camera retains outline from this operation on the same device.'
  ],visuals:['Orient a recognizable camera and its visible local chip.','Move the frame into the camera processor.','Reveal the source-stated outline on the device.','Keep that local result on the camera.','Hold this local operation only; imply neither privacy nor absence of networking.']},
  {kind:'edge-cloud',preset:'split-processing',label:'Split phone processing',subject:'phone',outcome:'retains crop and matches',device:'phone',localWork:'photo',localResult:'crop',remote:{service:'cloud service',work:'search request',result:'matches'},blocks:[
    'Split phone processing illustrates phone handling a photo alongside a cloud service.',
    'phone processes photo locally for the first part of this operation.',
    'phone produces crop from photo locally on its processor.',
    'phone sends only search request to cloud service. cloud service returns matches to phone.',
    'phone retains crop and matches for this particular illustrated operation.'
  ],visuals:['Orient phone, its chip and a separate cloud/server silhouette.','Process the photo locally first.','Keep the crop on the phone.','Send only the named request; return the named matches on a separate path.','Hold both results on the phone; do not claim all data stayed local.']},
];
const fields=['setup','action','response','check','resolve'];
const fixtures=defs.map(d=>{
  const durationSec=11.4, sourceText=d.blocks.join(' '), words=conceptFixtureWords(sourceText,durationSec);
  let offset=0;
  const storyboard=d.blocks.map((source,i)=>{const word=offset;offset+=source.split(/\s+/).length;return {beat:fields[i],word,at:Math.max(.3,words[word].start),source,visual:d.visuals[i],camera:'Fixed existing ExplanationStage camera; model and text rails remain reserved.'};});
  const span=(text)=>{const index=sourceText.indexOf(text);if(index<0) throw new Error(text);const fromWord=sourceText.slice(0,index).trim().split(/\s+/).filter(Boolean).length;return {fromWord,toWord:fromWord+text.split(/\s+/).length-1};};
  const plannerInput={kind:d.kind,preset:d.preset,startWord:0,endWord:words.length-1,layout:'stack',label:d.label,subject:d.subject,outcome:d.outcome,...Object.fromEntries(storyboard.map(b=>[`${b.beat}Word`,b.word]))};
  const scene={kind:d.kind,preset:d.preset,label:d.label,subject:d.subject,outcome:d.outcome,...Object.fromEntries(storyboard.map(b=>[`${b.beat}At`,b.at]))};
  if(d.kind==='token-choice'){
    Object.assign(plannerInput,{sentence:d.sentence,candidates:d.candidates,selected:d.selected,nextCandidates:d.nextCandidates,candidateEvidence:span(d.blocks[1]),selectionEvidence:span(d.blocks[2]),nextEvidence:span(d.blocks[3])});
    Object.assign(scene,{sentence:d.sentence,candidates:d.candidates.map((label,i)=>({id:`candidate-${i}`,label})),selectedId:`candidate-${d.candidates.indexOf(d.selected)}`,nextCandidates:d.nextCandidates.map((label,i)=>({id:`next-${i}`,label})),candidateEvidence:plannerInput.candidateEvidence,selectionEvidence:plannerInput.selectionEvidence,nextEvidence:plannerInput.nextEvidence});
    if(d.uncertainty){plannerInput.uncertainty=d.uncertainty;scene.uncertainty=d.uncertainty;}
  }else if(d.kind==='expert-selection'){
    plannerInput.experts=d.experts.map(e=>{
      const action=`${d.subject} ${e.selected?'selects':'leaves'} ${e.label}${e.selected?'':' inactive'}.`;
      const expert={...e,evidence:span(action)};
      if(e.selected){const clause=d.blocks[2].split(/(?<=\.)\s+/).find(s=>s.startsWith(e.label));expert.returnEvidence=span(clause);}
      return expert;
    });
    scene.experts=plannerInput.experts.map((e,i)=>({id:`expert-${i}`,...e}));
  }else{
    Object.assign(plannerInput,{device:d.device,localWork:d.localWork,localResult:d.localResult,localEvidence:span(d.blocks[1]),localResultEvidence:span(d.blocks[2])});
    Object.assign(scene,{device:d.device,localWork:d.localWork,localResult:d.localResult,localEvidence:plannerInput.localEvidence,localResultEvidence:plannerInput.localResultEvidence});
    if(d.remote){const [send,ret]=d.blocks[3].split(/(?<=\.)\s+/);plannerInput.remote={...d.remote,sendEvidence:span(send),returnEvidence:span(ret)};scene.remote=plannerInput.remote;}
  }
  const samples=[{name:'setup',frame:24},{name:'primary-change',frame:Math.round((scene.actionAt+scene.responseAt)*15)},{name:'relationship-reveal',frame:Math.round((scene.responseAt+scene.checkAt)*15)},{name:'comparison',frame:Math.round((scene.checkAt+scene.resolveAt)*15)},{name:'final-hold',frame:Math.round((scene.resolveAt+.85)*30)}];
  return {name:`${d.kind}-${d.preset}`,covers:[{category:'kind',id:d.kind},{category:'explanation',id:`${d.kind}/${d.preset}`}],description:'Synthetic source-grounded illustration, not a measured model result. Fixed camera and bounded authored objects.',sourceText,durationSec,plannerInput,storyboard,scene,samples,palette:light,cases:[{name:'stack-light',layout:'stack',aspect:'9:16'},{name:'stack-dark',layout:'stack',aspect:'9:16',palette:dark},{name:'flipped-light',layout:'stack-flipped',aspect:'9:16'},{name:'takeover-dark',layout:'takeover',aspect:'9:16',palette:dark},{name:'landscape-over',layout:'over',aspect:'16:9'}]};
});
fs.writeFileSync(path,JSON.stringify(fixtures,null,2)+'\n');
console.log(`Created ${fixtures.length} fixtures / ${fixtures.reduce((s,f)=>s+f.samples.length,0)} semantic samples with padded-word plannerInput.`);
