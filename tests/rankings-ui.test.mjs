import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

test('UI loads lazily, renders names as text and switches tracks',async()=>{
 class Element{constructor(){this.children=[];this.dataset={};this.listeners={};this.value='';this.hidden=false;this.textContent='';}setAttribute(n,v){this[n]=v}append(...n){this.children.push(...n)}replaceChildren(...n){this.children=n;if(this.isSelect)this.value=n[0]?.value||''}addEventListener(n,c){this.listeners[n]=c}querySelector(){return new Element()}}
 const ids=['records','rankingTrack','rankingRows','rankingStatus','rankingEmpty','rankingTable','lang','trackComments','commentForm','commentStatus'];
 const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));nodes.rankingTrack.isSelect=true;
 const document={hidden:false,documentElement:{lang:'es'},getElementById:id=>nodes[id],createElement:()=>new Element(),addEventListener(){}};
 let observer,requests=0,timer;class Observer{constructor(c){observer=c}observe(){}}
 const payload={version:1,generated_at:new Date().toISOString(),tracks:[{id:'karting-tenerife',entries:[{rank:1,nick:'<img onerror=alert(1)>',best_time_ms:36239,car_id:'avenir_gripline'},{rank:2,nick:'JUANFRIKAZO_DEV',best_time_ms:37560,car_id:'helix_vortex'},{rank:3,nick:'Third',best_time_ms:38000,car_id:'../bad'},{rank:4,nick:'Fourth',best_time_ms:39000,car_id:'helix_spark'}]},{id:'karting-canarias',entries:[]}]};
 const context={document,window:{IntersectionObserver:Observer},IntersectionObserver:Observer,localStorage:{getItem(){return null},setItem(){}},crypto:{randomUUID(){return '00000000-0000-4000-8000-000000000000'}},FormData:class{},AbortSignal,Intl,Date,setInterval(c){timer=c},fetch:async url=>{requests++;if(String(url).includes('web_leaderboard_snapshot'))return{ok:true,json:async()=>[{payload}]};if(String(url).includes('web_track_comments'))return{ok:true,json:async()=>[]};throw new Error('unexpected')}};
 vm.runInNewContext(await readFile(new URL('../assets/rankings.js',import.meta.url),'utf8'),context);
 assert.equal(requests,0);observer([{isIntersecting:true}]);await new Promise(r=>setImmediate(r));
 assert.equal(requests,2,'one snapshot and one comments read');
 assert.equal(nodes.rankingRows.children[0].children[1].textContent,'<img onerror=alert(1)>');
 assert.equal(nodes.rankingRows.children[0].children[1].children.length,0);
 assert.equal(nodes.rankingRows.children[0].children[3].textContent,'0:36.239');
 const rows=nodes.rankingRows.children;
 assert.equal(rows[0].role,'row');
 assert.equal(rows[0].children.length,4);
 assert.equal(rows[0].children[2].role,'cell');
 assert.match(rows[0].children[2].children[0].src,/avenir_gripline\.webp$/);
 assert.equal(rows[1].children[1].textContent,'JUANFRIKAZO_DEV');
 assert.match(rows[1].children[2].children[0].src,/helix_vortex\.webp$/);
 assert.equal(rows[2].children[2].children.length,0,'unsafe car paths are ignored');
 assert.equal(rows[3].children[2].children.length,0,'rank 4 has no image');
 rows[0].children[2].children[0].listeners.error();
 assert.equal(rows[0].children[2].children[0].hidden,true,'missing asset never displays broken image');
 nodes.rankingTrack.value='karting-canarias';nodes.rankingTrack.listeners.change();await new Promise(r=>setImmediate(r));
 assert.equal(nodes.rankingEmpty.hidden,false);assert.equal(nodes.rankingTable.hidden,true);
 document.documentElement.lang='en';nodes.lang.listeners.change();assert.match(nodes.rankingEmpty.textContent,/No published times/);
 const before=requests;timer();assert.equal(requests,before,'no fetch within five minutes');document.hidden=true;timer();assert.equal(requests,before);
});