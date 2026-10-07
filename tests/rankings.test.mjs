import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sanitizeSnapshot,sync} from '../scripts/sync-rankings.mjs';

const now=Date.parse('2026-10-07T10:00:00Z');
const fixture=()=>({version:1,generated_at:new Date(now).toISOString(),tracks:[{id:'karting-tenerife',entries:[
  {rank:1,nick:'<img src=x onerror=alert(1)>',best_time_ms:36239,user_id:'private',ghost_payload:'private'},
  {rank:1,nick:'Tie',best_time_ms:36239},{rank:3,nick:'Next',best_time_ms:37560}
]}]});
test('only public fields survive export; ties retain race-control ranks',()=>{
  const data=sanitizeSnapshot(fixture(),now);
  assert.deepEqual(data.tracks[0].entries.map(e=>e.rank),[1,1,3]);
  assert.deepEqual(Object.keys(data.tracks[0].entries[0]),['rank','nick','best_time_ms']);
  assert.equal(data.tracks[0].entries[0].nick,'<img src=x onerror=alert(1)>');
});
test('rejects stale data, unordered times and more than ten entries',()=>{
  assert.throws(()=>sanitizeSnapshot(fixture(),now+21*60000),/older/);
  const unordered=fixture();unordered.tracks[0].entries[2].best_time_ms=1;
  assert.throws(()=>sanitizeSnapshot(unordered,now));
  const tooMany=fixture();tooMany.tracks[0].entries=Array.from({length:11},(_,i)=>({rank:i+1,nick:'x',best_time_ms:i+1}));
  assert.throws(()=>sanitizeSnapshot(tooMany,now));
});
test('one API read per export, measured bytes, failed fetch preserves last good snapshot',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'tdr-rankings-'));
  try {
    let calls=0;
    const raw=JSON.stringify([{payload:fixture()}]);
    const success=await sync(dir,{now,fetchImpl:async(url,options)=>{
      calls++;assert.equal(url.hostname,'juukbnkjboiazqggqcyv.supabase.co');
      assert.equal(url.pathname,'/rest/v1/web_leaderboard_snapshot');
      assert.equal(options.headers['Accept-Encoding'],'identity');
      return new Response(raw);
    }});
    assert.equal(calls,1);assert.equal(success.ok,true);
    assert.equal(success.usage.days[0].response_body_bytes,Buffer.byteLength(raw));
    const previous=await readFile(join(dir,'leaderboards.json'),'utf8');
    const failure=await sync(dir,{now:now+300000,fetchImpl:async()=>new Response('Unavailable',{status:503})});
    assert.equal(failure.ok,false);
    assert.equal(await readFile(join(dir,'leaderboards.json'),'utf8'),previous);
    assert.equal(failure.usage.days[0].requests,2);
    assert.equal(failure.usage.days[0].failures,1);
  } finally {await rm(dir,{recursive:true,force:true});}
});
