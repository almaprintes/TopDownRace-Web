import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

test('UI loads lazily, renders names as text and switches tracks',async()=>{
 class Element{constructor(){this.children=[];this.dataset={};this.listeners={};this.value='';this.hidden=false;this.textContent='';}append(...n){this.children.push(...n)}replaceChildren(...n){this.children=n;if(this.isSelect)this.value=n[0]?.value||''}addEventListener(n,c){this.listeners[n]=c}querySelector(){return new Element()}}
 const ids=['records','rankingTrack','rankingRows','rankingStatus','rankingEmpty','rankingTable','lang','trackComments','commentForm','commentStatus'];
 const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));nodes.rankingTrack.isSelect=true;
 const document={hidden:false,documentElement:{lang:'es'},getElementById:id=>nodes[id],createElement:()=>new Element(),addEventListener(){}};
 let observer,requests=0,timer;class Observer{constructor(c){observer=c}observe(){}}
 const payload={version:1,generated_at:new Date().toISOString(),tracks:[{id:'circuito-atlantico@g2-20261023',entries:[{rank:1,nick:'<img onerror=alert(1)>',best_time_ms:36239}]},{id:'karting-canarias-4096',entries:[]},{id:'nuevo-circuito@g2-20261030',entries:[]}]};
 const context={document,window:{IntersectionObserver:Observer},IntersectionObserver:Observer,localStorage:{getItem(){return null},setItem(){}},crypto:{randomUUID(){return '00000000-0000-4000-8000-000000000000'}},FormData:class{},AbortSignal,Intl,Date,setInterval(c){timer=c},fetch:async url=>{requests++;if(String(url).includes('web_leaderboard_snapshot'))return{ok:true,json:async()=>[{payload}]};if(String(url).includes('web_track_comments'))return{ok:true,json:async()=>[]};throw new Error('unexpected')}};
 vm.runInNewContext(await readFile(new URL('../assets/rankings.js',import.meta.url),'utf8'),context);
 assert.equal(requests,0);observer([{isIntersecting:true}]);await new Promise(r=>setImmediate(r));
 assert.equal(requests,2,'one snapshot and one comments read');
 assert.equal(nodes.rankingRows.children[0].children[1].textContent,'<img onerror=alert(1)>');
 assert.equal(nodes.rankingRows.children[0].children[1].children.length,0);
 assert.equal(nodes.rankingRows.children[0].children[2].textContent,'0:36.239');
 assert.ok(nodes.rankingTrack.children.some(x=>x.value==='nuevo-circuito@g2-20261030' && x.textContent==='Nuevo Circuito'),'new circuits must appear automatically without exposing generation suffixes');
 nodes.rankingTrack.value='karting-canarias-4096';nodes.rankingTrack.listeners.change();await new Promise(r=>setImmediate(r));
 assert.equal(nodes.rankingEmpty.hidden,false);assert.equal(nodes.rankingTable.hidden,true);
 document.documentElement.lang='en';nodes.lang.listeners.change();assert.match(nodes.rankingEmpty.textContent,/No published times/);
 const before=requests;timer();assert.equal(requests,before,'no fetch within five minutes');document.hidden=true;timer();assert.equal(requests,before);
});