import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import createJiti from 'jiti';

// Use the installed TS loader: execute the real planner, not a hand-constructed render scene.
const load = createJiti(fileURLToPath(import.meta.url), { alias: { '@shared': resolve('src/shared') } });
const { conceptFixtureWords } = load('../fixture-words.ts');
const { parseExplainerPlan } = load('../../../../../ai/explainer-scenes.ts');
const light = {bgOuter:'#f6ecd9',bgInner:'#fff8ed',card:'#ffffff',cardRaised:'#fffdfa',cardBorder:'rgba(35,16,12,0.14)',text:'#23100c',muted:'#725f58',accent:'#8254d9',accent2:'#8b6570',accentSoft:'rgba(130,84,217,0.18)',positive:'#367b50',negative:'#ad4939',paper:'#ffffff',paperText:'#23100c',clay:['#c5adeb','#ead8cc','#9881bf']};
const dark = {bgOuter:'#23100c',bgInner:'#321c18',card:'#432b26',cardRaised:'#51352e',cardBorder:'rgba(246,236,217,0.14)',text:'#f6ecd9',muted:'#c7ada3',accent:'#9f75ff',accent2:'#c594a2',accentSoft:'rgba(159,117,255,0.18)',positive:'#8cb698',negative:'#d89a87',paper:'#f6ecd9',paperText:'#23100c',clay:['#c5adeb','#ead8cc','#9881bf']};
const beatNames = ['setup','action','response','check','resolve'];
function fixture(kind,preset,parts,base,configure,actions){
 const padded=parts.map(part=>part.split(/\s+/).length<10?`${part} The same identities stay visible throughout this illustration.`:part);
 const indices=[];let index=0;for(const part of padded){indices.push(index);index+=part.split(/\s+/).length;}
 const sourceText=padded.join(' '); const tokens=sourceText.split(/\s+/); const durationSec=12;
 const words=conceptFixtureWords(sourceText,durationSec);
 const word=(phrase)=>{const terms=phrase.split(/\s+/);const i=tokens.findIndex((_,i)=>terms.every((text,n)=>tokens[i+n]?.toLowerCase().replace(/[.;]$/,'')===text.toLowerCase().replace(/[.;]$/,'')));if(i<0)throw new Error(phrase);return i;};
 const plannerInput={kind,preset,startWord:0,endWord:tokens.length-1,layout:'stack',...base,...Object.fromEntries(beatNames.map((name,i)=>[name+'Word',indices[i]]))};
 configure(plannerInput,word);
 const plans=parseExplainerPlan({scenes:[plannerInput]},words,{minStart:0,maxEnd:60});
 if(plans.length!==1)throw new Error(`Production planner rejected ${kind}/${preset}`);
 const plan=plans[0];
 if(plan.startTime!==0||Math.abs(plan.endTime-durationSec)>1e-8)throw new Error(`Unexpected fixture window for ${preset}`);
 // startTime is exactly zero: preserve source precision, without renderer millisecond rounding.
 const scene=plan.scene;
 const at=beatNames.map(name=>scene[name+'At']);
 return {name:kind+'-'+preset,covers:[{category:'kind',id:kind},{category:'explanation',id:kind+'/'+preset}],description:'Synthetic Pack D storyboard, not measured business data. Qualitative actors are illustrative; quantitative counts quote this named source population only.',sourceText,durationSec,plannerInput,sourceBeats:padded.map((text,i)=>({at:at[i],text,storyboard:actions[i]})),storyboard:actions.map((action,i)=>({beat:beatNames[i],word:indices[i],at:at[i],action,camera:'Existing fixed ExplanationStage camera; preserve editorial rails.'})),cases:[{name:'stack-light',layout:'stack',aspect:'9:16',palette:light},{name:'stack-dark',layout:'stack',aspect:'9:16',palette:dark},{name:'stack-flipped-light',layout:'stack-flipped',aspect:'9:16',palette:light},{name:'takeover-dark',layout:'takeover',aspect:'16:9',palette:dark},{name:'over-light',layout:'over',aspect:'16:9',palette:light},{name:'over-dark',layout:'over',aspect:'16:9',palette:dark}],scene,samples:[{name:'setup',frame:Math.round((at[0]+.2)*30)},{name:'first-movement',frame:Math.round((at[1]+.25)*30)},{name:'relationship-reveal',frame:Math.round((at[2]+.35)*30)},{name:'comparison',frame:Math.round((at[3]+.35)*30)},{name:'final-hold',frame:Math.round((scene.resolveAt+(durationSec-scene.resolveAt)/2)*30)}]};
}
const fixtures=[];
fixtures.push(fixture('population-distribution','customer-concentration',[
 'Customer concentration. Shop includes all 3 members: Ada, Ben and Cy.',
 'Ada receives 6 orders.', 'Ben receives 1 orders. Cy receives 1 orders.',
 'Persistent customers keep their own orders.', 'Shop orders are concentrated.'
],{mode:'quantitative',label:'Customer concentration',subject:'Shop',outcome:'Shop orders are concentrated',unit:'orders'},(raw,w)=>{
 raw.populationSize=3;raw.populationWord=w('Shop includes');raw.members=['Ada','Ben','Cy'].map((label,i)=>({label,amount:i?1:6,evidenceWord:w(label+' receives')}));
 return {populationSize:3,members:raw.members.map((m,i)=>({id:'member-'+i,label:m.label,amount:m.amount,level:i?'low':'high'}))};
},['Identify the same three customers and a finite tray of eight order documents.','Move Ada’s six striped order documents to her station.','Move Ben’s and Cy’s own documents without duplicating them.','Compare the unequal stacks; all customers and documents remain.','Hold the dominant order stack without adding a ratio.']));
fixtures.push(fixture('population-distribution','workload-spread',[
 'Workload spread. Workshop names Ada, Ben and Cy.', 'Ada receives many tasks.',
 'Ben receives some tasks. Cy receives few tasks.', 'These are illustrative workloads.', 'Workshop workloads differ.'
],{mode:'qualitative',label:'Workload spread',subject:'Workshop',outcome:'Workshop workloads differ',unit:'tasks'},(raw,w)=>{raw.members=['Ada','Ben','Cy'].map((label,i)=>({label,level:['high','middle','low'][i],evidenceWord:w(label+' receives')}));return {members:raw.members.map((m,i)=>({id:'member-'+i,label:m.label,level:m.level}))};},['Identify three workers and task documents; no numerical scale.','Ada receives the visibly heavier illustrative workload.','Ben and Cy receive their distinct task stacks.','Keep identities and unequal stacks visible together.','Hold the spread with an explicit illustrative/no-scale label.']));
fixtures.push(fixture('population-distribution','average-hides-tail',[
 'Average hides the tail. Team includes all 3 members: Ada, Ben and Cy.',
 'Ada receives 0 tasks.', 'Ben receives 3 tasks. Cy receives 6 tasks.',
 'Team average is 3 tasks.', 'Team average hides the tail.'
],{mode:'quantitative',label:'Average hides the tail',subject:'Team',outcome:'Team average hides the tail',unit:'tasks'},(raw,w)=>{raw.populationSize=3;raw.populationWord=w('Team includes');raw.average=3;raw.averageWord=w('Team average is');raw.members=['Ada','Ben','Cy'].map((label,i)=>({label,amount:i*3,evidenceWord:w(label+' receives')}));return {populationSize:3,average:3,members:raw.members.map((m,i)=>({id:'member-'+i,label:m.label,amount:m.amount,level:['low','middle','high'][i]}))};},['Identify the complete named team; an empty task tray remains a real member.','Ada remains visible with zero tasks while task sheets start moving.','Ben’s three and Cy’s six task documents keep their owners.','Reveal the stated three-task average guide without leveling the stacks.','Hold the average, empty tray and high tail together.']));
for(const preset of ['retention','churn']){
 const retained=preset==='retention';
 const parts=[`Customer ${preset}. Cohort starts with 2 customers in Spring. Ada starts in Spring in Cohort. Ben starts in Spring in Cohort.`,
 'Ada remains in Autumn in Cohort.', 'Ben leaves in Autumn in Cohort.',
 'Cy joins Cohort in Autumn as a new customer. Cohort retains 1 customers in Autumn. Cohort loses 1 customers in Autumn. Cohort adds 1 customers in Autumn.',
 `Cohort ${retained?'retains':'loses'} named customers.`];
 fixtures.push(fixture('customer-cohort',preset,parts,{mode:retained?'quantitative':'qualitative',label:'Customer '+preset,subject:'Cohort',outcome:`Cohort ${retained?'retains':'loses'} named customers`,startPeriod:'Spring',endPeriod:'Autumn'},(raw,w)=>{
 raw.members=[{label:'Ada',status:'retained',startWord:w('Ada starts'),evidenceWord:w('Ada remains')},{label:'Ben',status:'departed',startWord:w('Ben starts'),evidenceWord:w('Ben leaves')}];raw.arrivals=[{label:'Cy',evidenceWord:w('Cy joins')}];
 const result={members:raw.members.map((m,i)=>({id:'original-'+i,label:m.label,status:m.status})),arrivals:[{id:'arrival-0',label:'Cy'}]};
 if(retained){raw.counts={starting:2,retained:1,departed:1,arrivals:1};raw.countWords={starting:w('Cohort starts'),retained:w('Cohort retains 1'),departed:w('Cohort loses 1'),arrivals:w('Cohort adds 1')};result.counts=raw.counts;}
 return result;
 },['Identify the original Spring customers by stable silhouette/badge; Cy waits outside the cohort.','The same originals pass the source-stated Autumn boundary.','Ada stays on the original-member lane; Ben moves into the departed lane without disappearing.','Cy enters a separate new-customer lane, never the retained lane.','Hold originals, departures and newcomers separately; never compute a retention rate.']));
}
for(const preset of ['surplus','shortage','balanced']){
 const quant=preset!=='balanced';const stock=preset==='surplus'?4:3;const demand=preset==='shortage'?4:3;const relation=preset==='surplus'?'exceeds':preset==='shortage'?'falls short of':'matches';
 const parts=[`Inventory ${preset}. Mugs are physical shelf products.`,quant?`Stock holds ${stock} products of Mugs.`:'Stock holds Mugs.',quant?`Demand requests ${demand} products of Mugs.`:'Demand requests Mugs.','Shelf products match separate customer requests.',`Stock ${relation} Demand.`];
 fixtures.push(fixture('inventory-demand',preset,parts,{mode:quant?'quantitative':'qualitative',label:'Inventory '+preset,subject:'Mugs',outcome:`Stock ${relation} Demand`,productLabel:'Mugs',stockLabel:'Stock',demandLabel:'Demand'},(raw,w)=>{raw.stockWord=w('Stock holds');raw.demandWord=w('Demand requests');const result={stock:Array.from({length:stock},(_,i)=>({id:'stock-'+i})),demand:Array.from({length:demand},(_,i)=>({id:'demand-'+i}))};if(quant){raw.stockCount=stock;raw.demandCount=demand;raw.unit='products';result.quantities={stock,demand,unit:'products'};}return result;},['Identify physical mugs on a recognizable shelf and separate incoming people holding requests.','Bring the demand queue to the matching counter; stock remains on shelves.','Move each matched mug once from its shelf slot to its own requesting customer.','Keep unmatched people or leftover shelf stock visible; empty slots are preserved.','Hold the conserved stock/customer result, with no invented demand trend.']));
}
writeFileSync('scripts/explainer-stills/fixtures/concept-business-populations.json',JSON.stringify(fixtures,null,2)+'\n');
