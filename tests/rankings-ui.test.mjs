import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

test('UI loads lazily, renders names as text and switches tracks without API requests',async()=>{
  class Element {
    constructor(){this.children=[];this.dataset={};this.listeners={};this.value='';this.hidden=false;}
    append(node){this.children.push(node);}
    replaceChildren(...nodes){this.children=nodes;if(this.isSelect)this.value=nodes[0]?.value||'';}
    addEventListener(name,callback){this.listeners[name]=callback;}
  }
  const nodes=Object.fromEntries(['records','rankingTrack','rankingRows','rankingStatus','rankingEmpty','rankingTable','lang'].map(id=>[id,new Element()]));
  nodes.rankingTrack.isSelect=true;
  const document={hidden:false,documentElement:{lang:'es'},getElementById:id=>nodes[id],
    createElement:()=>new Element(),addEventListener(){}};
  let observer,requests=0,timer;
  class Observer{constructor(callback){observer=callback;}observe(){}}
  const payload={version:1,generated_at:new Date().toISOString(),tracks:[
    {id:'karting-tenerife',entries:[{rank:1,nick:'<img onerror=alert(1)>',best_time_ms:36239}]},
    {id:'karting-canarias',entries:[]}
  ]};
  const context={document,window:{IntersectionObserver:Observer},IntersectionObserver:Observer,
    AbortSignal,Intl,Date,setInterval(callback){timer=callback;},
    fetch:async url=>{requests++;assert.match(url,/raw\.githubusercontent\.com/);return{ok:true,json:async()=>payload};}};
  vm.runInNewContext(await readFile(new URL('../assets/rankings.js',import.meta.url),'utf8'),context);
  assert.equal(requests,0,'nothing downloaded before the section is visible');
  observer([{isIntersecting:true}]);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requests,1);
  assert.equal(nodes.rankingRows.children[0].children[1].textContent,'<img onerror=alert(1)>');
  assert.equal(nodes.rankingRows.children[0].children[1].children.length,0);
  assert.equal(nodes.rankingRows.children[0].children[2].textContent,'0:36.239');
  nodes.rankingTrack.value='karting-canarias';
  nodes.rankingTrack.listeners.change();
  assert.equal(nodes.rankingEmpty.hidden,false);
  assert.equal(nodes.rankingTable.hidden,true);
  document.documentElement.lang='en';nodes.lang.listeners.change();
  assert.match(nodes.rankingEmpty.textContent,/No published times/);
  timer();
  assert.equal(requests,1,'no fetch within five minutes');
  document.hidden=true;timer();
  assert.equal(requests,1,'background tabs do not fetch');
});
